from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class TicketStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class TicketPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TicketCategory(str, Enum):
    bug = "bug"
    billing = "billing"
    feature_request = "feature_request"
    general = "general"


# ---------- Write models ----------


class TicketCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(..., min_length=5, max_length=120)
    description: str = Field(..., min_length=1, max_length=2000)
    priority: TicketPriority = TicketPriority.medium
    category: TicketCategory
    requester_name: str = Field(..., min_length=1)
    requester_email: EmailStr
    assignee: Optional[str] = None
    due_date: Optional[datetime] = None


class TicketUpdate(BaseModel):
    """Full replacement of editable fields (PUT)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(..., min_length=5, max_length=120)
    description: str = Field(..., min_length=1, max_length=2000)
    priority: TicketPriority
    category: TicketCategory
    requester_name: str = Field(..., min_length=1)
    requester_email: EmailStr
    assignee: Optional[str] = None
    status: Optional[TicketStatus] = None
    due_date: Optional[datetime] = None


class TicketPatch(BaseModel):
    """Partial update (PATCH). At least one field must be provided."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Optional[str] = Field(None, min_length=5, max_length=120)
    description: Optional[str] = Field(None, min_length=1, max_length=2000)
    priority: Optional[TicketPriority] = None
    category: Optional[TicketCategory] = None
    requester_name: Optional[str] = Field(None, min_length=1)
    requester_email: Optional[EmailStr] = None
    assignee: Optional[str] = None
    status: Optional[TicketStatus] = None
    due_date: Optional[datetime] = None

    @model_validator(mode="after")
    def check_at_least_one_field(self) -> "TicketPatch":
        """Reject patches where every field is None."""
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("At least one field must be provided for a patch update.")
        return self


# ---------- Read models ----------


class CommentInTicket(BaseModel):
    author: str
    message: str
    created_at: datetime


class ActivityItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: str
    from_val: Optional[str] = Field(None, alias="from", serialization_alias="from")
    to: Optional[str] = None
    at: datetime


class TicketResponse(BaseModel):
    id: str
    ticket_number: str
    title: str
    description: str
    status: TicketStatus
    priority: TicketPriority
    category: TicketCategory
    requester_name: str
    requester_email: str
    assignee: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    comments: list[CommentInTicket] = []
    activity: list[ActivityItem] = []


class TicketListItem(BaseModel):
    """Lighter model for list views — no comments or activity."""

    id: str
    ticket_number: str
    title: str
    description: str
    status: TicketStatus
    priority: TicketPriority
    category: TicketCategory
    requester_name: str
    requester_email: str
    assignee: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


# ---------- Query params ----------


class TicketListParams(BaseModel):
    """Query parameters for listing tickets."""

    q: Optional[str] = None
    status: Optional[str] = None  # Comma-separated statuses
    priority: Optional[str] = None  # Comma-separated priorities
    category: Optional[str] = None  # Comma-separated categories
    assignee: Optional[str] = None  # Comma-separated assignees
    created_from: Optional[datetime] = None
    created_to: Optional[datetime] = None
    sort_by: str = "created_at"  # created_at | updated_at | priority
    order: str = "desc"  # asc | desc
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=50)
    overdue: Optional[bool] = None


# ---------- Bulk & Specialized models ----------


class BulkActionType(str, Enum):
    update_status = "update_status"
    update_priority = "update_priority"
    assign = "assign"
    delete = "delete"


class BulkRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ids: list[str] = Field(..., max_length=100)
    action: BulkActionType
    value: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None


class BulkFailedItem(BaseModel):
    id: str
    reason: str


class BulkResponse(BaseModel):
    matched: int
    modified: int
    failed: list[BulkFailedItem]


class TicketSuggestion(BaseModel):
    id: str
    ticket_number: str
    title: str


class TimelineItem(BaseModel):
    date: str
    created: int
    resolved: int
