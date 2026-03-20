from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import eeg, pison, whoop, survey, analysis

app = FastAPI(title="BoxSmart API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://boxsmart.fit",
        "https://www.boxsmart.fit",
        "https://*.vercel.app",   # preview deployments
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(eeg.router, prefix="/api/eeg", tags=["EEG"])
app.include_router(pison.router, prefix="/api/pison", tags=["Pison"])
app.include_router(whoop.router, prefix="/api/whoop", tags=["WHOOP"])
app.include_router(survey.router, prefix="/api/survey", tags=["Survey"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
