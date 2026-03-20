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

PISON_CSV = Path(__file__).parents[2] / "pison" / "data" / "pison_extracted.csv"

# Literature-derived thresholds
RECOVERY_THRESHOLD = 33.0   # % — "red" zone in WHOOP; below = do not train hard
HRV_DECLINE_PCT    = 0.15   # 15% drop from personal baseline triggers caution
RT_DECLINE_PCT     = 0.20   # 20% increase in reaction time (Coutts et al., 2007)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_merged() -> pd.DataFrame:
    """WHOOP cycles + sleep + survey joined on date."""
    cycles = load_cycles()
    sleep  = sleep_stage_pct(load_sleep())
    survey = load_survey()

    cycles["date"] = pd.to_datetime(cycles["date"].astype(str))
    sleep["date"]  = pd.to_datetime(sleep["date"].astype(str))
    survey["date"] = pd.to_datetime(survey["date"].astype(str))

    df = cycles.merge(sleep, on="date", how="left")
    df = df.merge(survey, on="date", how="left")
    return df


def _load_pison() -> pd.DataFrame:
    df = pd.read_csv(PISON_CSV)
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
def get_ab_sparring():
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
        return {
            "label": label,
            "sparring":     {"mean": round(float(np.mean(spar)), 3),  "ci_lo": lo_s, "ci_hi": hi_s, "n": len(spar)},
            "non_sparring": {"mean": round(float(np.mean(nospar)), 3), "ci_lo": lo_n, "ci_hi": hi_n, "n": len(nospar)},
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

    pison_results = {}
    for cat, label, col_out in [
        ("daily_readiness", "Readiness (ms)", "readiness_ms"),
        ("daily_agility",   "Agility (/100)", "agility"),
    ]:
        sub = pison_daily[pison_daily["category"] == cat]
        # daily average per date
        avg = sub.groupby(["date_str", "sparred"])["reading_value"].mean().reset_index()
        spar   = avg[avg["sparred"] == 1]["reading_value"].values.astype(float)
        nospar = avg[avg["sparred"] == 0]["reading_value"].values.astype(float)
        r = _compare_metric(spar, nospar, label)
        if r:
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

        eeg_metrics = {
            "alpha_theta_ratio": "Alpha/Theta Ratio",
            "rel_alpha_eo":      "Rel. Alpha EO",
            "rel_theta_eo":      "Rel. Theta EO",
            "sef90":             "SEF90 (Hz)",
        }
        for col, label in eeg_metrics.items():
            if col not in eeg_df.columns:
                continue
            spar   = eeg_df[eeg_df["sparred"] == 1][col].dropna().values.astype(float)
            nospar = eeg_df[eeg_df["sparred"] == 0][col].dropna().values.astype(float)
            # Skip U-test if too few, but still return means
            lo_s, hi_s = _bootstrap_ci(spar) if len(spar) >= 2 else (None, None)
            lo_n, hi_n = _bootstrap_ci(nospar) if len(nospar) >= 2 else (None, None)
            entry = {
                "label": label,
                "sparring":     {"mean": round(float(np.mean(spar)), 4) if len(spar) else None, "ci_lo": lo_s, "ci_hi": hi_s, "n": len(spar)},
                "non_sparring": {"mean": round(float(np.mean(nospar)), 4) if len(nospar) else None, "ci_lo": lo_n, "ci_hi": hi_n, "n": len(nospar)},
                "insufficient_n": bool(len(spar) < 2 or len(nospar) < 2),
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

    # Merge in Pison weekly data
    pison = _load_pison()
    pison_r = pison[pison["category"] == "weekly_readiness"][["date", "summary_value"]].copy()
    pison_r.columns = ["date", "readiness_ms"]
    pison_r["date"] = pd.to_datetime(pison_r["date"])
    pison_r["week_start"] = (pison_r["date"] - pd.to_timedelta(pison_r["date"].dt.dayofweek, unit="D")).dt.strftime("%Y-%m-%d")

    pison_a = pison[pison["category"] == "weekly_agility"][["date", "summary_value"]].copy()
    pison_a.columns = ["date", "agility"]
    pison_a["date"] = pd.to_datetime(pison_a["date"])
    pison_a["week_start"] = (pison_a["date"] - pd.to_timedelta(pison_a["date"].dt.dayofweek, unit="D")).dt.strftime("%Y-%m-%d")

    weekly = weekly.merge(pison_r[["week_start", "readiness_ms"]], on="week_start", how="left")
    weekly = weekly.merge(pison_a[["week_start", "agility"]], on="week_start", how="left")

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
                eeg_valid.groupby("week_start")[["alpha_theta_ratio", "sef90"]]
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
    eeg_sessions = eeg_pipeline.process_all_sessions()
    if not eeg_sessions.empty:
        eeg_valid = eeg_sessions[eeg_sessions["poor_contact"] != True].copy()
        eeg_valid["date_str"] = eeg_valid["date"].astype(str)
        eeg_avg = eeg_valid.groupby("date_str")[["alpha_theta_ratio"]].mean().reset_index()
        df = df.merge(eeg_avg, on="date_str", how="left")

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
