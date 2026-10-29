import math
import re
from datetime import datetime, timezone
from typing import Any, Iterator

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING, DeleteOne, ReturnDocument, UpdateOne
from pymongo.database import Database

from app.schemas.comment import CommentCreate
from app.schemas.ticket import (
    BulkActionType,
    BulkRequest,
    TicketCategory,
    TicketCreate,
    TicketListParams,
    TicketPatch,
    TicketPriority,
    TicketStatus,
    TicketUpdate,
)

# ---------- Status transition rules ----------
# Closed tickets cannot transition to any other status.
VALID_TRANSITIONS: dict[str, set[str]] = {
    "open": {"in_progress", "resolved", "closed"},
    "in_progress": {"open", "resolved", "closed"},
    "resolved": {"open", "in_progress", "closed"},
    "closed": set(),
}

# Map priority names to numeric values for sorting
PRIORITY_SORT_ORDER: dict[str, int] = {
    "urgent": 0,
    "high": 1,
    "medium": 2,
    "low": 3,
}


def _normalize_utc(dt: datetime | None) -> datetime | None:
    """Ensure datetime is UTC-aware."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def escape_regex(pattern: str) -> str:
    """Escape all regex special characters so pattern is treated literally."""
    return re.escape(pattern)


def _validate_object_id(ticket_id: str) -> ObjectId:
    """Convert a string to ObjectId, raising InvalidId on failure."""
    return ObjectId(ticket_id)


def serialize_ticket(doc: dict[str, Any]) -> dict[str, Any]:
    """Convert a raw MongoDB document into an API-friendly dict.

    * ``_id`` -> ``id`` (string)
    * datetime fields are normalized to UTC with millisecond precision
    * Comment and activity sub-documents are passed through normalized
    """
    if doc is None:
        return None  # type: ignore[return-value]

    serialized = {**doc}
    serialized["id"] = str(serialized.pop("_id"))

    # Ensure comments and activity lists exist
    serialized.setdefault("comments", [])
    serialized.setdefault("activity", [])

    for field in ("created_at", "updated_at", "due_date"):
        val = serialized.get(field)
        if isinstance(val, datetime):
            if val.tzinfo is None:
                val = val.replace(tzinfo=timezone.utc)
            else:
                val = val.astimezone(timezone.utc)
            val = val.replace(microsecond=(val.microsecond // 1000) * 1000)
            serialized[field] = val
        elif field == "due_date" and val is None:
            serialized[field] = None

    for c in serialized.get("comments", []):
        c_at = c.get("created_at")
        if isinstance(c_at, datetime):
            if c_at.tzinfo is None:
                c_at = c_at.replace(tzinfo=timezone.utc)
            else:
                c_at = c_at.astimezone(timezone.utc)
            c["created_at"] = c_at.replace(microsecond=(c_at.microsecond // 1000) * 1000)

    for a in serialized.get("activity", []):
        a_at = a.get("at")
        if isinstance(a_at, datetime):
            if a_at.tzinfo is None:
                a_at = a_at.replace(tzinfo=timezone.utc)
            else:
                a_at = a_at.astimezone(timezone.utc)
            a["at"] = a_at.replace(microsecond=(a_at.microsecond // 1000) * 1000)

    return serialized


# ---------- Ticket number generation ----------


def generate_ticket_number(db: Database) -> str:
    """Atomically increment a counter and return a formatted ticket number.

    Uses find_one_and_update with upsert on a counters collection to
    guarantee uniqueness even under concurrent inserts.
    """
    counters = db["counters"]
    result = counters.find_one_and_update(
        {"_id": "ticket_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = result["seq"]
    return f"TKT-{seq:04d}"


# ---------- CRUD ----------


def create_ticket(db: Database, data: TicketCreate) -> dict[str, Any]:
    """Insert a new ticket and return the full document."""
    now = datetime.now(timezone.utc)
    ticket_number = generate_ticket_number(db)
    due_date = _normalize_utc(data.due_date) if data.due_date else None

    activity = [
        {
            "type": "create",
            "from": None,
            "to": "open",
            "at": now,
        }
    ]

    doc = {
        "ticket_number": ticket_number,
        "title": data.title,
        "description": data.description,
        "status": "open",
        "priority": data.priority.value,
        "category": data.category.value,
        "requester_name": data.requester_name,
        "requester_email": data.requester_email,
        "assignee": data.assignee,
        "due_date": due_date,
        "comments": [],
        "activity": activity,
        "created_at": now,
        "updated_at": now,
    }

    result = db["tickets"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_ticket(doc)


def build_query(params: TicketListParams) -> dict[str, Any]:
    """Build a MongoDB filter dict from ticket list parameters."""
    query: dict[str, Any] = {}

    # Free-text search via regex (case-insensitive)
    if params.q:
        escaped = escape_regex(params.q)
        regex = {"$regex": escaped, "$options": "i"}
        query["$or"] = [{"title": regex}, {"description": regex}]

    # Multi-value filters: split by comma, use $in
    if params.status:
        query["status"] = {"$in": [s.strip() for s in params.status.split(",") if s.strip()]}
    if params.priority:
        query["priority"] = {"$in": [p.strip() for p in params.priority.split(",") if p.strip()]}
    if params.category:
        query["category"] = {"$in": [c.strip() for c in params.category.split(",") if c.strip()]}
    if params.assignee:
        query["assignee"] = {"$in": [a.strip() for a in params.assignee.split(",") if a.strip()]}

    # Date range filters
    if params.created_from or params.created_to:
        date_filter: dict[str, Any] = {}
        if params.created_from:
            date_filter["$gte"] = _normalize_utc(params.created_from)
        if params.created_to:
            date_filter["$lte"] = _normalize_utc(params.created_to)
        query["created_at"] = date_filter

    # Overdue filter: due_date < now and status not in (resolved, closed)
    if params.overdue is True:
        now = datetime.now(timezone.utc)
        query["due_date"] = {"$ne": None, "$lt": now}
        if "status" in query and isinstance(query["status"], dict) and "$in" in query["status"]:
            allowed = [s for s in query["status"]["$in"] if s not in ("resolved", "closed")]
            query["status"] = {"$in": allowed}
        else:
            query["status"] = {"$nin": ["resolved", "closed"]}
    elif params.overdue is False:
        now = datetime.now(timezone.utc)
        query["$or"] = [
            {"due_date": None},
            {"due_date": {"$gte": now}},
            {"status": {"$in": ["resolved", "closed"]}},
        ]

    return query


def list_tickets(db: Database, params: TicketListParams) -> dict[str, Any]:
    """Return a paginated, filtered, sorted list of tickets (without comments/activity)."""
    query = build_query(params)

    # ---------- Sorting ----------
    if params.sort_by == "priority":
        sort_dir = ASCENDING if params.order == "asc" else DESCENDING
        return _list_tickets_by_priority(db, query, sort_dir, params)

    sort_field = params.sort_by if params.sort_by in ("created_at", "updated_at") else "created_at"
    sort_dir = ASCENDING if params.order == "asc" else DESCENDING

    total = db["tickets"].count_documents(query)
    skip = (params.page - 1) * params.page_size

    # Exclude heavy arrays for list view
    cursor = (
        db["tickets"]
        .find(query, {"comments": 0, "activity": 0})
        .sort(sort_field, sort_dir)
        .skip(skip)
        .limit(params.page_size)
    )

    items = [serialize_ticket(doc) for doc in cursor]
    total_pages = math.ceil(total / params.page_size) if total else 0

    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "total_pages": total_pages,
    }


def _list_tickets_by_priority(
    db: Database, query: dict, sort_dir: int, params: TicketListParams
) -> dict[str, Any]:
    """List tickets sorted by priority using an aggregation pipeline."""
    skip = (params.page - 1) * params.page_size

    pipeline: list[dict[str, Any]] = []
    if query:
        pipeline.append({"$match": query})

    pipeline.append(
        {
            "$addFields": {
                "_priority_order": {
                    "$switch": {
                        "branches": [
                            {"case": {"$eq": ["$priority", "urgent"]}, "then": 0},
                            {"case": {"$eq": ["$priority", "high"]}, "then": 1},
                            {"case": {"$eq": ["$priority", "medium"]}, "then": 2},
                            {"case": {"$eq": ["$priority", "low"]}, "then": 3},
                        ],
                        "default": 4,
                    }
                }
            }
        }
    )

    pipeline.append(
        {
            "$facet": {
                "metadata": [{"$count": "total"}],
                "data": [
                    {"$sort": {"_priority_order": sort_dir, "created_at": DESCENDING}},
                    {"$skip": skip},
                    {"$limit": params.page_size},
                    {"$project": {"_priority_order": 0, "comments": 0, "activity": 0}},
                ],
            }
        }
    )

    result = list(db["tickets"].aggregate(pipeline))
    facet = result[0] if result else {"metadata": [], "data": []}

    total = facet["metadata"][0]["total"] if facet["metadata"] else 0
    items = [serialize_ticket(doc) for doc in facet["data"]]
    total_pages = math.ceil(total / params.page_size) if total else 0

    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "total_pages": total_pages,
    }


def get_ticket(db: Database, ticket_id: str) -> dict[str, Any] | None:
    """Return a single ticket by its ObjectId string, or None."""
    oid = _validate_object_id(ticket_id)
    doc = db["tickets"].find_one({"_id": oid})
    return serialize_ticket(doc) if doc else None


def update_ticket(db: Database, ticket_id: str, data: TicketUpdate) -> dict[str, Any] | None:
    """Full replacement of editable fields (PUT semantics)."""
    oid = _validate_object_id(ticket_id)
    current = db["tickets"].find_one({"_id": oid})
    if current is None:
        return None

    now = datetime.now(timezone.utc)
    new_activities: list[dict[str, Any]] = []

    # Validate status transition if status is being updated
    current_status = current.get("status", "open")
    new_status = data.status.value if data.status is not None else current_status
    if data.status is not None and new_status != current_status:
        if new_status not in VALID_TRANSITIONS.get(current_status, set()):
            raise ValueError(
                f"Invalid status transition from '{current_status}' to '{new_status}'."
            )
        new_activities.append({
            "type": "status",
            "from": current_status,
            "to": new_status,
            "at": now,
        })

    # Track priority changes
    current_priority = current.get("priority", "medium")
    new_priority = data.priority.value
    if new_priority != current_priority:
        new_activities.append({
            "type": "priority",
            "from": current_priority,
            "to": new_priority,
            "at": now,
        })

    # Track assignee changes
    current_assignee = current.get("assignee")
    new_assignee = data.assignee
    if new_assignee != current_assignee:
        new_activities.append({
            "type": "assignee",
            "from": current_assignee,
            "to": new_assignee,
            "at": now,
        })

    due_date = _normalize_utc(data.due_date) if data.due_date else None

    update_fields: dict[str, Any] = {
        "title": data.title,
        "description": data.description,
        "priority": new_priority,
        "category": data.category.value,
        "requester_name": data.requester_name,
        "requester_email": data.requester_email,
        "assignee": new_assignee,
        "due_date": due_date,
        "updated_at": now,
    }
    if data.status is not None:
        update_fields["status"] = new_status

    update_op: dict[str, Any] = {"$set": update_fields}
    if new_activities:
        update_op["$push"] = {"activity": {"$each": new_activities}}

    doc = db["tickets"].find_one_and_update(
        {"_id": oid},
        update_op,
        return_document=ReturnDocument.AFTER,
    )
    return serialize_ticket(doc) if doc else None


def patch_ticket(
    db: Database, ticket_id: str, data: TicketPatch
) -> dict[str, Any] | None:
    """Partial update with status-transition validation and activity tracking."""
    oid = _validate_object_id(ticket_id)
    current = db["tickets"].find_one({"_id": oid})
    if current is None:
        return None

    patch_data = data.model_dump(exclude_none=True)
    now = datetime.now(timezone.utc)
    new_activities: list[dict[str, Any]] = []

    if "status" in patch_data:
        current_status = current.get("status", "open")
        raw_status = patch_data["status"]
        new_status = raw_status.value if hasattr(raw_status, "value") else str(raw_status)

        if new_status != current_status:
            if new_status not in VALID_TRANSITIONS.get(current_status, set()):
                raise ValueError(
                    f"Invalid status transition from '{current_status}' to '{new_status}'."
                )
            new_activities.append({
                "type": "status",
                "from": current_status,
                "to": new_status,
                "at": now,
            })

    if "priority" in patch_data:
        curr_p = current.get("priority", "medium")
        raw_p = patch_data["priority"]
        new_p = raw_p.value if hasattr(raw_p, "value") else str(raw_p)
        if new_p != curr_p:
            new_activities.append({
                "type": "priority",
                "from": curr_p,
                "to": new_p,
                "at": now,
            })

    if "assignee" in patch_data:
        curr_a = current.get("assignee")
        new_a = patch_data["assignee"]
        if new_a != curr_a:
            new_activities.append({
                "type": "assignee",
                "from": curr_a,
                "to": new_a,
                "at": now,
            })

    update_fields: dict[str, Any] = {}
    for key, value in patch_data.items():
        if hasattr(value, "value"):
            update_fields[key] = value.value
        elif key == "due_date" and isinstance(value, datetime):
            update_fields[key] = _normalize_utc(value)
        else:
            update_fields[key] = value

    update_fields["updated_at"] = now

    update_op: dict[str, Any] = {"$set": update_fields}
    if new_activities:
        update_op["$push"] = {"activity": {"$each": new_activities}}

    doc = db["tickets"].find_one_and_update(
        {"_id": oid},
        update_op,
        return_document=ReturnDocument.AFTER,
    )
    return serialize_ticket(doc) if doc else None


def delete_ticket(db: Database, ticket_id: str) -> bool:
    """Delete a ticket. Returns True if a document was actually removed."""
    oid = _validate_object_id(ticket_id)
    result = db["tickets"].delete_one({"_id": oid})
    return result.deleted_count > 0


def add_comment(
    db: Database, ticket_id: str, data: CommentCreate
) -> dict[str, Any] | None:
    """Append a comment to a ticket and return the updated document."""
    oid = _validate_object_id(ticket_id)
    now = datetime.now(timezone.utc)

    comment = {
        "author": data.author,
        "message": data.message,
        "created_at": now,
    }

    doc = db["tickets"].find_one_and_update(
        {"_id": oid},
        {
            "$push": {"comments": comment},
            "$set": {"updated_at": now},
        },
        return_document=ReturnDocument.AFTER,
    )
    return serialize_ticket(doc) if doc else None


def suggest_tickets(db: Database, q: str = "", limit: int = 5) -> list[dict[str, Any]]:
    """Return lightweight suggestions for quick search / command palette (fast, projection only)."""
    projection = {"_id": 1, "ticket_number": 1, "title": 1}

    if not q or not q.strip():
        cursor = (
            db["tickets"]
            .find({}, projection)
            .sort("created_at", DESCENDING)
            .limit(limit)
        )
    else:
        escaped = escape_regex(q.strip())
        rgx = {"$regex": escaped, "$options": "i"}
        cursor = (
            db["tickets"]
            .find(
                {"$or": [{"ticket_number": rgx}, {"title": rgx}]},
                projection,
            )
            .sort("created_at", DESCENDING)
            .limit(limit)
        )

    return [
        {
            "id": str(doc["_id"]),
            "ticket_number": doc.get("ticket_number", ""),
            "title": doc.get("title", ""),
        }
        for doc in cursor
    ]


def stream_tickets_csv(db: Database, params: TicketListParams) -> Iterator[str]:
    """Stream CSV chunks of filtered tickets (no pagination, cap at 5000 rows)."""
    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)

    # Write CSV header row
    writer.writerow([
        "Ticket Number",
        "Title",
        "Status",
        "Priority",
        "Category",
        "Requester Name",
        "Requester Email",
        "Assignee",
        "Due Date",
        "Created At",
        "Updated At",
    ])
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)

    query = build_query(params)
    cursor = (
        db["tickets"]
        .find(query, {"comments": 0, "activity": 0})
        .sort("created_at", DESCENDING)
        .limit(5000)
    )

    for doc in cursor:
        t = serialize_ticket(doc)
        due_str = t["due_date"].isoformat() if t.get("due_date") else ""
        c_at_str = t["created_at"].isoformat() if t.get("created_at") else ""
        u_at_str = t["updated_at"].isoformat() if t.get("updated_at") else ""

        writer.writerow([
            t.get("ticket_number", ""),
            t.get("title", ""),
            t.get("status", ""),
            t.get("priority", ""),
            t.get("category", ""),
            t.get("requester_name", ""),
            t.get("requester_email", ""),
            t.get("assignee") or "",
            due_str,
            c_at_str,
            u_at_str,
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)


def bulk_tickets(db: Database, request: BulkRequest) -> dict[str, Any]:
    """Perform bulk operations (status, priority, assign, delete) using bulk_write.

    Validates status transitions per ticket, records failed tickets with reasons,
    and appends activity history for each modified ticket.
    """
    ids = request.ids
    action = request.action.value if hasattr(request.action, "value") else str(request.action)
    raw_val = request.value
    if raw_val is None:
        if action == "update_status":
            raw_val = request.status
        elif action == "update_priority":
            raw_val = request.priority
        elif action == "assign":
            raw_val = request.assignee

    failed: list[dict[str, str]] = []
    valid_oids: list[ObjectId] = []
    oid_map: dict[str, ObjectId] = {}

    for item_id in ids:
        try:
            oid = ObjectId(item_id)
            valid_oids.append(oid)
            oid_map[item_id] = oid
        except (InvalidId, TypeError):
            failed.append({"id": item_id, "reason": f"'{item_id}' is not a valid ObjectId."})

    if not valid_oids:
        return {"matched": 0, "modified": 0, "failed": failed}

    # Fetch existing documents
    existing_docs = {
        str(doc["_id"]): doc
        for doc in db["tickets"].find({"_id": {"$in": valid_oids}})
    }

    # Check for missing documents
    existing_ids_set = set(existing_docs.keys())
    for item_id, oid in oid_map.items():
        if item_id not in existing_ids_set:
            failed.append({"id": item_id, "reason": "Ticket not found."})

    now = datetime.now(timezone.utc)
    matched_count = len(existing_docs)
    modified_count = 0

    if action == "delete":
        if existing_docs:
            ops = [DeleteOne({"_id": doc["_id"]}) for doc in existing_docs.values()]
            res = db["tickets"].bulk_write(ops)
            modified_count = res.deleted_count
        return {
            "matched": matched_count,
            "modified": modified_count,
            "failed": failed,
        }

    if action == "update_status":
        target_status = str(raw_val) if raw_val is not None else ""
        valid_status_values = {s.value for s in TicketStatus}
        if target_status not in valid_status_values:
            raise ValueError(f"Invalid status value '{target_status}'. Allowed: {', '.join(sorted(valid_status_values))}.")

        ops: list[UpdateOne] = []
        for doc_id, doc in existing_docs.items():
            curr_status = doc.get("status", "open")
            if curr_status == target_status:
                # Already in that status
                continue

            allowed = VALID_TRANSITIONS.get(curr_status, set())
            if target_status not in allowed:
                failed.append({
                    "id": doc_id,
                    "reason": f"Cannot transition status from '{curr_status}' to '{target_status}'.",
                })
                continue

            ops.append(
                UpdateOne(
                    {"_id": doc["_id"]},
                    {
                        "$set": {"status": target_status, "updated_at": now},
                        "$push": {
                            "activity": {
                                "type": "status",
                                "from": curr_status,
                                "to": target_status,
                                "at": now,
                            }
                        },
                    },
                )
            )

        if ops:
            res = db["tickets"].bulk_write(ops)
            modified_count = res.modified_count

        return {
            "matched": matched_count,
            "modified": modified_count,
            "failed": failed,
        }

    if action == "update_priority":
        target_priority = str(raw_val) if raw_val is not None else ""
        valid_priority_values = {p.value for p in TicketPriority}
        if target_priority not in valid_priority_values:
            raise ValueError(f"Invalid priority value '{target_priority}'. Allowed: {', '.join(sorted(valid_priority_values))}.")

        ops: list[UpdateOne] = []
        for doc_id, doc in existing_docs.items():
            curr_p = doc.get("priority", "medium")
            ops.append(
                UpdateOne(
                    {"_id": doc["_id"]},
                    {
                        "$set": {"priority": target_priority, "updated_at": now},
                        "$push": {
                            "activity": {
                                "type": "priority",
                                "from": curr_p,
                                "to": target_priority,
                                "at": now,
                            }
                        },
                    },
                )
            )

        if ops:
            res = db["tickets"].bulk_write(ops)
            modified_count = res.modified_count

        return {
            "matched": matched_count,
            "modified": modified_count,
            "failed": failed,
        }

    if action == "assign":
        target_assignee = str(raw_val).strip() if raw_val else None

        ops: list[UpdateOne] = []
        for doc_id, doc in existing_docs.items():
            curr_a = doc.get("assignee")
            ops.append(
                UpdateOne(
                    {"_id": doc["_id"]},
                    {
                        "$set": {"assignee": target_assignee, "updated_at": now},
                        "$push": {
                            "activity": {
                                "type": "assignee",
                                "from": curr_a,
                                "to": target_assignee,
                                "at": now,
                            }
                        },
                    },
                )
            )

        if ops:
            res = db["tickets"].bulk_write(ops)
            modified_count = res.modified_count

        return {
            "matched": matched_count,
            "modified": modified_count,
            "failed": failed,
        }

    raise ValueError(f"Unknown bulk action '{action}'.")
