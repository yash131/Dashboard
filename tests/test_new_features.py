"""
Tests for newly added backend features:
1. POST /api/tickets/bulk (status, priority, assign, delete, transitions, validation)
2. GET /api/tickets/export (streaming CSV, filtered, max 5000)
3. GET /api/stats/timeline (created & resolved per day, fills 0s)
4. Embedded activity array ({type, from, to, at} on create, status, priority, assignee)
5. due_date and overdue=true list filter & stats overdue count
6. GET /api/tickets/suggest?q= (max 5, projection only, regex safe)
"""

from datetime import datetime, timedelta, timezone
import io
import csv
import pytest


class TestBulkOperations:
    """Tests for POST /api/tickets/bulk."""

    def test_bulk_update_status_valid(self, client, mock_db):
        # Create 3 tickets (initially open)
        ids = []
        for i in range(3):
            r = client.post("/api/tickets", json={
                "title": f"Bulk status ticket {i + 1}",
                "description": "Description for bulk ticket update",
                "priority": "low",
                "category": "bug",
                "requester_name": "Alice",
                "requester_email": "alice@example.com",
            })
            assert r.status_code == 201
            ids.append(r.json()["id"])

        res = client.post("/api/tickets/bulk", json={
            "ids": ids,
            "action": "update_status",
            "value": "in_progress",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["matched"] == 3
        assert data["modified"] == 3
        assert data["failed"] == []

        # Check all are in_progress
        for tid in ids:
            t = client.get(f"/api/tickets/{tid}").json()
            assert t["status"] == "in_progress"

    def test_bulk_update_status_partial_invalid_transition(self, client):
        # Ticket 1: open -> resolved (valid)
        t1 = client.post("/api/tickets", json={
            "title": "Open ticket for transition",
            "description": "Testing status transition",
            "category": "general",
            "requester_name": "Bob",
            "requester_email": "bob@example.com",
        }).json()

        # Ticket 2: closed -> in_progress (invalid)
        t2 = client.post("/api/tickets", json={
            "title": "Closed ticket for transition",
            "description": "Testing status transition",
            "category": "general",
            "requester_name": "Charlie",
            "requester_email": "charlie@example.com",
        }).json()
        client.patch(f"/api/tickets/{t2['id']}", json={"status": "closed"})

        res = client.post("/api/tickets/bulk", json={
            "ids": [t1["id"], t2["id"]],
            "action": "update_status",
            "value": "resolved",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["matched"] == 2
        assert data["modified"] == 1
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == t2["id"]
        assert "Cannot transition status" in data["failed"][0]["reason"]

        # Verify t1 was modified, t2 remains closed
        assert client.get(f"/api/tickets/{t1['id']}").json()["status"] == "resolved"
        assert client.get(f"/api/tickets/{t2['id']}").json()["status"] == "closed"

    def test_bulk_update_priority(self, client):
        ids = []
        for p in ["low", "medium"]:
            r = client.post("/api/tickets", json={
                "title": f"Priority test ticket {p}",
                "description": "Testing priority change",
                "priority": p,
                "category": "general",
                "requester_name": "Dave",
                "requester_email": "dave@example.com",
            })
            ids.append(r.json()["id"])

        res = client.post("/api/tickets/bulk", json={
            "ids": ids,
            "action": "update_priority",
            "value": "urgent",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["matched"] == 2
        assert data["modified"] == 2
        assert data["failed"] == []

        for tid in ids:
            assert client.get(f"/api/tickets/{tid}").json()["priority"] == "urgent"

    def test_bulk_assign(self, client):
        ids = []
        for i in range(2):
            r = client.post("/api/tickets", json={
                "title": f"Assign test ticket {i}",
                "description": "Testing assignment change",
                "category": "general",
                "requester_name": "Eve",
                "requester_email": "eve@example.com",
            })
            ids.append(r.json()["id"])

        res = client.post("/api/tickets/bulk", json={
            "ids": ids,
            "action": "assign",
            "value": "Agent Smith",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["matched"] == 2
        assert data["modified"] == 2
        for tid in ids:
            assert client.get(f"/api/tickets/{tid}").json()["assignee"] == "Agent Smith"

    def test_bulk_delete(self, client):
        ids = []
        for i in range(2):
            r = client.post("/api/tickets", json={
                "title": f"Delete test ticket {i}",
                "description": "Testing bulk deletion",
                "category": "billing",
                "requester_name": "Frank",
                "requester_email": "frank@example.com",
            })
            ids.append(r.json()["id"])

        res = client.post("/api/tickets/bulk", json={
            "ids": ids,
            "action": "delete",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["matched"] == 2
        assert data["modified"] == 2

        for tid in ids:
            assert client.get(f"/api/tickets/{tid}").status_code == 404

    def test_bulk_invalid_and_missing_ids(self, client):
        res = client.post("/api/tickets/bulk", json={
            "ids": ["not-a-valid-id", "507f1f77bcf86cd799439011"],
            "action": "update_status",
            "value": "in_progress",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["matched"] == 0
        assert data["modified"] == 0
        assert len(data["failed"]) == 2
        reasons = [f["reason"] for f in data["failed"]]
        assert any("not a valid ObjectId" in r for r in reasons)
        assert any("Ticket not found" in r for r in reasons)

    def test_bulk_exceeds_max_100_ids(self, client):
        many_ids = ["507f1f77bcf86cd799439011"] * 101
        res = client.post("/api/tickets/bulk", json={
            "ids": many_ids,
            "action": "delete",
        })
        assert res.status_code == 422


class TestExportCSV:
    """Tests for GET /api/tickets/export."""

    def test_export_csv_headers_and_data(self, client):
        client.post("/api/tickets", json={
            "title": "Export ticket test alpha",
            "description": "Testing CSV export functionality",
            "priority": "high",
            "category": "billing",
            "requester_name": "Grace Hopper",
            "requester_email": "grace@example.com",
            "assignee": "Tech Lead",
        })

        res = client.get("/api/tickets/export")
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]
        assert 'attachment; filename="tickets.csv"' in res.headers.get("content-disposition", "")

        csv_reader = csv.reader(io.StringIO(res.text))
        rows = list(csv_reader)
        assert len(rows) >= 2  # Header + at least 1 ticket
        header = rows[0]
        assert "Ticket Number" in header
        assert "Title" in header
        assert "Status" in header
        assert "Priority" in header
        assert "Category" in header

        # Verify row content
        found = False
        for row in rows[1:]:
            if "Export ticket test alpha" in row:
                found = True
                assert "billing" in row
                assert "high" in row
                assert "grace@example.com" in row
        assert found

    def test_export_csv_respects_filters(self, client):
        client.post("/api/tickets", json={
            "title": "Bug ticket for filtering",
            "description": "Should be included in bug export",
            "category": "bug",
            "requester_name": "User 1",
            "requester_email": "u1@example.com",
        })
        client.post("/api/tickets", json={
            "title": "Feature ticket for filtering",
            "description": "Should NOT be included in bug export",
            "category": "feature_request",
            "requester_name": "User 2",
            "requester_email": "u2@example.com",
        })

        res = client.get("/api/tickets/export?category=bug")
        assert res.status_code == 200
        text = res.text
        assert "Bug ticket for filtering" in text
        assert "Feature ticket for filtering" not in text


class TestStatsTimeline:
    """Tests for GET /api/stats/timeline."""

    def test_stats_timeline_default_14_days(self, client):
        res = client.get("/api/stats/timeline")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) == 14
        for item in data:
            assert "date" in item
            assert "created" in item
            assert "resolved" in item
            assert isinstance(item["created"], int)
            assert isinstance(item["resolved"], int)

    def test_stats_timeline_custom_days(self, client):
        res = client.get("/api/stats/timeline?days=7")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 7

    def test_stats_timeline_records_created_and_resolved(self, client):
        # Create ticket today
        t = client.post("/api/tickets", json={
            "title": "Timeline created ticket today",
            "description": "Verifying timeline aggregation",
            "category": "bug",
            "requester_name": "Tester",
            "requester_email": "tester@example.com",
        }).json()

        # Resolve ticket today
        client.patch(f"/api/tickets/{t['id']}", json={"status": "resolved"})

        res = client.get("/api/stats/timeline?days=14")
        assert res.status_code == 200
        data = res.json()
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        today_entry = next((item for item in data if item["date"] == today_str), None)
        assert today_entry is not None
        assert today_entry["created"] >= 1
        assert today_entry["resolved"] >= 1


class TestActivityHistory:
    """Tests for embedded activity array on tickets."""

    def test_activity_created_on_new_ticket(self, client):
        res = client.post("/api/tickets", json={
            "title": "Activity tracking ticket creation",
            "description": "Checking activity initialization",
            "category": "general",
            "requester_name": "Isaac",
            "requester_email": "isaac@example.com",
        })
        assert res.status_code == 201
        data = res.json()
        tid = data["id"]

        detail = client.get(f"/api/tickets/{tid}").json()
        assert "activity" in detail
        assert len(detail["activity"]) >= 1
        first_act = detail["activity"][0]
        assert first_act["type"] == "create"
        assert first_act["to"] == "open"
        assert "at" in first_act

    def test_activity_appended_on_status_priority_assignee_change(self, client):
        t = client.post("/api/tickets", json={
            "title": "Activity multi event ticket",
            "description": "Checking multiple activity appends",
            "priority": "low",
            "category": "general",
            "requester_name": "Isaac",
            "requester_email": "isaac@example.com",
            "assignee": "Agent A",
        }).json()
        tid = t["id"]

        # Patch status and priority
        p_res = client.patch(f"/api/tickets/{tid}", json={
            "status": "in_progress",
            "priority": "urgent",
        })
        assert p_res.status_code == 200

        # Patch assignee
        a_res = client.patch(f"/api/tickets/{tid}", json={
            "assignee": "Agent B",
        })
        assert a_res.status_code == 200

        detail = client.get(f"/api/tickets/{tid}").json()
        acts = detail["activity"]
        types = [a["type"] for a in acts]
        assert "create" in types
        assert "status" in types
        assert "priority" in types
        assert "assignee" in types

        # Check status event
        status_act = next(a for a in acts if a["type"] == "status")
        assert status_act["from"] == "open"
        assert status_act["to"] == "in_progress"

        # Check priority event
        pri_act = next(a for a in acts if a["type"] == "priority")
        assert pri_act["from"] == "low"
        assert pri_act["to"] == "urgent"

        # Check assignee event
        ass_act = next(a for a in acts if a["type"] == "assignee")
        assert ass_act["from"] == "Agent A"
        assert ass_act["to"] == "Agent B"

    def test_activity_not_returned_in_list_view(self, client):
        client.post("/api/tickets", json={
            "title": "Lightweight list view test ticket",
            "description": "Checking list view projection excludes activity",
            "category": "general",
            "requester_name": "User",
            "requester_email": "user@example.com",
        })
        list_res = client.get("/api/tickets").json()
        for item in list_res["items"]:
            assert "activity" not in item
            assert "comments" not in item


class TestDueDateAndOverdue:
    """Tests for due_date, overdue=true filter, and stats overdue count."""

    def test_due_date_creation_and_retrieval(self, client):
        due = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        res = client.post("/api/tickets", json={
            "title": "Ticket with specified due date",
            "description": "Validating due_date field",
            "category": "general",
            "requester_name": "Due Tester",
            "requester_email": "due@example.com",
            "due_date": due,
        })
        assert res.status_code == 201
        data = res.json()
        assert data["due_date"] is not None

        get_res = client.get(f"/api/tickets/{data['id']}").json()
        assert get_res["due_date"] is not None

    def test_overdue_filter_and_stats_count(self, client, mock_db):
        now = datetime.now(timezone.utc)
        past_due = (now - timedelta(days=2)).isoformat()
        future_due = (now + timedelta(days=2)).isoformat()

        # 1. Overdue ticket: due_date in past, status=open
        t_overdue = client.post("/api/tickets", json={
            "title": "Overdue open ticket sample",
            "description": "Testing overdue filter",
            "category": "bug",
            "requester_name": "Overdue User",
            "requester_email": "od@example.com",
            "due_date": past_due,
        }).json()

        # 2. Future due ticket: due_date in future, status=open
        client.post("/api/tickets", json={
            "title": "Future ticket not overdue",
            "description": "Testing overdue filter",
            "category": "bug",
            "requester_name": "Future User",
            "requester_email": "fu@example.com",
            "due_date": future_due,
        })

        # 3. Resolved ticket with past due_date: should NOT be counted as overdue
        t_resolved = client.post("/api/tickets", json={
            "title": "Resolved ticket with past due",
            "description": "Testing overdue filter exclusion",
            "category": "bug",
            "requester_name": "Resolved User",
            "requester_email": "ru@example.com",
            "due_date": past_due,
        }).json()
        client.patch(f"/api/tickets/{t_resolved['id']}", json={"status": "resolved"})

        # Check list with overdue=true
        od_list = client.get("/api/tickets?overdue=true").json()
        od_ids = [item["id"] for item in od_list["items"]]
        assert t_overdue["id"] in od_ids
        assert t_resolved["id"] not in od_ids

        # Check /api/stats overdue count
        stats = client.get("/api/stats").json()
        assert "overdue" in stats
        assert stats["overdue"] >= 1


class TestSuggestEndpoint:
    """Tests for GET /api/tickets/suggest."""

    def test_suggest_with_query(self, client):
        client.post("/api/tickets", json={
            "title": "UniqueKeywordAlpha in ticket title",
            "description": "Body with some words",
            "category": "bug",
            "requester_name": "Suggester",
            "requester_email": "sug@example.com",
        })

        res = client.get("/api/tickets/suggest?q=UniqueKeywordAlpha")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        item = data[0]
        assert "id" in item
        assert "ticket_number" in item
        assert "title" in item
        # Fast projection only: description, comments, activity are NOT included
        assert "description" not in item
        assert "comments" not in item
        assert "activity" not in item

    def test_suggest_empty_query_returns_recent(self, client):
        res = client.get("/api/tickets/suggest")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) <= 5

    def test_suggest_regex_safe(self, client):
        # Queries containing regex metacharacters should not crash
        for meta in ["(", "[", "*", "+", ".*", "\\"]:
            res = client.get(f"/api/tickets/suggest?q={meta}")
            assert res.status_code == 200
            assert isinstance(res.json(), list)
