import re
import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from auth import verify_password
from gcp import bucket

router = APIRouter()

EEG_DATA_DIR = Path(__file__).parents[2] / "neurable" / "data"
FILENAME_PATTERN = re.compile(r"^\d{8}_(pre|post)-boxing_[a-f0-9]{16}\.csv$")


@router.get("/sessions")
def get_sessions():
    """List all available EEG session dates."""
    # TODO: scan neurable/data/ for CSV files, return metadata
    return []


@router.get("/sessions/{date}/metrics")
def get_session_metrics(date: str, timing: str = "pre"):
    """
    Return processed EEG metrics for a session.
    timing: 'pre' | 'post'
    Returns: alpha_eo, alpha_ec, alpha_reactivity, theta, delta, alpha_theta_ratio, sef90
    """
    # TODO: call processing.eeg_pipeline.process_session(date, timing)
    return {}


@router.get("/longitudinal")
def get_longitudinal():
    """All sessions' metrics in time order for trend charts."""
    # TODO: aggregate all processed sessions
    return []


@router.get("/ab-sparring")
def get_ab_sparring():
    """Sparring vs non-sparring day comparison (Mann-Whitney U)."""
    # TODO: join with survey data, run stats
    return {}


@router.post("/upload")
async def upload_eeg(
    password: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Accept a Neurable EEG CSV and save it to neurable/data/.
    Filename must match: MMDDYYYY_(pre|post)-boxing_<16-char hex id>.csv
    Rejects duplicate filenames (file already exists).
    """
    verify_password(password)

    filename = file.filename or ""
    if not FILENAME_PATTERN.match(filename):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Filename '{filename}' does not match expected format: "
                "MMDDYYYY_(pre|post)-boxing_<16hexchars>.csv"
            ),
        )

    dest = EEG_DATA_DIR / filename
    if dest.exists():
        raise HTTPException(status_code=409, detail=f"File already exists: {filename}")

    # Read file bytes once — needed for both local save and GCS upload
    data = await file.read()

    # ── Save locally (keeps EEG pipeline working without GCS reads) ──
    EEG_DATA_DIR.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)

    # ── Upload to GCS ──
    blob = bucket.blob(f"neurable/{filename}")
    blob.upload_from_string(data, content_type="text/csv")

    return {"ok": True, "saved_as": filename, "gcs_path": f"gs://boxsmart-raw/neurable/{filename}"}
