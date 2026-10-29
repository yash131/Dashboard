from datetime import datetime
from typing import Optional

from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.db.connection import get_db
from app.schemas.comment import CommentCreate
from app.schemas.common import ErrorResponse, PaginatedResponse
from app.schemas.ticket import (
    BulkRequest,
    BulkResponse,
    TicketCategory,
    TicketCreate,
    TicketListItem,
    TicketListParams,
    TicketPatch,
    TicketPriority,
    TicketResponse,
    TicketStatus,
    TicketSuggestion,
    TicketUpdate,
)
from app.services.ticket_service import (
    add_comment,
    bulk_tickets,
    create_ticket,
    delete_ticket,
    get_ticket,
    list_tickets,
    patch_ticket,
    stream_tickets_csv,
    suggest_tickets,
    update_ticket,
)

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


def _validate_object_id(ticket_id: str) -> str:
    """Raise 422 if the id is not a valid 24-hex-char ObjectId."""
    from bson import ObjectId

    try:
        ObjectId(ticket_id)
    except (InvalidId, TypeError):
        raise HTTPException(
            status_code=422,
            detail={
                "error": {
                    "code": "INVALID_ID",
                    "message": f"'{ticket_id}' is not a valid ObjectId.",
                }
            },
        )
    return ticket_id


def _build_list_params(
    q: Optional[str] = Query(None, description="Free-text search"),
    status: Optional[str] = Query(None, description="Comma-separated statuses"),
    priority: Optional[str] = Query(None, description="Comma-separated priorities"),
    category: Optional[str] = Query(None, description="Comma-separated categories"),
    assignee: Optional[str] = Query(None, description="Comma-separated assignees"),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    sort_by: str = Query("created_at", pattern="^(created_at|updated_at|priority)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    overdue: Optional[bool] = Query(None, description="Filter overdue tickets"),
) -> TicketListParams:
    # Validate date range: created_from cannot be after created_to
    if created_from and created_to and created_from > created_to:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_DATE_RANGE",
                    "message": "'created_from' cannot be greater than 'created_to'.",
                }
            },
        )

    # Validate enum values in multi-value filters
    if status:
        valid_statuses = {s.value for s in TicketStatus}
        invalid_statuses = [
            s.strip() for s in status.split(",") if s.strip() and s.strip() not in valid_statuses
        ]
        if invalid_statuses:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": {
                        "code": "INVALID_ENUM",
                        "message": f"Invalid status: {', '.join(invalid_statuses)}. Allowed: {', '.join(sorted(valid_statuses))}.",
                    }
                },
            )

    if priority:
        valid_priorities = {p.value for p in TicketPriority}
        invalid_priorities = [
            p.strip() for p in priority.split(",") if p.strip() and p.strip() not in valid_priorities
        ]
        if invalid_priorities:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": {
                        "code": "INVALID_ENUM",
                        "message": f"Invalid priority: {', '.join(invalid_priorities)}. Allowed: {', '.join(sorted(valid_priorities))}.",
                    }
                },
            )

    if category:
        valid_categories = {c.value for c in TicketCategory}
        invalid_categories = [
            c.strip() for c in category.split(",") if c.strip() and c.strip() not in valid_categories
        ]
        if invalid_categories:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": {
                        "code": "INVALID_ENUM",
                        "message": f"Invalid category: {', '.join(invalid_categories)}. Allowed: {', '.join(sorted(valid_categories))}.",
                    }
                },
            )

    return TicketListParams(
        q=q,
        status=status,
        priority=priority,
        category=category,
        assignee=assignee,
        created_from=created_from,
        created_to=created_to,
        sort_by=sort_by,
        order=order,
        page=page,
        page_size=page_size,
        overdue=overdue,
    )


# ---------- Endpoints ----------


@router.post(
    "",
    status_code=201,
    response_model=TicketResponse,
    responses={422: {"model": ErrorResponse}},
)
@router.post(
    "/",
    status_code=201,
    response_model=TicketResponse,
    responses={422: {"model": ErrorResponse}},
    include_in_schema=False,
)
def create_ticket_endpoint(payload: TicketCreate):
    db = get_db()
    ticket = create_ticket(db, payload)
    return ticket


@router.get("", response_model=PaginatedResponse[TicketListItem])
@router.get("/", response_model=PaginatedResponse[TicketListItem], include_in_schema=False)
def list_tickets_endpoint(params: TicketListParams = Depends(_build_list_params)):
    db = get_db()
    return list_tickets(db, params)


@router.get("/suggest", response_model=list[TicketSuggestion])
def suggest_endpoint(q: str = Query("", description="Search query")):
    db = get_db()
    return suggest_tickets(db, q, limit=5)


@router.get("/export")
def export_endpoint(params: TicketListParams = Depends(_build_list_params)):
    db = get_db()
    return StreamingResponse(
        stream_tickets_csv(db, params),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="tickets.csv"'},
    )


@router.post(
    "/bulk",
    response_model=BulkResponse,
    responses={422: {"model": ErrorResponse}},
)
def bulk_endpoint(payload: BulkRequest):
    db = get_db()
    try:
        return bulk_tickets(db, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "error": {
                    "code": "INVALID_ENUM",
                    "message": str(exc),
                }
            },
        )


@router.get(
    "/{ticket_id}",
    response_model=TicketResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def get_ticket_endpoint(ticket_id: str):
    _validate_object_id(ticket_id)
    db = get_db()
    ticket = get_ticket(db, ticket_id)
    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"Ticket '{ticket_id}' not found.",
                }
            },
        )
    return ticket


@router.put(
    "/{ticket_id}",
    response_model=TicketResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def update_ticket_endpoint(ticket_id: str, payload: TicketUpdate):
    _validate_object_id(ticket_id)
    db = get_db()
    try:
        ticket = update_ticket(db, ticket_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "error": {
                    "code": "INVALID_TRANSITION",
                    "message": str(exc),
                }
            },
        )
    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"Ticket '{ticket_id}' not found.",
                }
            },
        )
    return ticket


@router.patch(
    "/{ticket_id}",
    response_model=TicketResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def patch_ticket_endpoint(ticket_id: str, payload: TicketPatch):
    _validate_object_id(ticket_id)
    db = get_db()
    try:
        ticket = patch_ticket(db, ticket_id, payload)
    except ValueError as exc:
        # Invalid status transition -> 409 Conflict
        raise HTTPException(
            status_code=409,
            detail={
                "error": {
                    "code": "INVALID_TRANSITION",
                    "message": str(exc),
                }
            },
        )

    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"Ticket '{ticket_id}' not found.",
                }
            },
        )
    return ticket


@router.delete("/{ticket_id}", status_code=204, responses={404: {"model": ErrorResponse}})
def delete_ticket_endpoint(ticket_id: str):
    _validate_object_id(ticket_id)
    db = get_db()
    deleted = delete_ticket(db, ticket_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"Ticket '{ticket_id}' not found.",
                }
            },
        )
    return None


@router.post(
    "/{ticket_id}/comments",
    status_code=201,
    response_model=TicketResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def add_comment_endpoint(ticket_id: str, payload: CommentCreate):
    _validate_object_id(ticket_id)
    db = get_db()
    ticket = add_comment(db, ticket_id, payload)
    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"Ticket '{ticket_id}' not found.",
                }
            },
        )
    return ticket
