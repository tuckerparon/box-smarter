from fastapi import APIRouter
from pathlib import Path
import pandas as pd

router = APIRouter()

CSV_PATH = Path(__file__).parents[2] / "pison" / "data" / "pison_extracted.csv"
BASELINE_READINESS_MS = 123.0
BASELINE_AGILITY = 80.0


def _load_csv() -> pd.DataFrame:
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
