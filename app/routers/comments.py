from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException

from app.db.connection import get_db
from app.schemas.comment import CommentCreate
from app.schemas.common import ErrorResponse
from app.schemas.ticket import TicketResponse
from app.services.ticket_service import add_comment

router = APIRouter(prefix="/api/tickets", tags=["comments"])


def _validate_object_id(ticket_id: str) -> str:
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
