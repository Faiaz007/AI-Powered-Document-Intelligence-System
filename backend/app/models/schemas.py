"""Pydantic schemas for API request/response validation."""

from decimal import Decimal
from typing import List, Optional, Literal
from uuid import UUID
from pydantic import BaseModel, Field


# --- Status types ---

InvoiceStatus = Literal["uploaded", "processing", "completed", "failed"]


# --- Request/Response models ---

class DocumentUploadResponse(BaseModel):
    job_ids: List[UUID]
    status: str
    filenames: List[str]


class ProcessStatusResponse(BaseModel):
    job_id: UUID
    status: InvoiceStatus
    progress: int = Field(ge=0, le=100)


class LineItem(BaseModel):
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[Decimal] = None
    amount: Optional[Decimal] = None


class ExtractionResult(BaseModel):
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    supplier_name: Optional[str] = None
    customer_name: Optional[str] = None
    subtotal: Optional[Decimal] = None
    tax: Optional[Decimal] = None
    total: Optional[Decimal] = None
    currency: Optional[str] = "USD"
    line_items: List[LineItem] = []
    confidence: Optional[float] = Field(default=0.0, ge=0.0, le=1.0)


class ValidationErrorItem(BaseModel):
    field_name: str
    error_type: str  # missing, inconsistency, duplicate
    severity: str  # low, medium, high
    description: str


class DocumentResult(BaseModel):
    document_id: UUID
    filename: str
    file_type: str
    status: InvoiceStatus
    extracted_text: Optional[str] = None
    structured: Optional[ExtractionResult] = None
    validation_errors: List[ValidationErrorItem] = []
    created_at: Optional[str] = None


class SearchResult(BaseModel):
    document_id: UUID
    filename: str
    file_type: str
    score: float
    matched_fields: List[str] = []


class CorrectionRequest(BaseModel):
    document_id: UUID
    field_name: str
    corrected_value: str


class HealthResponse(BaseModel):
    status: str
    version: str = "1.0.0"