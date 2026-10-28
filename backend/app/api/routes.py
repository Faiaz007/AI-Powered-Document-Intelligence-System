"""REST API routes for document upload, processing, results, search, corrections."""

import os
import shutil
from typing import List, Optional
from uuid import UUID
from pathlib import Path
from decimal import Decimal

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from app.models.schemas import (
    DocumentUploadResponse,
    ProcessStatusResponse,
    ExtractionResult,
    ValidationErrorItem,
    DocumentResult,
    SearchResult,
    CorrectionRequest,
    HealthResponse,
)
from app.services import database as db
from app.services import ocr as ocr_service
from app.services import spreadsheet as spreadsheet_service
from app.services import extraction as extraction_service
from app.services import validation as validation_service
from app.workers.celery_app import celery_app

router = APIRouter()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "data/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".xlsx", ".xls", ".csv"}


def _get_file_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def _get_file_type(extension: str) -> str:
    ext = extension.lower()
    if ext == ".pdf":
        return "pdf"
    if ext in (".jpg", ".jpeg"):
        return "jpg"
    if ext == ".png":
        return "png"
    if ext in (".tiff", ".tif"):
        return "tiff"
    if ext == ".xlsx":
        return "xlsx"
    if ext == ".xls":
        return "xls"
    if ext == ".csv":
        return "csv"
    return "unknown"


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """System health check."""
    return HealthResponse(status="healthy", version="1.0.0")


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
):
    """Upload multiple documents and start processing jobs.

    Each file is saved to data/uploads/, a database record is created,
    and a Celery task is enqueued for background processing.
    """
    job_ids = []
    filenames = []

    for upload_file in files:
        ext = _get_file_extension(upload_file.filename)
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        file_type = _get_file_type(ext)
        if file_type == "unknown":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot determine file type for: {upload_file.filename}",
            )

        # Save file to disk
        file_path = UPLOAD_DIR / upload_file.filename
        # Avoid overwriting: add suffix if exists
        if file_path.exists():
            stem = Path(upload_file.filename).stem
            file_path = UPLOAD_DIR / f"{stem}_{UUID(int=0).hex[:8]}{ext}"

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)

        # Create document record
        document_id = await db.create_document(upload_file.filename, file_type)

        # Enqueue Celery task
        celery_app.send_task(
            "app.workers.tasks.process_document_task",
            args=[str(document_id), str(file_path), file_type],
        )

        job_ids.append(document_id)
        filenames.append(upload_file.filename)

    return DocumentUploadResponse(
        job_ids=job_ids,
        status="uploaded",
        filenames=filenames,
    )


@router.get("/process/{job_id}", response_model=ProcessStatusResponse)
async def get_process_status(job_id: UUID):
    """Check the processing status of a document job."""
    doc = await db.get_document_status(job_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Determine progress based on status
    status = doc["status"]
    progress_map = {
        "uploaded": 10,
        "processing": 50,
        "completed": 100,
        "failed": 0,
    }
    progress = progress_map.get(status, 0)

    return ProcessStatusResponse(
        job_id=job_id,
        status=status,
        progress=progress,
    )


@router.get("/results/{job_id}", response_model=DocumentResult)
async def get_results(job_id: UUID):
    """Get full extraction results and validation errors for a document."""
    result = await db.get_document_full_results(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")

    structured = None
    if result.get("structured"):
        s = result["structured"]
        # Convert Decimal values to float for JSON serialization
        structured = ExtractionResult(
            invoice_number=s.get("invoice_number"),
            invoice_date=str(s.get("invoice_date")) if s.get("invoice_date") else None,
            supplier_name=s.get("supplier_name"),
            customer_name=s.get("customer_name"),
            subtotal=float(s["subtotal"]) if s.get("subtotal") is not None else None,
            tax=float(s["tax"]) if s.get("tax") is not None else None,
            total=float(s["total"]) if s.get("total") is not None else None,
            currency=s.get("currency", "USD"),
            line_items=s.get("line_items", []),
            confidence=s.get("confidence", 0.0),
        )

    errors = [
        ValidationErrorItem(
            field_name=e.get("field_name", ""),
            error_type=e.get("error_type", ""),
            severity=e.get("severity", ""),
            description=e.get("description", ""),
        )
        for e in result.get("validation_errors", [])
    ]

    return DocumentResult(
        document_id=job_id,
        filename=result["filename"],
        file_type=result["file_type"],
        status=result["status"],
        extracted_text=None,  # Not included in results by default
        structured=structured,
        validation_errors=errors,
        created_at=result.get("created_at"),
    )


@router.get("/search", response_model=List[SearchResult])
async def search_documents(q: str, limit: int = 10):
    """Search documents by keyword (filename + extracted text)."""
    if not q or not q.strip():
        return []

    results = await db.search_documents(q.strip(), limit=limit)
    return [
        SearchResult(
            document_id=r["document_id"],
            filename=r["filename"],
            file_type=r.get("file_type", ""),
            score=r.get("score", 0.0),
            matched_fields=r.get("matched_fields", []),
        )
        for r in results
    ]


@router.post("/corrections")
async def submit_correction(correction: CorrectionRequest):
    """Submit a manual correction for a validated field.

    Updates the structured results and marks the validation error as resolved.
    """
    # Verify document exists
    doc = await db.get_document_status(correction.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Update the structured result field
    # Fetch current structured results
    current = await db.get_structured_results(correction.document_id)
    if not current:
        raise HTTPException(status_code=404, detail="No structured results found")

    # Update the specific field
    field = correction.field_name
    value = correction.corrected_value

    # Handle Decimal fields
    if field in ("subtotal", "tax", "total"):
        try:
            current[field] = Decimal(value.replace(",", "").replace("$", "").strip())
        except Exception:
            current[field] = None
    elif field == "invoice_date":
        current[field] = value
    else:
        current[field] = value

    await db.save_structured_results(correction.document_id, current)

    # Mark validation error as resolved
    await db.mark_validation_resolved(correction.document_id, field)

    return {"status": "success", "message": f"Corrected {field} to {value}"}


@router.post("/reprocess/{job_id}")
async def reprocess_job(job_id: UUID, background_tasks: BackgroundTasks):
    """Reprocess a failed document job."""
    doc = await db.get_document_status(job_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Find the file path (search uploads dir)
    file_path = None
    for f in UPLOAD_DIR.iterdir():
        if f.stem == doc["filename"].rsplit(".", 1)[0]:
            file_path = str(f)
            break

    if not file_path:
        raise HTTPException(status_code=404, detail="Original file not found")

    # Reset status
    await db.update_document_status(job_id, "uploaded")

    # Re-enqueue task
    celery_app.send_task(
        "app.workers.tasks.process_document_task",
        args=[str(job_id), file_path, doc["file_type"]],
    )

    return {"status": "reprocessing", "job_id": job_id}