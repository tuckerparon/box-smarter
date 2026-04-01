from fastapi import APIRouter, Form
from auth import verify_password

router = APIRouter()


@router.post("/auth")
def auth(password: str = Form(...)):
    """Verify log password. Returns 200 ok or 401."""
    verify_password(password)
    return {"ok": True}
