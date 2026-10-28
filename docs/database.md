# Database Schema — docintel

Run these SQL commands against your PostgreSQL database (with pgvector extension enabled).

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- pdf, jpg, png, tiff, xlsx, csv
  status VARCHAR(50) DEFAULT 'uploaded',
  page_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Extracted text (per page or per document)
CREATE TABLE extracted_text (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER,
  text TEXT,
  ocr_confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Structured extraction results
CREATE TABLE structured_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  invoice_number TEXT,
  invoice_date DATE,
  supplier_name TEXT,
  customer_name TEXT,
  subtotal DECIMAL(19, 2),
  tax DECIMAL(19, 2),
  total DECIMAL(19, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  line_items JSONB DEFAULT '[]',
  confidence FLOAT DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Validation errors
CREATE TABLE validation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  field_name VARCHAR(100),
  error_type VARCHAR(50), -- missing, inconsistency, duplicate
  severity VARCHAR(20), -- low, medium, high
  description TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Vector embeddings for semantic search
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  embedding VECTOR(768), -- all-MiniLM-L6-v2 embedding dimension
  created_at TIMESTAMP DEFAULT NOW()
);

-- Processing history
CREATE TABLE processing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  step VARCHAR(50), -- ocr, extraction, validation, processing
  status VARCHAR(20),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_file_type ON documents(file_type);
CREATE INDEX idx_extracted_text_document ON extracted_text(document_id);
CREATE INDEX idx_structured_results_document ON structured_results(document_id);
CREATE INDEX idx_validation_errors_document ON validation_errors(document_id);
CREATE INDEX idx_validation_errors_resolved ON validation_errors(resolved);
CREATE INDEX idx_processing_history_document ON processing_history(document_id);

-- Vector search index (ivfflat for cosine distance)
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## Connection String

```
postgresql://postgres:postgres@localhost:5432/docintel
```

Set via `DATABASE_URL` environment variable.