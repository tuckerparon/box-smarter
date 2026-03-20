"""
Run this locally whenever you add new data:
  cd backend && python export_static.py

Writes pre-computed JSON to frontend/public/static-api/
Vercel serves these as plain static files — no backend server needed.
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from routers.analysis import (
    get_ab_sparring,
    get_pre_post_delta,
    get_longitudinal,
    get_neuroprotective,
    get_recommendation,
)

OUT = Path(__file__).parent.parent / "frontend" / "public" / "static-api"
OUT.mkdir(parents=True, exist_ok=True)

endpoints = {
    "ab-sparring":    get_ab_sparring,
    "pre-post-delta": get_pre_post_delta,
    "longitudinal":   get_longitudinal,
    "neuroprotective":get_neuroprotective,
    "recommendation": get_recommendation,
}

for name, fn in endpoints.items():
    print(f"  computing {name}...", end=" ", flush=True)
    result = fn()
    # FastAPI returns a dict or list — JSONResponse wraps it, we just need the value
    if hasattr(result, "body"):
        data = json.loads(result.body)
    else:
        data = result
    out_file = OUT / f"{name}.json"
    out_file.write_text(json.dumps(data, indent=2))
    print(f"→ {out_file.relative_to(Path(__file__).parent.parent)}")

print("\nDone. Commit frontend/public/static-api/ and push to redeploy.")
