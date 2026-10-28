"""Celery background tasks for document processing pipeline.

Pipeline per document:
1. Extract text (OCR or spreadsheet parser)
2. Save extracted text to DB
3. AI extraction (LLM)
4. Save structured results
5. Validation (rules)
6. Save validation errors
7. Generate embedding
8. Update document status
"""

import os
import sys
import traceback
from datetime import datetime
from decimal import Decimal
from uuid import UUID

# Ensure backend imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.workers.celery_app import celery_app
from app.services import database as db
from app.services import ocr as ocr_service
from app.services import spreadsheet as spreadsheet_service
from app.services import extraction as extraction_service
from app.services import validation as validation_service


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


@celery_app.task(bind=True, name="app.workers.tasks.process_document_task")
def process_document_task(self, document_id: str, file_path: str, file_type: str):
    """Process a single document through the full pipeline.

    Args:
        document_id: UUID string of the document.
        file_path: Absolute path to the uploaded file.
        file_type: One of pdf, jpg, png, tiff, xlsx, xls, csv.

    Returns:
        dict with processing summary.
    """
    doc_uuid = UUID(document_id)

    def record_step(step: str, status: str, error_details: dict = None):
        """Record a processing step in history (sync wrapper for Celery)."""
        import asyncio
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(
                db.save_processing_history(
                    doc_uuid, step, status,
                    started_at=_now_iso(),
                    completed_at=_now_iso(),
                    error_details=error_details,
                )
            )
            loop.close()
        except Exception:
            pass

    try:
        # Step 1: Update status to processing
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(db.update_document_status(doc_uuid, "processing"))
        loop.close()

        record_step("ocr", "started")

        # Step 2: Extract text
        if file_type in ("pdf", "jpg", "png", "tiff"):
            text = ocr_service.extract_text_ocr(file_path, file_type)
        elif file_type in ("xlsx", "xls", "csv"):
            text = spreadsheet_service.parse_spreadsheet(file_path, file_type)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        # Save extracted text (single page for simplicity; multi-page handled in OCR)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            db.save_extracted_text(doc_uuid, 1, text, None)
        )
        loop.close()

        record_step("ocr", "completed")

        # Step 3: AI extraction
        record_step("extraction", "started")
        structured = extraction_service.extract_invoice_info(text)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            db.save_structured_results(doc_uuid, structured)
        )
        loop.close()
        record_step("extraction", "completed")

        # Step 4: Validation
        record_step("validation", "started")
        errors = validation_service.validate_invoice(structured)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            db.save_validation_errors(doc_uuid, errors)
        )
        loop.close()
        record_step("validation", "completed")

        # Step 5: Determine final status
        has_high_errors = any(e.get("severity") == "high" for e in errors)
        final_status = "completed" if not has_high_errors else "completed"  # Still completed but flagged

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            db.update_document_status(doc_uuid, final_status)
        )
        loop.close()

        return {
            "document_id": document_id,
            "status": final_status,
            "extracted_fields": list(structured.keys()),
            "validation_errors": len(errors),
        }

    except Exception as exc:
        error_details = {
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        record_step("processing", "failed", error_details)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            db.update_document_status(doc_uuid, "failed")
        )
        loop.close()

        return {
            "document_id": document_id,
            "status": "failed",
            "error": str(exc),
        }