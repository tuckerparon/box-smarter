"""
One-time migration: load all local data into BigQuery.

Run from the project root or backend/:
    python backend/migrate_to_bq.py

Requires GOOGLE_APPLICATION_CREDENTIALS to be set.
"""
import sys
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd
from dateutil import parser as dateutil_parser
from google.cloud import bigquery, storage

# ── Resolve paths ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(Path(__file__).parent / "processing"))

from survey_loader import load_survey
from whoop_loader import load_cycles, load_sleep, sleep_stage_pct
import eeg_pipeline

PROJECT   = "boxsmart-492022"
DATASET   = "boxsmart"
BUCKET    = "boxsmart-raw"

bq  = bigquery.Client(project=PROJECT)
gcs = storage.Client(project=PROJECT)

NOW = datetime.now(timezone.utc).isoformat()


def insert(table_id: str, rows: list[dict], label: str):
    if not rows:
        print(f"  [{label}] no rows to insert — skipping")
        return
    ref = f"{PROJECT}.{DATASET}.{table_id}"
    errors = bq.insert_rows_json(ref, rows)
    if errors:
        print(f"  [{label}] ⚠ BQ errors: {errors[:2]}")
    else:
        print(f"  [{label}] ✓ {len(rows)} rows inserted into {table_id}")


def safe_float(v):
    try:
        f = float(v)
        import math
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def safe_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def safe_date(v) -> str | None:
    if pd.isna(v) or v is None:
        return None
    try:
        return pd.to_datetime(str(v)).date().isoformat()
    except Exception:
        return None


def parse_pison_ts(ts_str) -> str | None:
    """Parse Pison timestamp like '9:15 am 04/01/2026' → ISO string."""
    if pd.isna(ts_str) or not str(ts_str).strip():
        return None
    try:
        return dateutil_parser.parse(str(ts_str)).isoformat()
    except Exception:
        return None


# ── 1. Survey → training_log ───────────────────────────────────────────────────

def migrate_survey():
    print("\n[Survey → training_log]")
    df = load_survey(filled_only=True)
    rows = []
    for _, r in df.iterrows():
        rows.append({
            "date":               str(r["date"]),
            "day_of_week":        str(r["day_of_week"]) if pd.notna(r.get("day_of_week")) else None,
            "trained":            safe_int(r.get("trained")),
            "sparred":            safe_int(r.get("sparred")),
            "fought":             safe_int(r.get("fought")),
            "head_contact_level": str(r["head_contact_level"]) if pd.notna(r.get("head_contact_level")) else None,
            "headache":           safe_int(r.get("headache")),
            "creatine":           safe_int(r.get("creatine")),
            "caffeine":           safe_float(r.get("caffeine")),
            "ingested_at":        NOW,
        })
    insert("training_log", rows, "survey")


# ── 2. Pison → pison_readings ─────────────────────────────────────────────────

def migrate_pison():
    print("\n[Pison → pison_readings]")
    csv_path = ROOT / "pison" / "data" / "pison_extracted.csv"
    if not csv_path.exists():
        print("  pison_extracted.csv not found — skipping")
        return

    df = pd.read_csv(csv_path)
    # Only daily readings with an actual value
    daily = df[df["category"].isin(["daily_readiness", "daily_agility"])].copy()
    daily = daily[daily["reading_value"].notna()].copy()

    rows = []
    for _, r in daily.iterrows():
        rows.append({
            "date":        safe_date(r.get("date")),
            "reading_ts":  parse_pison_ts(r.get("reading_timestamp")),
            "category":    str(r["category"]),
            "value":       safe_float(r.get("reading_value")),
            "unit":        str(r["reading_unit"]) if pd.notna(r.get("reading_unit")) else None,
            "tags":        str(r["notes"]) if pd.notna(r.get("notes")) else None,
            "source":      str(r["source_image"]) if pd.notna(r.get("source_image")) else None,
            "ingested_at": NOW,
        })
    insert("pison_readings", rows, "pison")


# ── 3. WHOOP → whoop_daily ────────────────────────────────────────────────────

def migrate_whoop():
    print("\n[WHOOP → whoop_daily]")
    cycles = load_cycles(camp_only=True)
    sleep  = sleep_stage_pct(load_sleep(camp_only=True))

    if cycles.empty:
        print("  No WHOOP cycles data found — skipping")
        return

    sleep_slim = sleep[["date", "sleep_perf_pct", "asleep_min", "rem_min", "deep_min", "light_min"]].copy()
    merged = cycles.merge(sleep_slim, on="date", how="left")

    rows = []
    for _, r in merged.iterrows():
        rows.append({
            "date":          str(r["date"]),
            "recovery_pct":  safe_float(r.get("recovery_pct")),
            "rhr_bpm":       safe_float(r.get("rhr_bpm")),
            "hrv_ms":        safe_float(r.get("hrv_ms")),
            "skin_temp_c":   safe_float(r.get("skin_temp_c")),
            "spo2_pct":      safe_float(r.get("spo2_pct")),
            "strain":        safe_float(r.get("strain")),
            "energy_kcal":   safe_float(r.get("energy_kcal")),
            "max_hr":        safe_float(r.get("max_hr")),
            "avg_hr":        safe_float(r.get("avg_hr")),
            "sleep_perf_pct": safe_float(r.get("sleep_perf_pct")),
            "asleep_min":    safe_float(r.get("asleep_min")),
            "rem_min":       safe_float(r.get("rem_min")),
            "deep_min":      safe_float(r.get("deep_min")),
            "light_min":     safe_float(r.get("light_min")),
            "ingested_at":   NOW,
        })
    insert("whoop_daily", rows, "whoop")


# ── 4. Neurable → GCS + eeg_sessions ─────────────────────────────────────────

def migrate_neurable():
    print("\n[Neurable → GCS + eeg_sessions]")
    bucket = gcs.bucket(BUCKET)
    sessions = eeg_pipeline.list_sessions()

    if not sessions:
        print("  No EEG session files found — skipping")
        return

    bq_rows = []
    for s in sessions:
        filepath: Path = s["filepath"]
        gcs_path = f"neurable/{filepath.name}"

        # Upload raw CSV to GCS
        blob = bucket.blob(gcs_path)
        if blob.exists():
            print(f"  [GCS] already exists: {gcs_path}")
        else:
            blob.upload_from_filename(str(filepath), content_type="text/csv")
            print(f"  [GCS] uploaded: {gcs_path}")

        # Process EEG metrics
        try:
            metrics = eeg_pipeline.process_session(filepath)
            bq_rows.append({
                "date":                   s["date"],
                "timing":                 s["timing"],
                "alpha_ec":               safe_float(metrics.get("alpha_ec")),
                "alpha_eo":               safe_float(metrics.get("alpha_eo")),
                "alpha_reactivity":       safe_float(metrics.get("alpha_reactivity")),
                "theta":                  safe_float(metrics.get("theta")),
                "delta":                  safe_float(metrics.get("delta")),
                "alpha_theta_ratio":      safe_float(metrics.get("alpha_theta_ratio")),
                "sef90":                  safe_float(metrics.get("sef90")),
                "rel_alpha_eo":           safe_float(metrics.get("rel_alpha_eo")),
                "rel_theta_eo":           safe_float(metrics.get("rel_theta_eo")),
                "rel_delta_eo":           safe_float(metrics.get("rel_delta_eo")),
                "n_samples":              safe_int(metrics.get("n_samples")),
                "artifact_rejection_pct": safe_float(metrics.get("artifact_rejection_pct")),
                "poor_contact":           bool(metrics.get("poor_contact", False)),
                "signal_std_adc":         safe_float(metrics.get("signal_std_adc")),
                "source_file":            filepath.name,
                "ingested_at":            NOW,
            })
            print(f"  [EEG] processed: {filepath.name}")
        except Exception as e:
            print(f"  [EEG] skipped {filepath.name}: {e}")

    insert("eeg_sessions", bq_rows, "neurable")


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Starting migration → {PROJECT}.{DATASET}")
    print(f"Timestamp: {NOW}\n")

    migrate_survey()
    migrate_pison()
    migrate_whoop()
    migrate_neurable()

    print("\nMigration complete.")
