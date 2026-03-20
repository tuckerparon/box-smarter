from fastapi import APIRouter

router = APIRouter()


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
