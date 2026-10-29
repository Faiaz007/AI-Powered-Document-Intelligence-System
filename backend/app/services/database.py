"""Database service layer using asyncpg with connection pooling."""

import os
import json
from typing import List, Optional, Dict, Any
from uuid import UUID
from decimal import Decimal

import asyncpg


# Module-level pool (initialized in main.py lifespan)
_pool: Optional[asyncpg.Pool] = None


from app.core.config import DATABASE_URL as _DATABASE_URL

async def init_pool() -> None:
    """Initialize the PostgreSQL connection pool."""
    global _pool
    database_url = os.getenv("DATABASE_URL", _DATABASE_URL)
    _pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)


async def get_pool() -> asyncpg.Pool:
    """Return the connection pool, initializing if needed."""
    global _pool
    if _pool is None:
        await init_pool()
    return _pool


async def close_pool() -> None:
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


# --- Document CRUD ---

async def create_document(filename: str, file_type: str) -> UUID:
    """Insert a new document record and return its UUID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO documents (filename, file_type, status)
            VALUES ($1, $2, 'uploaded')
            RETURNING id
            """,
            filename,
            file_type,
        )
        return row["id"]


async def update_document_status(document_id: UUID, status: str) -> None:
    """Update the processing status of a document."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE documents
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            """,
            status,
            document_id,
        )


async def get_document_status(document_id: UUID) -> Optional[dict]:
    """Fetch document metadata and current status."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, filename, file_type, status, page_count, created_at, updated_at
            FROM documents
            WHERE id = $1
            """,
            document_id,
        )
        return dict(row) if row else None


# --- Extracted text ---

async def save_extracted_text(
    document_id: UUID,
    page_number: int,
    text: str,
    ocr_confidence: Optional[float] = None,
) -> None:
    """Save OCR-extracted text for a document page."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO extracted_text (document_id, page_number, text, ocr_confidence)
            VALUES ($1, $2, $3, $4)
            """,
            document_id,
            page_number,
            text,
            ocr_confidence,
        )


async def get_extracted_text(document_id: UUID) -> List[dict]:
    """Fetch all extracted text pages for a document."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT page_number, text, ocr_confidence
            FROM extracted_text
            WHERE document_id = $1
            ORDER BY page_number
            """,
            document_id,
        )
        return [dict(r) for r in rows]


# --- Structured results ---

async def save_structured_results(document_id: UUID, data: dict) -> None:
    """Save LLM extraction results to the database."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO structured_results
            (document_id, invoice_number, invoice_date, supplier_name,
             customer_name, subtotal, tax, total, currency, line_items, confidence)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (document_id) DO UPDATE SET
                invoice_number = EXCLUDED.invoice_number,
                invoice_date = EXCLUDED.invoice_date,
                supplier_name = EXCLUDED.supplier_name,
                customer_name = EXCLUDED.customer_name,
                subtotal = EXCLUDED.subtotal,
                tax = EXCLUDED.tax,
                total = EXCLUDED.total,
                currency = EXCLUDED.currency,
                line_items = EXCLUDED.line_items,
                confidence = EXCLUDED.confidence
            """,
            document_id,
            data.get("invoice_number"),
            data.get("invoice_date"),
            data.get("supplier_name"),
            data.get("customer_name"),
            data.get("subtotal"),
            data.get("tax"),
            data.get("total"),
            data.get("currency", "USD"),
            json.dumps(data.get("line_items", [])),
            data.get("confidence", 0.0),
        )


async def get_structured_results(document_id: UUID) -> Optional[dict]:
    """Fetch structured extraction results for a document."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT *
            FROM structured_results
            WHERE document_id = $1
            """,
            document_id,
        )
        if not row:
            return None
        result = dict(row)
        if isinstance(result.get("line_items"), str):
            try:
                result["line_items"] = json.loads(result["line_items"])
            except (json.JSONDecodeError, TypeError):
                result["line_items"] = []
        return result


# --- Validation errors ---

async def save_validation_errors(document_id: UUID, errors: List[dict]) -> None:
    """Save validation errors for a document."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        for error in errors:
            await conn.execute(
                """
                INSERT INTO validation_errors
                (document_id, field_name, error_type, severity, description)
                VALUES ($1, $2, $3, $4, $5)
                """,
                document_id,
                error.get("field_name", error.get("field", "")),
                error.get("error_type", ""),
                error.get("severity", ""),
                error.get("description", ""),
            )


async def get_validation_errors(document_id: UUID) -> List[dict]:
    """Fetch all validation errors for a document."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT field_name, error_type, severity, description, resolved
            FROM validation_errors
            WHERE document_id = $1
            """,
            document_id,
        )
        return [dict(r) for r in rows]


async def mark_validation_resolved(document_id: UUID, field_name: str) -> None:
    """Mark a validation error as resolved after manual correction."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE validation_errors
            SET resolved = TRUE
            WHERE document_id = $1 AND field_name = $2
            """,
            document_id,
            field_name,
        )


# --- Processing history ---

async def save_processing_history(
    document_id: UUID,
    step: str,
    status: str,
    started_at: Optional[str] = None,
    completed_at: Optional[str] = None,
    error_details: Optional[dict] = None,
) -> None:
    """Record a processing step in history."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO processing_history
            (document_id, step, status, started_at, completed_at, error_details)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            document_id,
            step,
            status,
            started_at,
            completed_at,
            error_details,
        )


# --- Embeddings ---

async def save_embedding(document_id: UUID, embedding: List[float]) -> None:
    """Save vector embedding for semantic search."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO document_embeddings (id, embedding)
            VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding
            """,
            document_id,
            embedding,
        )


# --- Search ---

async def search_documents(
    query: str,
    limit: int = 10,
) -> List[dict]:
    """Keyword + semantic search over documents."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Keyword search on filename and extracted text
        keyword_rows = await conn.fetch(
            """
            SELECT DISTINCT d.id, d.filename, d.file_type, d.status,
                   ts_rank_cd(to_tsvector('english', d.filename || ' ' || COALESCE(et.text, '')), plainto_tsquery('english', $1)) AS rank
            FROM documents d
            LEFT JOIN extracted_text et ON et.document_id = d.id
            WHERE plainto_tsquery('english', $1) @@ to_tsvector('english', d.filename || ' ' || COALESCE(et.text, ''))
            ORDER BY rank DESC
            LIMIT $2
            """,
            query,
            limit,
        )

        results = []
        for row in keyword_rows:
            results.append({
                "document_id": row["id"],
                "filename": row["filename"],
                "file_type": row["file_type"],
                "score": float(row["rank"]) if row["rank"] else 0.0,
                "matched_fields": ["filename", "text"],
            })

        return results[:limit]


async def search_similar(embedding: List[float], limit: int = 10) -> List[dict]:
    """Semantic search over document embeddings using cosine distance."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT d.id, d.filename, d.file_type,
                   1 - (de.embedding <=> $1::vector) AS score
            FROM document_embeddings de
            JOIN documents d ON d.id = de.id
            ORDER BY de.embedding <=> $1::vector
            LIMIT $2
            """,
            embedding,
            limit,
        )
        return [
            {
                "document_id": r["id"],
                "filename": r["filename"],
                "file_type": r["file_type"],
                "score": float(r["score"]) if r["score"] is not None else 0.0,
                "matched_fields": ["semantic"],
            }
            for r in rows
        ]

async def get_document_full_results(document_id: UUID) -> Optional[dict]:
    """Fetch complete document data: metadata, text, structured results, errors."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT * FROM documents WHERE id = $1", document_id
        )
        if not doc:
            return None

        structured = await get_structured_results(document_id)
        errors = await get_validation_errors(document_id)

        return {
            "document_id": doc["id"],
            "filename": doc["filename"],
            "file_type": doc["file_type"],
            "status": doc["status"],
            "structured": structured,
            "validation_errors": errors,
            "created_at": str(doc["created_at"]) if doc["created_at"] else None,
            "updated_at": str(doc["updated_at"]) if doc["updated_at"] else None,
        }