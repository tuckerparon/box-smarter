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


def _to_nullable_int(series: pd.Series) -> pd.Series:
    """
    Safely coerce a series to nullable Int64, handling bool/float/int/string types
    that BigQuery may return depending on schema and pyarrow version.
    """
    def _coerce(x):
        try:
            if x is None:
                return pd.NA
            if isinstance(x, float) and pd.isna(x):
                return pd.NA
            if hasattr(x, '__class__') and x.__class__.__name__ in ('NAType', 'NA'):
                return pd.NA
            return int(x)
        except (ValueError, TypeError):
            return pd.NA

    try:
        # Fast path: standard pd.to_numeric works for most cases
        result = pd.to_numeric(series, errors="coerce").astype("Int64")
        return result
    except (TypeError, ValueError):
        # Slow path: cell-by-cell coercion for unusual dtypes (e.g. BooleanDtype from pyarrow)
        return pd.array([_coerce(x) for x in series], dtype="Int64")


def _normalize(df: pd.DataFrame, filled_only: bool) -> pd.DataFrame:
    df = df.copy()
    # errors='coerce' turns unparseable/out-of-range dates into NaT instead of crashing.
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df[df["date"].notna()].reset_index(drop=True)

    for col in ["trained", "sparred", "fought", "headache", "creatine"]:
        if col in df.columns:
            df[col] = _to_nullable_int(df[col])

    if "caffeine" in df.columns:
        df["caffeine"] = pd.to_numeric(df["caffeine"], errors="coerce")

    if "endurance" in df.columns:
        df["endurance"] = pd.to_numeric(df["endurance"], errors="coerce")

    if "head_contact_level" in df.columns:
        df["head_contact_level"] = df["head_contact_level"].replace({"N/A": pd.NA, "": pd.NA})

    if filled_only:
        if "trained" in df.columns:
            df = df[df["trained"].notna()].reset_index(drop=True)

    return df


def load_survey(filled_only: bool = True) -> pd.DataFrame:
    """
    Load and normalize all survey entries from BigQuery.

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
        print(f"[survey_loader] load_survey failed (filled_only={filled_only}): {e}")
        return pd.DataFrame(columns=_EMPTY_COLS)


def weekly_contact_score(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Compute composite head contact score per ISO week.
    contact_score = mean(map(None→0, Low→1, Medium→2, High→3))
    Only includes rows where head_contact_level is not NaN.

    Returns DataFrame with columns: year, week, contact_score, n_days
    """
    if df is None:
        df = load_survey(filled_only=False)

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
        df = load_survey(filled_only=False)
    return df[df["sparred"] == 1].reset_index(drop=True)


def neuroprotective_summary(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Return daily caffeine and creatine intake alongside training flags.
    Used for correlating intake with EEG/Pison metric deltas.
    """
    if df is None:
        df = load_survey()
    return df[["date", "trained", "sparred", "creatine", "caffeine"]].copy()
