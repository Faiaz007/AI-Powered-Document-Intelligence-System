# System Design Document — docintel

## 1. Executive Summary

docintel is a monorepo AI-powered document intelligence system that automates invoice processing from upload through extraction, validation, and search. It accepts PDF, JPG, PNG, TIFF, XLSX, XLS, and CSV files. Digital PDFs use PyMuPDF text extraction; scanned documents and images use OCR (Tesseract + OpenCV preprocessing); spreadsheets are parsed with pandas/openpyxl. Extracted text flows through an LLM-based extraction layer (Gemini/OpenAI), then a rule-based validation engine. Results are stored in PostgreSQL with pgvector for semantic search. Background processing runs via Celery/ARQ + Redis. The frontend is Next.js + Tailwind CSS.

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                            │
│  ┌─────────────────┐ ┌───────────────────────────────────────────────────┐ │
│  │ Upload Component│ │ Dashboard / Processing Status                     │ │
│  │ • Multi-file    │ │ • Progress bars (poll /process/:id)               │ │
│  │ • Drag & drop   │ │ • Inspect extracted data                          │ │
│  └─────────────────┘ │ • Review validation errors                        │ │
│                     │ • Manual corrections (POST /corrections)           │ │
│                     │ • Keyword + semantic search (GET /search)          │ │
│                     └───────────────────────────────────────────────────┘ │
│                            │                                              │
└───────────────────────────┼───────────────────────────────────────────────┘
                            │ REST API (JSON)
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (FastAPI)                               │
│  ┌─────────────────┐ ┌───────────────────────────────────────────────────┐ │
│  │  api/routes.py  │ │  app/services/                                    │ │
│  │  POST /upload   │ │  • ocr.py — text extraction                       │ │
│  │  GET /process   │ │  • extraction.py — LLM extraction                 │ │
│  │  GET /results   │ │  • validation.py — rule-based checks              │ │
│  │  GET /search    │ │  • database.py — PostgreSQL access                │ │
│  │  POST /corrections│ └───────────────────────────────────────────────────┘ │
│  │  POST /reprocess│ │  app/workers/tasks.py — Celery background jobs    │ │
│  │  GET /health    │ └───────────────────────────────────────────────────┘ │
│  └─────────────────┘                            │                          │
│                            ┌─────────────────────┘                          │
│                            ▼                                                │
│                    ┌─────────────────────────────────────┐                 │
│                    │  Redis (Celery/ARQ broker)          │                 │
│                    └─────────────────────────────────────┘                 │
│                            │                                              │
└───────────────────────────┼───────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATABASE (PostgreSQL + pgvector)                       │
│  ┌─────────────────┐ ┌───────────────────────────────────────────────────┐ │
│  │ documents       │ │ document_embeddings                               │ │
│  │ extracted_text  │ │ validation_errors                                 │ │
│  │ structured_results│ │ processing_history                              │ │
│  └─────────────────┘ └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **API Layer** | HTTP endpoints, request validation, job ID generation |
| **Worker Layer** | Background OCR → extraction → validation → persistence |
| **OCR Service** | PyMuPDF (digital PDFs), Tesseract + OpenCV (scanned/images) |
| **Spreadsheet Service** | pandas/openpyxl parsing for XLSX/XLS/CSV |
| **Extraction Service** | LLM (Gemini/OpenAI) structured JSON extraction |
| **Validation Service** | Rule-based checks: missing fields, numeric consistency, duplicates |
| **Database Service** | PostgreSQL queries, connection pooling, pgvector search |
| **Frontend** | Upload UI, status polling, results inspection, corrections, search |

## 4. Data Flow

1. **Upload**: Client POSTs files → `/upload` → FastAPI saves files to `data/uploads/`, creates job record (status=`uploaded`), enqueues Celery task, returns `job_id`.
2. **Process**: Celery worker picks up job → reads file → determines type → extracts text (OCR or spreadsheet parser) → calls LLM extraction → runs validation → saves results to PostgreSQL → updates job status.
3. **Status**: Client polls `GET /process/{job_id}` → returns current status and progress.
4. **Results**: Client GET `GET /results/{job_id}` → returns structured JSON + validation errors.
5. **Search**: Client GET `GET /search?q=...` → keyword filter + pgvector semantic similarity.
6. **Corrections**: Client POST `POST /corrections` → updates structured results, marks validation errors resolved.
7. **Reprocess**: Client POST `POST /reprocess/{job_id}` → re-queues failed job.

## 5. Processing Pipeline (per document)

```
File Upload
    │
    ▼
┌─────────────────┐
│  File Type Check│ ──► pdf/tiff/jpg/png → OCR path
│                 │ ──► xlsx/xls/csv → Spreadsheet path
└─────────────────┘
    │
    ▼
┌─────────────────┐
│   OCR Service   │ ──► PyMuPDF (digital PDF)
│   (text extract)│ ──► Tesseract + OpenCV (scanned/images)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ LLM Extraction  │ ──► Gemini/OpenAI → structured JSON
│   (invoice info)│     Decimal for money, null for missing
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Validation     │ ──► Missing fields, numeric consistency,
│   Engine        │     duplicate detection, line item sums
└─────────────────┘
    │
    ▼
┌─────────────────┐
│   Persist       │ ──► PostgreSQL (documents, results, errors)
│   to DB         │ ──► pgvector (embeddings for search)
└─────────────────┘
```

## 6. Database Schema

### documents
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY DEFAULT gen_random_uuid() |
| filename | TEXT | NOT NULL |
| file_type | TEXT | NOT NULL (pdf, jpg, png, tiff, xlsx, csv) |
| status | VARCHAR(50) | DEFAULT 'uploaded' |
| page_count | INTEGER | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

### extracted_text
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY DEFAULT gen_random_uuid() |
| document_id | UUID | REFERENCES documents(id) |
| page_number | INTEGER | |
| text | TEXT | |
| ocr_confidence | FLOAT | |

### structured_results
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY DEFAULT gen_random_uuid() |
| document_id | UUID | REFERENCES documents(id) |
| invoice_number | TEXT | |
| invoice_date | DATE | |
| supplier_name | TEXT | |
| customer_name | TEXT | |
| subtotal | DECIMAL(19,2) | |
| tax | DECIMAL(19,2) | |
| total | DECIMAL(19,2) | |
| currency | VARCHAR(10) | DEFAULT 'USD' |
| line_items | JSONB | |
| confidence | FLOAT | |

### validation_errors
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY DEFAULT gen_random_uuid() |
| document_id | UUID | REFERENCES documents(id) |
| field_name | VARCHAR(100) | |
| error_type | VARCHAR(50) | (missing, inconsistency) |
| severity | VARCHAR(20) | (low, medium, high) |
| description | TEXT | |
| resolved | BOOLEAN | DEFAULT FALSE |

### document_embeddings
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY REFERENCES documents(id) |
| embedding | VECTOR(768) | |
| created_at | TIMESTAMP | DEFAULT NOW() |

### processing_history
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY DEFAULT gen_random_uuid() |
| document_id | UUID | REFERENCES documents(id) |
| step | VARCHAR(50) | (ocr, extraction, validation) |
| status | VARCHAR(20) | |
| started_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |
| error_details | JSONB | |

## 7. Technology Decisions

| Decision | Rationale |
|----------|-----------|
| FastAPI (backend) | Async-first, automatic OpenAPI docs, Python ecosystem |
| Celery/ARQ + Redis | Mature distributed task queue, retry semantics, widely supported |
| PostgreSQL + pgvector | ACID compliance, JSONB for flexible line items, vector search in same DB |
| PyMuPDF + Tesseract + OpenCV | Industry-standard OCR stack, free, supports PDF/images |
| pandas + openpyxl | Native Excel/CSV parsing, multi-sheet support |
| Gemini/OpenAI API | Structured JSON output, low temperature for determinism |
| Next.js + Tailwind | React framework, server-side rendering, rapid UI development |
| pytest | Python standard for unit/integration testing |

## 8. Concurrency & Performance

- **Background jobs**: OCR and LLM calls run asynchronously via Celery; API returns immediately with `job_id`.
- **Connection pooling**: PostgreSQL connections use `asyncpg` pool; connections closed in async context managers.
- **Multi-page PDFs**: Each page OCR'd independently; results concatenated.
- **File size**: Large PDFs (~1000 pages) processed page-by-page to avoid memory exhaustion.

## 9. Failure Handling

| Scenario | Behavior |
|----------|----------|
| Corrupted file | Job marked `failed`, error stored in `processing_history` |
| OCR failure | Returns empty text, confidence 0.0, validation flags missing fields |
| LLM parse failure | Returns null values, confidence 0.0 |
| Numeric inconsistency | Validation error `severity=high`, record flagged for review |
| Duplicate invoice | Validation error logged, not blocked (manual review) |

## 10. Security

- File uploads validated by extension and MIME type
- Files stored outside web root (`data/uploads/`)
- No secrets in code; API keys via environment variables
- CORS configured for frontend origin only

## 11. Monitoring & Observability

- Job status transitions logged in `processing_history`
- LLM prompts logged to `docs/ai-prompts.md` (date, model, temperature, prompt text)
- Processing time tracked per step (OCR, extraction, validation)
- Health endpoint `GET /health` returns system status