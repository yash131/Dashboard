# Support Desk System

A full-stack ticket management (CRUD) application built as a practical assessment project, emphasizing backend data handling: validation, querying, indexing, error handling, and clean architecture.

## Tech Stack & Rationale

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | Python 3.11+, FastAPI | Async-ready, auto-generates OpenAPI docs, great Pydantic integration |
| **Validation** | Pydantic v2 | Strict schemas, stripping, unknown-field rejection, email validation |
| **Database** | MongoDB Atlas + PyMongo | Flexible document model suits tickets with embedded comments; powerful aggregation pipeline |
| **Frontend** | Vanilla HTML/CSS/JS | Zero build step, fast to serve, mobile-first responsive design |
| **Deployment** | Vercel (serverless) | Free tier, auto-scaling, simple config via vercel.json |

## Architecture

```
app/
├── main.py              ← FastAPI app, CORS, exception handlers, static mount
├── config.py            ← Settings from env vars (pydantic-settings)
├── db/
│   ├── connection.py    ← Module-level MongoClient singleton (serverless-safe)
│   └── indexes.py       ← Index creation on startup
├── schemas/             ← Pydantic v2 models (input/output validation)
│   ├── common.py        ← ErrorResponse, PaginatedResponse
│   ├── ticket.py        ← TicketCreate, TicketUpdate, TicketPatch, TicketResponse, enums
│   └── comment.py       ← CommentCreate, CommentResponse
├── routers/             ← Route handlers (thin — delegate to services)
│   ├── tickets.py       ← CRUD endpoints for /api/tickets
│   ├── comments.py      ← POST /api/tickets/{id}/comments
│   ├── stats.py         ← GET /api/stats (aggregation)
│   └── health.py        ← GET /api/health
└── services/            ← Business logic + DB queries
    ├── ticket_service.py ← CRUD, ticket numbering, status transitions, search
    └── stats_service.py  ← MongoDB aggregation pipeline

public/                  ← Frontend (served as static files)
├── index.html           ← Single-page layout
├── style.css            ← Mobile-first responsive styles
└── app.js               ← Vanilla JS application

scripts/
└── seed.py              ← Inserts ~30 realistic tickets

tests/
├── conftest.py          ← Fixtures with mongomock
└── test_tickets.py      ← 20+ pytest tests
```

**Key design decisions:**
- **Layered architecture**: Routers → Services → DB. No database logic in route handlers.
- **Serverless-safe**: MongoClient created once at module level and reused across invocations.
- **Atomic ticket numbers**: Uses `find_one_and_update` with `$inc` on a `counters` collection.
- **Status transitions**: Enforced via `VALID_TRANSITIONS` dict — closed tickets cannot be reopened.
- **Regex injection prevention**: Search input escaped with `re.escape()` before use in `$regex`.

## Database Setup (MongoDB Atlas)

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a database user with read/write permissions
3. Whitelist your IP (or use `0.0.0.0/0` for development)
4. Get your connection string (replace `<password>`)
5. Set it as the `MONGODB_URI` environment variable

### Collections
- **tickets** — Stores all ticket documents
- **counters** — Stores atomic counter for ticket number generation

### Indexes (created automatically on startup)
| Index | Fields | Purpose |
|-------|--------|---------|
| idx_status | `{status: 1}` | Filter by status |
| idx_priority | `{priority: 1}` | Filter by priority |
| idx_created_at | `{created_at: -1}` | Sort by newest |
| idx_status_priority_created | `{status: 1, priority: 1, created_at: -1}` | Compound filter+sort |
| idx_text_search | `{title: "text", description: "text"}` | Full-text search |

## Local Setup & Run

```bash
# Clone the repository
git clone <repo-url>
cd support-desk

# Create virtual environment
python -m venv venv
source venv/bin/activate    # Linux/Mac
.\venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set MONGODB_URI

# (Optional) Seed the database with sample data
python -m scripts.seed

# Run the application
uvicorn app.main:app --reload
```

The app will be available at **http://localhost:8000**

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | — | MongoDB Atlas connection string |
| `DATABASE_NAME` | No | `support_desk` | Database name |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |

## API Reference

### Health Check
```bash
curl http://localhost:8000/api/health
```

### Create Ticket
```bash
curl -X POST http://localhost:8000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Login page shows 500 error",
    "description": "The login button returns a server error consistently across browsers.",
    "category": "bug",
    "priority": "high",
    "requester_name": "Jane Doe",
    "requester_email": "jane@example.com",
    "assignee": "John Support"
  }'
```

### List Tickets (with filters, search, pagination)
```bash
# Basic list
curl "http://localhost:8000/api/tickets"

# Search with filters
curl "http://localhost:8000/api/tickets?q=login&status=open,in_progress&priority=high&page=1&page_size=10"

# Sort by priority
curl "http://localhost:8000/api/tickets?sort_by=priority&order=asc"

# Date range
curl "http://localhost:8000/api/tickets?created_from=2026-10-01T00:00:00Z&created_to=2026-10-31T23:59:59Z"
```

### Get Single Ticket
```bash
curl http://localhost:8000/api/tickets/{id}
```

### Full Update (PUT)
```bash
curl -X PUT http://localhost:8000/api/tickets/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated title here",
    "description": "Updated description.",
    "category": "bug",
    "priority": "urgent",
    "requester_name": "Jane Doe",
    "requester_email": "jane@example.com"
  }'
```

### Partial Update (PATCH)
```bash
# Change status
curl -X PATCH http://localhost:8000/api/tickets/{id} \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'

# Change priority
curl -X PATCH http://localhost:8000/api/tickets/{id} \
  -H "Content-Type: application/json" \
  -d '{"priority": "urgent"}'
```

### Delete Ticket
```bash
curl -X DELETE http://localhost:8000/api/tickets/{id}
```

### Add Comment
```bash
curl -X POST http://localhost:8000/api/tickets/{id}/comments \
  -H "Content-Type: application/json" \
  -d '{
    "author": "Support Agent",
    "message": "Looking into this issue now."
  }'
```

### Get Stats
```bash
curl http://localhost:8000/api/stats
# Returns: {"total": 30, "by_status": {"open": 8, ...}, "by_priority": {"high": 5, ...}, "overdue": 7}

# 9. Get timeline stats (14 days default)
curl "http://localhost:8000/api/stats/timeline?days=14"

# 10. Command palette quick suggestions
curl "http://localhost:8000/api/tickets/suggest?q=login"

# 11. Export filtered tickets to CSV (streams up to 5000 rows)
curl -O "http://localhost:8000/api/tickets/export?category=bug"

# 12. Bulk operations (status, priority, assign, delete - max 100 ids)
curl -X POST http://localhost:8000/api/tickets/bulk \
  -H "Content-Type: application/json" \
  -d '{"ids": ["6ae35360c15cbd4acb635ff4"], "action": "update_priority", "value": "urgent"}'
```

## Running Tests

```bash
# Run all 66 tests
python -m pytest tests/ -v
```

All 66 tests use **mongomock** to simulate MongoDB completely offline in 0.67s.

## Vercel Deployment

1. Install the Vercel CLI: `npm i -g vercel`
2. Set the `MONGODB_URI` env var in Vercel project settings
3. Deploy:
```bash
vercel --prod
```

The `vercel.json` routes API requests to the FastAPI app and serves static files from `/public`.

## Completed Features

- [x] Full CRUD for tickets (Create, Read, Update, Patch, Delete)
- [x] Auto-generated ticket numbers (TKT-0001) via atomic counter
- [x] Pydantic v2 validation: strip whitespace, reject unknown fields, email validation
- [x] Status transition enforcement (closed tickets cannot be reopened)
- [x] Multi-value filtering (status, priority, category, assignee)
- [x] Case-insensitive search with regex injection prevention
- [x] Date range filtering
- [x] Sorting by created_at, updated_at, or priority (custom numeric order)
- [x] Pagination with total count and page info
- [x] Embedded comments system
- [x] Embedded `activity` array ({type, from, to, at}) tracking create/status/priority/assignee changes
- [x] Optional `due_date` field with `overdue=true` query filter & `overdue` count in stats
- [x] Bulk operations endpoint `POST /api/tickets/bulk` with `bulk_write` and per-ticket transition validation
- [x] Streaming CSV export `GET /api/tickets/export` (capped at 5000 rows)
- [x] 14-day creation/resolution timeline aggregation `GET /api/stats/timeline?days=14`
- [x] Fast projection-only search suggestions `GET /api/tickets/suggest?q=`
- [x] MongoDB aggregation pipeline for stats
- [x] Database indexes (single, compound, text)
- [x] Consistent error format with proper HTTP status codes (400/404/409/422/500)
- [x] Global exception handlers
- [x] CORS configuration
- [x] Responsive modern frontend in vanilla HTML/CSS/JS with Inter font, Lucide icons, Dark mode, 5 accent colors, KPI cards, SVG charts, Kanban board, Drawer, Command palette, and Bulk actions bar
- [x] Seed script with ~30 realistic tickets
- [x] 66 comprehensive pytest tests with mongomock (all passing)

## Known Issues & Limitations

- **No authentication**: The API is open; add JWT/OAuth for production use.
- **No WebSocket**: Comments require a page refresh to see updates from other users.
- **No file attachments**: Tickets support text only.
- **Mongomock limitations**: Some aggregation operators (like `$facet`) may not be fully supported in mongomock, so stats tests may need a real DB for full validation.
- **No rate limiting**: Add middleware for production.
- **Ticket number gap**: If an insert fails after incrementing the counter, numbers may have gaps.

## Future Improvements

- JWT authentication & role-based access control
- WebSocket for real-time updates
- File attachment support (with cloud storage)
- Email notifications on ticket status changes
- SLA tracking and alerts
- Audit log for all ticket changes
- Bulk operations (status/assignee updates)
- Custom ticket fields
- Dashboard charts with D3.js or Chart.js
- Rate limiting middleware
- API versioning (/api/v1/...)
