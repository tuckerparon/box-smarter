from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import eeg, pison, whoop, survey, analysis, log

app = FastAPI(title="BoxSmart API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://boxsmart.fit",
        "https://www.boxsmart.fit",
        "https://*.vercel.app",
        "https://boxsmart-api-368048522002.us-central1.run.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(eeg.router, prefix="/api/eeg", tags=["EEG"])
app.include_router(pison.router, prefix="/api/pison", tags=["Pison"])
app.include_router(whoop.router, prefix="/api/whoop", tags=["WHOOP"])
app.include_router(survey.router, prefix="/api/survey", tags=["Survey"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(log.router, prefix="/api/log", tags=["Log"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
