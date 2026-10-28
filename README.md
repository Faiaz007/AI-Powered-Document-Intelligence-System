# docintel — AI Document Intelligence System

An AI-powered system for intelligent document processing and analysis. Automates invoice processing, extraction, validation, and search for PDF, image, Excel, and CSV files.

## Repository Layout

```
docintel/
  backend/          # FastAPI application + Python workers
  frontend/         # Next.js frontend
  docs/             # Documentation
  eval/             # Tests and evaluation
  data/             # Processed data (gitignored)
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Redis
- PostgreSQL + pgvector
- Tesseract OCR

### Backend Setup

```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install dependencies
cd backend
pip install -r requirements.txt

# Start Redis
redis-server --daemonize yes

# Start PostgreSQL (ensure pgvector extension is enabled)

# Create database
createdb docintel
psql -d docintel -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run database schema (see docs/database.md)

# Start backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start Celery worker (separate terminal)
celery -A app.workers.celery_app worker --loglevel=info
```

### Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` for the frontend.

### Run Tests

```powershell
cd backend
pytest -q
```

### Run Evaluation

```powershell
cd backend
python -m eval.run_evaluation
```

## Documentation

- `docs/system-design.md` — Architecture and design decisions
- `docs/step-by-step-explanation.md` — Code walkthrough and logic
- `docs/code-documentation.md` — API reference for all modules
- `docs/database.md` — Database schema
- `docs/setup.md` — Detailed setup instructions
- `docs/ai-prompts.md` — LLM prompt log

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/upload | Upload documents |
| GET | /api/process/{id} | Check processing status |
| GET | /api/results/{id} | Get extraction results |
| GET | /api/search | Search documents |
| POST | /api/corrections | Submit manual corrections |
| POST | /api/reprocess/{id} | Reprocess failed job |
| GET | /api/health | Health check |

## Rules

1. **Decimal for money** — Never use float for monetary values
2. **Never invent values** — Missing fields → null + 0.0 confidence
3. **Type hints everywhere**
4. **Small modules** — Single responsibility, <100 lines
5. **Every feature needs tests**
6. **Log every prompt** to `docs/ai-prompts.md`
7. **Background processing** via Celery/ARQ
8. **Fail-closed** — Uncertain → null

## License

MIT