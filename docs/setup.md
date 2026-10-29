# Setup Instructions — docintel

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.10+ | Backend runtime |
| Node.js | 18+ | Frontend runtime |
| Redis | 7+ | Celery broker |
| PostgreSQL | 14+ | Database |
| pgvector | 0.5+ | Vector search extension |
| Tesseract OCR | 5+ | OCR engine |
| Poppler | 22+ | PDF to image conversion |

## Installation

### 1. Clone the repository

```powershell
git clone https://github.com/your-org/docintel.git
cd docintel
```

### 2. Backend

```powershell
cd backend

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Install Tesseract OCR (Windows)
# Download from: https://github.com/UB-Mannheim/tesseract/wiki
# Add tesseract to PATH

# Install Poppler (Windows)
# Download from: https://github.com/oschwartz10612/poppler-windows/releases/
# Add poppler/bin to PATH
```

### 3. Database

```powershell
# Install PostgreSQL
# Create database and extension
createdb docintel
psql -d docintel -f docs/database.sql
```

### 4. Redis

```powershell
# Windows (using WSL or Docker)
docker run -d -p 6379:6379 redis:alpine

# Or install Redis natively
redis-server --daemonize yes
```

### 5. Frontend

```powershell
cd ../frontend
npm install
```

### 6. Environment Variables

Create `.env` in the backend directory:

```env
DATABASE_URL=postgresql://postgres@localhost:5434/docintel
REDIS_URL=redis://localhost:6379/0
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
UPLOAD_DIR=data/uploads
```

## Running the System

### Terminal 1: Backend API

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal 2: Celery Worker

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
celery -A app.workers.celery_app worker --loglevel=info
```

### Terminal 3: Frontend

```powershell
cd frontend
npm run dev
```

### Access

- Frontend: `http://localhost:3000`
- API Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/health`

## Running Tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -v
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tesseract not found | Install Tesseract OCR and add to PATH |
| Poppler not found | Install Poppler and add bin to PATH |
| Connection refused | Ensure Redis and PostgreSQL are running |
| Module not found | Run `pip install -r requirements.txt` |
| Port already in use | Change port or kill existing process |