import logging

from pymongo import ASCENDING, DESCENDING, TEXT

from app.db.connection import get_collection, get_db

logger = logging.getLogger(__name__)


def ensure_indexes() -> None:
    """Create required indexes on the tickets collection.

    Pings the database first to avoid long timeouts if MongoDB is offline.
    Uses background=True so index builds don't block operations.
    """
    try:
        db = get_db()
        # Fast connectivity check before attempting index creation
        db.command("ping")
    except Exception as e:
        logger.warning("MongoDB ping failed (%s); skipping index creation.", e)
        return

    try:
        tickets = get_collection("tickets")

        indexes = [
            ([("status", ASCENDING)], "idx_status"),
            ([("priority", ASCENDING)], "idx_priority"),
            ([("created_at", DESCENDING)], "idx_created_at"),
            (
                [("status", ASCENDING), ("priority", ASCENDING), ("created_at", DESCENDING)],
                "idx_status_priority_created",
            ),
            ([("title", TEXT), ("description", TEXT)], "idx_text_search"),
        ]

        for keys, name in indexes:
            try:
                tickets.create_index(keys, name=name, background=True)
                logger.info("Ensured index: %s", name)
            except Exception as e:
                logger.warning("Could not create index %s: %s", name, e)

        logger.info("All indexes ensured on 'tickets' collection.")
    except Exception as e:
        logger.warning("Index creation error: %s", e)
