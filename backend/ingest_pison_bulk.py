"""
Bulk-ingest historical Pison readings from pison/data/pison_readings_raw.csv.

Source CSV columns:
  datetime         MM/DD/YYYY HH:MM:SS AM/PM  (or MM/DD/YYYY H:MM AM/PM)
  readiness_ms     reaction time in ms (optional)
  agility_ms       agility reaction time in ms (optional)
  agility_accuracy accuracy 0–100 (optional)
  agility_score    go/no-go score 0–100 (optional)
  tags             comma-separated string (optional)

Run:
  cd backend && python ingest_pison_bulk.py
  cd backend && python ingest_pison_bulk.py --dry-run
"""
import argparse
import csv
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parents[1]
RAW_CSV       = ROOT / "pison" / "data" / "pison_readings_raw.csv"
EXTRACTED_CSV = ROOT / "pison" / "data" / "pison_extracted.csv"

CSV_HEADERS = [
    "source_image", "category", "date", "week_start", "week_end",
    "summary_value", "summary_unit", "vs_baseline_pct", "vs_baseline_direction",
    "reading_timestamp", "reading_value", "reading_unit",
    "reading_vs_baseline_pct", "reading_vs_baseline_direction", "notes",
]

BASELINE_READINESS_MS = 123.0
BASELINE_AGILITY      = 80.0

DATETIME_FMTS = [
    "%m/%d/%Y %I:%M:%S %p",
    "%m/%d/%Y %I:%M %p",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
]


def safe_float(v):
    if v is None or str(v).strip() == "":
        return None
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def parse_dt(s):
    s = str(s).strip()
    for fmt in DATETIME_FMTS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse datetime: {s!r}")


def vs_baseline_readiness(v):
    if v is None:
        return "", ""
    pct = round(abs(v - BASELINE_READINESS_MS) / BASELINE_READINESS_MS * 100)
    return pct, "slower" if v > BASELINE_READINESS_MS else "faster"


def vs_baseline_agility(v):
    if v is None:
        return "", ""
    pct = round(abs(v - BASELINE_AGILITY) / BASELINE_AGILITY * 100)
    return pct, "lower" if v < BASELINE_AGILITY else "higher"


def build_extracted_rows(dt, readiness_ms, agility_score, tags):
    """Convert one source row into pison_extracted.csv row(s) (row-per-metric)."""
    date_str = dt.date().isoformat()
    ts = dt.strftime("%-I:%M %p %m/%d/%Y").lower()
    rows = []

    if readiness_ms is not None:
        pct, direction = vs_baseline_readiness(readiness_ms)
        rows.append({
            "source_image": "manual",
            "category": "daily_readiness",
            "date": date_str,
            "week_start": "", "week_end": "",
            "summary_value": "", "summary_unit": "",
            "vs_baseline_pct": "", "vs_baseline_direction": "",
            "reading_timestamp": ts,
            "reading_value": readiness_ms,
            "reading_unit": "ms",
            "reading_vs_baseline_pct": pct,
            "reading_vs_baseline_direction": direction,
            "notes": tags,
        })

    if agility_score is not None:
        pct, direction = vs_baseline_agility(agility_score)
        rows.append({
            "source_image": "manual",
            "category": "daily_agility",
            "date": date_str,
            "week_start": "", "week_end": "",
            "summary_value": "", "summary_unit": "",
            "vs_baseline_pct": "", "vs_baseline_direction": "",
            "reading_timestamp": ts,
            "reading_value": agility_score,
            "reading_unit": "/100",
            "reading_vs_baseline_pct": pct,
            "reading_vs_baseline_direction": direction,
            "notes": tags,
        })

    return rows


def main(dry_run=False):
    if not RAW_CSV.exists():
        print(f"Raw CSV not found: {RAW_CSV}")
        sys.exit(1)

    df = pd.read_csv(RAW_CSV, dtype=str).fillna("")
    # Drop trailing placeholder columns (named '-')
    df = df[[c for c in df.columns if not c.strip().startswith("-")]]
    # Drop rows with no datetime
    df = df[df["datetime"].str.strip() != ""]

    all_extracted_rows = []
    all_bq_rows = []
    now = datetime.now(timezone.utc).isoformat()
    skipped = 0

    for _, r in df.iterrows():
        try:
            dt = parse_dt(r["datetime"])
        except ValueError as e:
            print(f"  SKIP: {e}")
            skipped += 1
            continue

        readiness     = safe_float(r.get("readiness_ms"))
        agility_ms    = safe_float(r.get("agility_ms"))
        agility_acc   = safe_float(r.get("agility_accuracy"))
        agility_score = safe_float(r.get("agility_score"))
        tags          = r.get("tags", "").strip()

        if readiness is None and agility_score is None and agility_ms is None:
            skipped += 1
            continue

        date_str = dt.date().isoformat()

        # pison_extracted.csv rows (legacy row-per-metric format)
        extracted = build_extracted_rows(dt, readiness, agility_score, tags)
        all_extracted_rows.extend(extracted)

        # BigQuery row (one row per session, all metrics together)
        all_bq_rows.append({
            "date":             date_str,
            "datetime":         dt.isoformat(),
            "readiness_ms":     readiness,
            "agility_ms":       agility_ms,
            "agility_accuracy": agility_acc,
            "agility_score":    agility_score,
            "tags":             tags,
            "source":           "manual",
            "ingested_at":      now,
        })

    print(f"Parsed {len(all_bq_rows)} sessions ({skipped} skipped) → {len(all_extracted_rows)} extracted rows")

    if dry_run:
        print("\n-- DRY RUN: first 5 BQ rows --")
        for row in all_bq_rows[:5]:
            print(row)
        return

    # ── pison_extracted.csv: keep weekly summaries, replace daily rows ────────
    existing = pd.read_csv(EXTRACTED_CSV)
    weekly_only = existing[existing["category"].isin(["weekly_readiness", "weekly_agility"])]
    weekly_only.to_csv(EXTRACTED_CSV, index=False)

    with open(EXTRACTED_CSV, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        for row in all_extracted_rows:
            writer.writerow(row)
    print(f"✓ Wrote {len(all_extracted_rows)} rows to {EXTRACTED_CSV.name}")

    # ── BigQuery ──────────────────────────────────────────────────────────────
    sys.path.insert(0, str(Path(__file__).parent))
    from gcp import bq, PROJECT, DATASET
    from google.cloud import bigquery

    table_id = f"{PROJECT}.{DATASET}.pison_readings"

    # Drop and recreate to avoid streaming-buffer DELETE restriction
    schema = [
        bigquery.SchemaField("date",             "DATE",      mode="NULLABLE"),
        bigquery.SchemaField("datetime",          "DATETIME",  mode="NULLABLE"),
        bigquery.SchemaField("readiness_ms",      "FLOAT64",   mode="NULLABLE"),
        bigquery.SchemaField("agility_ms",        "FLOAT64",   mode="NULLABLE"),
        bigquery.SchemaField("agility_accuracy",  "FLOAT64",   mode="NULLABLE"),
        bigquery.SchemaField("agility_score",     "FLOAT64",   mode="NULLABLE"),
        bigquery.SchemaField("tags",              "STRING",    mode="NULLABLE"),
        bigquery.SchemaField("source",            "STRING",    mode="NULLABLE"),
        bigquery.SchemaField("ingested_at",       "TIMESTAMP", mode="NULLABLE"),
    ]
    bq.delete_table(table_id, not_found_ok=True)
    bq.create_table(bigquery.Table(table_id, schema=schema))
    print("  Recreated pison_readings")

    job_config = bigquery.LoadJobConfig(
        schema=schema,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    job = bq.load_table_from_json(all_bq_rows, table_id, job_config=job_config)
    job.result()
    if job.errors:
        print(f"⚠ BigQuery errors: {job.errors[:3]}")
    else:
        print(f"✓ Loaded {len(all_bq_rows)} rows into pison_readings")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    main(dry_run=args.dry_run)
