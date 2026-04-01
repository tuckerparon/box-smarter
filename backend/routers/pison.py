import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Form, HTTPException

from auth import verify_password
from gcp import bq, DATASET

router = APIRouter()

CSV_PATH = Path(__file__).parents[2] / "pison" / "data" / "pison_extracted.csv"
BASELINE_READINESS_MS = 123.0
BASELINE_AGILITY = 80.0


def _load_csv() -> pd.DataFrame:
    if not CSV_PATH.exists():
        return pd.DataFrame()
    df = pd.read_csv(CSV_PATH)
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date.astype(str)
    return df


@router.get("/readiness")
def get_readiness():
    """Weekly and daily readiness (reaction time, ms) series."""
    df = _load_csv()
    weekly = df[df["category"] == "weekly_readiness"].copy()
    weekly = weekly[weekly["summary_value"].notna()][
        ["date", "week_start", "week_end", "summary_value", "vs_baseline_pct", "vs_baseline_direction"]
    ].rename(columns={"summary_value": "score_ms"})

    daily = df[df["category"] == "daily_readiness"].copy()
    daily = daily[daily["reading_value"].notna()][
        ["date", "reading_timestamp", "reading_value", "reading_vs_baseline_pct", "reading_vs_baseline_direction", "notes"]
    ].rename(columns={"reading_value": "score_ms", "reading_timestamp": "timestamp",
                      "reading_vs_baseline_pct": "vs_baseline_pct",
                      "reading_vs_baseline_direction": "vs_baseline_direction"})

    return {
        "baseline_ms": BASELINE_READINESS_MS,
        "weekly": weekly.where(weekly.notna(), None).to_dict(orient="records"),
        "daily": daily.where(daily.notna(), None).to_dict(orient="records"),
    }


@router.get("/agility")
def get_agility():
    """Weekly and daily agility (go-no-go score, 0–100) series."""
    df = _load_csv()
    weekly = df[df["category"] == "weekly_agility"].copy()
    weekly = weekly[weekly["summary_value"].notna()][
        ["date", "week_start", "week_end", "summary_value", "vs_baseline_pct", "vs_baseline_direction"]
    ].rename(columns={"summary_value": "score"})

    daily = df[df["category"] == "daily_agility"].copy()
    daily = daily[daily["reading_value"].notna()][
        ["date", "reading_timestamp", "reading_value", "reading_vs_baseline_pct", "reading_vs_baseline_direction", "notes"]
    ].rename(columns={"reading_value": "score", "reading_timestamp": "timestamp",
                      "reading_vs_baseline_pct": "vs_baseline_pct",
                      "reading_vs_baseline_direction": "vs_baseline_direction"})

    return {
        "baseline": BASELINE_AGILITY,
        "weekly": weekly.where(weekly.notna(), None).to_dict(orient="records"),
        "daily": daily.where(daily.notna(), None).to_dict(orient="records"),
    }


@router.get("/pre-post-delta")
def get_pre_post_delta():
    """Pre→post boxing delta per session, split by sparring vs non-sparring."""
    df = _load_csv()
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
    df = _load_csv()
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


CSV_HEADERS = [
    "source_image", "category", "date", "week_start", "week_end",
    "summary_value", "summary_unit", "vs_baseline_pct", "vs_baseline_direction",
    "reading_timestamp", "reading_value", "reading_unit",
    "reading_vs_baseline_pct", "reading_vs_baseline_direction", "notes",
]


@router.post("/log")
def log_pison(
    password: str = Form(...),
    log_date: str = Form(...),       # YYYY-MM-DD
    log_time: str = Form(...),       # HH:MM (24h)
    readiness_ms: Optional[float] = Form(None),
    agility_score: Optional[float] = Form(None),
    tags: str = Form(""),            # comma-separated tag string
):
    """
    Append one or two rows to pison_extracted.csv.
    One row per metric (readiness / agility) if a value was provided.
    """
    verify_password(password)

    try:
        dt = datetime.strptime(f"{log_date} {log_time}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date/time format")

    # Format timestamp to match existing CSV style: "09:15 am 04/01/2026"
    timestamp_str = dt.strftime("%-I:%M %p %m/%d/%Y").lower()
    # e.g. "9:15 am 04/01/2026" — lowercase am/pm to match app format

    rows_to_write = []

    if readiness_ms is not None:
        rows_to_write.append({
            "source_image": "manual",
            "category": "daily_readiness",
            "date": log_date,
            "week_start": "",
            "week_end": "",
            "summary_value": "",
            "summary_unit": "",
            "vs_baseline_pct": "",
            "vs_baseline_direction": "",
            "reading_timestamp": timestamp_str,
            "reading_value": readiness_ms,
            "reading_unit": "ms",
            "reading_vs_baseline_pct": "",
            "reading_vs_baseline_direction": "",
            "notes": tags,
        })

    if agility_score is not None:
        rows_to_write.append({
            "source_image": "manual",
            "category": "daily_agility",
            "date": log_date,
            "week_start": "",
            "week_end": "",
            "summary_value": "",
            "summary_unit": "",
            "vs_baseline_pct": "",
            "vs_baseline_direction": "",
            "reading_timestamp": timestamp_str,
            "reading_value": agility_score,
            "reading_unit": "/100",
            "reading_vs_baseline_pct": "",
            "reading_vs_baseline_direction": "",
            "notes": tags,
        })

    if not rows_to_write:
        raise HTTPException(status_code=422, detail="Provide at least one of readiness_ms or agility_score")

    # ── Write to local CSV (keeps existing dashboard reads working) ──
    with open(CSV_PATH, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        for row in rows_to_write:
            writer.writerow(row)

    # ── Write to BigQuery ──
    now = datetime.now(timezone.utc).isoformat()
    bq_rows = []
    for row in rows_to_write:
        category = row["category"]  # daily_readiness | daily_agility
        bq_rows.append({
            "date": log_date,
            "reading_ts": dt.replace(tzinfo=timezone.utc).isoformat(),
            "category": category,
            "value": row["reading_value"],
            "unit": row["reading_unit"],
            "tags": tags,
            "source": "manual",
            "ingested_at": now,
        })

    errors = bq.insert_rows_json(f"{DATASET}.pison_readings", bq_rows)
    if errors:
        # Log but don't fail — local CSV write already succeeded
        print(f"[WARN] BigQuery insert errors: {errors}")

    return {"ok": True, "rows_written": len(rows_to_write)}
