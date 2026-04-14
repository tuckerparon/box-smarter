from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import sys

from fastapi import APIRouter, Form, HTTPException

sys.path.insert(0, str(Path(__file__).parents[1] / "processing"))
from survey_loader import load_survey, weekly_contact_score, neuroprotective_summary
from auth import verify_password
from gcp import bq, DATASET

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


@router.post("/log")
def log_survey(
    password: str = Form(...),
    log_date: str = Form(...),                   # YYYY-MM-DD
    trained: int = Form(...),                    # 0 | 1
    sparred: int = Form(...),                    # 0 | 1
    fought: int = Form(...),                     # 0 | 1
    head_contact_level: str = Form(...),         # None | Low | Medium | High
    headache: int = Form(...),                   # 0 | 1
    creatine: int = Form(...),                   # 0 | 1
    caffeine: Optional[float] = Form(None),      # mg
    endurance: Optional[float] = Form(None),     # 1–5
):
    """Append one training log row to BigQuery training_log table."""
    verify_password(password)

    try:
        dt = datetime.strptime(log_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format; use YYYY-MM-DD")

    bq_row = {
        "date":               log_date,
        "day_of_week":        dt.strftime("%A"),
        "trained":            trained,
        "sparred":            sparred,
        "fought":             fought,
        "head_contact_level": head_contact_level,
        "headache":           headache,
        "creatine":           creatine,
        "caffeine":           caffeine,
        "endurance":          endurance,
        "ingested_at":        datetime.now(timezone.utc).isoformat(),
    }

    errors = bq.insert_rows_json(f"{DATASET}.training_log", [bq_row])
    if errors:
        raise HTTPException(status_code=500, detail=f"BigQuery error: {errors}")

    return {"ok": True}
