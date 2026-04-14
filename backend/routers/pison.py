from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Form, HTTPException

from auth import verify_password
from gcp import bq, DATASET

router = APIRouter()

BASELINE_READINESS_MS = 123.0
BASELINE_AGILITY = 80.0

_EMPTY_DF = pd.DataFrame(columns=["date", "reading_timestamp", "category", "reading_value", "notes"])


def _load_from_bq() -> pd.DataFrame:
    """
    Load Pison daily readings from BigQuery in tall format.
    Returns columns: date, reading_timestamp, category, reading_value, notes
    """
    try:
        query = (
            "SELECT date, datetime, readiness_ms, agility_score, tags "
            "FROM `boxsmart-492022.boxsmart.pison_readings` ORDER BY datetime"
        )
        raw = bq.query(query).to_dataframe()
        rows = []
        for _, r in raw.iterrows():
            date_str = str(pd.to_datetime(r["date"]).date())
            tags = str(r["tags"]) if pd.notna(r.get("tags")) else ""
            dt_str = str(r["datetime"]) if pd.notna(r.get("datetime")) else ""
            if pd.notna(r.get("readiness_ms")):
                rows.append({"date": date_str, "reading_timestamp": dt_str,
                             "category": "daily_readiness",
                             "reading_value": float(r["readiness_ms"]), "notes": tags})
            if pd.notna(r.get("agility_score")):
                rows.append({"date": date_str, "reading_timestamp": dt_str,
                             "category": "daily_agility",
                             "reading_value": float(r["agility_score"]), "notes": tags})
        return pd.DataFrame(rows) if rows else _EMPTY_DF.copy()
    except Exception as e:
        print(f"[pison] BQ query failed: {e}")
        return _EMPTY_DF.copy()


def _weekly_summary(daily: pd.DataFrame, baseline: float) -> list:
    """Compute weekly aggregates from daily readings."""
    if daily.empty:
        return []
    df = daily.copy()
    df["date_dt"] = pd.to_datetime(df["date"])
    iso = df["date_dt"].dt.isocalendar()
    df["year"] = iso["year"].values
    df["week"] = iso["week"].values
    agg = (
        df.groupby(["year", "week"])
        .agg(summary_value=("reading_value", "mean"),
             week_start=("date_dt", "min"),
             week_end=("date_dt", "max"))
        .reset_index()
    )
    agg["vs_baseline_pct"] = ((agg["summary_value"] - baseline) / baseline * 100).round(1)
    agg["vs_baseline_direction"] = agg["vs_baseline_pct"].apply(
        lambda x: "above" if x > 0 else ("below" if x < 0 else "at")
    )
    agg["summary_value"] = agg["summary_value"].round(1)
    agg["week_start"] = agg["week_start"].dt.date.astype(str)
    agg["week_end"] = agg["week_end"].dt.date.astype(str)
    return agg[["week_start", "week_end", "summary_value", "vs_baseline_pct", "vs_baseline_direction"]].to_dict(orient="records")


@router.get("/readiness")
def get_readiness():
    """Weekly and daily readiness (reaction time, ms) series."""
    df = _load_from_bq()
    daily = df[df["category"] == "daily_readiness"].copy()

    daily_out = daily[["date", "reading_timestamp", "reading_value", "notes"]].rename(
        columns={"reading_value": "score_ms", "reading_timestamp": "timestamp"}
    )
    daily_out["vs_baseline_pct"] = ((daily_out["score_ms"] - BASELINE_READINESS_MS) / BASELINE_READINESS_MS * 100).round(1)
    daily_out["vs_baseline_direction"] = daily_out["vs_baseline_pct"].apply(
        lambda x: "above" if x > 0 else ("below" if x < 0 else "at")
    )

    return {
        "baseline_ms": BASELINE_READINESS_MS,
        "weekly": _weekly_summary(daily, BASELINE_READINESS_MS),
        "daily": daily_out.where(daily_out.notna(), None).to_dict(orient="records"),
    }


@router.get("/agility")
def get_agility():
    """Weekly and daily agility (go-no-go score, 0–100) series."""
    df = _load_from_bq()
    daily = df[df["category"] == "daily_agility"].copy()

    daily_out = daily[["date", "reading_timestamp", "reading_value", "notes"]].rename(
        columns={"reading_value": "score", "reading_timestamp": "timestamp"}
    )
    daily_out["vs_baseline_pct"] = ((daily_out["score"] - BASELINE_AGILITY) / BASELINE_AGILITY * 100).round(1)
    daily_out["vs_baseline_direction"] = daily_out["vs_baseline_pct"].apply(
        lambda x: "above" if x > 0 else ("below" if x < 0 else "at")
    )

    return {
        "baseline": BASELINE_AGILITY,
        "weekly": _weekly_summary(daily, BASELINE_AGILITY),
        "daily": daily_out.where(daily_out.notna(), None).to_dict(orient="records"),
    }


@router.get("/pre-post-delta")
def get_pre_post_delta():
    """Pre→post boxing delta per session, split by sparring vs non-sparring."""
    df = _load_from_bq()
    daily = df[df["category"].isin(["daily_readiness", "daily_agility"])].copy()
    daily = daily[daily["reading_value"].notna() & daily["notes"].notna()]

    rows = []
    for date, group in daily.groupby("date"):
        for cat, subgroup in group.groupby("category"):
            pre = subgroup[subgroup["notes"].str.contains("pre", case=False, na=False)]
            post = subgroup[subgroup["notes"].str.contains("post", case=False, na=False)]
            if pre.empty or post.empty:
                continue
            pre_val = pre["reading_value"].mean()
            post_val = post["reading_value"].mean()
            is_sparring = subgroup["notes"].str.contains("sparring", case=False, na=False).any()
            rows.append({
                "date": date,
                "category": cat,
                "pre": round(pre_val, 1),
                "post": round(post_val, 1),
                "delta": round(post_val - pre_val, 1),
                "sparring": is_sparring,
            })

    return rows


@router.get("/load-recommendation")
def get_load_recommendation():
    """Sparring load recommendation based on last 7 days."""
    df = _load_from_bq()
    daily_r = df[(df["category"] == "daily_readiness") & df["reading_value"].notna()].copy()
    daily_r["date"] = pd.to_datetime(daily_r["date"])
    last7 = daily_r[daily_r["date"] >= daily_r["date"].max() - pd.Timedelta(days=7)]

    if last7.empty:
        return {"recommendation": "Insufficient data", "confidence": None, "details": {}}

    avg_ms = last7["reading_value"].mean()
    pct_above_baseline = (avg_ms - BASELINE_READINESS_MS) / BASELINE_READINESS_MS * 100

    if pct_above_baseline < 20:
        rec = "OK to spar"
        confidence = 90
    elif pct_above_baseline < 35:
        rec = "Spar with caution — reaction time elevated"
        confidence = 70
    else:
        rec = "Avoid sparring — reaction time significantly above baseline"
        confidence = 85

    return {
        "recommendation": rec,
        "confidence": confidence,
        "details": {
            "avg_readiness_ms_last7d": round(avg_ms, 1),
            "pct_above_baseline": round(pct_above_baseline, 1),
            "baseline_ms": BASELINE_READINESS_MS,
        }
    }


@router.post("/log")
def log_pison(
    password: str = Form(...),
    log_date: str = Form(...),       # YYYY-MM-DD
    log_time: str = Form(...),       # HH:MM (24h)
    readiness_ms: Optional[float] = Form(None),
    agility_score: Optional[float] = Form(None),
    agility_ms: Optional[float] = Form(None),
    agility_accuracy: Optional[float] = Form(None),
    tags: str = Form(""),            # comma-separated tag string
):
    """Append a Pison reading to BigQuery. One row per metric provided."""
    verify_password(password)

    try:
        dt = datetime.strptime(f"{log_date} {log_time}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date/time format")

    has_agility = any(v is not None for v in [agility_score, agility_ms, agility_accuracy])
    if readiness_ms is None and not has_agility:
        raise HTTPException(status_code=422, detail="Provide at least one score value")

    agility_notes_parts = [tags] if tags else []
    if agility_ms is not None:
        agility_notes_parts.append(f"agility_ms={agility_ms}")
    if agility_accuracy is not None:
        agility_notes_parts.append(f"agility_accuracy={agility_accuracy}")

    now = datetime.now(timezone.utc).isoformat()
    agility_val = agility_score

    bq_rows = [{
        "date":             log_date,
        "datetime":         dt.isoformat(),
        "readiness_ms":     readiness_ms,
        "agility_ms":       agility_ms,
        "agility_accuracy": agility_accuracy,
        "agility_score":    agility_val,
        "tags":             ", ".join(agility_notes_parts) if agility_notes_parts else tags,
        "source":           "manual",
        "ingested_at":      now,
    }]

    errors = bq.insert_rows_json(f"{DATASET}.pison_readings", bq_rows)
    if errors:
        raise HTTPException(status_code=500, detail=f"BigQuery error: {errors}")

    return {"ok": True}
