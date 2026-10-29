from datetime import datetime, timezone
from fastapi import APIRouter

from app.db.connection import is_mock_mode

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "database": "in_memory_demo" if is_mock_mode() else "mongodb_atlas",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
