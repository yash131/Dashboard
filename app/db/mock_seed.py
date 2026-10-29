"""
In-memory mock database with pre-seeded data for local development/demo
when real MongoDB Atlas credentials are not yet configured.
"""

from datetime import datetime, timezone, timedelta
import mongomock

SAMPLE_TICKETS = [
    {
        "title": "Login page returns 500 error on submit",
        "description": "When clicking the login button with valid credentials, server returns a 500 Internal Server Error. Happens consistently on Chrome and Firefox.",
        "status": "open",
        "priority": "urgent",
        "category": "bug",
        "requester_name": "Alice Johnson",
        "requester_email": "alice.j@example.com",
        "assignee": "Sarah Engineer",
        "comments": [
            {
                "author": "Sarah Engineer",
                "message": "Investigating the auth service logs. Looks like a null reference in token generation.",
                "created_at": datetime.now(timezone.utc) - timedelta(hours=2),
            }
        ],
    },
    {
        "title": "October invoice amount mismatch",
        "description": "My October invoice shows $299 but my monthly plan is $199. The extra $100 charge has no line-item explanation.",
        "status": "in_progress",
        "priority": "high",
        "category": "billing",
        "requester_name": "Bob Smith",
        "requester_email": "bob.smith@example.com",
        "assignee": "John Support",
        "comments": [
            {
                "author": "John Support",
                "message": "Checking Stripe billing records for account #8821. Will issue a credit if erroneous.",
                "created_at": datetime.now(timezone.utc) - timedelta(hours=5),
            }
        ],
    },
    {
        "title": "Dark mode theme option requested",
        "description": "Would love a dark mode option for the dashboard. Many of our support agents work night shifts and bright white causes eye fatigue.",
        "status": "open",
        "priority": "low",
        "category": "feature_request",
        "requester_name": "Carol Williams",
        "requester_email": "carol.w@acme.org",
        "assignee": None,
        "comments": [],
    },
    {
        "title": "Two-factor authentication QR code rejected",
        "description": "After scanning the 2FA setup QR code in Google Authenticator, generated 6-digit codes are consistently rejected as invalid.",
        "status": "resolved",
        "priority": "high",
        "category": "bug",
        "requester_name": "David Brown",
        "requester_email": "david.b@techcorp.io",
        "assignee": "Mike DevOps",
        "comments": [
            {
                "author": "Mike DevOps",
                "message": "Identified clock drift on the auth NTP server. Synced clocks and verified 2FA works now.",
                "created_at": datetime.now(timezone.utc) - timedelta(days=1),
            }
        ],
    },
    {
        "title": "CSV data export contains soft-deleted rows",
        "description": "When exporting monthly reports to CSV, records marked as deleted still appear in the spreadsheet file.",
        "status": "closed",
        "priority": "medium",
        "category": "bug",
        "requester_name": "Emma Davis",
        "requester_email": "emma.d@startup.co",
        "assignee": "Lisa Backend",
        "comments": [
            {
                "author": "Lisa Backend",
                "message": "Added `deleted_at: None` filter to the export aggregation pipeline in PR #412.",
                "created_at": datetime.now(timezone.utc) - timedelta(days=3),
            }
        ],
    },
    {
        "title": "Inquire about annual enterprise discount",
        "description": "We are currently on the monthly Pro tier with 25 seats and would like to switch to an annual plan. What discount tiers are available?",
        "status": "open",
        "priority": "medium",
        "category": "billing",
        "requester_name": "Frank Miller",
        "requester_email": "frank.m@enterprise.com",
        "assignee": None,
        "comments": [],
    },
    {
        "title": "Webhook notification delivery delayed by 2 hours",
        "description": "Webhooks configured for ticket events are triggering with substantial latency. We depend on this for our internal Slack bot alerts.",
        "status": "in_progress",
        "priority": "high",
        "category": "bug",
        "requester_name": "Grace Wilson",
        "requester_email": "grace.w@agency.net",
        "assignee": "Mike DevOps",
        "comments": [
            {
                "author": "Mike DevOps",
                "message": "Redis worker queue was backed up due to high load. Scaled consumer instances.",
                "created_at": datetime.now(timezone.utc) - timedelta(hours=8),
            }
        ],
    },
    {
        "title": "Cannot upload PDF attachments over 5MB",
        "description": "Receiving a 413 Payload Too Large error when uploading 7MB PDF documentation files. The manual says 25MB is allowed.",
        "status": "open",
        "priority": "medium",
        "category": "general",
        "requester_name": "Henry Moore",
        "requester_email": "henry.m@consulting.biz",
        "assignee": None,
        "comments": [],
    },
    {
        "title": "API rate limit increase for staging environment",
        "description": "Our automated CI/CD suite runs integration tests against the API and hits the 50 req/min rate limit. Requesting 250 req/min for staging IP.",
        "status": "resolved",
        "priority": "medium",
        "category": "feature_request",
        "requester_name": "Ivy Taylor",
        "requester_email": "ivy.t@design.studio",
        "assignee": "Lisa Backend",
        "comments": [
            {
                "author": "Lisa Backend",
                "message": "Whitelisted staging IP address with 300 req/min limit in Cloudflare.",
                "created_at": datetime.now(timezone.utc) - timedelta(days=2),
            }
        ],
    },
    {
        "title": "User session expires prematurely after 5 minutes",
        "description": "Agents are being logged out unexpectedly after only 5 minutes of inactivity instead of the configured 8-hour shift duration.",
        "status": "closed",
        "priority": "urgent",
        "category": "bug",
        "requester_name": "Jack Anderson",
        "requester_email": "jack.a@dev.team",
        "assignee": "Sarah Engineer",
        "comments": [
            {
                "author": "Sarah Engineer",
                "message": "Fixed session cookie Max-Age header value in auth middleware.",
                "created_at": datetime.now(timezone.utc) - timedelta(days=4),
            }
        ],
    },
    {
        "title": "Custom report builder export to XLSX",
        "description": "Feature request: In addition to CSV export, allow exporting custom analytical reports directly into Microsoft Excel (.xlsx) format with formatted tables.",
        "status": "open",
        "priority": "low",
        "category": "feature_request",
        "requester_name": "Karen Thomas",
        "requester_email": "karen.t@support.org",
        "assignee": None,
        "comments": [],
    },
    {
        "title": "Duplicate charges on card renewal",
        "description": "Card ending in 4022 was billed twice for monthly renewal on Oct 25. Transaction IDs: TXN-99120 and TXN-99121.",
        "status": "in_progress",
        "priority": "urgent",
        "category": "billing",
        "requester_name": "Leo Jackson",
        "requester_email": "leo.j@media.group",
        "assignee": "John Support",
        "comments": [
            {
                "author": "John Support",
                "message": "Confirmed duplicate transaction with payment processor. Processing immediate refund of $199.",
                "created_at": datetime.now(timezone.utc) - timedelta(hours=3),
            }
        ],
    },
]


def create_in_memory_db():
    """Create and seed an in-memory mongomock database with realistic sample tickets."""
    client = mongomock.MongoClient()
    db = client["support_desk"]

    # Initialize counter
    db.counters.update_one(
        {"_id": "ticket_number"},
        {"$set": {"seq": len(SAMPLE_TICKETS)}},
        upsert=True,
    )

    now = datetime.now(timezone.utc)
    docs = []
    for i, t in enumerate(SAMPLE_TICKETS):
        created = now - timedelta(days=len(SAMPLE_TICKETS) - i, hours=i * 2)
        # Give some tickets overdue due_dates and others future due_dates
        if i % 3 == 0:
            due_date = now - timedelta(days=2)
        elif i % 3 == 1:
            due_date = now + timedelta(days=3)
        else:
            due_date = None

        activity = [
            {
                "type": "create",
                "from": None,
                "to": "open",
                "at": created,
            }
        ]
        if t["status"] != "open":
            activity.append({
                "type": "status",
                "from": "open",
                "to": t["status"],
                "at": created + timedelta(hours=1),
            })

        doc = {
            "ticket_number": f"TKT-{i + 1:04d}",
            "title": t["title"],
            "description": t["description"],
            "status": t["status"],
            "priority": t["priority"],
            "category": t["category"],
            "requester_name": t["requester_name"],
            "requester_email": t["requester_email"],
            "assignee": t.get("assignee"),
            "due_date": due_date,
            "created_at": created,
            "updated_at": created + timedelta(hours=1),
            "comments": t.get("comments", []),
            "activity": activity,
        }
        docs.append(doc)

    db.tickets.insert_many(docs)
    return db
