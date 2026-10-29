"""
Seed script — inserts ~30 realistic support tickets into MongoDB.

Usage:
    python -m scripts.seed

Requires MONGODB_URI environment variable to be set.
"""

import os
import sys
import random
from datetime import datetime, timezone, timedelta

# Add project root to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient, ReturnDocument
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.environ.get("MONGODB_URI")
DATABASE_NAME = os.environ.get("DATABASE_NAME", "support_desk")

if not MONGODB_URI:
    print("ERROR: MONGODB_URI environment variable is not set.")
    print("Set it in your .env file or export it.")
    sys.exit(1)

# --- Seed Data ---

TITLES_AND_DESCRIPTIONS = [
    ("Login page returns 500 error", "When clicking the login button, the server returns a 500 Internal Server Error. This happens consistently across all browsers."),
    ("Unable to reset password", "The password reset email is never received. Checked spam folder. Tried multiple times over the past 24 hours."),
    ("Dashboard loading very slowly", "The main dashboard takes over 15 seconds to load. This started after the last deployment on Friday."),
    ("Billing invoice shows wrong amount", "My October invoice shows $299 but my plan is $199/month. The extra $100 charge is unexplained."),
    ("Feature request: Dark mode", "Would love a dark mode option for the application. Many users work late at night and the bright white UI causes eye strain."),
    ("CSV export includes deleted records", "When exporting data to CSV, records that were soft-deleted still appear in the export file."),
    ("Mobile app crashes on startup", "The iOS app crashes immediately after the splash screen on iPhone 15 Pro running iOS 17.4."),
    ("Cannot upload files larger than 5MB", "Getting a 413 error when trying to upload a 7MB PDF document. The docs say the limit is 25MB."),
    ("Two-factor authentication not working", "After scanning the QR code, the generated codes are always rejected as invalid. Tried Google Authenticator and Authy."),
    ("API rate limiting too aggressive", "Our integration is getting rate-limited at 50 requests/minute. We need at least 200 req/min for our use case."),
    ("Feature request: Webhook notifications", "We need webhook support for ticket status changes so we can integrate with our Slack workspace."),
    ("Search returns irrelevant results", "Searching for 'billing' returns tickets about 'building maintenance'. The search algorithm needs improvement."),
    ("Email notifications delayed by hours", "Email notifications for new tickets are arriving 3-4 hours after the ticket is created. Should be near-instant."),
    ("User profile page not saving changes", "Changes to display name and timezone are not persisted after clicking Save. No error message shown."),
    ("Duplicate charges on credit card", "I was charged twice for my monthly subscription on Oct 15. Transaction IDs: TXN-88421 and TXN-88422."),
    ("Feature request: Custom ticket fields", "We need the ability to add custom fields to tickets for our specific workflow requirements."),
    ("Reports page shows blank charts", "All charts on the analytics/reports page render as empty white boxes. Browser console shows D3.js errors."),
    ("SSO integration with Okta failing", "SAML authentication with Okta returns 'Invalid assertion' error. Worked fine until we updated our Okta tenant."),
    ("Ticket comments not appearing in real-time", "After posting a comment, it doesn't appear until the page is refreshed. Expected behavior is real-time updates."),
    ("Account locked after 3 failed attempts", "My account gets locked after only 3 failed login attempts. The policy should be 5 attempts. Cannot unlock via email."),
    ("Feature request: Bulk ticket operations", "Need ability to bulk-update status, priority, or assignee for multiple tickets at once from the list view."),
    ("PDF generation failing for large reports", "Monthly reports with more than 500 tickets fail to generate as PDF. Error: 'Memory limit exceeded'."),
    ("Timezone display incorrect for APAC users", "Users in APAC timezones (GMT+8 to GMT+12) see ticket times in UTC instead of their local timezone."),
    ("Cannot reassign tickets between teams", "The assignee dropdown only shows members of my team. I need to reassign a ticket to the Engineering team."),
    ("Billing page not loading on Firefox", "The billing/subscription page shows a blank white screen on Firefox 121. Works fine on Chrome and Safari."),
    ("Feature request: SLA tracking", "We need SLA (Service Level Agreement) tracking with configurable response and resolution time targets."),
    ("API documentation outdated", "The API docs reference v1 endpoints that were deprecated 6 months ago. The v2 endpoints are not documented."),
    ("Attachment preview not working for PNG files", "PNG image attachments show a broken image icon instead of a preview. JPG and GIF previews work correctly."),
    ("Auto-assignment rules not triggering", "Tickets with category 'billing' should auto-assign to the Finance team, but they're remaining unassigned."),
    ("Feature request: Ticket templates", "We need pre-defined ticket templates for common issue types to speed up ticket creation."),
]

REQUESTER_NAMES = [
    "Alice Johnson", "Bob Smith", "Carol Williams", "David Brown", "Emma Davis",
    "Frank Miller", "Grace Wilson", "Henry Moore", "Ivy Taylor", "Jack Anderson",
    "Karen Thomas", "Leo Jackson", "Mia White", "Noah Harris", "Olivia Martin",
]

REQUESTER_EMAILS = [
    "alice.j@example.com", "bob.smith@example.com", "carol.w@acme.org",
    "david.b@techcorp.io", "emma.d@startup.co", "frank.m@enterprise.com",
    "grace.w@agency.net", "henry.m@consulting.biz", "ivy.t@design.studio",
    "jack.a@dev.team", "karen.t@support.org", "leo.j@media.group",
    "mia.w@research.lab", "noah.h@finance.co", "olivia.m@marketing.io",
]

ASSIGNEES = [
    "John Support", "Sarah Engineer", "Mike DevOps", "Lisa Backend",
    "Tom Frontend", "Amy QA", None, None,  # Some unassigned
]

STATUSES = ["open", "in_progress", "resolved", "closed"]
PRIORITIES = ["low", "medium", "high", "urgent"]
CATEGORIES = ["bug", "billing", "feature_request", "general"]

SAMPLE_COMMENTS = [
    ("John Support", "I've reproduced this issue. Escalating to the engineering team."),
    ("Sarah Engineer", "Looking into this now. Will update within the hour."),
    ("Mike DevOps", "This appears to be related to the recent deployment. Rolling back to investigate."),
    ("Lisa Backend", "Fixed in commit abc123. Deploying to staging for verification."),
    ("Tom Frontend", "Can you provide your browser version and OS? Need more details to reproduce."),
    ("Amy QA", "Verified the fix on staging. Looks good. Moving to resolved."),
    ("John Support", "Thank you for reporting this. We'll include this in our next sprint."),
    ("Sarah Engineer", "This is a known limitation. We have a feature request tracked internally."),
]


def generate_comments() -> list:
    """Generate 0-3 random comments for a ticket."""
    num_comments = random.choices([0, 1, 2, 3], weights=[3, 4, 2, 1])[0]
    comments = []
    base_time = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 25))
    for i in range(num_comments):
        author, message = random.choice(SAMPLE_COMMENTS)
        comments.append({
            "author": author,
            "message": message,
            "created_at": base_time + timedelta(hours=random.randint(1, 48) * (i + 1)),
        })
    return comments


def seed():
    """Insert seed data into MongoDB."""
    client = MongoClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    # Clear existing data
    db.tickets.delete_many({})
    db.counters.delete_many({})

    print(f"Seeding database '{DATABASE_NAME}'...")

    # Initialize counter
    db.counters.update_one(
        {"_id": "ticket_number"},
        {"$set": {"seq": 0}},
        upsert=True,
    )

    tickets = []
    for i, (title, description) in enumerate(TITLES_AND_DESCRIPTIONS):
        # Determine category from title/description hints
        if "billing" in title.lower() or "invoice" in title.lower() or "charge" in title.lower():
            category = "billing"
        elif "feature request" in title.lower():
            category = "feature_request"
        elif "crash" in title.lower() or "error" in title.lower() or "fail" in title.lower() or "bug" in title.lower():
            category = "bug"
        else:
            category = random.choice(CATEGORIES)

        # Stagger creation times over the past 30 days
        created_at = datetime.now(timezone.utc) - timedelta(
            days=random.randint(0, 30),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
        )

        requester_idx = random.randint(0, len(REQUESTER_NAMES) - 1)

        # Generate ticket number atomically
        counter = db.counters.find_one_and_update(
            {"_id": "ticket_number"},
            {"$inc": {"seq": 1}},
            return_document=ReturnDocument.AFTER,
            upsert=True,
        )
        ticket_number = f"TKT-{counter['seq']:04d}"

        status = random.choice(STATUSES)
        # Stagger due dates: some overdue, some upcoming, some None
        due_choice = random.choice(["past", "future", "none"])
        if due_choice == "past":
            due_date = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 5))
        elif due_choice == "future":
            due_date = datetime.now(timezone.utc) + timedelta(days=random.randint(1, 10))
        else:
            due_date = None

        activity = [
            {
                "type": "create",
                "from": None,
                "to": "open",
                "at": created_at,
            }
        ]
        if status != "open":
            activity.append({
                "type": "status",
                "from": "open",
                "to": status,
                "at": created_at + timedelta(hours=1),
            })

        ticket = {
            "ticket_number": ticket_number,
            "title": title,
            "description": description,
            "status": status,
            "priority": random.choice(PRIORITIES),
            "category": category,
            "requester_name": REQUESTER_NAMES[requester_idx],
            "requester_email": REQUESTER_EMAILS[requester_idx],
            "assignee": random.choice(ASSIGNEES),
            "due_date": due_date,
            "created_at": created_at,
            "updated_at": created_at + timedelta(hours=random.randint(0, 72)),
            "comments": generate_comments(),
            "activity": activity,
        }
        tickets.append(ticket)

    result = db.tickets.insert_many(tickets)
    print(f"Inserted {len(result.inserted_ids)} tickets (TKT-0001 to TKT-{len(tickets):04d}).")

    # Print summary
    print("\nSummary:")
    for status in STATUSES:
        count = sum(1 for t in tickets if t["status"] == status)
        print(f"  {status}: {count}")
    print(f"  Total: {len(tickets)}")

    client.close()
    print("\nDone! Database seeded successfully.")


if __name__ == "__main__":
    seed()
