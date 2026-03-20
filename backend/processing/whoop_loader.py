"""
WHOOP data loader.
Source: whoop/data/my_whoop_data_2026_03_20/
Files: physiological_cycles.csv, sleeps.csv

Camp window: 2026-01-15 – 2026-05-07
"""
from pathlib import Path
from typing import Optional

import pandas as pd

DATA_DIR = Path(__file__).parents[2] / "whoop" / "data" / "my_whoop_data_2026_03_20"
CAMP_START = pd.Timestamp("2026-01-15").date()
CAMP_END = pd.Timestamp("2026-05-07").date()


def load_cycles(camp_only: bool = True) -> pd.DataFrame:
    """
    Load physiological cycles with clean column names.
    Returns one row per WHOOP day.

    Columns: date, recovery_pct, rhr_bpm, hrv_ms, skin_temp_c, spo2_pct,
             strain, energy_kcal, max_hr, avg_hr
    """
    df = pd.read_csv(DATA_DIR / "physiological_cycles.csv")
    df["date"] = pd.to_datetime(df["Cycle start time"]).dt.date

    df = df.rename(columns={
        "Recovery score %": "recovery_pct",
        "Resting heart rate (bpm)": "rhr_bpm",
        "Heart rate variability (ms)": "hrv_ms",
        "Skin temp (celsius)": "skin_temp_c",
        "Blood oxygen %": "spo2_pct",
        "Day Strain": "strain",
        "Energy burned (cal)": "energy_kcal",
        "Max HR (bpm)": "max_hr",
        "Average HR (bpm)": "avg_hr",
    })

    keep = ["date", "recovery_pct", "rhr_bpm", "hrv_ms", "skin_temp_c",
            "spo2_pct", "strain", "energy_kcal", "max_hr", "avg_hr"]
    df = df[keep].sort_values("date").reset_index(drop=True)

    if camp_only:
        df = df[(df["date"] >= CAMP_START) & (df["date"] <= CAMP_END)].reset_index(drop=True)

    return df


def load_sleep(camp_only: bool = True, naps: bool = False) -> pd.DataFrame:
    """
    Load sleep sessions with clean column names.
    Excludes nap sessions by default.

    Columns: date, sleep_onset, wake_onset, sleep_perf_pct, asleep_min,
             in_bed_min, light_min, deep_min, rem_min, awake_min,
             sleep_debt_min, efficiency_pct, consistency_pct,
             respiratory_rpm, is_nap
    """
    df = pd.read_csv(DATA_DIR / "sleeps.csv")
    df["date"] = pd.to_datetime(df["Cycle start time"]).dt.date
    df["sleep_onset"] = pd.to_datetime(df["Sleep onset"])
    df["wake_onset"] = pd.to_datetime(df["Wake onset"])
    df["is_nap"] = df["Nap"].astype(bool)

    df = df.rename(columns={
        "Sleep performance %": "sleep_perf_pct",
        "Asleep duration (min)": "asleep_min",
        "In bed duration (min)": "in_bed_min",
        "Light sleep duration (min)": "light_min",
        "Deep (SWS) duration (min)": "deep_min",
        "REM duration (min)": "rem_min",
        "Awake duration (min)": "awake_min",
        "Sleep need (min)": "sleep_need_min",
        "Sleep debt (min)": "sleep_debt_min",
        "Sleep efficiency %": "efficiency_pct",
        "Sleep consistency %": "consistency_pct",
        "Respiratory rate (rpm)": "respiratory_rpm",
    })

    keep = ["date", "sleep_onset", "wake_onset", "sleep_perf_pct", "asleep_min",
            "in_bed_min", "light_min", "deep_min", "rem_min", "awake_min",
            "sleep_need_min", "sleep_debt_min", "efficiency_pct", "consistency_pct",
            "respiratory_rpm", "is_nap"]
    df = df[keep].sort_values("date").reset_index(drop=True)

    if not naps:
        df = df[~df["is_nap"]].reset_index(drop=True)

    if camp_only:
        df = df[(df["date"] >= CAMP_START) & (df["date"] <= CAMP_END)].reset_index(drop=True)

    return df


def sleep_stage_pct(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Add REM%, Deep%, Light% columns (as fraction of asleep_min).
    Useful for charting sleep composition over time.
    """
    if df is None:
        df = load_sleep()
    df = df.copy()
    for stage, col in [("rem_min", "rem_pct"), ("deep_min", "deep_pct"), ("light_min", "light_pct")]:
        df[col] = (df[stage] / df["asleep_min"].replace(0, pd.NA) * 100).round(1)
    return df


def merged(camp_only: bool = True) -> pd.DataFrame:
    """
    Join cycles + sleep (non-nap) on date.
    Provides a single row per day with all WHOOP metrics.
    """
    cycles = load_cycles(camp_only=camp_only)
    sleep = sleep_stage_pct(load_sleep(camp_only=camp_only))
    return cycles.merge(sleep, on="date", how="left")
