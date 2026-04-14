"""
Daily survey loader.
Source: BigQuery (boxsmart.training_log)

Notes:
- head_contact_level: 'None'/'Low'/'Medium'/'High'
- caffeine: stored as mg
- endurance: perceived endurance rating (1–5 scale), N/A → NaN
"""
from typing import Optional

import pandas as pd

CONTACT_MAP = {"None": 0, "Low": 1, "Medium": 2, "High": 3}

_EMPTY_COLS = ["date", "day_of_week", "trained", "sparred", "fought",
               "head_contact_level", "headache", "creatine", "caffeine", "endurance"]


def _normalize(df: pd.DataFrame, filled_only: bool) -> pd.DataFrame:
    df["date"] = pd.to_datetime(df["date"]).dt.date

    for col in ["trained", "sparred", "fought", "headache", "creatine"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")

    if "caffeine" in df.columns:
        df["caffeine"] = pd.to_numeric(df["caffeine"], errors="coerce")

    if "endurance" in df.columns:
        df["endurance"] = pd.to_numeric(df["endurance"], errors="coerce")

    if "head_contact_level" in df.columns:
        df["head_contact_level"] = df["head_contact_level"].replace({"N/A": pd.NA, "": pd.NA})

    if filled_only:
        df = df[df["trained"].notna()].reset_index(drop=True)

    return df


def load_survey(filled_only: bool = True) -> pd.DataFrame:
    """
    Load and normalize all survey entries from BigQuery (falls back to CSV).

    filled_only=True (default): returns only rows where data has been entered.

    Columns: date, day_of_week, trained, sparred, fought, head_contact_level,
             headache, creatine, caffeine, endurance
    """
    try:
        from gcp import bq  # type: ignore
        query = "SELECT * FROM `boxsmart-492022.boxsmart.training_log` ORDER BY date"
        df = bq.query(query).to_dataframe()
        return _normalize(df, filled_only)
    except Exception as e:
        print(f"[survey_loader] BQ query failed: {e}")
        return pd.DataFrame(columns=_EMPTY_COLS)


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
