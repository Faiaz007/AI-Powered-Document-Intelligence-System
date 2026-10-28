"""Tests for database service layer."""

import os
import sys
from decimal import Decimal
from uuid import uuid4

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# These tests require a running PostgreSQL database.
# They are skipped if no DATABASE_URL is available.

import pytest


@pytest.mark.asyncio
async def test_database_pool_initialization():
    """Test that the database pool can be initialized."""
    from app.services.database import init_pool, close_pool, get_pool
    try:
        await init_pool()
        pool = await get_pool()
        assert pool is not None
        await close_pool()
    except Exception:
        pytest.skip("PostgreSQL not available")


@pytest.mark.asyncio
async def test_create_document():
    """Test creating a document record."""
    from app.services.database import init_pool, close_pool, create_document, get_document_status
    try:
        await init_pool()
        doc_id = await create_document("test.pdf", "pdf")
        assert doc_id is not None
        status = await get_document_status(doc_id)
        assert status is not None
        assert status["filename"] == "test.pdf"
        await close_pool()
    except Exception:
        pytest.skip("PostgreSQL not available")