# Step-by-Step Code Explanation — docintel

This document walks through every part of the codebase, explaining what each file does, how data flows through it, and the logic behind key design decisions. Use this to understand and explain the system.

---

## Part 1: Project Entry Points

### `backend/main.py`

**Purpose**: FastAPI application entry point. Configures the app, registers routers, sets up CORS, and defines the health endpoint.

**Key Logic**:
1. Create `FastAPI()` instance with title/version.
2. Add `CORSMiddleware` to allow frontend requests.
3. Include API router (`app.api.routes`) with prefix `/api`.
4. Define `GET /health` — returns `{"status": "healthy"}`.
5. On startup, initialize database connection pool and Celery app.

**Code Flow**:
```
uvicorn main:app
    → FastAPI app created
    → CORS middleware added
    → API routes mounted at /api
    → Server listens on 0.0.0.0:8000
```

---

## Part 2: API Routes (`backend/app/api/routes.py`)

**Purpose**: All REST endpoints. Each endpoint is thin — it delegates business logic to services/workers.

### `POST /api/upload`
- Accepts multiple files via `multipart/form-data`.
- Validates file extensions (pdf, jpg, png, tiff, xlsx, xls, csv).
- Saves each file to `data/uploads/`.
- Creates a `documents` row with `status='uploaded'`.
- Enqueues a Celery task (`process_document_task`) with the document ID.
- Returns `{"job_id": "<uuid>", "status": "uploaded", "filenames": [...]}`.

### `GET /api/process/{job_id}`
- Queries the `documents` table by ID.
- Returns `{"job_id": ..., "status": "uploaded|processing|completed|failed", "progress": 0-100}`.
- Progress is inferred from `processing_history` steps completed.

### `GET /api/results/{job_id}`
- Joins `documents`, `structured_results`, `validation_errors`.
- Returns full structured JSON: invoice fields, line items, confidence, errors.

### `GET /api/search`
- Accepts query parameter `q`.
- Performs keyword search on `documents.filename` and `extracted_text.text`.
- Performs semantic search using pgvector on `document_embeddings`.
- Returns ranked list of matching documents.

### `POST /api/corrections`
- Accepts `document_id`, field name, corrected value.
- Updates `structured_results` for that field.
- Marks related `validation_errors` as `resolved=TRUE`.
- Returns updated result.

### `POST /api/reprocess/{job_id}`
- Finds the document, resets `status='uploaded'`.
- Re-enqueues the Celery processing task.
- Returns new job status.

---

## Part 3: OCR Service (`backend/app/services/ocr.py`)

**Purpose**: Extract text from PDFs, images, and scanned documents.

### `extract_text_ocr(file_path: str, file_type: str) -> str`

**Logic for PDFs**:
1. Use `pdf2image.convert_from_path(file_path, dpi=300)` to convert each page to a PIL Image.
2. For each page image:
   a. Convert to OpenCV array (`cv2.array(image)`).
   b. Convert to grayscale (`cv2.COLOR_BGR2GRAY`).
   c. Apply Otsu thresholding for binarization (`cv2.THRESH_BINARY + cv2.THRESH_OTSU`).
   d. Run Tesseract OCR with config `--psm 6 --oem 3`.
3. Join all page texts with newlines.

**Logic for Images (JPG/PNG/TIFF)**:
1. Open with PIL `Image.open()`.
2. Convert to OpenCV array.
3. Grayscale → Gaussian blur → Otsu threshold.
4. Tesseract OCR.
5. Return text.

**Why this preprocessing?** Poor-quality scans benefit from grayscale conversion, blur (noise reduction), and Otsu thresholding (binarization) before OCR.

---

## Part 4: Spreadsheet Service (`backend/app/services/spreadsheet.py`)

**Purpose**: Parse XLSX, XLS, CSV files into text for downstream extraction.

### `parse_spreadsheet(file_path: str, file_type: str) -> str`

**Logic**:
1. If CSV: `pd.read_csv(file_path)`.
2. If XLSX/XLS: `pd.read_excel(file_path, sheet_name=None)` — reads ALL sheets into a dict of DataFrames.
3. For each sheet/DataFrame:
   - Convert to string representation (`df.to_string()`).
   - Include sheet name as header.
4. Join all sheet text.
5. Return combined text.

**Why all sheets?** Business documents may have invoices spread across multiple sheets; we must not miss data.

---

## Part 5: AI Extraction Service (`backend/app/services/extraction.py`)

**Purpose**: Use an LLM to extract structured invoice fields from raw text.

### `extract_invoice_info(text: str) -> dict`

**Prompt Design**:
- System instructs: "Return valid JSON only. If a field cannot be determined, use null. Do not invent values."
- Fields requested: invoice_number, invoice_date, supplier_name, customer_name, subtotal, tax, total, currency, line_items, confidence.
- Temperature = 0 (deterministic output).

**LLM Call**:
```python
response = call_llm(prompt, model='gemini-1.5-flash', temperature=0)
```

**Post-processing**:
- Parse JSON response.
- Convert monetary fields (subtotal, tax, total) to `Decimal(str(value))` — never float.
- If JSON parse fails, return all-null result with `confidence=0.0`.

**Fail-closed rule**: Missing fields → `null`, confidence → `0.0`. Never hallucinate.

---

## Part 6: Validation Service (`backend/app/services/validation.py`)

**Purpose**: Rule-based validation of extracted invoice data.

### `validate_invoice(data: dict) -> list[dict]`

**Check 1 — Missing required fields**:
- Required: invoice_number, invoice_date, supplier_name, total.
- If any is null/empty → error `type='missing'`, `severity='high'`.

**Check 2 — Numeric consistency (subtotal + tax = total)**:
- If all three are present: `expected = subtotal + tax`.
- If `total != expected` → error `type='inconsistency'`, `severity='high'`.
- Uses `Decimal` arithmetic for exact comparison.

**Check 3 — Line items sum vs total**:
- Sum all `line_items[].amount` as Decimal.
- If sum != total → error `type='inconsistency'`, `severity='medium'`.

**Check 4 — Duplicate detection**:
- Query recent documents for same `invoice_number`.
- If found → error `type='duplicate'`, `severity='medium'`.

**Return**: List of error dicts with `field`, `error_type`, `severity`, `description`.

---

## Part 7: Database Service (`backend/app/services/database.py`)

**Purpose**: PostgreSQL access with connection pooling.

**Key Functions**:
- `get_connection()` — returns a pooled connection from `asyncpg.create_pool()`.
- `create_document(filename, file_type)` — INSERT into `documents`, returns UUID.
- `update_status(document_id, status)` — UPDATE documents status.
- `save_extracted_text(document_id, page_number, text, confidence)` — INSERT into `extracted_text`.
- `save_structured_results(document_id, data)` — INSERT into `structured_results` with Decimal values.
- `save_validation_errors(document_id, errors)` — INSERT into `validation_errors`.
- `save_embedding(document_id, embedding)` — INSERT into `document_embeddings`.
- `search_documents(query, limit)` — keyword + pgvector semantic search.
- `get_document_results(document_id)` — JOIN query for full results.

**Connection Management**: All connections used in `async with` context managers to ensure they are returned to the pool.

---

## Part 8: Worker Tasks (`backend/app/workers/tasks.py`)

**Purpose**: Celery background tasks for document processing.

### `process_document_task(document_id: str)`

**Pipeline**:
1. Fetch document record from DB.
2. Update status to `processing`; record step start in `processing_history`.
3. Determine file type from extension.
4. Extract text:
   - pdf/tiff/jpg/png → `ocr.extract_text_ocr()`
   - xlsx/xls/csv → `spreadsheet.parse_spreadsheet()`
5. Save extracted text to DB; record OCR step complete.
6. Call `extraction.extract_invoice_info(text)` → structured data.
7. Save structured results to DB; record extraction step complete.
8. Call `validation.validate_invoice(structured)` → errors.
9. Save validation errors to DB; record validation step complete.
10. Generate embedding for extracted text; save to `document_embeddings`.
11. Update document status to `completed` or `failed`.
12. Return result summary.

**Error Handling**: Any exception → status set to `failed`, error details stored in `processing_history`, task does not crash the worker.

---

## Part 9: Celery Configuration (`backend/app/workers/celery_app.py`)

**Purpose**: Configure Celery app with Redis broker.

**Settings**:
- Broker: `redis://localhost:6379/0`
- Backend: `redis://localhost:6379/0`
- Task serialization: JSON
- Accept content: JSON
- Result expires: 3600 seconds
- Worker prefetch multiplier: 1 (one task at a time per worker for OCR-heavy jobs)

---

## Part 10: Frontend — Next.js

### `frontend/src/pages/index.tsx`
- Home page with upload form and document list.
- `FileUploader` component: drag-and-drop zone, file input, multi-select.
- On submit: `POST /api/upload` with `FormData`, stores returned `job_id`s.
- Polls `GET /api/process/{job_id}` every 2 seconds until status = `completed` or `failed`.
- On complete, fetches `GET /api/results/{job_id}` and displays.

### `frontend/src/pages/results/[id].tsx`
- Dynamic route for viewing a single document's results.
- Displays: invoice fields (number, date, supplier, customer, subtotal, tax, total, currency), line items table, confidence score.
- Displays validation errors with severity badges (high/medium/low).
- "Correct" button opens inline edit for each field.
- On correction: `POST /api/corrections` with document_id, field, value.

### `frontend/src/pages/search.tsx`
- Search input with keyword field.
- On submit: `GET /api/search?q=...`.
- Displays results with relevance score, filename, status, key fields.

### `frontend/src/lib/api.ts`
- `fetch` wrapper with base URL `http://localhost:8000/api`.
- Helper functions: `uploadFiles()`, `getProcessStatus()`, `getResults()`, `searchDocuments()`, `submitCorrection()`, `reprocessJob()`.
- Error handling with try/catch, returns structured error objects.

### `frontend/src/components/`
- `FileUploader.tsx` — drag-drop upload zone.
- `ProgressTracker.tsx` — polling status indicator.
- `ResultsTable.tsx` — displays extracted invoice fields.
- `ValidationErrors.tsx` — lists validation errors with severity.
- `LineItemsTable.tsx` — displays line items array.
- `SearchBar.tsx` — search input with results list.

---

## Part 11: How Everything Connects (End-to-End Example)

```
User uploads invoice.pdf via Next.js frontend
    │
    ▼
Frontend POST /api/upload [file: invoice.pdf]
    │
    ▼
FastAPI receives file, saves to data/uploads/invoice.pdf
    │
    ▼
FastAPI INSERT documents (filename='invoice.pdf', file_type='pdf', status='uploaded')
    │
    ▼
FastAPI enqueues Celery task: process_document_task(document_id=<uuid>)
    │
    ▼
FastAPI returns {"job_id": "<uuid>", "status": "uploaded"}
    │
    ▼
Frontend polls GET /api/process/<uuid> every 2s
    │
    ▼
Celery worker picks up task
    │
    ▼
Worker: ocr.extract_text_ocr('data/uploads/invoice.pdf', 'pdf')
    │   → PyMuPDF converts PDF pages to images
    │   → OpenCV preprocesses (grayscale, blur, Otsu threshold)
    │   → Tesseract extracts text per page
    │   → Returns combined text
    │
    ▼
Worker saves text to extracted_text table
    │
    ▼
Worker: extraction.extract_invoice_info(text)
    │   → LLM prompt: "Extract invoice fields, return JSON only, null if missing"
    │   → LLM returns JSON with subtotal, tax, total as strings
    │   → Converted to Decimal
    │   → confidence = 0.95
    │
    ▼
Worker saves structured_results to DB
    │
    ▼
Worker: validation.validate_invoice(structured)
    │   → Checks: all required fields present?
    │   → Checks: subtotal + tax == total? (Decimal math)
    │   → Checks: line items sum == total?
    │   → Returns errors list
    │
    ▼
Worker saves validation_errors to DB
    │
    ▼
Worker generates embedding, saves to document_embeddings
    │
    ▼
Worker updates documents.status = 'completed'
    │
    ▼
Frontend poll detects status='completed'
    │
    ▼
Frontend GET /api/results/<uuid> → displays invoice data + errors
    │
    ▼
User sees validation error: "Total (150.01) != Subtotal (100.00) + Tax (20.00) = 120.00"
    │
    ▼
User submits correction via POST /api/corrections
    │
    ▼
Database updated, error marked resolved
```

---

## Part 12: Key Design Principles (Rules)

| Rule | Implementation |
|------|---------------|
| Decimal for money | All monetary fields use `Decimal(str(value))`, never `float` |
| Never invent values | Missing fields → `null`, confidence → `0.0` |
| Type hints everywhere | All function signatures annotated |
| Small modules | Each service < 100 lines, single responsibility |
| Every feature tested | pytest tests for OCR, extraction, validation, API |
| Log every prompt | Full prompt text logged to `docs/ai-prompts.md` |
| Background processing | OCR/LLM via Celery; API returns immediately |
| Fail-closed | Uncertain → null + 0.0 confidence |
| Connection pooling | asyncpg pool, async context managers |

---

## Part 13: Running the System

```powershell
# 1. Activate venv
.\.venv\Scripts\Activate.ps1

# 2. Install backend deps
cd backend
pip install -r requirements.txt

# 3. Install frontend deps
cd ../frontend
npm install

# 4. Start Redis
redis-server --daemonize yes

# 5. Start backend
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 6. Start Celery worker (separate terminal)
celery -A app.workers.celery_app worker --loglevel=info

# 7. Start frontend
cd frontend
npm run dev

# 8. Run tests
cd backend
pytest -q
```

Open `http://localhost:3000` for the frontend, `http://localhost:8000/docs` for API documentation.