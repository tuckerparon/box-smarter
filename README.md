# BoxSmart

A web application tracking the neurological impact of a 4-month boxing training camp (01/15/2026–05/07/2026) for a charity match on 05/07/2026. Correlates EEG (Neurable), neuromuscular (Pison), and physiological (WHOOP) data to monitor cognitive and neurological health over time.

## Architecture

```
Frontend (React + Vite)          Backend (FastAPI)           Cloud (GCP)
  Vercel                    →      Cloud Run              →   BigQuery + GCS
  boxsmart.fit                     /api/*                     boxsmart-492022
```

- **Frontend** — React + Tailwind, deployed on Vercel. Four brand-specific dashboard views (WHOOP, Pison, Neurable, Oura) served via URL routing with distinct themes.
- **Backend** — FastAPI on Google Cloud Run. Containerized via Docker. Scales to zero when idle.
- **Storage** — Raw EEG CSVs in GCS (`boxsmart-raw`). All processed metrics in BigQuery (`boxsmart` dataset).
- **Secrets** — WHOOP OAuth tokens stored in GCP Secret Manager. No credentials in the repo.

## Data Sources

| Source | What it measures | Ingest |
|--------|-----------------|--------|
| Daily survey | Training, sparring, head contact, headache, creatine, caffeine | Log modal → BQ `training_log` |
| Pison (neuromuscular) | Reaction time (readiness), go/no-go score (agility) | Log modal → BQ `pison_readings` |
| Neurable (EEG) | Alpha/theta/delta power, alpha reactivity, SEF90 | Log modal upload → GCS + BQ `neurable_readings` |
| WHOOP | HRV, recovery score, RHR, sleep stages, strain | OAuth API sync → BQ `whoop_daily`, `whoop_sleep` |

## EEG Pipeline

Raw Neurable CSVs (12 channels, 500 Hz, 2-min EOEC protocol) are processed via `backend/processing/eeg_pipeline.py`:

1. Bandpass filter 1–100 Hz (zero-phase Butterworth)
2. Notch filter 60 Hz (US power line)
3. Zero packet-loss samples, per-channel z-score artifact rejection
4. Multitaper PSD (MNE, half_nbw=4 — matches Neurable's pipeline)
5. Confidence-weighted band power extraction (delta, theta, alpha, beta, gamma)
6. Left/right hemisphere split (Ch1–6 / Ch7–12)
7. Derived metrics: alpha reactivity, alpha/theta ratio, SEF90
8. Results inserted to BigQuery `neurable_readings`

## Local Development

Requires GCP credentials (`GOOGLE_APPLICATION_CREDENTIALS`) and a `.env` in `backend/`:

```
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...
WHOOP_REDIRECT_URI=...
WHOOP_REFRESH_TOKEN=...
LOG_PASSWORD=...
```

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Deployment

Backend deploys to Cloud Run:

```bash
./deploy.sh
```

Frontend deploys automatically via Vercel on push to `main`.

To regenerate the static API snapshots used by Vercel as a fallback:

```bash
cd backend && python export_static.py
```

## Analysis Modules

- **A/B sparring comparison** — Mann-Whitney U test, Cohen's d effect size
- **Pre/post boxing delta** — Per-session change, split by sparring vs. non-sparring days
- **Longitudinal trends** — Weekly metrics with head contact score overlay
- **Neuroprotective agents** — Caffeine and creatine correlation with metric deltas
- **Sparring load recommendation** — Bayesian-lite model from last 7 days of Pison readiness
