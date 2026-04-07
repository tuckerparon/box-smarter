"""
WHOOP API sync → BigQuery.

Tables populated:
  whoop_daily    — one row per cycle: recovery, HRV, RHR, strain
  whoop_sleep    — one row per sleep session (including naps)
  whoop_workouts — one row per workout
  whoop_journal  — from CSV export (not in API)

Usage:
  cd backend
  python whoop_sync.py --full        # backfill from camp start
  python whoop_sync.py               # incremental from last BQ date

Requires backend/.env:
  WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI, WHOOP_REFRESH_TOKEN
"""
import argparse
import json
import math
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, date, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

CLIENT_ID    = os.environ["WHOOP_CLIENT_ID"]
CLIENT_SECRET = os.environ["WHOOP_CLIENT_SECRET"]
REDIRECT_URI = os.environ["WHOOP_REDIRECT_URI"]
TOKEN_URL    = "https://api.prod.whoop.com/oauth/oauth2/token"
BASE_V1      = "https://api.prod.whoop.com/developer/v1"
BASE_V2      = "https://api.prod.whoop.com/developer/v2"

CAMP_START   = "2026-01-15T00:00:00.000Z"
JOURNAL_CSV  = Path(__file__).parents[1] / "whoop" / "data" / "my_whoop_data_2026_03_20" / "journal_entries.csv"


# ── Token management ──────────────────────────────────────────────────────────

_access_token  = None
_token_expires = 0


def _refresh_access_token():
    global _access_token, _token_expires
    refresh_token = os.environ.get("WHOOP_REFRESH_TOKEN")
    if not refresh_token:
        raise RuntimeError("WHOOP_REFRESH_TOKEN not set. Run whoop_auth.py first.")

    data = urllib.parse.urlencode({
        "grant_type":    "refresh_token",
        "refresh_token": refresh_token,
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }).encode()

    req = urllib.request.Request(TOKEN_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("User-Agent", "Mozilla/5.0")
    with urllib.request.urlopen(req) as resp:
        tokens = json.loads(resp.read())

    _access_token  = tokens["access_token"]
    _token_expires = time.time() + tokens.get("expires_in", 3600) - 60

    new_refresh = tokens.get("refresh_token")
    if new_refresh and new_refresh != refresh_token:
        env_file = Path(__file__).parent / ".env"
        lines = env_file.read_text().splitlines()
        lines = [l for l in lines if not l.startswith("WHOOP_REFRESH_TOKEN=")]
        lines.append(f"WHOOP_REFRESH_TOKEN={new_refresh}")
        env_file.write_text("\n".join(lines) + "\n")
        os.environ["WHOOP_REFRESH_TOKEN"] = new_refresh


def _get_token():
    if not _access_token or time.time() >= _token_expires:
        _refresh_access_token()
    return _access_token


def _get(path, params=None, base=None):
    url = f"{base or BASE_V1}{path}"
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {_get_token()}")
    req.add_header("User-Agent", "Mozilla/5.0")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def fetch_all(path, start, end=None, base=None):
    records = []
    params = {"start": start, "limit": 25}
    if end:
        params["end"] = end
    while True:
        data = _get(path, params, base=base)
        records.extend(data.get("records", []))
        next_token = data.get("next_token")
        if not next_token:
            break
        params["nextToken"] = next_token
    return records


# ── Helpers ───────────────────────────────────────────────────────────────────

def sf(v):
    """Safe float."""
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def ms_to_min(v):
    f = sf(v)
    return round(f / 60000, 1) if f is not None else None


def parse_dt(s):
    """ISO string → local DATETIME string (drop timezone offset)."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).strftime("%Y-%m-%dT%H:%M:%S")
    except Exception:
        return None


def to_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return None


# ── Row builders ──────────────────────────────────────────────────────────────

def build_daily_row(cycle, recovery_by_cycle, now):
    cid     = cycle.get("id")
    c_score = cycle.get("score") or {}
    rec     = recovery_by_cycle.get(cid, {})
    r_score = rec.get("score") or {}
    kj      = sf(c_score.get("kilojoule"))

    return {
        "date":         to_date(cycle.get("start")),
        "recovery_pct": sf(r_score.get("recovery_score")),
        "rhr_bpm":      sf(r_score.get("resting_heart_rate")),
        "hrv_ms":       sf(r_score.get("hrv_rmssd_milli")),
        "skin_temp_c":  sf(r_score.get("skin_temp_celsius")),
        "spo2_pct":     sf(r_score.get("spo2_percentage")),
        "strain":       sf(c_score.get("strain")),
        "energy_kcal":  round(kj / 4.184, 1) if kj is not None else None,
        "max_hr":       sf(c_score.get("max_heart_rate")),
        "avg_hr":       sf(c_score.get("average_heart_rate")),
        "ingested_at":  now,
    }


def build_sleep_row(s, now):
    score   = s.get("score") or {}
    stage   = score.get("stage_summary") or {}
    needed  = score.get("sleep_needed") or {}

    in_bed_min  = ms_to_min(stage.get("total_in_bed_time_milli"))
    awake_min   = ms_to_min(stage.get("total_awake_time_milli"))
    asleep_min  = round(in_bed_min - awake_min, 1) if (in_bed_min and awake_min) else None
    need_min    = ms_to_min(
        (sf(needed.get("baseline_milli")) or 0) +
        (sf(needed.get("need_from_sleep_debt_milli")) or 0) +
        (sf(needed.get("need_from_recent_strain_milli")) or 0)
    ) if needed else None
    debt_min    = round(need_min - asleep_min, 1) if (need_min and asleep_min) else None

    return {
        "id":              s.get("id"),
        "cycle_id":        s.get("cycle_id"),
        "date":            to_date(s.get("start")),
        "start":           parse_dt(s.get("start")),
        "end":             parse_dt(s.get("end")),
        "nap":             s.get("nap", False),
        "sleep_perf_pct":  sf(score.get("sleep_performance_percentage")),
        "asleep_min":      asleep_min,
        "in_bed_min":      in_bed_min,
        "awake_min":       awake_min,
        "light_min":       ms_to_min(stage.get("total_light_sleep_time_milli")),
        "deep_min":        ms_to_min(stage.get("total_slow_wave_sleep_time_milli")),
        "rem_min":         ms_to_min(stage.get("total_rem_sleep_time_milli")),
        "sleep_need_min":  need_min,
        "sleep_debt_min":  debt_min,
        "efficiency_pct":  sf(score.get("sleep_efficiency_percentage")),
        "consistency_pct": sf(score.get("sleep_consistency_percentage")),
        "respiratory_rpm": sf(score.get("respiratory_rate")),
        "sleep_cycles":    stage.get("sleep_cycle_count"),
        "disturbances":    stage.get("disturbance_count"),
        "ingested_at":     now,
    }


def build_workout_row(w, now):
    score = w.get("score") or {}
    zones = score.get("zone_durations") or {}
    kj    = sf(score.get("kilojoule"))

    return {
        "id":          w.get("id"),
        "date":        to_date(w.get("start")),
        "start":       parse_dt(w.get("start")),
        "end":         parse_dt(w.get("end")),
        "sport_name":  w.get("sport_name"),
        "strain":      sf(score.get("strain")),
        "energy_kcal": round(kj / 4.184, 1) if kj is not None else None,
        "max_hr":      score.get("max_heart_rate"),
        "avg_hr":      score.get("average_heart_rate"),
        "zone_0_min":  ms_to_min(zones.get("zone_zero_milli")),
        "zone_1_min":  ms_to_min(zones.get("zone_one_milli")),
        "zone_2_min":  ms_to_min(zones.get("zone_two_milli")),
        "zone_3_min":  ms_to_min(zones.get("zone_three_milli")),
        "zone_4_min":  ms_to_min(zones.get("zone_four_milli")),
        "zone_5_min":  ms_to_min(zones.get("zone_five_milli")),
        "ingested_at": now,
    }


def load_journal_rows(now):
    """Load journal entries from CSV export (not available via API)."""
    if not JOURNAL_CSV.exists():
        print("  journal CSV not found — skipping")
        return []

    df = pd.read_csv(JOURNAL_CSV, dtype=str).fillna("")
    rows = []
    for _, r in df.iterrows():
        cycle_start = r.get("Cycle start time", "").strip()
        cycle_end   = r.get("Cycle end time", "").strip()
        answered    = r.get("Answered yes", "").strip().lower()
        notes       = r.get("Notes", "").strip() or None

        date_val = None
        if cycle_start:
            try:
                date_val = pd.to_datetime(cycle_start).date().isoformat()
            except Exception:
                pass

        rows.append({
            "date":         date_val,
            "cycle_start":  parse_dt(cycle_start) if cycle_start else None,
            "cycle_end":    parse_dt(cycle_end) if cycle_end else None,
            "question":     r.get("Question text", "").strip() or None,
            "answered_yes": True if answered == "true" else (False if answered == "false" else None),
            "notes":        notes,
            "ingested_at":  now,
        })
    return rows


# ── BQ helpers ────────────────────────────────────────────────────────────────

def get_latest_date(table):
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from gcp import bq, PROJECT, DATASET
    try:
        rows = list(bq.query(
            f"SELECT MAX(date) as d FROM `{PROJECT}.{DATASET}.{table}`"
        ).result())
        return str(rows[0].d) if rows and rows[0].d else None
    except Exception:
        return None


def load_table(bq, table_id, rows, schema):
    from google.cloud import bigquery as bq_mod
    job_config = bq_mod.LoadJobConfig(
        schema=schema,
        source_format=bq_mod.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bq_mod.WriteDisposition.WRITE_TRUNCATE,
    )
    job = bq.load_table_from_json(rows, table_id, job_config=job_config)
    job.result()
    if job.errors:
        print(f"  ⚠ errors: {job.errors[:2]}")
    else:
        print(f"  ✓ {len(rows)} rows → {table_id.split('.')[-1]}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main(full=False):
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from gcp import bq, PROJECT, DATASET
    from google.cloud import bigquery

    now = datetime.now(timezone.utc).isoformat()

    if full:
        start = CAMP_START
        print(f"Full sync from camp start ({CAMP_START[:10]})")
    else:
        latest = get_latest_date("whoop_daily")
        start  = f"{latest}T00:00:00.000Z" if latest else CAMP_START
        print(f"Incremental sync from {start[:10]}")

    end = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    # ── Fetch ─────────────────────────────────────────────────────────────────
    print("\nFetching from WHOOP API...")

    cycles     = fetch_all("/cycle",             start, end, base=BASE_V1)
    recoveries = fetch_all("/recovery",          start, end, base=BASE_V2)
    sleeps     = fetch_all("/activity/sleep",    start, end, base=BASE_V2)
    workouts   = fetch_all("/activity/workout",  start, end, base=BASE_V2)

    print(f"  {len(cycles)} cycles, {len(recoveries)} recoveries, "
          f"{len(sleeps)} sleeps, {len(workouts)} workouts")

    recovery_by_cycle = {r["cycle_id"]: r for r in recoveries}

    # ── Build rows ────────────────────────────────────────────────────────────
    daily_rows   = [build_daily_row(c, recovery_by_cycle, now)
                    for c in cycles if to_date(c.get("start")) and to_date(c.get("start")) >= "2026-01-15"]
    sleep_rows   = [build_sleep_row(s, now)
                    for s in sleeps if to_date(s.get("start")) and to_date(s.get("start")) >= "2026-01-15"]
    workout_rows = [build_workout_row(w, now)
                    for w in workouts if to_date(w.get("start")) and to_date(w.get("start")) >= "2026-01-15"]
    journal_rows = load_journal_rows(now)

    print(f"\nRows to write: {len(daily_rows)} daily, {len(sleep_rows)} sleep, "
          f"{len(workout_rows)} workouts, {len(journal_rows)} journal")

    # ── Load to BQ ────────────────────────────────────────────────────────────
    print("\nLoading to BigQuery...")

    def schema_of(table_name):
        return bq.get_table(f"{PROJECT}.{DATASET}.{table_name}").schema

    if daily_rows:
        load_table(bq, f"{PROJECT}.{DATASET}.whoop_daily",    daily_rows,   schema_of("whoop_daily"))
    if sleep_rows:
        load_table(bq, f"{PROJECT}.{DATASET}.whoop_sleep",    sleep_rows,   schema_of("whoop_sleep"))
    if workout_rows:
        load_table(bq, f"{PROJECT}.{DATASET}.whoop_workouts", workout_rows, schema_of("whoop_workouts"))
    if journal_rows:
        load_table(bq, f"{PROJECT}.{DATASET}.whoop_journal",  journal_rows, schema_of("whoop_journal"))

    print("\nDone.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="Pull all data from camp start")
    args = ap.parse_args()
    main(full=args.full)
