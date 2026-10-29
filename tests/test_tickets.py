"""
Tests for the Support Desk ticket API.

Covers: create, validation, filters, search, pagination, invalid ID,
status transitions, comments, and stats.
"""

import pytest


class TestCreateTicket:
    """Tests for POST /api/tickets."""

    def test_create_ticket_success(self, client, sample_ticket_data):
        """Test successful ticket creation with all required fields."""
        response = client.post("/api/tickets", json=sample_ticket_data)
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == sample_ticket_data["title"]
        assert data["status"] == "open"
        assert data["priority"] == "high"
        assert data["ticket_number"].startswith("TKT-")
        assert data["id"] is not None
        assert data["created_at"] is not None
        assert data["comments"] == []

    def test_create_ticket_defaults(self, client):
        """Test that default values are applied (status=open, priority=medium)."""
        minimal_data = {
            "title": "Minimal ticket title",
            "description": "A description that is long enough.",
            "category": "general",
            "requester_name": "Bob",
            "requester_email": "bob@example.com",
        }
        response = client.post("/api/tickets", json=minimal_data)
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "open"
        assert data["priority"] == "medium"
        assert data["assignee"] is None

    def test_ticket_number_stays_unique_under_concurrent_creates(self, client):
        """Atomic counter must guarantee 20 distinct ticket numbers under parallel creation."""
        from concurrent.futures import ThreadPoolExecutor

        def create_one(idx):
            return client.post("/api/tickets", json={
                "title": f"Concurrent ticket {idx:02d}",
                "description": f"Testing atomic counter sequence under concurrency for request {idx}.",
                "category": "bug",
                "requester_name": f"Tester {idx}",
                "requester_email": f"tester{idx}@example.com",
            })

        with ThreadPoolExecutor(max_workers=10) as executor:
            responses = list(executor.map(create_one, range(20)))

        ticket_numbers = []
        for r in responses:
            assert r.status_code == 201
            ticket_numbers.append(r.json()["ticket_number"])

        assert len(ticket_numbers) == 20
        assert len(set(ticket_numbers)) == 20, f"Duplicate ticket numbers generated: {ticket_numbers}"


class TestValidation:
    """Tests for input validation."""

    def test_title_too_short(self, client):
        """Title must be at least 5 characters."""
        data = {
            "title": "Hi",
            "description": "Valid description here.",
            "category": "bug",
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
        }
        response = client.post("/api/tickets", json=data)
        assert response.status_code == 422

    def test_title_too_long(self, client):
        """Title must not exceed 120 characters."""
        data = {
            "title": "A" * 121,
            "description": "Valid description here.",
            "category": "bug",
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
        }
        response = client.post("/api/tickets", json=data)
        assert response.status_code == 422

    def test_invalid_email(self, client):
        """Email must be a valid format."""
        data = {
            "title": "Valid title here",
            "description": "Valid description here.",
            "category": "bug",
            "requester_name": "Jane",
            "requester_email": "not-an-email",
        }
        response = client.post("/api/tickets", json=data)
        assert response.status_code == 422

    def test_invalid_priority(self, client):
        """Priority must be one of the allowed values."""
        data = {
            "title": "Valid title here",
            "description": "Valid description here.",
            "category": "bug",
            "priority": "critical",  # Not a valid value
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
        }
        response = client.post("/api/tickets", json=data)
        assert response.status_code == 422

    def test_unknown_fields_rejected(self, client):
        """Extra/unknown fields should be rejected."""
        data = {
            "title": "Valid title here",
            "description": "Valid description here.",
            "category": "bug",
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
            "unknown_field": "should fail",
        }
        response = client.post("/api/tickets", json=data)
        assert response.status_code == 422
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_empty_or_whitespace_title(self, client):
        """Whitespace-only title must be rejected with 422."""
        data = {
            "title": "     ",
            "description": "Valid description here.",
            "category": "bug",
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
        }
        response = client.post("/api/tickets", json=data)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_invalid_category_enum(self, client):
        """Invalid category enum value must be rejected with 422."""
        data = {
            "title": "Valid title here",
            "description": "Valid description here.",
            "category": "not_a_category",
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
        }
        response = client.post("/api/tickets", json=data)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_invalid_status_enum_patch(self, client, created_ticket):
        """Invalid status enum value in PATCH must be rejected with 422."""
        ticket_id = created_ticket["id"]
        response = client.patch(f"/api/tickets/{ticket_id}", json={"status": "invalid_status"})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_invalid_status_query_param(self, client):
        """Invalid status enum value in query parameter must return 422."""
        response = client.get("/api/tickets?status=invalid_status")
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_ENUM"

    def test_invalid_priority_query_param(self, client):
        """Invalid priority enum value in query parameter must return 422."""
        response = client.get("/api/tickets?priority=super_urgent")
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_ENUM"

    def test_invalid_category_query_param(self, client):
        """Invalid category enum value in query parameter must return 422."""
        response = client.get("/api/tickets?category=billing_issue")
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_ENUM"


class TestGetTicket:
    """Tests for GET /api/tickets/{id}."""

    def test_get_ticket_success(self, client, created_ticket):
        """Test fetching an existing ticket by ID."""
        ticket_id = created_ticket["id"]
        response = client.get(f"/api/tickets/{ticket_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == ticket_id
        assert data["title"] == created_ticket["title"]

    def test_get_ticket_invalid_id(self, client):
        """Test 422 for malformed ObjectId."""
        response = client.get("/api/tickets/not-a-valid-id")
        assert response.status_code == 422

    def test_get_ticket_not_found(self, client):
        """Test 404 for non-existent but valid ObjectId."""
        response = client.get("/api/tickets/507f1f77bcf86cd799439011")
        assert response.status_code == 404


class TestListTickets:
    """Tests for GET /api/tickets (list, filter, search, pagination)."""

    def _create_tickets(self, client, count=5):
        """Helper to create multiple tickets."""
        tickets = []
        categories = ["bug", "billing", "feature_request", "general"]
        priorities = ["low", "medium", "high", "urgent"]
        for i in range(count):
            data = {
                "title": f"Test ticket number {i + 1}",
                "description": f"Description for test ticket {i + 1} with details.",
                "category": categories[i % len(categories)],
                "priority": priorities[i % len(priorities)],
                "requester_name": f"User {i + 1}",
                "requester_email": f"user{i + 1}@example.com",
            }
            resp = client.post("/api/tickets", json=data)
            assert resp.status_code == 201
            tickets.append(resp.json())
        return tickets

    def test_list_tickets_pagination(self, client):
        """Test paginated listing of tickets."""
        self._create_tickets(client, count=5)
        response = client.get("/api/tickets?page=1&page_size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total_pages"] == 3

    def test_pagination_page_zero_rejected(self, client):
        """page=0 must return 422."""
        response = client.get("/api/tickets?page=0")
        assert response.status_code == 422

    def test_pagination_page_size_exceeds_max_rejected(self, client):
        """page_size > 50 must return 422."""
        response = client.get("/api/tickets?page_size=51")
        assert response.status_code == 422

    def test_pagination_page_beyond_total(self, client):
        """page beyond total should return empty items with accurate total."""
        self._create_tickets(client, count=3)
        response = client.get("/api/tickets?page=99&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 3
        assert data["page"] == 99

    def test_date_range_inverted_error(self, client):
        """created_from > created_to must return 400 Bad Request."""
        response = client.get("/api/tickets?created_from=2026-10-31T00:00:00Z&created_to=2026-10-01T00:00:00Z")
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "INVALID_DATE_RANGE"

    def test_combined_filters_search_sort_pagination(self, client):
        """Combined filters, search, sort, and pagination return correct total and light projection."""
        # Create 4 specific tickets
        client.post("/api/tickets", json={
            "title": "Alpha network latency issue",
            "description": "High latency observed on Alpha server.",
            "category": "bug",
            "priority": "high",
            "requester_name": "User A",
            "requester_email": "a@example.com",
        })
        client.post("/api/tickets", json={
            "title": "Alpha database disk full",
            "description": "Alpha disk capacity reached 98%.",
            "category": "bug",
            "priority": "high",
            "requester_name": "User B",
            "requester_email": "b@example.com",
        })
        client.post("/api/tickets", json={
            "title": "Alpha billing discrepancy",
            "description": "Wrong amount on invoice for Alpha plan.",
            "category": "billing",
            "priority": "high",
            "requester_name": "User C",
            "requester_email": "c@example.com",
        })
        client.post("/api/tickets", json={
            "title": "Beta general inquiry",
            "description": "General question.",
            "category": "general",
            "priority": "low",
            "requester_name": "User D",
            "requester_email": "d@example.com",
        })

        # Query: search 'Alpha', category 'bug', priority 'high', sort 'created_at desc', page 1, page_size 1
        resp = client.get("/api/tickets?q=Alpha&category=bug&priority=high&sort_by=created_at&order=desc&page=1&page_size=1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 1
        assert "Alpha" in data["items"][0]["title"]
        assert data["items"][0]["category"] == "bug"
        assert "comments" not in data["items"][0]

    def test_list_tickets_filter_by_priority(self, client):
        """Test filtering tickets by priority."""
        self._create_tickets(client, count=8)
        response = client.get("/api/tickets?priority=high")
        assert response.status_code == 200
        data = response.json()
        # All returned tickets should have priority=high
        for item in data["items"]:
            assert item["priority"] == "high"

    def test_list_tickets_filter_by_category(self, client):
        """Test filtering tickets by category."""
        self._create_tickets(client, count=8)
        response = client.get("/api/tickets?category=bug")
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["category"] == "bug"

    def test_list_tickets_no_comments_in_list(self, client, created_ticket):
        """List view should not include comments (projection)."""
        response = client.get("/api/tickets")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) > 0
        # Comments should be excluded from list items
        for item in data["items"]:
            assert "comments" not in item

    def test_search_tickets(self, client):
        """Test searching tickets by keyword."""
        client.post("/api/tickets", json={
            "title": "Database connection pool timeout",
            "description": "The pool runs out of connections under load.",
            "category": "bug",
            "requester_name": "Dev",
            "requester_email": "dev@example.com",
        })
        client.post("/api/tickets", json={
            "title": "Need invoice for March",
            "description": "Billing inquiry about past subscription.",
            "category": "billing",
            "requester_name": "User",
            "requester_email": "user@example.com",
        })

        # Search for database
        resp = client.get("/api/tickets?q=database")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert "Database" in items[0]["title"]

    def test_search_regex_sanitization(self, client):
        """Search query with regex special characters should not crash or inject regex."""
        client.post("/api/tickets", json={
            "title": "Fix [CRITICAL] issue in auth",
            "description": "Some description with special regex characters +*?()",
            "category": "bug",
            "requester_name": "Dev",
            "requester_email": "dev@example.com",
        })

        # Search with regex metacharacters that would be invalid or broad regex
        resp = client.get("/api/tickets?q=[CRITICAL]")
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

        # Search with unclosed parenthesis — must not crash with 500
        resp_unclosed = client.get("/api/tickets?q=auth(")
        assert resp_unclosed.status_code == 200

    def test_multi_value_filter(self, client):
        """Test filtering by multiple comma-separated statuses."""
        self._create_tickets(client, count=6)
        resp = client.get("/api/tickets?status=open,in_progress")
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            assert item["status"] in ("open", "in_progress")

    def test_sort_tickets(self, client):
        """Test sorting tickets by created_at ascending."""
        self._create_tickets(client, count=4)
        resp = client.get("/api/tickets?sort_by=created_at&order=asc")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 4
        # Verify timestamps are ascending
        assert items[0]["created_at"] <= items[-1]["created_at"]

    def test_sort_by_priority(self, client):
        """Test sorting tickets by priority."""
        self._create_tickets(client, count=4)
        resp = client.get("/api/tickets?sort_by=priority&order=asc")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 4

    def test_date_range_filter(self, client, created_ticket):
        """Test filtering tickets by created_from / created_to."""
        resp = client.get("/api/tickets?created_from=2020-01-01T00:00:00Z&created_to=2030-12-31T23:59:59Z")
        assert resp.status_code == 200
        assert len(resp.json()["items"]) >= 1


class TestUpdateTicket:
    """Tests for PUT /api/tickets/{id} and PATCH /api/tickets/{id}."""

    def test_put_full_update(self, client, created_ticket):
        """Test full replacement of ticket fields via PUT."""
        ticket_id = created_ticket["id"]
        update_data = {
            "title": "Completely updated title",
            "description": "Completely updated description for this ticket.",
            "priority": "urgent",
            "category": "billing",
            "requester_name": "Jane Updated",
            "requester_email": "jane.new@example.com",
            "assignee": "Sarah Engineer",
        }
        resp = client.put(f"/api/tickets/{ticket_id}", json=update_data)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Completely updated title"
        assert data["priority"] == "urgent"
        assert data["category"] == "billing"
        assert data["assignee"] == "Sarah Engineer"

    def test_put_with_status_transition(self, client, created_ticket):
        """Test full update via PUT with valid status transition."""
        ticket_id = created_ticket["id"]
        update_data = {
            "title": "Updated with status change",
            "description": "Description text.",
            "priority": "low",
            "category": "general",
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
            "status": "in_progress",
        }
        resp = client.put(f"/api/tickets/{ticket_id}", json=update_data)
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    def test_put_invalid_status_transition(self, client, created_ticket):
        """Test full update via PUT rejecting invalid status transition."""
        ticket_id = created_ticket["id"]
        # Close ticket first
        client.patch(f"/api/tickets/{ticket_id}", json={"status": "closed"})
        # Attempt to reopen via PUT -> 409
        update_data = {
            "title": "Try to reopen closed ticket",
            "description": "Description text.",
            "priority": "low",
            "category": "general",
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
            "status": "open",
        }
        resp = client.put(f"/api/tickets/{ticket_id}", json=update_data)
        assert resp.status_code == 409

    def test_patch_partial_fields(self, client, created_ticket):
        """Test partial update of fields without changing status."""
        ticket_id = created_ticket["id"]
        patch_data = {
            "title": "Patched ticket title only",
            "priority": "urgent",
        }
        resp = client.patch(f"/api/tickets/{ticket_id}", json=patch_data)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Patched ticket title only"
        assert data["priority"] == "urgent"
        # Untouched fields remain unchanged
        assert data["category"] == created_ticket["category"]

    def test_patch_empty_payload_rejected(self, client, created_ticket):
        """Patch with no fields set should be rejected."""
        ticket_id = created_ticket["id"]
        resp = client.patch(f"/api/tickets/{ticket_id}", json={})
        assert resp.status_code == 422

    def test_updated_at_changes_created_at_never_does(self, client, created_ticket):
        """updated_at must change on PUT, PATCH, and comment; created_at must never change."""
        import time

        ticket_id = created_ticket["id"]
        original_created_at = created_ticket["created_at"]
        original_updated_at = created_ticket["updated_at"]

        # 1. Test PUT
        time.sleep(0.01)
        put_resp = client.put(f"/api/tickets/{ticket_id}", json={
            "title": "Title after PUT operation",
            "description": "Description after PUT operation.",
            "priority": "urgent",
            "category": "billing",
            "requester_name": "Jane",
            "requester_email": "jane@example.com",
        })
        assert put_resp.status_code == 200
        put_data = put_resp.json()
        assert put_data["created_at"] == original_created_at
        assert put_data["updated_at"] >= original_updated_at

        # 2. Test PATCH
        time.sleep(0.01)
        patch_resp = client.patch(f"/api/tickets/{ticket_id}", json={"priority": "high"})
        assert patch_resp.status_code == 200
        patch_data = patch_resp.json()
        assert patch_data["created_at"] == original_created_at
        assert patch_data["updated_at"] >= put_data["updated_at"]

        # 3. Test Comment
        time.sleep(0.01)
        comment_resp = client.post(f"/api/tickets/{ticket_id}/comments", json={
            "author": "Auditor",
            "message": "Testing comment timestamp update.",
        })
        assert comment_resp.status_code == 201
        comment_data = comment_resp.json()
        assert comment_data["created_at"] == original_created_at
        assert comment_data["updated_at"] >= patch_data["updated_at"]


class TestStatusTransitions:
    """Tests for PATCH /api/tickets/{id} status transitions."""

    def test_valid_transition_open_to_in_progress(self, client, created_ticket):
        """Test valid status transition: open -> in_progress."""
        ticket_id = created_ticket["id"]
        response = client.patch(
            f"/api/tickets/{ticket_id}",
            json={"status": "in_progress"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "in_progress"

    def test_invalid_transition_closed_to_open(self, client, created_ticket):
        """Test that closed tickets cannot be reopened."""
        ticket_id = created_ticket["id"]
        # First, close the ticket
        client.patch(f"/api/tickets/{ticket_id}", json={"status": "closed"})
        # Try to reopen — should fail with 409
        response = client.patch(
            f"/api/tickets/{ticket_id}",
            json={"status": "open"},
        )
        assert response.status_code == 409


class TestComments:
    """Tests for POST /api/tickets/{id}/comments."""

    def test_add_comment(self, client, created_ticket):
        """Test adding a comment to a ticket."""
        ticket_id = created_ticket["id"]
        comment_data = {
            "author": "Support Agent",
            "message": "Looking into this issue now.",
        }
        response = client.post(
            f"/api/tickets/{ticket_id}/comments",
            json=comment_data,
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data["comments"]) == 1
        assert data["comments"][0]["author"] == "Support Agent"
        assert data["comments"][0]["message"] == "Looking into this issue now."

    def test_add_comment_not_found(self, client):
        """Test adding comment to non-existent ticket."""
        response = client.post(
            "/api/tickets/507f1f77bcf86cd799439011/comments",
            json={"author": "Test", "message": "Hello there."},
        )
        assert response.status_code == 404

    def test_add_comment_invalid_id(self, client):
        """Test adding comment with invalid ObjectId returns 422."""
        response = client.post(
            "/api/tickets/invalid-id/comments",
            json={"author": "Test", "message": "Hello there."},
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_ID"


class TestDeleteTicket:
    """Tests for DELETE /api/tickets/{id}."""

    def test_delete_ticket(self, client, created_ticket):
        """Test successful deletion of a ticket."""
        ticket_id = created_ticket["id"]
        response = client.delete(f"/api/tickets/{ticket_id}")
        assert response.status_code == 204
        # Verify it's gone
        response = client.get(f"/api/tickets/{ticket_id}")
        assert response.status_code == 404


class TestStats:
    """Tests for GET /api/stats."""

    def test_stats_endpoint(self, client, created_ticket):
        """Test that stats endpoint returns correct structure."""
        response = client.get("/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "by_status" in data
        assert "by_priority" in data
        assert data["total"] >= 1


class TestHealth:
    """Tests for GET /api/health."""

    def test_health_check(self, client):
        """Test health endpoint returns ok."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
