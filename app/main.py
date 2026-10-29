import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.indexes import ensure_indexes
from app.routers import comments, health, stats, tickets

# ---------- Logging ----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ---------- Lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    logger.info("Running startup tasks …")
    try:
        ensure_indexes()
    except Exception as e:
        logger.warning("Could not ensure indexes: %s", e)
    yield
    logger.info("Shutting down …")


# ---------- App ----------
app = FastAPI(
    title="Support Desk API",
    description="Backend API for the Support Desk ticketing system.",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------- CORS ----------
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Exception handlers ----------

def _error_response(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    """Build a consistent error JSON response."""
    body = {"error": {"code": code, "message": message, "details": details}}
    return JSONResponse(status_code=status_code, content=body)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return _error_response(
        422,
        "VALIDATION_ERROR",
        "Request validation failed.",
        details=jsonable_encoder(exc.errors()),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # If detail is already formatted as our error dict, pass it through
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    return _error_response(
        exc.status_code,
        "HTTP_ERROR",
        str(exc.detail),
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return _error_response(400, "BAD_REQUEST", str(exc))


@app.exception_handler(ServerSelectionTimeoutError)
async def mongo_timeout_handler(request: Request, exc: ServerSelectionTimeoutError):
    logger.error("MongoDB connection timeout: %s", exc)
    return _error_response(
        503,
        "DATABASE_UNAVAILABLE",
        "Could not connect to the database. Please verify your MONGODB_URI environment variable and network access.",
    )


@app.exception_handler(PyMongoError)
async def mongo_exception_handler(request: Request, exc: PyMongoError):
    logger.error("MongoDB error: %s", exc)
    return _error_response(500, "DATABASE_ERROR", f"A database error occurred: {str(exc)}")


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception")
    return _error_response(500, "INTERNAL_ERROR", "An unexpected error occurred.")


# ---------- Routers ----------
app.include_router(health.router)
app.include_router(tickets.router)
app.include_router(comments.router)
app.include_router(stats.router)


# ---------- Static files (frontend) ----------
# Mount last so API routes take priority. Silently skip if directory is missing.
try:
    from pathlib import Path
    _public_dir = Path(__file__).resolve().parent.parent / "public"
    app.mount("/", StaticFiles(directory=str(_public_dir), html=True), name="public")
except Exception:
    logger.warning("'public' directory not found — static file serving disabled.")
