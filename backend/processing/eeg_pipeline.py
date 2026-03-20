"""
EEG signal processing pipeline for Neurable 12-channel headset.

Sampling rate: 500 Hz
Channels: Ch1–Ch12 (raw ADC counts — scaling to µV TBD with Neurable)
Protocol: 2-min EOEC — first 60s eyes-closed (EC), next 60s eyes-open (EO)

Note on units: raw values are ADC counts with large DC offsets per channel
(e.g., Ch1 ≈ -23k, Ch6 ≈ +4k). Artifact rejection uses per-channel z-score
(>5 SD from channel mean) rather than a fixed µV threshold, which is valid
regardless of the ADC→µV scaling factor.
"""
import re
from pathlib import Path
from typing import Tuple

import numpy as np
import pandas as pd
from scipy import signal

DATA_DIR = Path(__file__).parents[2] / "neurable" / "data"
FS = 500  # Hz
CHANNELS = [f"Ch{i}RawEEG" for i in range(1, 13)]
ARTIFACT_Z_THRESH = 5.0  # standard deviations from channel mean


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------

def list_sessions() -> list[dict]:
    """
    Scan DATA_DIR for Neurable CSVs. Returns list of dicts:
      {date, timing, filepath}
    File naming: MMDDYYYY_pre/post-boxing_<id>.csv
    """
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
# Loading & preprocessing
# ---------------------------------------------------------------------------

def load_session(filepath: Path) -> np.ndarray:
    """
    Load a Neurable CSV, drop interpolated samples, truncate to first 120s.
    Returns float64 array of shape (n_samples, 12).
    """
    df = pd.read_csv(filepath)
    df = df[df["Interpolated"] == "no"].reset_index(drop=True)

    # Parse EpochTimestamp (HH:MM:SS.fff) and keep first 120 seconds
    df["t"] = pd.to_timedelta(df["EpochTimestamp"])
    df = df[df["t"] <= pd.Timedelta(seconds=120)].reset_index(drop=True)

    return df[CHANNELS].values.astype(np.float64)


def bandpass_filter(data: np.ndarray, lowcut: float = 1.0, highcut: float = 50.0, order: int = 4) -> np.ndarray:
    """Butterworth bandpass 1–50 Hz, applied with zero-phase filtfilt."""
    nyq = FS / 2
    b, a = signal.butter(order, [lowcut / nyq, highcut / nyq], btype="band")
    return signal.filtfilt(b, a, data, axis=0)


def notch_filter(data: np.ndarray, freq: float = 60.0, Q: float = 30.0) -> np.ndarray:
    """Notch filter at 60 Hz (US power line noise)."""
    b, a = signal.iirnotch(freq / (FS / 2), Q)
    return signal.filtfilt(b, a, data, axis=0)


def reject_artifacts(data: np.ndarray, z_thresh: float = ARTIFACT_Z_THRESH) -> Tuple[np.ndarray, float]:
    """
    Per-channel z-score artifact rejection.
    Samples where any channel exceeds ±z_thresh SDs from its mean are zeroed.
    Returns (cleaned_data, rejection_fraction).
    """
    ch_mean = data.mean(axis=0)
    ch_std = data.std(axis=0)
    z = np.abs((data - ch_mean) / np.where(ch_std > 0, ch_std, 1))
    bad = np.any(z > z_thresh, axis=1)
    data = data.copy()
    data[bad] = 0.0
    return data, float(bad.mean())


def preprocess(raw: np.ndarray) -> Tuple[np.ndarray, float]:
    """Run full filter + artifact rejection chain. Returns (filtered, rejection_fraction)."""
    filtered = bandpass_filter(raw)
    filtered = notch_filter(filtered)
    filtered, rej_frac = reject_artifacts(filtered)
    return filtered, rej_frac


# ---------------------------------------------------------------------------
# Spectral analysis
# ---------------------------------------------------------------------------

def compute_psd(epoch: np.ndarray, window_sec: float = 4.0) -> Tuple[np.ndarray, np.ndarray]:
    """
    Welch PSD per channel.
    window=4s, 50% overlap.
    Returns (freqs shape (F,), psd shape (F, 12)).
    """
    nperseg = int(window_sec * FS)
    freqs, psd = signal.welch(
        epoch.T,           # shape (12, n_samples) — welch operates on last axis
        fs=FS,
        nperseg=nperseg,
        noverlap=nperseg // 2,
    )
    return freqs, psd.T  # return (F, 12)


def band_power(freqs: np.ndarray, psd: np.ndarray, fmin: float, fmax: float) -> float:
    """
    Integrate PSD within [fmin, fmax] Hz using the trapezoidal rule,
    then average across channels.
    """
    idx = (freqs >= fmin) & (freqs <= fmax)
    return float(np.mean(np.trapz(psd[idx], freqs[idx], axis=0)))


def relative_band_power(freqs: np.ndarray, psd: np.ndarray, fmin: float, fmax: float,
                        total_fmin: float = 1.0, total_fmax: float = 50.0) -> float:
    """Band power as fraction of total power in [total_fmin, total_fmax]."""
    bp = band_power(freqs, psd, fmin, fmax)
    total = band_power(freqs, psd, total_fmin, total_fmax)
    return bp / total if total > 0 else 0.0


def spectral_edge_frequency(freqs: np.ndarray, psd: np.ndarray, edge: float = 0.90) -> float:
    """
    SEF{edge*100}: frequency below which `edge` fraction of total power lies.
    Computed per channel via trapezoidal cumsum, then averaged.
    psd shape: (F, 12)
    """
    sef_per_channel = []
    for ch in range(psd.shape[1]):
        p = psd[:, ch]
        # Trapezoidal area for each frequency bin: shape (F-1,)
        bin_powers = 0.5 * (p[:-1] + p[1:]) * np.diff(freqs)
        cumulative = np.cumsum(bin_powers)
        total = cumulative[-1]
        if total == 0:
            continue
        # cumulative[i] = power up through freqs[i+1]
        idx = np.searchsorted(cumulative, edge * total)
        sef_per_channel.append(freqs[min(idx + 1, len(freqs) - 1)])
    return float(np.mean(sef_per_channel)) if sef_per_channel else 0.0


# ---------------------------------------------------------------------------
# Session processing
# ---------------------------------------------------------------------------

def process_session(filepath: Path) -> dict:
    """
    Full pipeline for one session file.
    Returns dict of EEG metrics + QC fields.
    """
    raw = load_session(filepath)

    if len(raw) < 2 * 60 * FS * 0.5:
        # Less than 1 minute of data — skip
        raise ValueError(f"Session too short: {filepath.name} ({len(raw)} samples)")

    filtered, rej_frac = preprocess(raw)

    # QC: flag sessions where signal amplitude is unusually large
    # Typical per-channel std is 300–1200 ADC counts; >5000 suggests poor contact
    signal_std = float(raw.std(axis=0).mean())
    poor_contact = signal_std > 5000

    # Segment by sample index (500 Hz × 60s = 30,000 samples per epoch)
    # Always use the first 60s as EC regardless of total session length.
    n_ec = 60 * FS
    ec = filtered[:n_ec]
    eo = filtered[n_ec: n_ec + 60 * FS]

    if len(eo) < 60 * FS * 0.5:
        raise ValueError(f"EO epoch too short in {filepath.name}")

    freqs_ec, psd_ec = compute_psd(ec)
    freqs_eo, psd_eo = compute_psd(eo)

    alpha_ec = band_power(freqs_ec, psd_ec, 8, 12)
    alpha_eo = band_power(freqs_eo, psd_eo, 8, 12)
    theta_eo = band_power(freqs_eo, psd_eo, 4, 8)
    delta_eo = band_power(freqs_eo, psd_eo, 1, 4)

    return {
        # Core metrics
        "alpha_ec": alpha_ec,
        "alpha_eo": alpha_eo,
        "alpha_reactivity": alpha_ec - alpha_eo,
        "theta": theta_eo,
        "delta": delta_eo,
        "alpha_theta_ratio": alpha_eo / theta_eo if theta_eo else None,
        "sef90": spectral_edge_frequency(freqs_eo, psd_eo, edge=0.90),
        # Relative band powers
        "rel_alpha_eo": relative_band_power(freqs_eo, psd_eo, 8, 12),
        "rel_theta_eo": relative_band_power(freqs_eo, psd_eo, 4, 8),
        "rel_delta_eo": relative_band_power(freqs_eo, psd_eo, 1, 4),
        # QC
        "n_samples": len(raw),
        "artifact_rejection_pct": round(rej_frac * 100, 1),
        "poor_contact": poor_contact,
        "signal_std_adc": round(signal_std, 1),
    }


def process_all_sessions() -> pd.DataFrame:
    """
    Process all sessions in DATA_DIR and return a tidy DataFrame.
    Columns: date, timing, + all metric keys from process_session().
    """
    rows = []
    for session in list_sessions():
        try:
            metrics = process_session(session["filepath"])
            rows.append({"date": session["date"], "timing": session["timing"], **metrics})
        except Exception as e:
            print(f"[WARN] Skipping {session['filepath'].name}: {e}")
    return pd.DataFrame(rows)
