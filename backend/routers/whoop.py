from fastapi import APIRouter, HTTPException, Form
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "processing"))
sys.path.insert(0, str(Path(__file__).parents[1]))  # expose backend/ for whoop_sync
from whoop_loader import load_cycles, load_sleep, merged, sleep_stage_pct
from auth import verify_password

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


@router.post("/sync")
def sync_whoop(password: str = Form(...)):
    """
    Pull latest WHOOP data from WHOOP API into BigQuery.
    Reads credentials from Secret Manager (Cloud Run) or .env (local).
    Always does a full sync to keep tables consistent.
    """
    verify_password(password)
    try:
        import os
        # Inject secrets from Secret Manager into env vars when on Cloud Run
        if os.environ.get("K_SERVICE"):
            from google.cloud import secretmanager
            sm = secretmanager.SecretManagerServiceClient()
            project = "boxsmart-492022"
            for key in ["WHOOP_CLIENT_ID", "WHOOP_CLIENT_SECRET",
                        "WHOOP_REDIRECT_URI", "WHOOP_REFRESH_TOKEN"]:
                if not os.environ.get(key):
                    name = f"projects/{project}/secrets/{key}/versions/latest"
                    val = sm.access_secret_version(request={"name": name}).payload.data.decode()
                    os.environ[key] = val

        import whoop_sync
        whoop_sync.main(full=True)
        return {"ok": True, "message": "WHOOP sync complete"}
    except Exception as e:
        print(f"[whoop/sync] failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
