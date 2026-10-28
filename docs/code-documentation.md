# Code Documentation — docintel

Auto-generated style documentation for all modules. Each entry includes: file path, purpose, classes/functions, parameters, return types, and usage notes.

---

## backend/main.py

**Purpose**: FastAPI application entry point.

**Classes**:
- `FastAPI` — main application instance.

**Functions**:
- `lifespan(app)` — async context manager for startup/shutdown (DB pool init, cleanup).
- `health_check()` — GET /health handler.

**Endpoints**:
- `GET /health` → `{"status": "healthy", "version": "1.0.0"}`

**Middleware**:
- `CORSMiddleware` — allows `http://localhost:3000` (frontend).

**Usage**:
```python
from main import app
# Run: uvicorn main:app --reload
```

---

## backend/app/api/routes.py

**Purpose**: REST API route definitions.

**Endpoints**:

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | /upload | `upload_documents()` | Multi-file upload, create jobs |
| GET | /process/{job_id} | `get_process_status()` | Job status polling |
| GET | /results/{job_id} | `get_results()` | Structured extraction results |
| GET | /search | `search_documents()` | Keyword + semantic search |
| POST | /corrections | `submit_correction()` | Manual value corrections |
| POST | /reprocess/{job_id} | `reprocess_job()` | Retry failed jobs |

**Key Functions**:

### `upload_documents(files: List[UploadFile])`
- **Params**: `files` — list of uploaded files.
- **Returns**: `dict` with `job_ids`, `status`, `filenames`.
- **Logic**: Validates extensions, saves files, creates DB records, enqueues Celery tasks.

### `get_process_status(job_id: UUID)`
- **Params**: `job_id` — document UUID.
- **Returns**: `dict` with `status`, `progress`.
- **Logic**: Queries `documents` and `processing_history` tables.

### `get_results(job_id: UUID)`
- **Params**: `job_id` — document UUID.
- **Returns**: `dict` with structured results + validation errors.
- **Logic**: JOIN query across `documents`, `structured_results`, `validation_errors`.

### `search_documents(q: str)`
- **Params**: `q` — search query string.
- **Returns**: `list[dict]` of matching documents with scores.
- **Logic**: Keyword ILIKE + pgvector cosine similarity.

### `submit_correction(correction: CorrectionRequest)`
- **Params**: `document_id`, `field_name`, `corrected_value`.
- **Returns**: Updated structured result.
- **Logic**: UPDATE `structured_results`, mark `validation_errors.resolved=TRUE`.

### `reprocess_job(job_id: UUID)`
- **Params**: `job_id` — document UUID.
- **Returns**: New job status.
- **Logic**: Reset status to 'uploaded', re-enqueue Celery task.

---

## backend/app/services/ocr.py

**Purpose**: Optical Character Recognition for PDFs and images.

**Functions**:

### `extract_text_ocr(file_path: str, file_type: str) -> str`
- **Params**: `file_path` (absolute path), `file_type` (pdf, jpg, png, tiff).
- **Returns**: Extracted text string.
- **Logic**:
  - PDF: `pdf2image.convert_from_path()` → per-page OpenCV preprocessing → Tesseract.
  - Image: PIL open → OpenCV preprocessing → Tesseract.
- **Preprocessing**: Grayscale → Gaussian blur → Otsu threshold → Tesseract `--psm 6 --oem 3`.

**Dependencies**: `pytesseract`, `PIL.Image`, `cv2`, `pdf2image`.

---

## backend/app/services/spreadsheet.py

**Purpose**: Parse Excel and CSV files.

**Functions**:

### `parse_spreadsheet(file_path: str, file_type: str) -> str`
- **Params**: `file_path`, `file_type` (xlsx, xls, csv).
- **Returns**: Combined text from all sheets/rows.
- **Logic**:
  - CSV: `pd.read_csv()` → `df.to_string()`.
  - Excel: `pd.read_excel(sheet_name=None)` → iterate all sheets → `df.to_string()`.
- **Dependencies**: `pandas`, `openpyxl`.

---

## backend/app/services/extraction.py

**Purpose**: LLM-based structured invoice extraction.

**Functions**:

### `extract_invoice_info(text: str) -> dict`
- **Params**: `text` — raw OCR/spreadsheet text.
- **Returns**: `dict` with keys: invoice_number, invoice_date, supplier_name, customer_name, subtotal (Decimal), tax (Decimal), total (Decimal), currency, line_items (list), confidence (float).
- **Logic**:
  1. Build prompt instructing JSON-only output, null for missing fields.
  2. Call LLM (Gemini 1.5 Flash, temperature=0).
  3. Parse JSON response.
  4. Convert monetary strings to `Decimal`.
  5. On parse failure: return all-null dict with confidence=0.0.

**Prompt** (logged to `docs/ai-prompts.md`):
```
Extract the following fields from this invoice text. Return valid JSON only.
If a field cannot be determined, use null. Do not invent values.
...
```

**Dependencies**: `decimal.Decimal`, `json`, LLM client (google-genai or openai).

---

## backend/app/services/validation.py

**Purpose**: Rule-based invoice validation.

**Functions**:

### `validate_invoice(data: dict) -> list[dict]`
- **Params**: `data` — structured extraction result.
- **Returns**: `list[dict]` with keys: field, error_type, severity, description.
- **Checks**:
  1. Missing required fields (invoice_number, invoice_date, supplier_name, total).
  2. Numeric consistency: subtotal + tax == total (Decimal).
  3. Line items sum == total (Decimal).
  4. Duplicate invoice_number in recent documents.

**Error Types**: `missing`, `inconsistency`, `duplicate`.
**Severities**: `high`, `medium`, `low`.

**Dependencies**: `decimal.Decimal`.

---

## backend/app/services/database.py

**Purpose**: PostgreSQL data access layer.

**Functions**:

| Function | Params | Returns | Description |
|----------|--------|---------|-------------|
| `get_pool()` | — | `asyncpg.Pool` | Get/create connection pool |
| `create_document()` | filename, file_type | UUID | INSERT documents |
| `update_status()` | document_id, status | None | UPDATE documents.status |
| `save_extracted_text()` | document_id, page, text, conf | None | INSERT extracted_text |
| `save_structured_results()` | document_id, data | None | INSERT structured_results |
| `save_validation_errors()` | document_id, errors | None | INSERT validation_errors |
| `save_embedding()` | document_id, embedding | None | INSERT document_embeddings |
| `search_documents()` | query, limit | list[dict] | Keyword + vector search |
| `get_document_results()` | document_id | dict | Full results JOIN |

**Connection Pattern**:
```python
async with pool.acquire() as conn:
    async with conn.transaction():
        await conn.execute(...)
```

---

## backend/app/workers/celery_app.py

**Purpose**: Celery application configuration.

**Settings**:
- `broker_url`: `redis://localhost:6379/0`
- `result_backend`: `redis://localhost:6379/0`
- `task_serializer`: `json`
- `result_expires`: 3600
- `worker_prefetch_multiplier`: 1

**Usage**:
```python
from app.workers.celery_app import celery_app
# Run: celery -A app.workers.celery_app worker --loglevel=info
```

---

## backend/app/workers/tasks.py

**Purpose**: Celery background task for document processing.

**Functions**:

### `process_document_task(document_id: str) -> dict`
- **Params**: `document_id` — UUID string.
- **Returns**: `dict` with processing summary.
- **Pipeline**:
  1. Fetch document from DB.
  2. Extract text (OCR or spreadsheet).
  3. AI extraction (LLM).
  4. Validation (rules).
  5. Save all results to DB.
  6. Generate embedding.
  7. Update status to completed/failed.
- **Error Handling**: Try/except around entire pipeline; on failure, status='failed', error in processing_history.

---

## backend/app/models/schemas.py

**Purpose**: Pydantic models for API request/response validation.

**Models**:

| Model | Fields | Usage |
|-------|--------|-------|
| `DocumentUploadResponse` | job_ids, status, filenames | POST /upload response |
| `ProcessStatusResponse` | job_id, status, progress | GET /process response |
| `ExtractionResult` | invoice_number, invoice_date, supplier_name, customer_name, subtotal, tax, total, currency, line_items, confidence | GET /results response |
| `ValidationError` | field_name, error_type, severity, description | Validation error item |
| `SearchResult` | document_id, filename, score, matched_fields | GET /search response |
| `CorrectionRequest` | document_id, field_name, corrected_value | POST /corrections body |
| `HealthResponse` | status, version | GET /health response |

**Types**:
- `Money` = `Decimal` (custom type for monetary fields)
- `InvoiceStatus` = Literal['uploaded', 'processing', 'completed', 'failed']

---

## frontend/src/lib/api.ts

**Purpose**: API client utilities for frontend.

**Functions**:

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `uploadFiles()` | POST | /upload | Multi-file upload |
| `getProcessStatus()` | GET | /process/{id} | Poll job status |
| `getResults()` | GET | /results/{id} | Get extraction results |
| `searchDocuments()` | GET | /search | Search documents |
| `submitCorrection()` | POST | /corrections | Submit manual correction |
| `reprocessJob()` | POST | /reprocess/{id} | Retry failed job |

**Base URL**: `http://localhost:8000/api`
**Error Handling**: try/catch with structured error return.

---

## frontend/src/components/FileUploader.tsx

**Purpose**: Drag-and-drop file upload component.

**Props**: `onUpload(files: File[])` — callback when files selected.

**Features**:
- Drag-and-drop zone with visual feedback.
- File input fallback.
- Multiple file selection.
- File type validation (pdf, jpg, png, tiff, xlsx, xls, csv).
- File list display with remove option.

---

## frontend/src/components/ProgressTracker.tsx

**Purpose**: Real-time job status polling component.

**Props**: `jobId: string` — document UUID.

**Behavior**:
- Polls `GET /api/process/{jobId}` every 2000ms.
- Displays progress bar (0-100%).
- Status indicators: Uploading → Processing → Completed/Failed.
- Stops polling on terminal status.

---

## frontend/src/components/ResultsTable.tsx

**Purpose**: Display extracted invoice fields.

**Props**: `data: ExtractionResult` — structured extraction result.

**Displays**:
- Invoice number, date, supplier, customer.
- Subtotal, tax, total (formatted as currency).
- Currency code.
- Confidence score (percentage).
- Line items table (description, quantity, unit_price, amount).

---

## frontend/src/components/ValidationErrors.tsx

**Purpose**: Display validation errors.

**Props**: `errors: ValidationError[]` — list of validation errors.

**Features**:
- Severity badges: High (red), Medium (orange), Low (yellow).
- Error descriptions.
- "Resolve" checkbox per error.
- Correction inline input for each field.

---

## frontend/src/components/LineItemsTable.tsx

**Purpose**: Display line items from extraction.

**Props**: `items: LineItem[]` — array of line items.

**Columns**: Description, Quantity, Unit Price, Amount.

---

## frontend/src/components/SearchBar.tsx

**Purpose**: Document search interface.

**Features**:
- Text input with debounce (300ms).
- Search results list with document preview.
- Click to navigate to results page.

---

## frontend/src/pages/index.tsx

**Purpose**: Home page — upload + document list.

**State**:
- `files: File[]` — selected files.
- `uploading: boolean` — upload in progress.
- `jobs: Job[]` — active job list.
- `results: Result[]` — completed results.

**Flow**:
1. User selects files → `onUpload` callback.
2. `uploadFiles(files)` → returns job IDs.
3. For each job ID, start `ProgressTracker`.
4. On completion, fetch results and add to `results` list.

---

## frontend/src/pages/results/[id].tsx

**Purpose**: Single document results page.

**Data Fetching**:
- `useEffect` → `getResults(id)` on mount.
- Display loading/error states.

**Actions**:
- Edit any field inline → `submitCorrection()`.
- Reprocess if failed → `reprocessJob()`.

---

## frontend/src/pages/search.tsx

**Purpose**: Search page.

**State**:
- `query: string` — search text.
- `results: SearchResult[]` — search matches.

**Flow**:
1. User types query (debounced).
2. `searchDocuments(query)` → results.
3. Display results with relevance scores.

---

## eval/test_ocr.py

**Purpose**: Test OCR extraction from various sources.

**Tests**:
- `test_extract_text_from_digital_pdf()` — verifies text extraction from digital PDF.
- `test_extract_text_from_scanned_image()` — verifies OCR on scanned JPG/PNG.
- `test_multi_page_pdf()` — verifies all pages processed.
- `test_poor_quality_image()` — verifies preprocessing helps low-quality scans.
- `test_corrupted_file_returns_empty()` — verifies graceful failure.

---

## eval/test_extraction.py

**Purpose**: Test AI extraction logic.

**Tests**:
- `test_extraction_returns_null_for_missing_fields()` — empty text → all null.
- `test_extraction_includes_confidence()` — confidence score present.
- `test_extraction_uses_decimal_for_money()` — monetary values are Decimal.
- `test_extraction_line_items_parsed()` — line items array correct.
- `test_extraction_no_hallucination()` — no invented values.

---

## eval/test_validation.py

**Purpose**: Test validation rules.

**Tests**:
- `test_validation_missing_required_fields()` — missing total → error.
- `test_validation_numeric_inconsistency()` — subtotal+tax != total → error.
- `test_validation_line_items_sum_mismatch()` — items sum != total → error.
- `test_validation_duplicate_invoice()` — duplicate number → error.
- `test_validation_no_errors_for_valid_invoice()` — valid → empty errors.

---

## eval/test_api.py

**Purpose**: Test REST API endpoints.

**Tests**:
- `test_upload_returns_job_id()` — POST /upload returns job_id.
- `test_process_status_polling()` — GET /process returns status.
- `test_get_results_after_completion()` — GET /results returns data.
- `test_search_returns_matches()` — GET /search returns results.
- `test_submit_correction_updates_value()` — POST /corrections updates DB.
- `test_reprocess_failed_job()` — POST /reprocess retries.

---

## eval/test_workers.py

**Purpose**: Test Celery background tasks.

**Tests**:
- `test_process_document_task_success()` — full pipeline completes.
- `test_process_document_task_failure()` — corrupted file → failed status.
- `test_task_retries_on_error()` — Celery retry logic.
- `test_task_updates_processing_history()` — steps recorded.