import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import sys

from fastapi import APIRouter, Form, HTTPException

sys.path.insert(0, str(Path(__file__).parents[1] / "processing"))
from survey_loader import load_survey, weekly_contact_score, neuroprotective_summary
from auth import verify_password

router = APIRouter()

SURVEY_CSV = Path(__file__).parents[2] / "survey" / "head_contact_study.csv"
SURVEY_HEADERS = [
    "date", "day_of_week", "trained", "sparred", "fought",
    "head_contact_level", "headache", "creatine", "caffeine", "endurance",
]


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
    """Append one survey row to head_contact_study.csv."""
    verify_password(password)

    try:
        dt = datetime.strptime(log_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format; use YYYY-MM-DD")

    day_of_week = dt.strftime("%A")
    csv_date = dt.strftime("%m/%d/%Y")

    row = {
        "date": csv_date,
        "day_of_week": day_of_week,
        "trained": trained,
        "sparred": sparred,
        "fought": fought,
        "head_contact_level": head_contact_level if head_contact_level != "None" else "N/A",
        "headache": headache,
        "creatine": creatine,
        "caffeine": caffeine if caffeine is not None else "",
        "endurance": endurance if endurance is not None else "N/A",
    }

    with open(SURVEY_CSV, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=SURVEY_HEADERS)
        writer.writerow(row)

    return {"ok": True}
