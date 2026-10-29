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
import asyncio
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
    """Process a single document through the full pipeline."""
    doc_uuid = UUID(document_id)

    async def run_pipeline():
        async def record_step(step, status, error_details=None):
            try:
                await db.save_processing_history(
                    doc_uuid, step, status,
                    started_at=_now_iso(),
                    completed_at=_now_iso(),
                    error_details=error_details,
                )
            except Exception:
                pass

        try:
            await db.init_pool()
            await db.update_document_status(doc_uuid, "processing")
            await record_step("ocr", "started")

            if file_type in ("pdf", "jpg", "png", "tiff"):
                text = ocr_service.extract_text_ocr(file_path, file_type)
            elif file_type in ("xlsx", "xls", "csv"):
                text = spreadsheet_service.parse_spreadsheet(file_path, file_type)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            await db.save_extracted_text(doc_uuid, 1, text, None)
            await record_step("ocr", "completed")

            await record_step("extraction", "started")
            structured = extraction_service.extract_invoice_info(text)
            await db.save_structured_results(doc_uuid, structured)
            await record_step("extraction", "completed")

            # Generate embedding for semantic search (best-effort)
            try:
                import os, google.generativeai as genai
                key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
                if key:
                    genai.configure(api_key=key)
                    resp = genai.embed_content(model="models/text-embedding-004", content=text[:8000])
                    emb = resp.get("embedding") if isinstance(resp, dict) else getattr(resp, "embedding", None)
                    if emb:
                        await db.save_embedding(doc_uuid, emb)
            except Exception:
                pass

            await record_step("validation", "started")
            errors = validation_service.validate_invoice(structured)
            await db.save_validation_errors(doc_uuid, errors)
            await record_step("validation", "completed")

            has_high_errors = any(e.get("severity") == "high" for e in errors)
            final_status = "completed"

            await db.update_document_status(doc_uuid, final_status)
            await db.close_pool()

            return {
                "document_id": document_id,
                "status": final_status,
                "extracted_fields": list(structured.keys()),
                "validation_errors": len(errors),
            }
        except Exception as exc:
            error_details = {"error": str(exc), "traceback": traceback.format_exc()}
            await record_step("processing", "failed", error_details)
            try:
                await db.update_document_status(doc_uuid, "failed")
            except Exception:
                pass
            await db.close_pool()
            return {"document_id": document_id, "status": "failed", "error": str(exc)}

    return asyncio.run(run_pipeline())
