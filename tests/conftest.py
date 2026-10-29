"""
Test configuration and fixtures.

Uses mongomock to simulate MongoDB for testing without a real database.
"""

import os
import pytest
import mongomock
from fastapi.testclient import TestClient

# Ensure MONGODB_URI is set for settings initialization
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

from app.db.connection import set_db


@pytest.fixture(scope="session")
def mock_mongo_client():
    """Create a mongomock client for the entire test session."""
    client = mongomock.MongoClient()
    return client


@pytest.fixture()
def mock_db(mock_mongo_client):
    """Get a clean test database for each test."""
    db = mock_mongo_client["test_support_desk"]
    # Clean all collections before each test
    for collection_name in db.list_collection_names():
        db[collection_name].delete_many({})
    # Initialize the counter for ticket numbers
    db.counters.update_one(
        {"_id": "ticket_number"},
        {"$set": {"seq": 0}},
        upsert=True,
    )
    return db


@pytest.fixture()
def client(mock_db):
    """
    Create a FastAPI TestClient with the DB set to mongomock.
    """
    set_db(mock_db)
    from app.main import app
    with TestClient(app) as tc:
        yield tc
    set_db(None)


@pytest.fixture()
def sample_ticket_data():
    """Return valid ticket creation data."""
    return {
        "title": "Test ticket title here",
        "description": "This is a detailed description of the test ticket for validation purposes.",
        "priority": "high",
        "category": "bug",
        "requester_name": "Jane Doe",
        "requester_email": "jane@example.com",
        "assignee": "John Support",
    }


@pytest.fixture()
def created_ticket(client, sample_ticket_data):
    """Create and return a ticket via the API."""
    response = client.post("/api/tickets", json=sample_ticket_data)
    assert response.status_code == 201
    return response.json()
