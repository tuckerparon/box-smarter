from fastapi import APIRouter
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "processing"))
from survey_loader import load_survey, weekly_contact_score, neuroprotective_summary

router = APIRouter()


@router.get("/")
def get_survey():
    """All daily survey entries."""
    df = load_survey()
    df["date"] = df["date"].astype(str)
    return df.where(df.notna(), None).to_dict(orient="records")


@router.get("/contact-score")
def get_contact_score():
    """Weekly composite head contact score."""
    df = weekly_contact_score()
    return df.where(df.notna(), None).to_dict(orient="records")


@router.get("/neuroprotective")
def get_neuroprotective():
    """Caffeine and creatine intake correlated with metric deltas."""
    df = neuroprotective_summary()
    df["date"] = df["date"].astype(str)
    return df.where(df.notna(), None).to_dict(orient="records")
