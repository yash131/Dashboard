from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo.database import Database


def get_stats(db: Database) -> dict[str, Any]:
    """Return aggregated ticket statistics using a single $facet pipeline."""
    pipeline = [
        {
            "$facet": {
                "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
                "by_priority": [{"$group": {"_id": "$priority", "count": {"$sum": 1}}}],
                "total": [{"$count": "count"}],
            }
        }
    ]

    result = list(db["tickets"].aggregate(pipeline))
    facet = result[0] if result else {"by_status": [], "by_priority": [], "total": []}

    total = facet["total"][0]["count"] if facet["total"] else 0

    by_status: dict[str, int] = {
        "open": 0,
        "in_progress": 0,
        "resolved": 0,
        "closed": 0,
    }
    for item in facet["by_status"]:
        if item.get("_id"):
            by_status[item["_id"]] = item.get("count", 0)

    by_priority: dict[str, int] = {
        "low": 0,
        "medium": 0,
        "high": 0,
        "urgent": 0,
    }
    for item in facet["by_priority"]:
        if item.get("_id"):
            by_priority[item["_id"]] = item.get("count", 0)

    # Compute overdue tickets: due_date < now and status not in (resolved, closed)
    now = datetime.now(timezone.utc)
    overdue_count = db["tickets"].count_documents({
        "due_date": {"$ne": None, "$lt": now},
        "status": {"$nin": ["resolved", "closed"]},
    })

    return {
        "total": total,
        "by_status": by_status,
        "by_priority": by_priority,
        "overdue": overdue_count,
    }


def get_timeline(db: Database, days: int = 14) -> list[dict[str, Any]]:
    """Return created and resolved counts per day for the specified number of days (fill missing days with 0)."""
    now = datetime.now(timezone.utc)
    # Range of days: oldest day starts at midnight UTC
    start_date = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    # Pre-populate all days with 0
    date_map: dict[str, dict[str, int]] = {}
    for i in range(days):
        day_str = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        date_map[day_str] = {"created": 0, "resolved": 0}

    # Try MongoDB aggregation pipeline with $dateToString
    try:
        created_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                    },
                    "count": {"$sum": 1},
                }
            },
        ]
        for item in db["tickets"].aggregate(created_pipeline):
            d_str = item.get("_id")
            if d_str in date_map:
                date_map[d_str]["created"] = item.get("count", 0)

        resolved_pipeline = [
            {
                "$match": {
                    "status": {"$in": ["resolved", "closed"]},
                    "updated_at": {"$gte": start_date},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$updated_at"}
                    },
                    "count": {"$sum": 1},
                }
            },
        ]
        for item in db["tickets"].aggregate(resolved_pipeline):
            d_str = item.get("_id")
            if d_str in date_map:
                date_map[d_str]["resolved"] = item.get("count", 0)

    except Exception:
        # Fallback for mongomock or engines that do not support $dateToString
        cursor = db["tickets"].find({
            "$or": [
                {"created_at": {"$gte": start_date}},
                {"status": {"$in": ["resolved", "closed"]}, "updated_at": {"$gte": start_date}},
            ]
        })
        for doc in cursor:
            c_at = doc.get("created_at")
            if c_at and isinstance(c_at, datetime):
                c_str = c_at.strftime("%Y-%m-%d")
                if c_str in date_map:
                    date_map[c_str]["created"] += 1

            if doc.get("status") in ("resolved", "closed"):
                u_at = doc.get("updated_at")
                if u_at and isinstance(u_at, datetime):
                    u_str = u_at.strftime("%Y-%m-%d")
                    if u_str in date_map:
                        date_map[u_str]["resolved"] += 1

    return [
        {
            "date": d,
            "created": date_map[d]["created"],
            "resolved": date_map[d]["resolved"],
        }
        for d in sorted(date_map.keys())
    ]
