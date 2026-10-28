# docintel — Complete Learning Guide

**Build an AI-Powered Document Intelligence System from Scratch**

This guide teaches you the complete coding logic, syntax, theory, and step-by-step explanation of every part of docintel. It is designed for beginners who want to understand and build the system themselves.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Python Basics Refresher](#python-basics)
3. [Project Architecture](#architecture)
4. [Backend — FastAPI](#fastapi)
5. [Backend Services — OCR, Extraction, Validation](#services)
6. [Database — PostgreSQL + asyncpg](#database)
7. [Background Jobs — Celery + Redis](#celery)
8. [Frontend — Next.js + React](#frontend)
9. [Testing — pytest](#testing)
10. [How to Build It Yourself (Step by Step)](#build-yourself)
11. [Common Errors & Fixes](#errors)
12. [Glossary](#glossary)

---

<a name="project-overview"></a>
## 1. Project Overview

### What is docintel?

docintel is an AI-powered document intelligence system that automates invoice processing. It accepts PDF, JPG, PNG, TIFF, XLSX, XLS, and CSV files, extracts structured information using OCR and LLMs, validates results with rule-based checks, and makes data searchable through an API and web interface.

**What it does:**
- Accepts multiple document files at once
- Extracts text from digital PDFs, scanned PDFs, images, and spreadsheets
- Uses AI to extract invoice fields (number, date, supplier, customer, amounts, line items)
- Validates extracted data (missing fields, math consistency, duplicates)
- Stores results in PostgreSQL with vector search
- Provides a REST API and web frontend
- Runs slow operations (OCR, AI) in the background

---

<a name="python-basics"></a>
## 2. Python Basics Refresher

Before building docintel, understand these Python concepts:

### 2.1 Variables and Types

```python
# String
name = "docintel"

# Integer
port = 8000

# Float (NOT for money!)
price = 100.50

# Boolean
is_active = True

# List (ordered, mutable)
files = ["invoice.pdf", "receipt.jpg"]

# Dictionary (key-value pairs)
user = {"name": "Alice", "role": "admin"}

# Set (unique items)
allowed_types = {".pdf", ".jpg", ".png"}
```

### 2.2 Decimal for Money (CRITICAL RULE)

**Never use `float` for monetary values.** Floats have rounding errors.

```python
from decimal import Decimal

# ❌ Wrong - float rounding error
a = 0.1
b = 0.2
print(a + b)  # 0.30000000000000004

# ✅ Correct - Decimal is exact
subtotal = Decimal("100.00")
tax = Decimal("20.00")
total = subtotal + tax  # Exactly 120.00
print(total)  # 120.00
```

**Rule:** All monetary values (subtotal, tax, total) must use `Decimal`, never `float`.

### 2.3 Functions

```python
def greet(name: str) -> str:
    """Say hello to someone.
    
    Args:
        name: The person's name
    
    Returns:
        A greeting string
    """
    return "Hello, " + name

message = greet("Alice")
print(message)  # Hello, Alice
```

**Syntax breakdown:**
- `def` = define function
- `name: str` = parameter with type hint
- `-> str` = return type hint
- `"""..."""` = docstring (explains what function does)
- `return` = send value back to caller

### 2.4 If/Else Statements

```python
file_type = ".pdf"

if file_type == ".pdf":
    print("It's a PDF")
elif file_type == ".jpg":
    print("It's an image")
else:
    print("Unknown type")
```

### 2.5 For Loops

```python
files = ["a.pdf", "b.jpg", "c.png"]

for file in files:
    print(f"Processing: {file}")
```

`f"..."` is an f-string that embeds variables inside strings.

### 2.6 Try/Except (Error Handling)

```python
try:
    result = 10 / 0  # This will crash
except ZeroDivisionError:
    print("Cannot divide by zero")
except Exception as e:
    print(f"Some error: {e}")
```

**Theory:** `try` runs code that might fail. `except` catches the error so the program doesn't crash.

### 2.7 Async/Await

```python
import asyncio

async def fetch_data():
    await asyncio.sleep(1)  # Wait without blocking
    return "data"

result = asyncio.run(fetch_data())
```

**Theory:** `async def` defines a function that can pause. `await` pauses until something finishes without blocking other code.

---

<a name="architecture"></a>
## 3. Project Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User (Browser)                           │
└─────────────────────────────────────────────────────────────┘
                          │ HTTP/REST
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Backend (Port 8000)                │
│  Endpoints: /upload, /process, /results, /search            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (enqueue task)
┌─────────────────────────────────────────────────────────────┐
│              Celery + Redis (Background Jobs)               │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Worker (Python)                                │
│  OCR → AI Extraction → Validation → Save to DB              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          PostgreSQL + pgvector (Database)                   │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User uploads file → FastAPI receives → Saves to disk → Creates database record → Returns job ID immediately
2. FastAPI sends task to Redis → Celery worker picks up task → Processes document → Saves results
3. User polls `/api/process/{id}` to check status
4. User views results at `/api/results/{id}`

---

<a name="fastapi"></a>
## 4. Backend — FastAPI

### 4.1 What is an API?

API = Application Programming Interface. It's how two programs talk to each other over HTTP.

**Example:**
- Frontend sends: `POST /api/upload` with a file
- Backend responds: `{"job_id": "abc-123", "status": "uploaded"}`

### 4.2 Creating the FastAPI App

`backend/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="docintel", version="1.0.0")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

**Line by line:**

| Line | What it does |
|------|-------------|
| `from fastapi import FastAPI` | Import the FastAPI class |
| `app = FastAPI(...)` | Create the application object |
| `@app.get("/health")` | Map URL to function (decorator) |
| `async def health_check():` | Define async function |
| `return {"status": "healthy"}` | Return JSON response |

### 4.3 Running the Server

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

| Flag | Meaning |
|------|---------|
| `main:app` | Look in `main.py` for `app` object |
| `--reload` | Auto-restart when code changes |
| `--host 0.0.0.0` | Accept connections from any IP |
| `--port 8000` | Use port 8000 |

### 4.4 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Check if server is running |
| POST | `/api/upload` | Upload documents |
| GET | `/api/process/{id}` | Check processing status |
| GET | `/api/results/{id}` | Get extracted data |
| GET | `/api/search` | Search documents |
| POST | `/api/corrections` | Fix wrong values |
| POST | `/api/reprocess/{id}` | Retry failed job |

### 4.5 Pydantic Schemas

`backend/app/models/schemas.py`:

```python
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal

class ExtractionResult(BaseModel):
    invoice_number: Optional[str] = None
    subtotal: Optional[Decimal] = None
    total: Optional[Decimal] = None
    confidence: Optional[float] = 0.0
```

**Theory:** Pydantic models define what data should look like. FastAPI uses them to validate incoming data, convert types, and generate API documentation automatically.

**Easy Example:**
```python
# If someone sends: {"subtotal": "abc"}
# Pydantic rejects it because subtotal should be Decimal
# FastAPI returns 422 error automatically
```

---

<a name="services"></a>
## 5. Backend Services

Services contain business logic. Each service does ONE thing.

### 5.1 OCR Service (`ocr.py`)

OCR = Optical Character Recognition. It reads text from images.

**Theory:**
1. **Digital PDFs** have a text layer → extract directly with PyMuPDF
2. **Scanned PDFs/images** are pictures → need OCR (Tesseract)
3. **Poor quality images** need preprocessing (grayscale, blur, threshold)

**Code Example:**

```python
from PIL import Image
import cv2
import pytesseract

def extract_text_from_image(file_path: str) -> str:
    # Step 1: Open image
    image = Image.open(file_path)
    
    # Step 2: Preprocess (make it easier for OCR to read)
    processed = preprocess_image(image)
    
    # Step 3: Run Tesseract OCR
    text = pytesseract.image_to_string(processed, config="--psm 6 --oem 3")
    
    return text
```

**Preprocessing explained:**

| Step | What it does | Why |
|------|--------------|-----|
| Grayscale | Remove color | OCR works better on black/white |
| Gaussian Blur | Smooth noise | Remove small speckles |
| Otsu Threshold | Convert to pure black/white | Clear text edges |

**Easy Example:**
A scanned invoice that's yellowish and blurry:
- Yellow → Gray → Black/White
- Blurry speckles → Smoothed
- Faint text → Sharp black text on white
- Tesseract can now read it accurately

### 5.2 AI Extraction Service (`extraction.py`)

Uses an LLM (Gemini/OpenAI) to understand text and extract structured data.

**Theory:**
- OCR gives raw text (messy, unstructured)
- LLM reads text and figures out: "This is the invoice number", "This is the total"
- We ask LLM to return JSON (structured data)

**Code Example:**

```python
import json
from decimal import Decimal

def extract_invoice_info(text: str) -> dict:
    # Build the prompt
    prompt = """
    Extract these fields from the invoice text. Return JSON only.
    If a field cannot be found, use null. Do not invent values.
    
    Fields: invoice_number, invoice_date, supplier_name, customer_name,
    subtotal, tax, total, currency, line_items, confidence
    
    Text: """ + text + """
    
    JSON only:
    """
    
    # Call the LLM
    response = call_llm(prompt, model="gemini-1.5-flash", temperature=0)
    
    # Parse the JSON response
    result = json.loads(response)
    
    # Convert money to Decimal
    if result.get("subtotal"):
        result["subtotal"] = Decimal(str(result["subtotal"]))
    
    return result
```

**Key Concepts:**

| Concept | Explanation |
|---------|-------------|
| Prompt Engineering | Writing instructions that get good results from LLM |
| Temperature=0 | Makes LLM deterministic (same input = same output) |
| JSON Only | Force LLM to return structured data, not conversation |
| Null for Missing | If LLM can't find something, return `null`, not made-up value |
| Decimal for Money | Convert string "100.00" to Decimal("100.00") |

**Easy Example:**

Input text: `"Invoice #INV-2024-001 from Acme Corp. Total: $150.00"`

LLM Output:
```json
{
  "invoice_number": "INV-2024-001",
  "supplier_name": "Acme Corp",
  "total": "150.00",
  "confidence": 0.95
}
```

### 5.3 Validation Service (`validation.py`)

Checks extracted data for errors.

**Rules:**
1. **Missing fields:** Required fields must exist
2. **Math check:** subtotal + tax should equal total
3. **Line items check:** Sum of line items should equal total
4. **Duplicate check:** Same invoice number shouldn't appear twice

**Code Example:**

```python
from decimal import Decimal

def validate_invoice(data: dict) -> list:
    errors = []
    
    # Check missing fields
    required = ["invoice_number", "invoice_date", "supplier_name", "total"]
    for field in required:
        if not data.get(field):
            errors.append({
                "field": field,
                "type": "missing",
                "severity": "high",
                "message": f"{field} is required"
            })
    
    # Check math: subtotal + tax = total
    subtotal = data.get("subtotal")
    tax = data.get("tax")
    total = data.get("total")
    
    if subtotal and tax and total:
        expected = Decimal(str(subtotal)) + Decimal(str(tax))
        if Decimal(str(total)) != expected:
            errors.append({
                "field": "total",
                "type": "inconsistency",
                "severity": "high",
                "message": f"Subtotal ({subtotal}) + Tax ({tax}) = {expected}, but Total is {total}"
            })
    
    return errors
```

**Easy Example:**

| Input | Expected | Errors |
|-------|----------|--------|
| subtotal=100, tax=20, total=120 | ✅ Correct | None |
| subtotal=100, tax=20, total=150 | ❌ Wrong | "Subtotal (100) + Tax (20) = 120, but Total is 150" |
| subtotal=100, tax=20, total=None | ❌ Missing | "total is required" |

### 5.4 Spreadsheet Service (`spreadsheet.py`)

Parses Excel and CSV files.

```python
import pandas as pd

def parse_spreadsheet(file_path: str, file_type: str) -> str:
    if file_type == "csv":
        df = pd.read_csv(file_path)
    elif file_type in ("xlsx", "xls"):
        df = pd.read_excel(file_path, sheet_name=None)  # All sheets
    
    return df.to_string()  # Convert to text
```

**Theory:**
- pandas reads tabular data (rows and columns)
- `sheet_name=None` reads ALL sheets in an Excel file
- `.to_string()` converts the table to plain text for the LLM

---

<a name="database"></a>
## 6. Database — PostgreSQL + asyncpg

### 6.1 What is a Database?

A database stores data permanently. When you restart the server, the data is still there.

### 6.2 Tables in docintel

| Table | Purpose |
|-------|---------|
| `documents` | File metadata (name, type, status, upload time) |
| `extracted_text` | Raw text from OCR/spreadsheet |
| `structured_results` | Extracted invoice fields (subtotal, tax, total, etc.) |
| `validation_errors` | Errors found during validation |
| `document_embeddings` | Vector embeddings for semantic search |
| `processing_history` | Log of each processing step |

### 6.3 SQL Examples

```sql
-- Insert a new document
INSERT INTO documents (filename, file_type, status)
VALUES ('invoice.pdf', 'pdf', 'uploaded')
RETURNING id;

-- Get document by ID
SELECT * FROM documents WHERE id = 'abc-123';

-- Update status
UPDATE documents SET status = 'completed' WHERE id = 'abc-123';

-- Search documents
SELECT * FROM documents 
WHERE filename ILIKE '%invoice%';
```

### 6.4 asyncpg (Async Database Driver)

```python
import asyncpg

async def get_pool():
    pool = await asyncpg.create_pool(
        "postgresql://user:pass@localhost:5432/docintel",
        min_size=2,
        max_size=10
    )
    return pool

async def create_document(filename: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO documents (filename, status) VALUES ($1, 'uploaded') RETURNING id",
            filename
        )
        return row["id"]
```

**Concepts:**

| Concept | Explanation |
|---------|-------------|
| Connection Pool | Reuses database connections instead of creating new ones (faster) |
| `async with` | Automatically returns connection to pool when done |
| `fetchrow` | Returns one row from a query |
| `$1, $2` | Parameter placeholders (prevents SQL injection) |
| `RETURNING id` | Gets the ID of the newly inserted row |

**Easy Example:**

```python
# ❌ Bad - String concatenation (SQL injection risk!)
query = "SELECT * FROM documents WHERE id = '" + user_input + "'"

# ✅ Good - Parameterized query
query = "SELECT * FROM documents WHERE id = $1"
await conn.fetchrow(query, user_input)
```

---

<a name="celery"></a>
## 7. Background Jobs — Celery + Redis

### 7.1 Why Background Jobs?

OCR and AI extraction are slow (5-30 seconds per document). If we do them in the web request:
- The user's browser waits (bad experience)
- The server might timeout

**Solution:** Use Celery to process in the background.

**Flow:**
1. User uploads file → FastAPI saves file → FastAPI returns job ID immediately
2. FastAPI sends task to Redis (message queue)
3. Celery worker picks up task from Redis → processes document → saves results
4. User polls `/api/process/{id}` to check status

### 7.2 Celery Configuration

```python
from celery import Celery

celery_app = Celery(
    "docintel",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
    include=["app.workers.tasks"],
)
```

**Concepts:**

| Concept | Explanation |
|---------|-------------|
| Broker | Redis stores the task queue (messages waiting to be processed) |
| Backend | Redis stores task results (return values, status) |
| Include | Tells Celery where to find task functions |

### 7.3 Creating a Task

```python
@celery_app.task(bind=True, name="process_document")
def process_document_task(self, document_id: str, file_path: str, file_type: str):
    # 1. Update status to "processing"
    # 2. Extract text (OCR or spreadsheet)
    # 3. AI extraction (LLM)
    # 4. Validation
    # 5. Save results to database
    # 6. Update status to "completed"
    return {"status": "completed", "document_id": document_id}
```

**Theory:**
- `@celery_app.task` registers the function as a background task
- `bind=True` gives access to `self` (task instance for retries)
- The function runs in a separate worker process, not the web server

### 7.4 Sending a Task

```python
# In FastAPI route
celery_app.send_task(
    "app.workers.tasks.process_document_task",
    args=[str(document_id), str(file_path), file_type],
)
```

**Theory:** `send_task` puts the task in Redis. A worker picks it up and executes it.

---

<a name="frontend"></a>
## 8. Frontend — Next.js + React

### 8.1 What is React?

React is a JavaScript library for building user interfaces. It uses components (reusable UI pieces).

### 8.2 Components

**FileUploader.tsx:**

```tsx
import { useState } from 'react';

export default function FileUploader({ onFilesSelected }) {
  const [files, setFiles] = useState([]);
  
  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setFiles(files);
    onFilesSelected(files);
  };
  
  return (
    <div onDrop={handleDrop} onDragEnter={(e) => e.preventDefault()}>
      <p>Drop files here</p>
      <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />
    </div>
  );
}
```

**Concepts:**

| Concept | Explanation |
|---------|-------------|
| `useState` | Manages component state (re-renders when changed) |
| `onDrop` | Event handler for drag-and-drop |
| `e.preventDefault()` | Stops browser from opening dropped file |
| `Array.from()` | Converts FileList to array |

### 8.3 ProgressTracker

Polls the API every 2 seconds to check processing status:

```tsx
import { useEffect, useState } from 'react';

export default function ProgressTracker({ jobId }) {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/process/${jobId}`);
      const data = await res.json();
      setProgress(data.progress);
    };
    
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [jobId]);
  
  return <div>{progress}%</div>;
}
```

**Concepts:**

| Concept | Explanation |
|---------|-------------|
| `useEffect` | Runs side effects (API calls, timers) |
| `setInterval` | Runs code every X milliseconds |
| `clearInterval` | Stops the timer when component unmounts |
| `[jobId]` | Dependency array - re-run when jobId changes |

### 8.4 Displaying Results

```tsx
export default function ResultsTable({ data }) {
  if (!data) return null;
  
  return (
    <div>
      <p>Invoice Number: {data.invoice_number || "Not found"}</p>
      <p>Total: ${data.total?.toFixed(2) || "Not found"}</p>
      <p>Confidence: {Math.round(data.confidence * 100)}%</p>
    </div>
  );
}
```

**Concepts:**

| Concept | Explanation |
|---------|-------------|
| `data?.toFixed(2)` | Optional chaining (won't crash if data is null) |
| `|| "Not found"` | Default value if data is missing |
| `Math.round()` | Convert 0.95 to 95% |

### 8.5 Main Page (page.tsx)

```tsx
'use client';

import { useState } from 'react';
import FileUploader from '@/components/FileUploader';
import ProgressTracker from '@/components/ProgressTracker';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  
  const handleUpload = async () => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    
    setJobs(data.job_ids);
  };
  
  return (
    <div>
      <FileUploader onFilesSelected={setFiles} />
      {jobs.map(job => (
        <div key={job.id}>
          <span>{job.filename}</span>
          <ProgressTracker jobId={job.id} />
        </div>
      ))}
    </div>
  );
}
```

**Concepts:**

| Concept | Explanation |
|---------|-------------|
| `FormData` | Object for sending files via HTTP |
| `fetch()` | HTTP request to backend API |
| `@/components` | Path alias (configured in tsconfig.json) |
| `.map()` | Create JSX elements from array |

---

<a name="testing"></a>
## 9. Testing — pytest

### 9.1 Why Test?

Tests verify your code works. They catch bugs before users do.

### 9.2 Writing a Test

```python
# eval/test_validation.py

def test_validation_catches_math_error():
    """Test that subtotal + tax != total is flagged."""
    data = {
        "subtotal": Decimal("100.00"),
        "tax": Decimal("20.00"),
        "total": Decimal("150.00"),  # Wrong! Should be 120.00
    }
    
    errors = validate_invoice(data)
    
    assert len(errors) > 0  # At least one error
    assert errors[0]["error_type"] == "inconsistency"
```

**Breakdown:**

| Element | Meaning |
|---------|---------|
| `def test_...` | Function name must start with `test_` |
| `assert` | Checks if condition is True. If False, test fails. |
| `Decimal("100.00")` | Exact money value |
| `"`"..."` | Docstring explaining what test does |

### 9.3 Running Tests

```powershell
cd backend
pytest -v
```

**Output:**
```
test_validation.py::test_validation_catches_math_error PASSED
test_extraction.py::test_empty_text_returns_null PASSED
```

### 9.4 Test Types

| Test Type | What it tests | Example |
|-----------|---------------|---------|
| Unit | Single function | `validate_invoice()` returns errors |
| Integration | Multiple parts working | Upload → Process → Get Results |
| API | HTTP endpoints | `POST /api/upload` returns 200 |

---

<a name="build-yourself"></a>
## 10. How to Build It Yourself (Step by Step)

### Step 1: Setup Environment

```powershell
# Create project folder
mkdir docintel
cd docintel

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install basic packages
pip install fastapi uvicorn pydantic python-multipart

# Install Node.js (for frontend)
# Download from nodejs.org
```

### Step 2: Create the Basic API

`main.py`:
```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "docintel is running"}
```

Run it:
```powershell
uvicorn main:app --reload
```

Visit: `http://localhost:8000/docs`

### Step 3: Add File Upload

```python
from fastapi import UploadFile, File
from typing import List

@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    return {"filenames": [f.filename for f in files]}
```

### Step 4: Add OCR

```powershell
pip install pytesseract Pillow opencv-python pdf2image
```

`ocr.py`:
```python
from PIL import Image
import pytesseract

def extract_text(file_path: str) -> str:
    image = Image.open(file_path)
    text = pytesseract.image_to_string(image)
    return text
```

### Step 5: Add AI Extraction

```powershell
pip install google-generativeai
```

`extraction.py`:
```python
import google.generativeai as genai
import json

genai.configure(api_key="YOUR_API_KEY")
model = genai.GenerativeModel("gemini-1.5-flash")

def extract(text: str) -> dict:
    prompt = f"Extract invoice fields from: {text}. Return JSON only."
    response = model.generate_content(prompt)
    return json.loads(response.text)
```

### Step 6: Add Validation

`validation.py`:
```python
def validate(data: dict) -> list:
    errors = []
    if not data.get("total"):
        errors.append({"field": "total", "type": "missing"})
    return errors
```

### Step 7: Add Database

```powershell
pip install asyncpg
```

`database.py`:
```python
import asyncpg

async def save_document(filename: str):
    conn = await asyncpg.connect("postgresql://localhost/docintel")
    await conn.execute(
        "INSERT INTO documents (filename, status) VALUES ($1, 'uploaded')",
        filename
    )
    await conn.close()
```

### Step 8: Add Celery Background Jobs

```powershell
pip install celery redis
```

`celery_app.py`:
```python
from celery import Celery

celery_app = Celery("docintel", broker="redis://localhost:6379/0")
```

`tasks.py`:
```python
@celery_app.task
def process_document(document_id: str):
    # Your pipeline here
    return {"status": "done"}
```

### Step 9: Create Frontend

```powershell
cd ../frontend
npx create-next-app@latest .
npm install lucide-react tailwindcss
```

Create `src/app/page.tsx` with upload form and progress tracker.

### Step 10: Write Tests

```powershell
pip install pytest pytest-asyncio
```

`eval/test_validation.py`:
```python
def test_missing_total():
    errors = validate_invoice({"total": None})
    assert len(errors) > 0
```

Run:
```powershell
pytest -v
```

---

<a name="errors"></a>
## 11. Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `ModuleNotFoundError: No module named 'fastapi'` | Package not installed | `pip install fastapi` |
| `ConnectionRefusedError` | PostgreSQL/Redis not running | Start the services |
| `TesseractNotFoundError` | Tesseract OCR not installed | Install Tesseract OCR |
| `json.JSONDecodeError` | LLM returned invalid JSON | Add try/except, return nulls |
| Float rounding error | Using float for money | Use `Decimal` instead |
| SQL injection | String concatenation in SQL | Use parameterized queries ($1, $2) |

---

<a name="glossary"></a>
## 12. Glossary

| Term | Simple Definition |
|------|------------------|
| API | A way for programs to talk to each other over HTTP |
| Endpoint | A specific URL in your API (e.g., `/api/upload`) |
| OCR | Reading text from images |
| LLM | Large Language Model (AI that understands text) |
| JSON | A data format (like a Python dict) |
| Decimal | Exact number type for money |
| Celery | Background task queue |
| Redis | In-memory database used as message broker |
| pgvector | PostgreSQL extension for vector/semantic search |
| Pydantic | Data validation library for Python |
| JSX | HTML-like syntax in React |
| Hook | React function like `useState` or `useEffect` |
| Polling | Repeatedly asking "are you done yet?" |
| Fail-closed | When unsure, return null instead of guessing |

---

## Next Steps

1. **Read** each section slowly
2. **Type out** the code examples yourself (don't copy-paste)
3. **Run** each piece and see what happens
4. **Break** things on purpose to see error messages
5. **Build** one feature at a time (don't try to build everything at once)

**Recommended order:**
1. FastAPI "Hello World"
2. File upload endpoint
3. OCR text extraction
4. AI extraction (needs API key)
5. Validation rules
6. Database connection
7. Celery background jobs
8. React frontend
9. Tests

Good luck! You can build this. Start small and add features one at a time.