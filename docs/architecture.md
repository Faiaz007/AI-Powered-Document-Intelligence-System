# Architecture — docintel

## Overview

docintel follows a monorepo architecture with three main layers: frontend (Next.js), backend (FastAPI), and background workers (Celery + Redis). Data is stored in PostgreSQL with pgvector for semantic search.

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Next.js Browser)                 │
└─────────────────────────────────────────────────────────────┘
                          │ HTTP/REST
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (FastAPI)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  /upload │ │ /process │ │  /results│ │  /search │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (enqueue task)
┌─────────────────────────────────────────────────────────────┐
│                  Task Queue (Celery + Redis)                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               Background Worker (Python)                    │
│  OCR → Extraction → Validation → Persistence → Embedding    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL + pgvector)               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. User uploads files via Next.js frontend
2. FastAPI receives files, saves to disk, creates DB record, enqueues Celery task
3. Celery worker extracts text (OCR/spreadsheet), calls LLM for extraction, runs validation
4. Results stored in PostgreSQL, embeddings in pgvector
5. Frontend polls for status, displays results, allows corrections and search

## Key Design Decisions

- **Async processing**: OCR and LLM calls are slow; they run in background via Celery
- **Decimal for money**: Prevents floating-point rounding errors in financial calculations
- **Fail-closed**: Missing fields → null, never hallucinated
- **Monorepo**: All code in one repo for easier coordination
- **PostgreSQL + pgvector**: Single database for both relational data and vector search