"""
WHOOP data loader.
Source: BigQuery (boxsmart.whoop_daily, boxsmart.whoop_sleep)

Camp window: 2026-01-15 – 2026-05-07
"""
from typing import Optional

import pandas as pd

CAMP_START = pd.Timestamp("2026-01-15").date()
CAMP_END = pd.Timestamp("2026-05-07").date()


def _empty_cycles() -> pd.DataFrame:
    return pd.DataFrame(columns=["date", "recovery_pct", "rhr_bpm", "hrv_ms",
                                  "skin_temp_c", "spo2_pct", "strain", "energy_kcal", "max_hr", "avg_hr"])

def _empty_sleep() -> pd.DataFrame:
    return pd.DataFrame(columns=["date", "sleep_onset", "wake_onset", "sleep_perf_pct", "asleep_min",
                                  "in_bed_min", "light_min", "deep_min", "rem_min", "awake_min",
                                  "sleep_need_min", "sleep_debt_min", "efficiency_pct", "consistency_pct",
                                  "respiratory_rpm", "is_nap"])


def load_cycles(camp_only: bool = True) -> pd.DataFrame:
    """
    Load WHOOP physiological cycles.
    Queries BigQuery whoop_daily; falls back to local CSV.
    Returns one row per day.
    """
    try:
        from gcp import bq  # type: ignore
        query = "SELECT * FROM `boxsmart-492022.boxsmart.whoop_daily` ORDER BY date"
        df = bq.query(query).to_dataframe()
        df["date"] = pd.to_datetime(df["date"]).dt.date
        keep = ["date", "recovery_pct", "rhr_bpm", "hrv_ms", "skin_temp_c",
                "spo2_pct", "strain", "energy_kcal", "max_hr", "avg_hr"]
        df = df[[c for c in keep if c in df.columns]].sort_values("date").reset_index(drop=True)
        if camp_only:
            df = df[(df["date"] >= CAMP_START) & (df["date"] <= CAMP_END)].reset_index(drop=True)
        return df
    except Exception as e:
        print(f"[whoop_loader] BQ query failed: {e}")
        return _empty_cycles()


def load_sleep(camp_only: bool = True, naps: bool = False) -> pd.DataFrame:
    """
    Load WHOOP sleep sessions.
    Queries BigQuery whoop_sleep; falls back to local CSV.
    """
    try:
        from gcp import bq  # type: ignore
        query = "SELECT * FROM `boxsmart-492022.boxsmart.whoop_sleep` ORDER BY date"
        df = bq.query(query).to_dataframe()
        df["date"] = pd.to_datetime(df["date"]).dt.date
        df["is_nap"] = df["nap"].astype(bool)
        # BQ uses start/end; rename to match downstream expectations
        if "start" in df.columns:
            df = df.rename(columns={"start": "sleep_onset", "end": "wake_onset"})
        keep = ["date", "sleep_onset", "wake_onset", "sleep_perf_pct", "asleep_min",
                "in_bed_min", "light_min", "deep_min", "rem_min", "awake_min",
                "sleep_need_min", "sleep_debt_min", "efficiency_pct", "consistency_pct",
                "respiratory_rpm", "is_nap"]
        df = df[[c for c in keep if c in df.columns]].sort_values("date").reset_index(drop=True)
        if not naps:
            df = df[~df["is_nap"]].reset_index(drop=True)
        if camp_only:
            df = df[(df["date"] >= CAMP_START) & (df["date"] <= CAMP_END)].reset_index(drop=True)
        return df
    except Exception as e:
        print(f"[whoop_loader] BQ query failed: {e}")
        return _empty_sleep()


def sleep_stage_pct(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Add REM%, Deep%, Light% columns (as fraction of asleep_min).
    """
    if df is None:
        df = load_sleep()
    df = df.copy()
    for stage, col in [("rem_min", "rem_pct"), ("deep_min", "deep_pct"), ("light_min", "light_pct")]:
        df[col] = (df[stage] / df["asleep_min"].replace(0, pd.NA) * 100).round(1)
    return df


def merged(camp_only: bool = True) -> pd.DataFrame:
    """Join cycles + sleep (non-nap) on date."""
    cycles = load_cycles(camp_only=camp_only)
    sleep = sleep_stage_pct(load_sleep(camp_only=camp_only))
    return cycles.merge(sleep, on="date", how="left")
