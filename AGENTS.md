# AGENTS.md — IntentGate for docintel

## Project Overview

docintel is an AI-powered document intelligence system for automating invoice processing, extraction, validation, and search. It accepts PDF, image, Excel, and CSV files, extracts structured information using OCR and LLMs, validates results with rule-based checks, and provides a REST API and web interface for managing processed documents.

- **Purpose**: Automate document processing pipeline from upload to searchable results
- **Problem solved**: Eliminate manual data entry for invoices, receipts, and financial documents
- **Key features**: Multi-format OCR, structured AI extraction, validation rules, background processing, semantic search

## Repo Layout

```
docintel/
  backend/          # FastAPI application + Python workers
    main.py         # Entry point
    app/            # Core application code
      api/          # REST endpoints
      workers/      # Celery/ARQ background tasks
      services/     # Business logic (OCR, extraction, validation)
    requirements.txt
  frontend/         # Next.js frontend
    src/
      components/   # React components
      pages/        # Next.js pages
      lib/          # API utilities
    package.json
  docs/             # Documentation
    ai-prompts.md   # Log of all AI prompts used
    architecture.md # Architecture diagram description
    database.md     # Database schema documentation
    setup.md        # Setup instructions
  eval/             # Tests and evaluation
    test_*.py       # pytest test files
  data/             # Processed data (gitignored)
    uploads/        # Uploaded temp files
```

## Commands (PowerShell)

```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install dependencies (backend)
cd backend
pip install -r requirements.txt

# Install dependencies (frontend)
cd ../frontend
npm install

# Start Redis (required for Celery/ARQ)
redis-server --daemonize yes

# Start backend server
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start frontend
cd frontend
npm run dev

# Run tests
cd backend
pytest -q

# Run evaluation
cd backend
python -m eval.run_evaluation
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | FastAPI | REST API framework |
| **Async** | Celery/ARQ + Redis | Background job processing |
| **Database** | PostgreSQL + pgvector | Document metadata, structured results, embeddings |
| **OCR** | PyMuPDF + Tesseract + OpenCV | Text extraction from PDFs and images |
| **Spreadsheet** | pandas + openpyxl | XLSX, XLS, CSV parsing |
| **AI Extraction** | Gemini / OpenAI API | Structured data extraction from extracted text |
| **Vector Search** | pgvector | Semantic search over documents |
| **Frontend** | Next.js + React | User interface for uploads and dashboard |
| **Styling** | Tailwind CSS | UI styling |
| **Testing** | pytest | Unit and integration tests |

## Rules

1. **Decimal for money** — All monetary values (subtotal, tax, total) must use Python `Decimal`, never `float`. Prevents rounding errors in financial data.
2. **Never invent extracted values** — If a field cannot be determined from the document, use `null` (JSON `None`). Never hallucinate values. Always include `confidence` score when possible.
3. **Type hints everywhere** — Function signatures, return types, and data models must have type annotations.
4. **Small modules** — Keep modules focused and under 100 lines when possible. Each module should have a single responsibility.
5. **Every feature needs tests** — Write pytest tests for all new functionality. Tests cover OCR, extraction, validation, and API endpoints.
6. **Log every prompt** — When using LLMs, log the full prompt to `docs/ai-prompts.md`. Include model name, purpose, and timestamp.
7. **Background processing** — OCR and AI operations must run as background jobs via Celery/ARQ. API must return immediately with job ID.
8. **Monorepo structure** — Keep backend/, frontend/, docs/, eval/ at root level. Shared configs go in docs/.
9. **Fail-closed** — Missing or uncertain fields default to `null` with a confidence score of `0.0`. Do not guess.
10. **Database connections** — Use connection pooling. Always close database connections in async context managers.

## API Endpoints (FastAPI)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST /upload` | Upload document | Accepts multiple files, creates processing job, returns job ID |
| `GET /process/{job_id}` | Check status | Returns processing progress (uploaded → processing → completed/failed) |
| `GET /results/{job_id}` | Get extracted data | Returns structured JSON results when processing complete |
| `GET /search` | Search documents | Keyword and semantic search over processed documents |
| `POST /corrections` | Manual corrections | Submit corrected values for validation errors |
| `POST /reprocess/{job_id}` | Reprocess failed job | Retry OCR/extraction on failed jobs |
| `GET /health` | Health check | System status |

## Database Schema (PostgreSQL + pgvector)

```sql
-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- pdf, jpg, png, tiff, xlsx, csv
  status VARCHAR(50) DEFAULT 'uploaded',
  page_count INTEGER,
  extracted_text TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  supplier_name TEXT,
  customer_name TEXT,
  subtotal DECIMAL(19, 2),
  tax DECIMAL(19, 2),
  total DECIMAL(19, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  line_items JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vector embeddings for semantic search
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY REFERENCES documents(id),
  embedding VECTOR(768), -- all-MiniLM-L6-v2 embedding dimension
  created_at TIMESTAMP DEFAULT NOW()
);
```

## OCR Processing Pipeline

```python
# worker.py - processes document in background

def process_document(file_path: str, file_type: str, job_id: str):
    """Main processing pipeline for a single document."""
    
    # Step 1: Extract text
    if file_type in ['pdf', 'tiff', 'jpg', 'png']:
        text = extract_text_ocr(file_path, file_type)
    elif file_type in ['xlsx', 'xls', 'csv']:
        text = parse_spreadsheet(file_path, file_type)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")
    
    # Step 2: AI information extraction
    structured = extract_invoice_info(text)
    
    # Step 3: Validation
    errors = validate_invoice(structured)
    
    # Step 4: Store results in DB
    save_to_database(job_id, text, structured, errors)
```

### OCR for Scanned Documents

```python
import pytesseract
from PIL import Image
import cv2
from pdf2image import convert_from_path

def extract_text_ocr(file_path: str, file_type: str) -> str:
    """Extract text from scanned documents and images using OCR."""
    
    if file_type == 'pdf':
        # Convert PDF pages to images
        images = convert_from_path(file_path, dpi=300)
        texts = []
        for image in images:
            # Pre-processing for poor quality
            img_array = cv2.array(image)
            gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
            # Apply thresholding for binarization
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            texts.append(pytesseract.image_to_string(
                Image.fromarray(binary), 
                config='--psm 6 --oem 3'
            ))
        return '\n'.join(texts)
    
    elif file_type in ['jpg', 'png', 'tiff']:
        img = Image.open(file_path)
        # Pre-processing
        img_array = cv2.array(img)
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)
        _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return pytesseract.image_to_string(
            Image.fromarray(binary), 
            config='--psm 6 --oem 3'
        )
```

## AI Information Extraction (LLM Prompt)

```python
from decimal import Decimal
import json

def extract_invoice_info(text: str) -> dict:
    """Extract structured invoice data using LLM.
    
    Returns dict with fields: invoice_number, invoice_date, supplier_name,
    customer_name, subtotal (Decimal), tax (Decimal), total (Decimal),
    currency, line_items (list of dicts), confidence scores.
    """
    
    prompt = """
    Extract the following fields from this invoice text. Return valid JSON only.
    If a field cannot be determined, use null. Do not invent values.
    
    Fields:
    - invoice_number: Invoice/purchase order number
    - invoice_date: Date in YYYY-MM-DD format
    - supplier_name: Company/vendor issuing the invoice
    - customer_name: Company buying the products/services
    - subtotal: Subtotal amount (number only, no currency symbol)
    - tax: Tax amount (number only, no currency symbol)
    - total: Total amount (number only, no currency symbol)
    - currency: Currency code (e.g., USD, EUR, GBP)
    - line_items: Array of line items with {description, quantity, unit_price, amount}
    - confidence: Overall confidence score 0.0 to 1.0
    
    Text:
    """ + text + """
    
    JSON only:
    """
    
    # Call LLM (Gemini or OpenAI)
    response = call_llm(prompt, model='gemini-1.5-flash', temperature=0)
    
    try:
        result = json.loads(response.text)
        # Ensure Decimal for monetary values
        if result.get('subtotal') is not None:
            result['subtotal'] = Decimal(str(result['subtotal']))
        if result.get('tax') is not None:
            result['tax'] = Decimal(str(result['tax']))
        if result.get('total') is not None:
            result['total'] = Decimal(str(result['total']))
        return result
    except json.JSONDecodeError:
        return {
            'invoice_number': None,
            'invoice_date': None,
            'supplier_name': None,
            'customer_name': None,
            'subtotal': None,
            'tax': None,
            'total': None,
            'currency': None,
            'line_items': [],
            'confidence': 0.0
        }
```

## Validation Rules

```python
def validate_invoice(data: dict) -> list:
    """Validate extracted invoice data against business rules.
    
    Returns list of error dicts with: field, error_type, severity, description.
    """
    from decimal import Decimal
    errors = []
    
    # Check missing required fields
    required = ['invoice_number', 'invoice_date', 'supplier_name', 'total']
    for field in required:
        if not data.get(field) and data.get(field) is not None:
            errors.append({
                'field': field,
                'error_type': 'missing',
                'severity': 'high',
                'description': f'{field} is required'
            })
    
    # Validate numeric consistency: subtotal + tax = total
    subtotal = data.get('subtotal')
    tax = data.get('tax')
    total = data.get('total')
    
    if subtotal is not None and tax is not None and total is not None:
        expected_total = subtotal + tax
        if total != expected_total:
            errors.append({
                'field': 'total',
                'error_type': 'inconsistency',
                'severity': 'high',
                'description': f'Subtotal ({subtotal}) + Tax ({tax}) = {expected_total}, but Total is {total}'
            })
    
    # Validate line items sum equals total
    line_items = data.get('line_items', [])
    if line_items:
        total_from_items = sum(Decimal(str(item.get('amount', 0))) for item in line_items)
        if total_from_items != total:
            errors.append({
                'field': 'line_items',
                'error_type': 'inconsistency',
                'severity': 'medium',
                'description': f'Line items sum ({total_from_items}) does not match total ({total})'
            })
    
    # Duplicate invoice detection (check against recent documents)
    # ... query DB for same invoice_number
    
    return errors
```

## Testing Strategy

Run pytest to execute all tests:

```powershell
cd backend
pytest -v
```

### Test Categories

| Test File | Focus |
|-----------|-------|
| `test_ocr.py` | OCR extraction from various image qualities, PDF multi-page |
| `test_extraction.py` | AI extraction, null handling, confidence scores |
| `test_validation.py` | Missing fields, numeric inconsistencies, duplicate detection |
| `test_api.py` | REST endpoints, upload, status, search |
| `test_workers.py` | Background job processing, retry logic |

### Sample Test (pytest)

```python
def test_extraction_returns_null_for_missing_fields():
    """Extraction should never invent values - missing fields get null."""
    from docintel.services.extraction import extract_invoice_info
    
    # Empty text should return null values, not hallucinated data
    result = extract_invoice_info("")
    
    assert result['invoice_number'] is None
    assert result['invoice_date'] is None
    assert result['supplier_name'] is None
    assert result['total'] is None
    assert result['confidence'] == 0.0

def test_validation_catches_inconsistency():
    """Validation should detect subtotal + tax != total."""
    errors = validate_invoice({
        'invoice_number': 'INV-001',
        'invoice_date': '2024-01-15',
        'supplier_name': 'Acme Corp',
        'subtotal': Decimal('100.00'),
        'tax': Decimal('20.00'),
        'total': Decimal('150.01'),  # Wrong! Should be 120.00
        'currency': 'USD',
        'line_items': []
    })
    
    assert len(errors) > 0
    assert errors[0]['error_type'] == 'inconsistency'
```

## AI Prompt Logging

Every prompt sent to an LLM must be logged to `docs/ai-prompts.md` with this format:

```markdown
## Prompt: Extract invoice information

- **Date**: YYYY-MM-DD HH:MM:SS
- **Model**: gemini-1.5-flash
- **Purpose**: Structured information extraction from OCR text
- **Tokens**: input_tokens / output_tokens
- **Temperature**: 0
- **Prompt length**: N characters

```
[THE ACTUAL PROMPT TEXT HERE]
```
```

**Rule**: Before asking me to use an LLM, I will add the prompt to `docs/ai-prompts.md` myself. You just need to ensure the code logs prompts appropriately.

## Workflow

1. **Upload** — User uploads files via frontend → `POST /upload` → FastAPI creates job in Redis
2. **Process** — Celery worker picks up job → OCR → AI extraction → Validation → Store results
3. **Status** — Frontend polls `GET /process/{job_id}` for progress updates
4. **Results** — When complete, `GET /results/{job_id}` returns structured JSON
5. **Search** — `GET /search` with keyword/vector query returns matching documents
6. **Correct** — User reviews errors, submits corrections via `POST /corrections`
7. **Test** — `pytest -q` must pass for all changes
8. **Document** — Add prompt to `docs/ai-prompts.md` for every LLM call

## Creating the Folder Structure

The following empty folders should be created:

```
backend/
  app/
    api/
    workers/
    services/
frontend/
  src/
    components/
    pages/
    lib/
docs/
  ai-prompts.md
  architecture.md
  database.md
  setup.md
eval/
  test_*.py
data/
  uploads/
```

---
*AGENTS.md generated for docintel AI document intelligence system.*