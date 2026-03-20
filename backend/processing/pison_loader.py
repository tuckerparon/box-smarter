"""
Pison data loader.
All readings are left hand (non-dominant). No hand separation needed.
Data is manually extracted from screenshots — stored as JSON/CSV in pison/data/.
"""
import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parents[2] / "pison" / "data"


def load_readiness() -> pd.DataFrame:
    """
    Load readiness (reaction time, ms) series.
    Lower is better. Baseline ~123ms.
    TODO: populate pison/data/readiness.csv from screenshot extraction.
    Columns: date, score_ms, week_label, tags
    """
    # TODO: replace with real CSV once extracted
    return pd.DataFrame(columns=["date", "score_ms", "week_label", "tags"])


def load_agility() -> pd.DataFrame:
    """
    Load agility (go-no-go score, 0–100) series.
    Higher is better. Ranges: <50 Low, 50–75 In Range, >75 High Performance.
    TODO: populate pison/data/agility.csv from screenshot extraction.
    Columns: date, score, week_label, tags
    """
    # TODO: replace with real CSV once extracted
    return pd.DataFrame(columns=["date", "score", "week_label", "tags"])
