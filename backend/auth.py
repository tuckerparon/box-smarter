"""
Shared password guard for log endpoints.
Set LOG_PASSWORD environment variable before starting the server.
"""
import os
from fastapi import HTTPException

LOG_PASSWORD = os.getenv("LOG_PASSWORD", "boxsmart2026")


def verify_password(password: str) -> None:
    if password != LOG_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
