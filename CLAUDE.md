# CLAUDE.md — BoxSmart

## Project Overview

A web app analyzing the neurological impact of a 4-month boxing training camp (01/15/2026–05/07/2026) for a charity match on 05/07/2026. Correlates EEG (Neurable), neuromuscular (Pison), and daily survey data to track cognitive/neurological health over time.

---

## Data Sources

### 1. Daily Survey (Google Sheet)
**Fields:**
- `date`, `day_of_week`
- `trained` (0/1)
- `sparred` (0/1)
- `fought` (0/1)
- `head_contact_level` (none | low | med | high)
- `headache` (0/1)
- `creatine` (0/1 — 1 = 5g dose)
- `caffeine` (mg)

### 2. Pison (Neuromuscular / Reaction Time)
**Metrics:** Readiness (reaction time), Agility (go-no-go)

**Tags applied to each reading:**
- Caffeine
- Boxing: `Pre-boxing` | `Post-boxing`
- Sparring: `Pre-sparring` | `Post-sparring`
- Eating: `Pre-lunch` | `Post-lunch` | `Pre-dunch` | `Post-dunch`
- Location: `MIT` | `EBF` | `Home/Roseland` | `Harvard`
- Handedness: `Left hand` | `Right hand`
- Body Position: `Sitting` | `Standing`

**Constraints:**
- Pre/post boxing readings must be within 1 hour of boxing
- Pre/post sparring readings must be within 1 hour of sparring
- Boxing + sparring tags used together on sparring days

**API:** https://github.com/pisontechnology/pison-docs (may be outdated — verify)

### 3. Neurable (EEG)
**Protocol:** 2-minute eyes-open/eyes-closed (EOEC)
- 1 min eyes closed (EC) → 1 min eyes open (EO)
- If session > 2 min, truncate to first 2 min

**File naming:** `MMDDYYYY_pre/post-boxing_FILE_ID.csv`

**Data:** Raw EEG — requires signal processing pipeline (see below)

---

## EEG Signal Processing Pipeline

### Goals
Evaluate boxing's acute and cumulative effect on:
1. **Cortical arousal / cognitive readiness** — alpha suppression during EO
2. **Neural fatigue / recovery** — delta/theta power changes
3. **Autonomic-cognitive coupling** — if HRV (WHOOP) is added

### Derived Metrics (from literature)

| Metric | Formula / Method | Rationale |
|--------|-----------------|-----------|
| Alpha Power (EO) | PSD (Welch), 8–12 Hz | Marker of cortical inhibition / relaxation |
| Alpha Power (EC) | PSD (Welch), 8–12 Hz | Baseline cortical state |
| Alpha Reactivity | EC_alpha − EO_alpha | Suppression = healthy arousal response |
| Theta Power | PSD, 4–8 Hz | Cognitive load, fatigue |
| Delta Power | PSD, 1–4 Hz | Recovery / sleep pressure |
| Alpha/Theta Ratio | alpha_power / theta_power | Cognitive performance proxy |
| Spectral Edge Frequency (SEF90) | Freq below which 90% of power lies | Global brain state summary |

**Each formula/metric should have a clickable ⓘ icon** showing source citation and formula details.

### Processing Steps
1. Bandpass filter: 1–50 Hz (Butterworth, 4th order)
2. Notch filter: 60 Hz (US power line)
3. Artifact rejection: amplitude threshold ±100 µV
4. Segment: EC epoch (0–60s), EO epoch (60–120s)
5. Compute PSD per epoch (Welch method, window=4s, 50% overlap)
6. Extract band powers (absolute and relative)
7. Compute derived metrics above

---

## Analysis Modules

### A. A/B: Sparring vs. Non-Sparring Days
- Average Pison + EEG metrics on sparring vs. non-sparring days
- Statistical test: Mann-Whitney U (non-parametric, small N)

### B. Pre/Post Boxing Delta
- Pre→Post change for each session
- Compare delta on sparring days vs. non-sparring days
- Is the delta larger on sparring days? (hypothesis: yes)

### C. Longitudinal Trends
- All metrics plotted over time (week-by-week)
- Overlay composite head contact score per week:
  - `contact_score = mean(map(none→0, low→1, med→2, high→3))` per week
- Trendlines + confidence intervals

### D. Neuroprotective Agents
- Acute: same-day caffeine/creatine → metric delta
- Obtuse (cumulative): rolling correlation of days-on-creatine vs. baseline EEG metrics

### E. Sparring Load Recommendation
- Based on last 7 days of head contact + EEG/Pison trends
- Output: "90% confidence you can spar X times this week without declining below [THRESHOLD]"
- THRESHOLD = defined from literature (e.g., >15% drop in alpha reactivity or Pison Readiness)
- Reference: Multidimensional load management frameworks from sports neuroscience

---

## UI / Routing

No UI selector visible. Brand-specific UIs served via URL routing:

| URL | Brand Theme |
|-----|------------|
| `/whoop` | WHOOP (dark, red accents) |
| `/oura` | Oura (dark navy, gold accents) |
| `/pison` | Pison (brand colors) |
| `/neurable` | Neurable (brand colors) |

Each version is visually distinct and self-contained. No cross-references to other brands.

---

## Data Ingestion

All data flows through the app's password-protected log modal — no manual CSV exports.

| Source | Ingest method | Storage |
|--------|--------------|---------|
| Daily survey | Log modal → `POST /api/survey/log` | BigQuery `training_log` |
| Pison | Log modal → `POST /api/pison/log` | BigQuery `pison_readings` |
| Neurable EEG | Log modal upload → `POST /api/eeg/upload` | GCS `boxsmart-raw/neurable/` + BQ `neurable_readings` |
| WHOOP | `POST /api/whoop/sync` (triggers OAuth API pull) | BigQuery `whoop_daily`, `whoop_sleep`, `whoop_workouts` |

EEG processing runs automatically on upload: file → GCS → pipeline → BigQuery. No local files involved.

---

## Wow Factor — Statistical & Research Rigor

- All metrics tied to peer-reviewed citations (ⓘ tooltips)
- Confidence intervals on all aggregate metrics (bootstrap, n_iter=1000)
- Bayesian updating for sparring recommendation (prior = baseline, likelihood = recent sessions)
- Effect size reporting (Cohen's d) alongside p-values
- Mixed-effects model for longitudinal analysis (accounts for within-subject correlation)
- Annotated timeline: auto-flag sessions with anomalous readings

---

## Resolved Questions

1. **WHOOP data** — Included. HRV, recovery score, RHR, sleep stages, strain all live in BigQuery.
2. **Neurable raw format** — 12 channels (Ch1–Ch12), 500 Hz, `EpochTimestamp` column for wall-clock segmentation, `Interpolated` flag for packet loss.
3. **Pison API** — Not used. Data logged manually through the app.
4. **Left vs. right hand Pison** — All readings are left hand (non-dominant). No separation needed.

---

## Stack

- **Frontend:** React + Vite + Tailwind, deployed on Vercel
- **Backend:** FastAPI, containerized (Docker), deployed on Google Cloud Run
- **Data processing:** Python — MNE (EEG), SciPy/NumPy (stats), pandas
- **Charts:** Recharts (interactive, supports annotations)
- **Storage:** Google Cloud Storage (raw EEG CSVs) + BigQuery (all processed metrics)
