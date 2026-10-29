import logging
from pymongo import MongoClient

from app.config import settings
from app.db.mock_seed import create_in_memory_db

logger = logging.getLogger(__name__)

# Module-level client & db (serverless-safe: reused across requests)
_client: MongoClient | None = None
_db = None
_is_mock: bool = False


def is_placeholder_uri(uri: str) -> bool:
    """Check if the connection string contains unconfigured template placeholders."""
    if not uri:
        return True
    placeholders = ["<username>", "<password>", "<cluster>", "<", ">"]
    return any(p in uri for p in placeholders)


def is_mock_mode() -> bool:
    """Return True if currently operating on the in-memory fallback database."""
    return _is_mock


def get_db():
    """Return the application database.

    Connects to MongoDB Atlas if a valid MONGODB_URI is provided.
    If MONGODB_URI contains placeholders (e.g. <cluster>) or MongoDB Atlas
    is unreachable, smoothly falls back to an in-memory database with pre-seeded
    sample tickets so local development and manual testing work immediately.
    """
    global _client, _db, _is_mock

    if _db is not None:
        return _db

    # 1. Check if URI contains template placeholders
    if is_placeholder_uri(settings.MONGODB_URI):
        logger.info(
            "MONGODB_URI contains unconfigured template placeholders. "
            "Initializing in-memory demo database with sample tickets."
        )
        _db = create_in_memory_db()
        _is_mock = True
        return _db

    # 2. Try real MongoDB connection
    try:
        client = MongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
            socketTimeoutMS=2000,
        )
        # Quick connectivity verification
        client.admin.command("ping")
        _client = client
        _db = client[settings.DATABASE_NAME]
        _is_mock = False
        logger.info("Connected to MongoDB Atlas: %s", settings.DATABASE_NAME)
        return _db
    except Exception as exc:
        logger.warning(
            "Could not connect to MongoDB Atlas (%s). "
            "Falling back to in-memory demo database with sample tickets.",
            exc,
        )
        _db = create_in_memory_db()
        _is_mock = True
        return _db


def set_db(db):
    """Override the database instance (e.g. for testing with mongomock)."""
    global _db, _is_mock
    _db = db
    _is_mock = False


def get_collection(name: str):
    """Shortcut to get a collection by name from the app database."""
    return get_db()[name]
