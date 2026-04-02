"""
Daily survey loader.
Source: survey/head_contact_study.csv

Notes:
- BACKFILL rows: early camp days logged retroactively without detail — treated as NaN
- Future rows: pre-filled calendar with all NaN — filtered out
- head_contact_level: CSV uses 'None'/'Low'/'Medium'/'High' (not 'none'/'low'/'med'/'high')
- caffeine: stored as entered (0, 0.5, 0.6, 1) — unit ambiguous (CLAUDE.md says mg,
  but values suggest cups; stored as-is for now)
"""
from pathlib import Path
from typing import Optional

import pandas as pd

DATA_DIR = Path(__file__).parents[2] / "survey"

CONTACT_MAP = {"None": 0, "Low": 1, "Medium": 2, "High": 3}


def load_survey(filled_only: bool = True) -> pd.DataFrame:
    """
    Load and normalize all survey entries.

    filled_only=True (default): returns only rows where data has actually been entered
    (excludes BACKFILL rows and future/blank rows).

    Columns returned:
      date (date), day_of_week (str), trained (Int64), sparred (Int64),
      fought (Int64), head_contact_level (str|None), headache (Int64),
      creatine (Int64), caffeine (float|None)
    """
    if not (DATA_DIR / "head_contact_study.csv").exists():
        return pd.DataFrame(columns=["date","day_of_week","trained","sparred","fought",
                                      "head_contact_level","headache","creatine","caffeine"])
    df = pd.read_csv(DATA_DIR / "head_contact_study.csv")

    df["date"] = pd.to_datetime(df["date"], format="%m/%d/%Y").dt.date

    # Replace BACKFILL sentinel with NaN
    for col in ["trained", "sparred", "fought", "headache", "creatine", "caffeine"]:
        df[col] = df[col].replace("BACKFILL", pd.NA)

    # Normalize head_contact_level — 'N/A' also becomes NaN
    df["head_contact_level"] = df["head_contact_level"].replace("N/A", pd.NA)

    # Cast binary columns to nullable integer
    for col in ["trained", "sparred", "fought", "headache", "creatine"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")

    df["caffeine"] = pd.to_numeric(df["caffeine"], errors="coerce")

    if filled_only:
        # Keep only rows where 'trained' has been entered (not BACKFILL, not future blank)
        df = df[df["trained"].notna()].reset_index(drop=True)

    return df


def weekly_contact_score(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Compute composite head contact score per ISO week.
    contact_score = mean(map(None→0, Low→1, Medium→2, High→3))
    Only includes rows where head_contact_level is not NaN.

    Returns DataFrame with columns: year, week, contact_score, n_days
    """
    if df is None:
        df = load_survey()

    df = df.copy()
    df["contact_numeric"] = df["head_contact_level"].map(CONTACT_MAP)

    dates = pd.to_datetime(df["date"].astype(str))
    iso = dates.dt.isocalendar()
    df["year"] = iso["year"].values
    df["week"] = iso["week"].values

    result = (
        df[df["contact_numeric"].notna()]
        .groupby(["year", "week"])
        .agg(contact_score=("contact_numeric", "mean"), n_days=("contact_numeric", "count"))
        .reset_index()
    )
    return result


def sparring_days(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """Return rows where sparred == 1."""
    if df is None:
        df = load_survey()
    return df[df["sparred"] == 1].reset_index(drop=True)


def neuroprotective_summary(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Return daily caffeine and creatine intake alongside training flags.
    Used for correlating intake with EEG/Pison metric deltas.
    """
    if df is None:
        df = load_survey()
    return df[["date", "trained", "sparred", "creatine", "caffeine"]].copy()
