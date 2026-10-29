from typing import Any

from fastapi import APIRouter, Query

from app.db.connection import get_db
from app.schemas.ticket import TimelineItem
from app.services.stats_service import get_stats, get_timeline

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/stats")
def stats_endpoint() -> dict[str, Any]:
    db = get_db()
    return get_stats(db)


@router.get("/stats/timeline", response_model=list[TimelineItem])
def stats_timeline_endpoint(days: int = Query(14, ge=1, le=90)) -> list[dict[str, Any]]:
    db = get_db()
    return get_timeline(db, days=days)
