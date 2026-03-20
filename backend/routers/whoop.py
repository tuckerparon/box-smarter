from fastapi import APIRouter
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "processing"))
from whoop_loader import load_cycles, load_sleep, merged, sleep_stage_pct

router = APIRouter()


@router.get("/cycles")
def get_cycles():
    """Physiological cycles: HRV, RHR, recovery score, strain."""
    df = load_cycles()
    df["date"] = df["date"].astype(str)
    return df.where(df.notna(), None).to_dict(orient="records")


@router.get("/sleep")
def get_sleep():
    """Sleep data: stages, duration, sleep score, SpO2, skin temp."""
    df = sleep_stage_pct(load_sleep())
    df["date"] = df["date"].astype(str)
    df["sleep_onset"] = df["sleep_onset"].astype(str)
    df["wake_onset"] = df["wake_onset"].astype(str)
    return df.where(df.notna(), None).to_dict(orient="records")


@router.get("/longitudinal")
def get_longitudinal():
    """Combined HRV + sleep trends over training camp duration."""
    df = merged()
    df["date"] = df["date"].astype(str)
    df["sleep_onset"] = df["sleep_onset"].astype(str)
    df["wake_onset"] = df["wake_onset"].astype(str)
    return df.where(df.notna(), None).to_dict(orient="records")
