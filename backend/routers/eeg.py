import os
import re
import sys
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

sys.path.insert(0, str(Path(__file__).parents[1] / "processing"))
from auth import verify_password
from gcp import bucket

router = APIRouter()

FILENAME_PATTERN = re.compile(r"^\d{8}_(pre|post)-boxing_[a-f0-9]{16}\.csv$")


@router.post("/upload")
async def upload_eeg(
    password: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Accept a Neurable EEG CSV, upload to GCS, process, and insert metrics to BigQuery.
    Filename must match: MMDDYYYY_(pre|post)-boxing_<16-char hex id>.csv
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

    data = await file.read()

    # Upload to GCS
    blob = bucket.blob(f"neurable/{filename}")
    if blob.exists():
        raise HTTPException(status_code=409, detail=f"File already exists: {filename}")
    blob.upload_from_string(data, content_type="text/csv")

    # Process and insert to BigQuery
    try:
        import eeg_pipeline
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)
        eeg_pipeline.process_and_insert(tmp_path.rename(tmp_path.parent / filename))
    except Exception as e:
        print(f"[eeg/upload] EEG processing failed for {filename}: {e}")
        # Upload succeeded — processing failure is non-fatal

    return {"ok": True, "saved_as": filename, "gcs_path": f"gs://boxsmart-raw/neurable/{filename}"}


@router.post("/process-gcs-file")
async def process_gcs_file(request: Request):
    """
    Eventarc endpoint: called when a new file is finalized in gs://boxsmart-raw/neurable/.
    Downloads the file from GCS, processes it, and inserts metrics to BigQuery.
    """
    # CloudEvents delivers GCS event in the request body
    body = await request.json()

    # Support both direct CloudEvents payload and Pub/Sub-wrapped format
    obj_name = (
        body.get("name")
        or body.get("data", {}).get("name")
        or ""
    )

    if not obj_name or not FILENAME_PATTERN.match(obj_name.split("/")[-1]):
        return {"ok": False, "reason": f"Skipped: {obj_name}"}

    filename = obj_name.split("/")[-1]

    try:
        import eeg_pipeline

        # Download from GCS to a temp file
        blob = bucket.blob(obj_name)
        with tempfile.TemporaryDirectory() as tmpdir:
            dest = Path(tmpdir) / filename
            blob.download_to_filename(str(dest))
            eeg_pipeline.process_and_insert(dest)

        print(f"[eeg/process-gcs-file] processed {filename}")
        return {"ok": True, "processed": filename}

    except Exception as e:
        print(f"[eeg/process-gcs-file] failed for {filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
def get_sessions():
    """List all available EEG session dates."""
    return []


@router.get("/sessions/{date}/metrics")
def get_session_metrics(date: str, timing: str = "pre"):
    return {}


@router.get("/longitudinal")
def get_longitudinal():
    return []


@router.get("/ab-sparring")
def get_ab_sparring():
    return {}
