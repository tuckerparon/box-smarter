"""
EEG signal processing pipeline for Neurable 12-channel headset.

Sampling rate: 500 Hz
Channels: Ch1–Ch12 (raw ADC counts — µV scaling not yet confirmed with Neurable)
Protocol: 2-min EOEC — first 60s eyes-closed (EC), next 60s eyes-open (EO)

Pipeline summary:
  1. Retain interpolated (packet-loss) samples for correct wall-clock segmentation;
     zero them out before filtering.
  2. Butterworth bandpass 1–100 Hz (zero-phase filtfilt) + 60 Hz notch.
  3. Per-channel z-score artifact rejection (>5 SD → zeroed).
  4. Multitaper PSD (MNE, half_nbw=4) — matches Neurable's own pipeline.
  5. Band power extraction: delta, theta, alpha, beta, gamma + relative powers.
  6. Channel averaging: confidence-weighted mean, split left (Ch1–6) / right (Ch7–12).
     Weights derived from per-channel peak-to-peak z-score (mirrors Neurable p_bad logic).
  7. SEF90 computed on overall weighted PSD.
  8. QC flags: poor_contact, ec/eo interpolation %, artifact %, low_quality.

Frequency bands (normalized total: 1–45 Hz):
  delta  1–4 Hz
  theta  4–8 Hz
  alpha  8–13 Hz
  beta  13–30 Hz
  gamma 30–45 Hz
"""
import os
import re
from pathlib import Path
from typing import Optional, Tuple

import mne
import numpy as np
import pandas as pd
from scipy import signal

# NumPy 2.0 renamed trapz → trapezoid; support both
try:
    _trapz = np.trapezoid
except AttributeError:
    _trapz = np.trapz

# On Cloud Run the repo is read-only; download GCS files to /tmp instead.
_LOCAL_DATA = Path(__file__).parents[2] / "neurable" / "data"
_TMP_DATA   = Path("/tmp/neurable/data")
DATA_DIR    = _TMP_DATA if os.getenv("K_SERVICE") else _LOCAL_DATA

_FILENAME_RE = re.compile(r"^\d{8}_(pre|post)-boxing_[a-f0-9]{16}\.csv$", re.IGNORECASE)


def _sync_from_gcs() -> None:
    """
    Download Neurable CSVs from GCS bucket (neurable/ prefix) into DATA_DIR.
    Runs only when K_SERVICE env var is set (Cloud Run).
    Skips files already present locally.
    """
    if not os.getenv("K_SERVICE"):
        return
    try:
        from gcp import bucket  # type: ignore
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        for blob in bucket.list_blobs(prefix="neurable/"):
            name = blob.name.split("/")[-1]
            if not _FILENAME_RE.match(name):
                continue
            dest = DATA_DIR / name
            if not dest.exists():
                blob.download_to_filename(str(dest))
                print(f"[eeg_pipeline] downloaded {name} from GCS")
    except Exception as e:
        print(f"[eeg_pipeline] GCS sync failed: {e}")
FS       = 500   # Hz
N_CH     = 12
CHANNELS = [f"Ch{i}RawEEG" for i in range(1, N_CH + 1)]
LEFT_CH  = list(range(0, 6))   # Ch1–Ch6
RIGHT_CH = list(range(6, 12))  # Ch7–Ch12

ARTIFACT_Z_THRESH    = 5.0    # SD from channel mean → zero out
LOW_QUALITY_INTERP   = 25.0   # % interpolated in either epoch → low_quality flag
HALF_NBW             = 4      # multitaper half-bandwidth (matches Neurable)

BANDS = {
    "delta": (1,  4),
    "theta": (4,  8),
    "alpha": (8,  13),
    "beta":  (13, 30),
    "gamma": (30, 45),
}
TOTAL_BAND = (1, 45)


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------

def list_sessions():
    """
    Scan DATA_DIR for Neurable CSVs. Returns list of dicts:
      {date, timing, filepath}
    File naming: MMDDYYYY_(pre|post)-boxing_<id>.csv
    """
    _sync_from_gcs()
    sessions = []
    pattern = re.compile(r"^(\d{8})_(pre|post)-boxing_")
    for path in sorted(DATA_DIR.glob("*.csv")):
        m = pattern.match(path.name)
        if not m:
            continue
        raw_date, timing = m.group(1), m.group(2)
        date = pd.to_datetime(raw_date, format="%m%d%Y").date().isoformat()
        sessions.append({"date": date, "timing": timing, "filepath": path})
    return sessions


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_session(filepath: Path):
    """
    Load a Neurable CSV, truncate to first 120s wall-clock.
    Interpolated samples are retained (correct EC/EO boundary) but flagged.

    Returns:
        data         float64 (n_samples, 12)
        interp_mask  bool (n_samples,) — True = packet-loss sample
        interp_pct   float — overall fraction interpolated
    """
    df = pd.read_csv(filepath)
    df["t"] = pd.to_timedelta(df["EpochTimestamp"])
    df = df[df["t"] <= pd.Timedelta(seconds=120)].reset_index(drop=True)

    interp_mask = (df["Interpolated"] == "yes").values
    interp_pct  = float(interp_mask.mean())
    data        = df[CHANNELS].values.astype(np.float64)
    return data, interp_mask, interp_pct


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def bandpass_filter(data: np.ndarray,
                    lowcut: float = 1.0,
                    highcut: float = 100.0,
                    order: int = 4) -> np.ndarray:
    """
    Zero-phase Butterworth bandpass 1–100 Hz.
    Matches Neurable's frequency range; filtfilt eliminates phase distortion.
    """
    nyq = FS / 2
    b, a = signal.butter(order, [lowcut / nyq, highcut / nyq], btype="band")
    return signal.filtfilt(b, a, data, axis=0)


def notch_filter(data: np.ndarray, freq: float = 60.0, Q: float = 30.0) -> np.ndarray:
    """60 Hz notch (US power line). Zero-phase filtfilt."""
    b, a = signal.iirnotch(freq / (FS / 2), Q)
    return signal.filtfilt(b, a, data, axis=0)


def reject_artifacts(data: np.ndarray,
                     z_thresh: float = ARTIFACT_Z_THRESH) -> Tuple[np.ndarray, float]:
    """
    Per-channel z-score artifact rejection.
    Any sample where any channel exceeds z_thresh SDs from its mean is zeroed.
    Returns (cleaned_data, rejection_fraction).
    """
    ch_mean = data.mean(axis=0)
    ch_std  = data.std(axis=0)
    z       = np.abs((data - ch_mean) / np.where(ch_std > 0, ch_std, 1))
    bad     = np.any(z > z_thresh, axis=1)
    out     = data.copy()
    out[bad] = 0.0
    return out, float(bad.mean())


def preprocess(raw: np.ndarray,
               interp_mask: Optional[np.ndarray] = None) -> Tuple[np.ndarray, float]:
    """
    Full preprocessing chain:
      1. Zero interpolated (packet-loss) samples
      2. Bandpass 1–100 Hz
      3. Notch 60 Hz
      4. Artifact rejection
    Returns (filtered, artifact_rejection_fraction).
    """
    data = raw.copy()
    if interp_mask is not None and interp_mask.any():
        data[interp_mask] = 0.0
    data = bandpass_filter(data)
    data = notch_filter(data)
    data, rej_frac = reject_artifacts(data)
    return data, rej_frac


# ---------------------------------------------------------------------------
# Spectral analysis — multitaper (matches Neurable pipeline)
# ---------------------------------------------------------------------------

def compute_psd(epoch: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Multitaper PSD per channel using MNE (half_nbw=4, matches Neurable).
    Input:  epoch shape (n_samples, 12)
    Output: freqs (F,), psd (F, 12)
    """
    # MNE expects (n_channels, n_times)
    psds, freqs = mne.time_frequency.psd_array_multitaper(
        epoch.T,
        sfreq=FS,
        fmin=TOTAL_BAND[0],
        fmax=100.0,
        bandwidth=HALF_NBW * 2 * FS / epoch.shape[0],
        normalization="full",
        verbose=False,
    )
    # psds shape: (12, F) → transpose to (F, 12)
    return freqs, psds.T


# ---------------------------------------------------------------------------
# Channel quality weighting (mirrors Neurable p_bad logic)
# ---------------------------------------------------------------------------

def channel_weights(epoch: np.ndarray) -> np.ndarray:
    """
    Per-channel confidence weights based on peak-to-peak amplitude z-score.
    Mirrors Neurable's p_bad sigmoid: channels with unusually high OR low
    amplitude are downweighted. No µV calibration needed — uses z-score
    across channels as a scale-invariant proxy.

    Returns weight array (12,) in [0.0001, 0.9999].
    """
    p2p = epoch.max(axis=0) - epoch.min(axis=0)  # shape (12,)

    # Z-score p2p across channels
    p2p_mean = p2p.mean()
    p2p_std  = p2p.std() if p2p.std() > 0 else 1.0
    z        = (p2p - p2p_mean) / p2p_std

    # High z → likely artifact; negative z (flatline) also bad
    # Use sigmoid to convert absolute z-score to p_bad
    p_bad  = 1 / (1 + np.exp(-2 * (np.abs(z) - 2)))
    weight = np.clip(1 - p_bad, 0.0001, 0.9999)
    return weight


def weighted_band_power(freqs: np.ndarray,
                        psd: np.ndarray,    # (F, 12)
                        weights: np.ndarray, # (12,)
                        fmin: float,
                        fmax: float) -> float:
    """
    Confidence-weighted band power.
    Integrates PSD in [fmin, fmax] per channel, then takes weighted mean.
    """
    idx = (freqs >= fmin) & (freqs <= fmax)
    per_ch = _trapz(psd[idx], freqs[idx], axis=0)  # (12,)
    return float(np.average(per_ch, weights=weights))


def hemisphere_band_power(freqs: np.ndarray,
                          psd: np.ndarray,
                          weights: np.ndarray,
                          fmin: float,
                          fmax: float) -> Tuple[float, float]:
    """
    Returns (left_power, right_power) using hemisphere-specific weights.
    Left: Ch1–6, Right: Ch7–12.
    """
    idx = (freqs >= fmin) & (freqs <= fmax)
    per_ch = _trapz(psd[idx], freqs[idx], axis=0)  # (12,)

    left  = float(np.average(per_ch[LEFT_CH],  weights=weights[LEFT_CH]))
    right = float(np.average(per_ch[RIGHT_CH], weights=weights[RIGHT_CH]))
    return left, right


def weighted_spectral_edge(freqs: np.ndarray,
                           psd: np.ndarray,
                           weights: np.ndarray,
                           edge: float = 0.90) -> float:
    """
    SEF90: frequency below which `edge` fraction of total power lies.
    Computed on confidence-weighted mean PSD.
    """
    w_psd = (psd * weights).sum(axis=1) / weights.sum()  # weighted mean across channels
    bin_powers = 0.5 * (w_psd[:-1] + w_psd[1:]) * np.diff(freqs)
    cumulative = np.cumsum(bin_powers)
    total = cumulative[-1]
    if total == 0:
        return 0.0
    idx = np.searchsorted(cumulative, edge * total)
    return float(freqs[min(idx + 1, len(freqs) - 1)])


# ---------------------------------------------------------------------------
# Session processing
# ---------------------------------------------------------------------------

def process_session(filepath: Path) -> dict:
    """
    Full pipeline for one session file.
    Returns dict of EEG metrics + QC fields.
    """
    raw, interp_mask, interp_pct = load_session(filepath)
    n_ec = 60 * FS

    if len(raw) < n_ec:
        raise ValueError(f"Session too short: {filepath.name} ({len(raw)/FS:.0f}s, need ≥60s)")

    filtered, rej_frac = preprocess(raw, interp_mask=interp_mask)

    # QC: per-channel std > 5000 ADC counts suggests poor headset contact
    signal_std   = float(raw.std(axis=0).mean())
    poor_contact = signal_std > 5000

    # Epoch segmentation
    ec = filtered[:n_ec]
    eo = filtered[n_ec: n_ec + n_ec]

    if len(eo) < 15 * FS:
        raise ValueError(f"EO epoch too short: {filepath.name} ({len(eo)/FS:.0f}s, need ≥15s)")

    # Multitaper PSDs
    freqs_ec, psd_ec = compute_psd(ec)
    freqs_eo, psd_eo = compute_psd(eo)

    # Channel weights per epoch
    w_ec = channel_weights(ec)
    w_eo = channel_weights(eo)

    # Band powers (weighted, full + hemisphere)
    def bands_for_epoch(freqs, psd, weights, suffix):
        out = {}
        total_power = weighted_band_power(freqs, psd, weights, *TOTAL_BAND)
        for name, (fmin, fmax) in BANDS.items():
            bp      = weighted_band_power(freqs, psd, weights, fmin, fmax)
            l, r    = hemisphere_band_power(freqs, psd, weights, fmin, fmax)
            rel     = bp / total_power if total_power > 0 else 0.0
            out[f"{name}_{suffix}"]      = bp
            out[f"{name}_{suffix}_left"]  = l
            out[f"{name}_{suffix}_right"] = r
            out[f"rel_{name}_{suffix}"]   = rel
        return out

    ec_bands = bands_for_epoch(freqs_ec, psd_ec, w_ec, "ec")
    eo_bands = bands_for_epoch(freqs_eo, psd_eo, w_eo, "eo")

    # Key derived metrics (EO-focused)
    alpha_ec = ec_bands["alpha_ec"]
    alpha_eo = eo_bands["alpha_eo"]
    theta_eo = eo_bands["theta_eo"]
    beta_eo  = eo_bands["beta_eo"]

    # QC interpolation per epoch
    ec_interp = round(float(interp_mask[:n_ec].mean()) * 100, 1)
    eo_interp = round(float(interp_mask[n_ec:n_ec + n_ec].mean()) * 100, 1) if len(raw) > n_ec else None

    low_quality = (
        poor_contact
        or ec_interp > LOW_QUALITY_INTERP
        or (eo_interp is not None and eo_interp > LOW_QUALITY_INTERP)
    )

    return {
        # ── Core derived metrics ──────────────────────────────────────────
        "alpha_reactivity":  alpha_ec - alpha_eo,
        "alpha_theta_ratio": alpha_eo / theta_eo if theta_eo else None,
        "beta_theta_ratio":  beta_eo  / theta_eo if theta_eo else None,
        "sef90":             weighted_spectral_edge(freqs_eo, psd_eo, w_eo),

        # ── EC band powers ────────────────────────────────────────────────
        **ec_bands,

        # ── EO band powers ────────────────────────────────────────────────
        **eo_bands,

        # ── QC ────────────────────────────────────────────────────────────
        "n_samples":              len(raw),
        "artifact_rejection_pct": round(rej_frac * 100, 1),
        "interpolated_pct":       round(interp_pct * 100, 1),
        "ec_interp_pct":          ec_interp,
        "eo_interp_pct":          eo_interp,
        "poor_contact":           poor_contact,
        "low_quality":            low_quality,
        "signal_std_adc":         round(signal_std, 1),
    }


def process_and_insert(filepath: Path) -> dict:
    """
    Process a single session file and insert metrics into BigQuery neurable_readings.
    Returns the metrics dict.
    """
    from datetime import datetime, timezone
    from gcp import bq  # type: ignore

    pattern = re.compile(r"^(\d{8})_(pre|post)-boxing_")
    m = pattern.match(filepath.name)
    if not m:
        raise ValueError(f"Filename does not match expected pattern: {filepath.name}")

    date = pd.to_datetime(m.group(1), format="%m%d%Y").date().isoformat()
    timing = m.group(2)

    # Dedup: skip if this source file is already in BQ
    try:
        existing = list(bq.query(
            f"SELECT 1 FROM `boxsmart-492022.boxsmart.neurable_readings`"
            f" WHERE source_file = '{filepath.name}' LIMIT 1"
        ).result())
        if existing:
            print(f"[eeg_pipeline] {filepath.name} already in BQ — skipping insert")
            return process_session(filepath)
    except Exception as e:
        print(f"[eeg_pipeline] dedup check failed for {filepath.name}: {e}")

    metrics = process_session(filepath)

    def _safe(v):
        import math
        if v is None:
            return None
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    row = {
        "date":        date,
        "timing":      timing,
        "source_file": filepath.name,
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        **{k: _safe(v) for k, v in metrics.items()},
    }

    errors = bq.insert_rows_json(
        f"boxsmart-492022.boxsmart.neurable_readings", [row]
    )
    if errors:
        print(f"[eeg_pipeline] BQ insert errors for {filepath.name}: {errors[:2]}")

    return metrics


def process_all_sessions() -> pd.DataFrame:
    """
    On Cloud Run: read processed metrics from BigQuery neurable_readings.
    Locally: process all session files in DATA_DIR.
    Columns: date, timing, source_file, + all metric keys.
    """
    if os.getenv("K_SERVICE"):
        try:
            from gcp import bq  # type: ignore
            query = "SELECT * FROM `boxsmart-492022.boxsmart.neurable_readings` ORDER BY date, timing"
            df = bq.query(query).to_dataframe()
            if not df.empty:
                df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)
            return df
        except Exception as e:
            print(f"[eeg_pipeline] BQ read failed: {e}")
            return pd.DataFrame()

    # Local: process from files
    rows = []
    for session in list_sessions():
        try:
            metrics = process_session(session["filepath"])
            rows.append({
                "date":        session["date"],
                "timing":      session["timing"],
                "source_file": session["filepath"].name,
                **metrics,
            })
        except Exception as e:
            print(f"[WARN] Skipping {session['filepath'].name}: {e}")
    return pd.DataFrame(rows)
