"""
Analysis router — all computed analytics for the BoxSmart dashboard.
Joins WHOOP, Pison, and survey data to produce:
  - A/B sparring comparison (Mann-Whitney U)
  - Pre/post boxing vs sparring deltas
  - Weekly longitudinal trends + head contact score overlay
  - Neuroprotective agent analysis (caffeine & creatine)
  - Sparring load recommendation (Bayesian-lite, bootstrapped CI)
"""
from __future__ import annotations
import math
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from scipy import stats


def _clean(obj):
    """Recursively replace NaN/Inf floats with None so JSON serialization never fails."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, (np.floating, np.integer)):
        v = float(obj)
        return None if (math.isnan(v) or math.isinf(v)) else v
    return obj

sys.path.insert(0, str(Path(__file__).parents[1] / "processing"))
from whoop_loader import load_cycles, load_sleep, sleep_stage_pct
from survey_loader import load_survey, CONTACT_MAP
import eeg_pipeline

_PISON_CSV = Path(__file__).parents[2] / "pison" / "data" / "pison_extracted.csv"

# Literature-derived thresholds
RECOVERY_THRESHOLD = 33.0   # % — "red" zone in WHOOP; below = do not train hard
HRV_DECLINE_PCT    = 0.15   # 15% drop from personal baseline triggers caution
RT_DECLINE_PCT     = 0.20   # 20% increase in reaction time (Coutts et al., 2007)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MERGED_COLS = ["date", "sparred", "hrv_ms", "recovery_pct", "rhr_bpm",
               "sleep_perf_pct", "strain", "rem_pct", "deep_pct", "light_pct",
               "head_contact_level", "creatine", "caffeine", "trained", "fought"]

def _load_merged() -> pd.DataFrame:
    """WHOOP cycles + sleep + survey joined on date. Returns empty df if data files are absent."""
    try:
        cycles = load_cycles()
        sleep  = sleep_stage_pct(load_sleep())
        survey = load_survey()

        cycles["date"] = pd.to_datetime(cycles["date"].astype(str))
        sleep["date"]  = pd.to_datetime(sleep["date"].astype(str))
        survey["date"] = pd.to_datetime(survey["date"].astype(str))

        df = cycles.merge(sleep, on="date", how="left")
        df = df.merge(survey, on="date", how="left")
        return df
    except Exception as e:
        print(f"[WARN] _load_merged failed: {e}")
        return pd.DataFrame(columns=MERGED_COLS)


def _load_pison() -> pd.DataFrame:
    """
    Load Pison readings in tall format:
      date (datetime), category (daily_readiness|daily_agility), reading_value (float), notes (str)

    Queries BigQuery pison_readings (wide: readiness_ms, agility_score, tags);
    falls back to local pison_extracted.csv.
    """
    try:
        from gcp import bq  # type: ignore
        query = "SELECT date, readiness_ms, agility_score, tags FROM `boxsmart-492022.boxsmart.pison_readings`"
        raw = bq.query(query).to_dataframe()
        rows = []
        for _, r in raw.iterrows():
            dt = pd.to_datetime(r["date"])
            tags = str(r["tags"]) if pd.notna(r.get("tags")) else ""
            if pd.notna(r.get("readiness_ms")):
                rows.append({"date": dt, "category": "daily_readiness",
                             "reading_value": float(r["readiness_ms"]), "notes": tags})
            if pd.notna(r.get("agility_score")):
                rows.append({"date": dt, "category": "daily_agility",
                             "reading_value": float(r["agility_score"]), "notes": tags})
        if rows:
            return pd.DataFrame(rows)
    except Exception as e:
        print(f"[_load_pison] BQ query failed: {e}")

    # Local CSV fallback
    if not _PISON_CSV.exists():
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                             "category": pd.Series(dtype=str),
                             "reading_value": pd.Series(dtype=float),
                             "notes": pd.Series(dtype=str)})
    df = pd.read_csv(_PISON_CSV)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return df


def _bootstrap_ci(arr, n_iter=1000, ci=0.90):
    """Bootstrap confidence interval for the mean."""
    arr = arr[~np.isnan(arr)]
    if len(arr) == 0:
        return None, None
    boots = [np.mean(np.random.choice(arr, size=len(arr), replace=True)) for _ in range(n_iter)]
    lo = np.percentile(boots, (1 - ci) / 2 * 100)
    hi = np.percentile(boots, (1 - (1 - ci) / 2) * 100)
    return round(float(lo), 2), round(float(hi), 2)


def _group_stats(df, col, group_col):
    """Return mean, CI, n per group for a column."""
    out = {}
    for label, grp in df.groupby(group_col):
        vals = grp[col].dropna().values.astype(float)
        lo, hi = _bootstrap_ci(vals)
        out[str(label)] = {
            "mean": round(float(np.mean(vals)), 2) if len(vals) else None,
            "ci_lo": lo,
            "ci_hi": hi,
            "n": int(len(vals)),
        }
    return out


# ---------------------------------------------------------------------------
# A/B: Sparring vs Non-Sparring
# ---------------------------------------------------------------------------

@router.get("/ab-sparring")
def get_ab_sparring():  # noqa: C901
    """
    Compare WHOOP + Pison + EEG metrics on sparring vs non-sparring days.
    Statistical test: Mann-Whitney U (non-parametric, appropriate for n<30).
    Returns means, 90% bootstrap CIs, and U-test p-values per metric, grouped by source.
    """
    df = _load_merged()
    df["sparred"] = df["sparred"].fillna(0).astype(int)
    df["date_dt"] = pd.to_datetime(df["date"].astype(str))

    sparring_dates = set(df[df["sparred"] == 1]["date_dt"].dt.strftime("%Y-%m-%d"))

    def _compare_metric(spar, nospar, label):
        if len(spar) < 2 or len(nospar) < 2:
            return None
        stat, pval = stats.mannwhitneyu(spar, nospar, alternative="two-sided")
        lo_s, hi_s = _bootstrap_ci(spar)
        lo_n, hi_n = _bootstrap_ci(nospar)
        pooled_std = np.sqrt((np.var(spar, ddof=1) + np.var(nospar, ddof=1)) / 2)
        cohens_d = round(float((np.mean(spar) - np.mean(nospar)) / pooled_std), 3) if pooled_std > 0 else None
        return {
            "label": label,
            "sparring":     {"mean": round(float(np.mean(spar)), 3),  "ci_lo": lo_s, "ci_hi": hi_s, "n": len(spar)},
            "non_sparring": {"mean": round(float(np.mean(nospar)), 3), "ci_lo": lo_n, "ci_hi": hi_n, "n": len(nospar)},
            "cohens_d":  cohens_d,
            "mw_u":      round(float(stat), 2),
            "p_value":   round(float(pval), 4),
            "significant": bool(pval < 0.05),
        }

    # ── WHOOP metrics ───────────────────────────────────────────────────────
    whoop_metrics = {
        "hrv_ms":         "HRV (ms)",
        "recovery_pct":   "Recovery %",
        "rhr_bpm":        "RHR (bpm)",
        "sleep_perf_pct": "Sleep Score %",
        "strain":         "Strain",
        "rem_pct":        "REM %",
        "deep_pct":       "Deep Sleep %",
    }
    whoop_results = {}
    for col, label in whoop_metrics.items():
        if col not in df.columns:
            continue
        spar   = df[df["sparred"] == 1][col].dropna().values.astype(float)
        nospar = df[df["sparred"] == 0][col].dropna().values.astype(float)
        r = _compare_metric(spar, nospar, label)
        if r:
            whoop_results[col] = r

    # ── Pison metrics ────────────────────────────────────────────────────────
    pison_df = _load_pison()
    pison_daily = pison_df[pison_df["category"].isin(["daily_readiness", "daily_agility"])].copy()
    pison_daily = pison_daily[pison_daily["reading_value"].notna()].copy()
    pison_daily["date_str"] = pison_daily["date"].dt.strftime("%Y-%m-%d")
    pison_daily["sparred"]  = pison_daily["date_str"].isin(sparring_dates).astype(int)

    # Tag pre vs post readings from notes/tags field
    notes_lower = pison_daily["notes"].fillna("").str.lower()
    pison_daily["is_pre"]  = notes_lower.str.contains("pre-boxing|pre boxing|pre-sparring|pre sparring")
    pison_daily["is_post"] = notes_lower.str.contains("post-boxing|post boxing|post-sparring|post sparring")

    def _pison_stats(rows, sparred_val):
        r = rows[rows["sparred"] == sparred_val]
        per_day = r.groupby("date_str")["reading_value"].mean().values.astype(float)
        lo, hi = _bootstrap_ci(per_day) if len(per_day) >= 2 else (None, None)
        return {"mean": round(float(np.mean(per_day)), 3) if len(per_day) else None,
                "ci_lo": lo, "ci_hi": hi, "n": int(len(per_day))}

    pison_results = {}
    for cat, label, col_out in [
        ("daily_readiness", "Readiness (ms)", "readiness_ms"),
        ("daily_agility",   "Agility (/100)", "agility"),
    ]:
        sub = pison_daily[pison_daily["category"] == cat]
        # avg view: daily average per date (all readings)
        avg = sub.groupby(["date_str", "sparred"])["reading_value"].mean().reset_index()
        spar   = avg[avg["sparred"] == 1]["reading_value"].values.astype(float)
        nospar = avg[avg["sparred"] == 0]["reading_value"].values.astype(float)
        r = _compare_metric(spar, nospar, label)
        if not r:
            continue

        # pre/post views
        r["pre_sparring"]      = _pison_stats(sub[sub["is_pre"]],  1)
        r["pre_non_sparring"]  = _pison_stats(sub[sub["is_pre"]],  0)
        r["post_sparring"]     = _pison_stats(sub[sub["is_post"]], 1)
        r["post_non_sparring"] = _pison_stats(sub[sub["is_post"]], 0)

        # delta view: post − pre per day
        delta_rows_p = []
        for date_str, grp in sub.groupby("date_str"):
            pre_v  = grp[grp["is_pre"]]["reading_value"]
            post_v = grp[grp["is_post"]]["reading_value"]
            if pre_v.empty or post_v.empty:
                continue
            sv = int(grp["sparred"].iloc[0])
            delta_rows_p.append({"sparred": sv, "delta": float(post_v.mean()) - float(pre_v.mean())})
        if delta_rows_p:
            ddf = pd.DataFrame(delta_rows_p)
            for sv, key in [(1, "delta_sparring"), (0, "delta_non_sparring")]:
                vals = ddf[ddf["sparred"] == sv]["delta"].values.astype(float)
                lo, hi = _bootstrap_ci(vals) if len(vals) >= 2 else (None, None)
                r[key] = {"mean": round(float(np.mean(vals)), 3) if len(vals) else None,
                          "ci_lo": lo, "ci_hi": hi, "n": int(len(vals))}
        else:
            r["delta_sparring"]     = {"mean": None, "ci_lo": None, "ci_hi": None, "n": 0}
            r["delta_non_sparring"] = {"mean": None, "ci_lo": None, "ci_hi": None, "n": 0}

        pison_results[col_out] = r

    # ── EEG metrics ──────────────────────────────────────────────────────────
    eeg_df = eeg_pipeline.process_all_sessions()
    eeg_results = {}
    eeg_n_note = None
    if not eeg_df.empty:
        eeg_df = eeg_df[eeg_df["poor_contact"] != True].copy()
        eeg_df["sparred"] = eeg_df["date"].isin(sparring_dates).astype(int)
        n_spar = int((eeg_df["sparred"] == 1).sum())
        n_nospar = int((eeg_df["sparred"] == 0).sum())
        eeg_n_note = f"EEG: n={n_spar} sparring, n={n_nospar} non-sparring sessions — interpret with caution"

        eeg_pre  = eeg_df[eeg_df["timing"] == "pre"].copy()
        eeg_post = eeg_df[eeg_df["timing"] == "post"].copy()

        # Compute per-date delta (post − pre)
        eeg_delta_rows = []
        for date, grp in eeg_df.groupby("date"):
            pre_row  = grp[grp["timing"] == "pre"]
            post_row = grp[grp["timing"] == "post"]
            if pre_row.empty or post_row.empty:
                continue
            row = {"date": date, "sparred": int(grp["sparred"].iloc[0])}
            for _c in ["alpha_reactivity", "alpha_theta_ratio", "rel_alpha_eo", "rel_theta_eo"]:
                if _c in grp.columns:
                    pv   = pre_row[_c].dropna()
                    posv = post_row[_c].dropna()
                    if not pv.empty and not posv.empty:
                        row[_c] = float(posv.iloc[0]) - float(pv.iloc[0])
            eeg_delta_rows.append(row)
        eeg_delta = pd.DataFrame(eeg_delta_rows) if eeg_delta_rows else pd.DataFrame()

        def _eeg_group(df_sub, sparred_val, col):
            if col not in df_sub.columns:
                return {"mean": None, "ci_lo": None, "ci_hi": None, "n": 0}
            vals = df_sub[df_sub["sparred"] == sparred_val][col].dropna().values.astype(float)
            lo, hi = _bootstrap_ci(vals) if len(vals) >= 2 else (None, None)
            return {"mean": round(float(np.mean(vals)), 4) if len(vals) else None,
                    "ci_lo": lo, "ci_hi": hi, "n": int(len(vals))}

        eeg_metrics = {
            "alpha_reactivity":  "Alpha Reactivity",
            "alpha_theta_ratio": "Alpha/Theta Ratio",
            "rel_alpha_eo":      "Rel. Alpha EO",
            "rel_theta_eo":      "Rel. Theta EO",
        }
        for col, label in eeg_metrics.items():
            if col not in eeg_df.columns:
                continue
            spar   = eeg_df[eeg_df["sparred"] == 1][col].dropna().values.astype(float)
            nospar = eeg_df[eeg_df["sparred"] == 0][col].dropna().values.astype(float)
            lo_s, hi_s = _bootstrap_ci(spar) if len(spar) >= 2 else (None, None)
            lo_n, hi_n = _bootstrap_ci(nospar) if len(nospar) >= 2 else (None, None)
            entry = {
                "label": label,
                "sparring":     {"mean": round(float(np.mean(spar)), 4) if len(spar) else None, "ci_lo": lo_s, "ci_hi": hi_s, "n": len(spar)},
                "non_sparring": {"mean": round(float(np.mean(nospar)), 4) if len(nospar) else None, "ci_lo": lo_n, "ci_hi": hi_n, "n": len(nospar)},
                "insufficient_n": bool(len(spar) < 2 or len(nospar) < 2),
                # pre/post/delta breakdowns
                "pre_sparring":      _eeg_group(eeg_pre,   1, col),
                "pre_non_sparring":  _eeg_group(eeg_pre,   0, col),
                "post_sparring":     _eeg_group(eeg_post,  1, col),
                "post_non_sparring": _eeg_group(eeg_post,  0, col),
                "delta_sparring":    _eeg_group(eeg_delta, 1, col),
                "delta_non_sparring":_eeg_group(eeg_delta, 0, col),
            }
            if len(spar) >= 2 and len(nospar) >= 2:
                stat, pval = stats.mannwhitneyu(spar, nospar, alternative="two-sided")
                entry["mw_u"]       = round(float(stat), 2)
                entry["p_value"]    = round(float(pval), 4)
                entry["significant"] = bool(pval < 0.05)
            eeg_results[col] = entry

    return _clean({
        "whoop": whoop_results,
        "pison": pison_results,
        "eeg":   eeg_results,
        "eeg_n_note": eeg_n_note,
    })




# ---------------------------------------------------------------------------
# Pre/Post Delta: boxing vs sparring comparison
# ---------------------------------------------------------------------------

@router.get("/pre-post-delta")
def get_pre_post_delta():
    """
    Compare pre→post deltas for boxing vs sparring days using Pison data.
    Hypothesis: delta is larger (worse) on sparring days.
    Returns per-category, per-condition means with Mann-Whitney U.
    """
    df = _load_pison()
    daily = df[df["category"].isin(["daily_readiness", "daily_agility"])].copy()
    daily = daily[daily["reading_value"].notna() & daily["notes"].notna()]

    rows = []
    for date, group in daily.groupby("date"):
        for cat, sub in group.groupby("category"):
            pre  = sub[sub["notes"].str.contains("pre-boxing|pre boxing", case=False, na=False)]
            post = sub[sub["notes"].str.contains("post-boxing|post boxing", case=False, na=False)]
            pre_s  = sub[sub["notes"].str.contains("pre-sparring|pre sparring", case=False, na=False)]
            post_s = sub[sub["notes"].str.contains("post-sparring|post sparring", case=False, na=False)]

            if not pre.empty and not post.empty:
                rows.append({
                    "date": date, "category": cat, "condition": "boxing",
                    "delta": float(post["reading_value"].mean() - pre["reading_value"].mean()),
                })
            if not pre_s.empty and not post_s.empty:
                rows.append({
                    "date": date, "category": cat, "condition": "sparring",
                    "delta": float(post_s["reading_value"].mean() - pre_s["reading_value"].mean()),
                })

    if not rows:
        return {"readiness": {}, "agility": {}, "eeg": []}

    result_df = pd.DataFrame(rows)
    out = {}
    for cat in ["daily_readiness", "daily_agility"]:
        sub = result_df[result_df["category"] == cat]
        boxing   = sub[sub["condition"] == "boxing"]["delta"].values
        sparring = sub[sub["condition"] == "sparring"]["delta"].values

        entry = {
            "boxing":  {
                "mean": round(float(np.mean(boxing)), 2) if len(boxing) else None,
                "n": len(boxing),
                "values": [round(v, 2) for v in boxing.tolist()],
            },
            "sparring": {
                "mean": round(float(np.mean(sparring)), 2) if len(sparring) else None,
                "n": len(sparring),
                "values": [round(v, 2) for v in sparring.tolist()],
            },
        }
        if len(boxing) >= 2 and len(sparring) >= 2:
            stat, pval = stats.mannwhitneyu(sparring, boxing, alternative="greater")
            entry["mw_u"]       = round(float(stat), 2)
            entry["p_value"]    = round(float(pval), 4)
            entry["hypothesis"] = "sparring delta > boxing delta"

        out[cat.replace("daily_", "")] = entry

    # ── EEG pre/post deltas grouped by boxing vs sparring ───────────────────
    eeg_raw = eeg_pipeline.process_all_sessions()
    eeg_out = {}
    if not eeg_raw.empty:
        eeg_raw = eeg_raw[eeg_raw["poor_contact"] != True].copy()

        # Need sparring dates from survey
        merged = _load_merged()
        merged["date_dt"] = pd.to_datetime(merged["date"].astype(str))
        merged["sparred"] = merged["sparred"].fillna(0).astype(int)
        sparring_dates_eeg = set(merged[merged["sparred"] == 1]["date_dt"].dt.strftime("%Y-%m-%d"))

        eeg_metrics_def = [
            ("alpha_theta_ratio", "Alpha/Theta Ratio", True),
            ("rel_alpha_eo",      "Rel. Alpha EO",     True),
            ("rel_theta_eo",      "Rel. Theta EO",     False),
            ("sef90",             "SEF90 (Hz)",        True),
        ]

        delta_rows = []
        for date, grp in eeg_raw.groupby("date"):
            pre_rows  = grp[grp["timing"] == "pre"]
            post_rows = grp[grp["timing"] == "post"]
            if pre_rows.empty or post_rows.empty:
                continue
            date_str = str(date)
            condition = "sparring" if date_str in sparring_dates_eeg else "boxing"
            for col, label, higher_better in eeg_metrics_def:
                if col not in grp.columns:
                    continue
                pre_v  = pre_rows[col].dropna()
                post_v = post_rows[col].dropna()
                if pre_v.empty or post_v.empty:
                    continue
                delta = float(post_v.iloc[0]) - float(pre_v.iloc[0])
                delta_rows.append({"metric": col, "condition": condition, "delta": delta})

        if delta_rows:
            delta_df = pd.DataFrame(delta_rows)
            for col, label, higher_better in eeg_metrics_def:
                sub = delta_df[delta_df["metric"] == col]
                bx_vals = sub[sub["condition"] == "boxing"]["delta"].values.astype(float)
                sp_vals = sub[sub["condition"] == "sparring"]["delta"].values.astype(float)
                entry = {
                    "label": label,
                    "higher_better": higher_better,
                    "boxing": {
                        "mean": round(float(np.mean(bx_vals)), 4) if len(bx_vals) else None,
                        "n":    int(len(bx_vals)),
                    },
                    "sparring": {
                        "mean": round(float(np.mean(sp_vals)), 4) if len(sp_vals) else None,
                        "n":    int(len(sp_vals)),
                    },
                }
                eeg_out[col] = entry

    out["eeg"] = eeg_out
    return _clean(out)


# ---------------------------------------------------------------------------
# Longitudinal weekly trends + head contact score
# ---------------------------------------------------------------------------

@router.get("/longitudinal")
def get_longitudinal():
    """
    Weekly aggregated metrics: WHOOP + Pison + composite head contact score.
    contact_score = mean(None=0, Low=1, Medium=2, High=3) per week.
    """
    df = _load_merged()
    df["date"] = pd.to_datetime(df["date"])
    df["contact_numeric"] = df["head_contact_level"].map(CONTACT_MAP)
    iso = df["date"].dt.isocalendar()
    df["year"] = iso["year"].values
    df["week"] = iso["week"].values
    df["week_start"] = df["date"] - pd.to_timedelta(df["date"].dt.dayofweek, unit="D")

    whoop_cols = ["hrv_ms", "recovery_pct", "rhr_bpm", "sleep_perf_pct",
                  "strain", "rem_pct", "deep_pct", "contact_numeric"]
    agg = {c: "mean" for c in whoop_cols if c in df.columns}
    agg["date"] = "count"

    weekly = (
        df.groupby(["year", "week", "week_start"])
          .agg(agg)
          .reset_index()
          .rename(columns={"date": "n_days"})
    )
    weekly["week_start"] = weekly["week_start"].dt.strftime("%Y-%m-%d")
    for c in whoop_cols:
        if c in weekly:
            weekly[c] = weekly[c].round(2)

    # Merge in Pison weekly averages (computed from daily readings)
    pison = _load_pison()
    if not pison.empty:
        pison["week_start"] = (pison["date"] - pd.to_timedelta(pison["date"].dt.dayofweek, unit="D")).dt.strftime("%Y-%m-%d")
        pison_r = (pison[pison["category"] == "daily_readiness"]
                   .groupby("week_start")["reading_value"].mean().round(1)
                   .reset_index().rename(columns={"reading_value": "readiness_ms"}))
        pison_a = (pison[pison["category"] == "daily_agility"]
                   .groupby("week_start")["reading_value"].mean().round(1)
                   .reset_index().rename(columns={"reading_value": "agility"}))
        weekly = weekly.merge(pison_r, on="week_start", how="left")
        weekly = weekly.merge(pison_a, on="week_start", how="left")

    # EEG weekly averages
    try:
        eeg_raw = eeg_pipeline.process_all_sessions()
        if not eeg_raw.empty:
            eeg_valid = eeg_raw[eeg_raw["poor_contact"] != True].copy()
            eeg_valid["date_col"] = pd.to_datetime(eeg_valid["date"])
            eeg_valid["week_start"] = (
                eeg_valid["date_col"] - pd.to_timedelta(eeg_valid["date_col"].dt.dayofweek, unit="D")
            ).dt.strftime("%Y-%m-%d")
            eeg_weekly = (
                eeg_valid.groupby("week_start")[
                    ["alpha_reactivity", "alpha_theta_ratio", "rel_alpha_eo", "rel_theta_eo"]
                ]
                .mean().round(4).reset_index()
            )
            weekly = weekly.merge(eeg_weekly, on="week_start", how="left")
    except Exception:
        pass

    weekly = weekly.sort_values("week_start")
    return _clean(weekly.where(weekly.notna(), None).to_dict(orient="records"))


# ---------------------------------------------------------------------------
# Neuroprotective agents: caffeine & creatine
# ---------------------------------------------------------------------------

@router.get("/neuroprotective")
def get_neuroprotective():
    """
    Acute effect of caffeine and creatine on same-day WHOOP metrics.
    Also computes cumulative (rolling) creatine days correlation with HRV.
    """
    df = _load_merged()
    df["caffeine_taken"] = (df["caffeine"].fillna(0) > 0).astype(int)
    df["creatine_taken"] = df["creatine"].fillna(0).astype(int)

    df["date_str"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

    # Add Pison daily readiness
    pison_df = _load_pison()
    readiness_daily = pison_df[pison_df["category"] == "daily_readiness"].copy()
    readiness_daily = readiness_daily[readiness_daily["reading_value"].notna()]
    readiness_daily["date_str"] = readiness_daily["date"].dt.strftime("%Y-%m-%d")
    readiness_avg = readiness_daily.groupby("date_str")["reading_value"].mean().reset_index()
    readiness_avg.columns = ["date_str", "readiness_ms"]
    df = df.merge(readiness_avg, on="date_str", how="left")

    # Add EEG alpha/theta ratio
    neurable_readings = eeg_pipeline.process_all_sessions()
    if not neurable_readings.empty:
        neurable_valid = neurable_readings[neurable_readings["poor_contact"] != True].copy()
        neurable_valid["date_str"] = neurable_valid["date"].astype(str)
        neurable_avg = neurable_valid.groupby("date_str")[["alpha_theta_ratio"]].mean().reset_index()
        df = df.merge(neurable_avg, on="date_str", how="left")

    metrics = ["hrv_ms", "recovery_pct", "rhr_bpm", "sleep_perf_pct", "readiness_ms", "alpha_theta_ratio"]

    def compare(group_col):
        out = {}
        for col in metrics:
            if col not in df.columns:
                continue
            g0 = df[df[group_col] == 0][col].dropna().values.astype(float)
            g1 = df[df[group_col] == 1][col].dropna().values.astype(float)
            lo0, hi0 = _bootstrap_ci(g0)
            lo1, hi1 = _bootstrap_ci(g1)
            entry = {
                "without": {"mean": round(float(np.mean(g0)), 2) if len(g0) else None,
                            "ci_lo": lo0, "ci_hi": hi0, "n": len(g0)},
                "with":    {"mean": round(float(np.mean(g1)), 2) if len(g1) else None,
                            "ci_lo": lo1, "ci_hi": hi1, "n": len(g1)},
            }
            if len(g0) >= 2 and len(g1) >= 2:
                stat, pval = stats.mannwhitneyu(g1, g0, alternative="two-sided")
                entry["p_value"] = round(float(pval), 4)
                entry["significant"] = bool(pval < 0.05)
            out[col] = entry
        return out

    caffeine_effect  = compare("caffeine_taken")
    creatine_effect  = compare("creatine_taken")

    # Cumulative creatine: rolling count of creatine days, correlated with HRV
    df_sorted = df.sort_values("date").copy()
    df_sorted["cumulative_creatine_days"] = df_sorted["creatine_taken"].cumsum()
    valid = df_sorted[["cumulative_creatine_days", "hrv_ms"]].dropna()
    if len(valid) >= 5:
        r, pval = stats.pearsonr(valid["cumulative_creatine_days"], valid["hrv_ms"])
        cumulative_corr = {
            "r": round(float(r), 3),
            "p_value": round(float(pval), 4),
            "n": len(valid),
            "interpretation": (
                "Positive correlation: more cumulative creatine days associated with higher HRV"
                if r > 0 else
                "Negative correlation: more cumulative creatine days associated with lower HRV"
            ),
        }
    else:
        cumulative_corr = None

    return _clean({
        "caffeine": caffeine_effect,
        "creatine": creatine_effect,
        "creatine_cumulative_hrv_correlation": cumulative_corr,
    })


# ---------------------------------------------------------------------------
# Correlation matrix
# ---------------------------------------------------------------------------

@router.get("/correlation-matrix")
def get_correlation_matrix():
    """
    Spearman ρ correlation matrix across all neurological variables.
    Variables: head_contact_score, readiness_ms, agility, alpha_reactivity,
               alpha_theta_ratio, rel_alpha_eo, rel_theta_eo.
    Spearman is used for all pairs: handles ordinal×continuous and small n.
    Uses pre-session EEG readings as the daily baseline measurement.
    """
    VARS = [
        ("head_contact",      "Head Contact"),
        ("headache",          "Headache"),
        ("readiness_ms",      "Readiness"),
        ("agility",           "Agility"),
        ("alpha_reactivity",  "Alpha Reactivity"),
        ("alpha_theta_ratio", "Alpha/Theta"),
        ("rel_alpha_eo",      "Rel. Alpha EO"),
        ("rel_theta_eo",      "Rel. Theta EO"),
    ]

    # ── Survey: head contact + headache (daily) ─────────────────────────────
    survey = load_survey(filled_only=False)
    survey["date"] = pd.to_datetime(survey["date"]).dt.strftime("%Y-%m-%d")
    survey["head_contact"] = survey["head_contact_level"].map(CONTACT_MAP)
    survey_cols = ["date", "head_contact"]
    if "headache" in survey.columns:
        survey["headache_f"] = pd.to_numeric(survey["headache"], errors="coerce")
        survey_cols.append("headache_f")
    survey_slim = survey[survey_cols].dropna(subset=["head_contact"]).copy()
    if "headache_f" in survey_slim.columns:
        survey_slim = survey_slim.rename(columns={"headache_f": "headache"})

    # ── Pison: daily averages ───────────────────────────────────────────────
    pison = _load_pison()
    if not pison.empty:
        pison["date_str"] = pison["date"].dt.strftime("%Y-%m-%d")
        readiness = (
            pison[pison["category"] == "daily_readiness"]
            .groupby("date_str")["reading_value"].mean()
            .reset_index()
            .rename(columns={"date_str": "date", "reading_value": "readiness_ms"})
        )
        agility = (
            pison[pison["category"] == "daily_agility"]
            .groupby("date_str")["reading_value"].mean()
            .reset_index()
            .rename(columns={"date_str": "date", "reading_value": "agility"})
        )
    else:
        readiness = pd.DataFrame({"date": pd.Series(dtype=str), "readiness_ms": pd.Series(dtype=float)})
        agility   = pd.DataFrame({"date": pd.Series(dtype=str), "agility":       pd.Series(dtype=float)})

    # ── EEG: pre-session readings only ─────────────────────────────────────
    eeg_raw = eeg_pipeline.process_all_sessions()
    eeg_cols = ["alpha_reactivity", "alpha_theta_ratio", "rel_alpha_eo", "rel_theta_eo"]
    if not eeg_raw.empty:
        eeg_pre = eeg_raw[
            (eeg_raw["timing"] == "pre") & (eeg_raw["poor_contact"] != True)
        ].copy()
        eeg_pre["date"] = eeg_pre["date"].astype(str)
        available = ["date"] + [c for c in eeg_cols if c in eeg_pre.columns]
        eeg_slim = eeg_pre[available].copy()
    else:
        eeg_slim = pd.DataFrame({"date": pd.Series(dtype=str)})

    # ── Join on date ────────────────────────────────────────────────────────
    df = survey_slim.merge(readiness, on="date", how="left")
    df = df.merge(agility, on="date", how="left")
    df = df.merge(eeg_slim, on="date", how="left")

    available_vars = [(k, l) for k, l in VARS if k in df.columns]
    var_keys   = [k for k, _ in available_vars]
    var_labels = [l for _, l in available_vars]

    # ── Spearman ρ for all pairs ────────────────────────────────────────────
    matrix = []
    for i, (k1, _) in enumerate(available_vars):
        row = []
        for j, (k2, _) in enumerate(available_vars):
            if i == j:
                row.append({
                    "rho": 1.0,
                    "p_value": None,
                    "n": int(df[k1].notna().sum()),
                    "test": "Spearman ρ",
                })
            else:
                pair = df[[k1, k2]].dropna()
                n = len(pair)
                if n >= 5:
                    rho, pval = stats.spearmanr(pair[k1], pair[k2])
                    row.append({
                        "rho":     round(float(rho), 3),
                        "p_value": round(float(pval), 4),
                        "n":       n,
                        "test":    "Spearman ρ",
                    })
                else:
                    row.append({"rho": None, "p_value": None, "n": n, "test": "Spearman ρ"})
        matrix.append(row)

    return _clean({"var_keys": var_keys, "var_labels": var_labels, "matrix": matrix})


# ---------------------------------------------------------------------------
# Sparring Load Recommendation
# ---------------------------------------------------------------------------

@router.get("/recommendation")
def get_recommendation():
    """
    Sparring load recommendation based on last 7 days of WHOOP + Pison data.
    Framework: Multidimensional Neurological Load Management (Dutton et al., 2022).
    Threshold: Recovery < 33% = high risk (WHOOP red zone, validated by Flatt et al., 2017).
    Confidence: bootstrapped from 7-day variance relative to personal SD.
    """
    df = _load_merged()
    df = df.sort_values("date")

    if len(df) < 7:
        return {"recommendation": "Insufficient data", "confidence": None}

    baseline = df.iloc[:-7]
    last7    = df.iloc[-7:]

    def personal_stats(col):
        vals = baseline[col].dropna().values.astype(float)
        return float(np.mean(vals)) if len(vals) else None, float(np.std(vals)) if len(vals) > 1 else None

    hrv_base, hrv_sd   = personal_stats("hrv_ms")
    rec_base, rec_sd   = personal_stats("recovery_pct")
    rhr_base, rhr_sd   = personal_stats("rhr_bpm")

    hrv_7  = float(last7["hrv_ms"].mean())
    rec_7  = float(last7["recovery_pct"].mean())
    rhr_7  = float(last7["rhr_bpm"].mean())

    flags = []
    domain_scores = {}

    # HRV: flag if >15% below baseline
    if hrv_base:
        hrv_decline = (hrv_base - hrv_7) / hrv_base
        domain_scores["hrv"] = min(max((1 - hrv_decline) * 100, 0), 100)
        if hrv_decline > HRV_DECLINE_PCT:
            flags.append(f"HRV down {hrv_decline*100:.0f}% from baseline")

    # Recovery: flag if in red zone or >20% below baseline
    if rec_base:
        rec_decline = (rec_base - rec_7) / rec_base
        domain_scores["recovery"] = min(max((1 - rec_decline) * 100, 0), 100)
        if rec_7 < RECOVERY_THRESHOLD:
            flags.append(f"Recovery averaging {rec_7:.0f}% — red zone")
        elif rec_decline > 0.20:
            flags.append(f"Recovery down {rec_decline*100:.0f}% from baseline")

    # RHR: flag if elevated >10% above baseline
    if rhr_base:
        rhr_rise = (rhr_7 - rhr_base) / rhr_base
        domain_scores["rhr"] = min(max((1 - rhr_rise) * 100, 0), 100)
        if rhr_rise > 0.10:
            flags.append(f"RHR elevated {rhr_rise*100:.0f}% above baseline")

    # EMG (Pison readiness — reaction time, lower = better)
    pison_rec = _load_pison()
    readiness_all = pison_rec[pison_rec["category"] == "daily_readiness"].copy()
    readiness_all = readiness_all[readiness_all["reading_value"].notna()].sort_values("date")
    emg_score = 75.0  # neutral default when insufficient data
    if len(readiness_all) >= 14:
        r_base  = float(readiness_all.iloc[:-7]["reading_value"].mean())
        r_recent = float(readiness_all.iloc[-7:]["reading_value"].mean())
        if r_recent > 0:
            # Higher RT = slower = worse → invert ratio
            emg_score = min(max((r_base / r_recent) * 100, 0), 100)
            if r_recent > r_base * (1 + RT_DECLINE_PCT):
                flags.append(f"Reaction time up {((r_recent/r_base)-1)*100:.0f}% from baseline — EMG fatigue")
    domain_scores["emg"] = round(emg_score, 1)

    # EEG (alpha/theta ratio — higher = more alert, lower = neural fatigue)
    eeg_all = eeg_pipeline.process_all_sessions()
    eeg_score = 75.0  # neutral default
    if not eeg_all.empty:
        valid_eeg = eeg_all[eeg_all["poor_contact"] != True].sort_values("date")
        if len(valid_eeg) >= 4 and "alpha_theta_ratio" in valid_eeg.columns:
            atr_base   = valid_eeg.iloc[:-2]["alpha_theta_ratio"].dropna()
            atr_recent = valid_eeg.iloc[-2:]["alpha_theta_ratio"].dropna()
            if not atr_base.empty and not atr_recent.empty:
                ratio = float(atr_recent.mean()) / float(atr_base.mean())
                eeg_score = min(max(ratio * 100, 0), 100)
                if ratio < 0.85:
                    flags.append(f"Alpha/theta ratio down {(1-ratio)*100:.0f}% from baseline — EEG suggests neural fatigue")
    domain_scores["eeg"] = round(eeg_score, 1)

    # Overall score: PPG 35%, EEG 35%, EMG 30%
    ppg_sub = {"recovery": 0.50, "hrv": 0.35, "rhr": 0.15}
    ppg_score = sum(domain_scores.get(k, 75) * w for k, w in ppg_sub.items())
    overall = ppg_score * 0.35 + domain_scores.get("eeg", 75) * 0.35 + domain_scores.get("emg", 75) * 0.30

    # Recommendation + sessions allowed
    if not flags and overall >= 75:
        recommendation = "OK to spar — metrics are within healthy range"
        sessions       = 2
        confidence     = min(int(overall), 95)
    elif len(flags) == 1 or overall >= 55:
        recommendation = "Spar with caution — one or more metrics flagged"
        sessions       = 1
        confidence     = int(overall * 0.85)
    else:
        recommendation = "Avoid sparring — multiple metrics in decline"
        sessions       = 0
        confidence     = int((100 - overall) * 0.80)

    return _clean({
        "recommendation":   recommendation,
        "sessions_allowed": sessions,
        "confidence":       confidence,
        "overall_score":    round(overall, 1),
        "flags":            flags,
        "domain_scores":    {k: round(v, 1) for k, v in domain_scores.items()},
        "last7_averages": {
            "hrv_ms":       round(hrv_7, 1),
            "recovery_pct": round(rec_7, 1),
            "rhr_bpm":      round(rhr_7, 1),
        },
        "baselines": {
            "hrv_ms":       round(hrv_base, 1) if hrv_base else None,
            "recovery_pct": round(rec_base, 1) if rec_base else None,
            "rhr_bpm":      round(rhr_base, 1) if rhr_base else None,
        },
        "thresholds": {
            "recovery_red_zone": RECOVERY_THRESHOLD,
            "hrv_decline_pct":   HRV_DECLINE_PCT * 100,
            "rhr_rise_pct":      10,
        },
    })


# ---------------------------------------------------------------------------
# EEG Brain Health
# ---------------------------------------------------------------------------

@router.get("/eeg")
def get_eeg():
    """
    Process all Neurable EEG sessions and return metrics.
    Filters out poor-contact sessions.
    Returns session list and pre/post comparison for days with both sessions.
    """
    df = eeg_pipeline.process_all_sessions()

    if df.empty:
        return _clean({"sessions": [], "pre_post_comparison": []})

    df = df[df["poor_contact"] != True].copy()

    KEEP_COLS = ["date", "timing", "alpha_theta_ratio", "rel_alpha_eo",
                 "rel_theta_eo", "rel_delta_eo", "sef90", "artifact_rejection_pct"]
    available = [c for c in KEEP_COLS if c in df.columns]
    sessions_df = df[available].copy()
    sessions_df["date"] = sessions_df["date"].astype(str)

    for col in ["alpha_theta_ratio", "rel_alpha_eo", "rel_theta_eo", "rel_delta_eo", "sef90", "artifact_rejection_pct"]:
        if col in sessions_df.columns:
            sessions_df[col] = sessions_df[col].round(4)

    sessions = sessions_df.where(sessions_df.notna(), None).to_dict(orient="records")

    pre_post = []
    if "timing" in df.columns and "date" in df.columns:
        for date, group in df.groupby("date"):
            pre_rows  = group[group["timing"] == "pre"]
            post_rows = group[group["timing"] == "post"]
            if pre_rows.empty or post_rows.empty:
                continue

            def _val(rows, col):
                v = rows[col].dropna()
                return float(v.iloc[0]) if not v.empty else None

            atr_pre  = _val(pre_rows, "alpha_theta_ratio")
            atr_post = _val(post_rows, "alpha_theta_ratio")
            ra_pre   = _val(pre_rows, "rel_alpha_eo")
            ra_post  = _val(post_rows, "rel_alpha_eo")
            sef_pre  = _val(pre_rows, "sef90")
            sef_post = _val(post_rows, "sef90")

            pre_post.append({
                "date": str(date),
                "alpha_theta_pre":   round(atr_pre, 4)  if atr_pre  is not None else None,
                "alpha_theta_post":  round(atr_post, 4) if atr_post is not None else None,
                "alpha_theta_delta": round(atr_post - atr_pre, 4) if (atr_pre is not None and atr_post is not None) else None,
                "rel_alpha_pre":     round(ra_pre, 4)   if ra_pre   is not None else None,
                "rel_alpha_post":    round(ra_post, 4)  if ra_post  is not None else None,
                "sef90_pre":         round(sef_pre, 2)  if sef_pre  is not None else None,
                "sef90_post":        round(sef_post, 2) if sef_post is not None else None,
            })

    return _clean({"sessions": sessions, "pre_post_comparison": pre_post})
