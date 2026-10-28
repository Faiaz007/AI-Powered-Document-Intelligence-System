"""Tests for API endpoints."""

import os
import sys
import uuid
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

client = TestClient(app)


import pytest as _pytest


def _db_available() -> bool:
    """Check if PostgreSQL is available for DB-dependent tests."""
    try:
        response = client.get("/api/search?q=test")
        return response.status_code != 500
    except Exception:
        return False


class TestAPIEndpoints:
    """Test REST API endpoints."""

    def test_health_check(self):
        """GET /api/health should return healthy status."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    def test_upload_unsupported_file_type(self):
        """POST /upload with unsupported type should return 400."""
        response = client.post(
            "/api/upload",
            files={"files": ("test.exe", b"dummy content", "application/octet-stream")},
        )
        assert response.status_code == 400

    def test_search_empty_query(self):
        """GET /search with empty query should return empty list."""
        response = client.get("/api/search?q=")
        assert response.status_code == 200
        assert response.json() == []

    def test_search_with_query(self):
        """GET /search with query - skips if DB unavailable."""
        if not _db_available():
            _pytest.skip("PostgreSQL not available")
        response = client.get("/api/search?q=invoice")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_upload_valid_pdf(self):
        """POST /upload with valid PDF - skips if DB unavailable."""
        if not _db_available():
            _pytest.skip("PostgreSQL not available")
        import io
        pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n"
        response = client.post(
            "/api/upload",
            files={"files": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")},
        )
        assert response.status_code == 200

    def test_get_nonexistent_document_when_db_available(self):
        """GET /process/nonexistent should return 404 when DB is available."""
        if not _db_available():
            _pytest.skip("PostgreSQL not available")
        fake_id = uuid.uuid4()
        response = client.get(f"/api/process/{fake_id}")
        assert response.status_code == 404

    def test_get_nonexistent_results_when_db_available(self):
        """GET /results/nonexistent should return 404 when DB is available."""
        if not _db_available():
            _pytest.skip("PostgreSQL not available")
        fake_id = uuid.uuid4()
        response = client.get(f"/api/results/{fake_id}")
        assert response.status_code == 404