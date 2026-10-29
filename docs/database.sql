-- docintel Database Migration
-- Run against PostgreSQL with pgvector extension enabled.
-- Usage: psql -U postgres -d docintel -f docs/database.sql

-- 1. Enable pgvector extension (required for semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Documents table — core file metadata
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'uploaded',
  page_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Extracted text — raw OCR / spreadsheet text per document page
CREATE TABLE IF NOT EXISTS extracted_text (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER,
  text TEXT,
  ocr_confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Structured extraction results — LLM-extracted invoice fields
CREATE TABLE IF NOT EXISTS structured_results (
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

-- 5. Validation errors — rule-based validation findings
CREATE TABLE IF NOT EXISTS validation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  field_name VARCHAR(100),
  error_type VARCHAR(50),
  severity VARCHAR(20),
  description TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Document embeddings — vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  embedding VECTOR(768),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Processing history — log of each background processing step
CREATE TABLE IF NOT EXISTS processing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  step VARCHAR(50),
  status VARCHAR(20),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_extracted_text_document ON extracted_text(document_id);
CREATE INDEX IF NOT EXISTS idx_structured_results_document ON structured_results(document_id);
CREATE INDEX IF NOT EXISTS idx_validation_errors_document ON validation_errors(document_id);
CREATE INDEX IF NOT EXISTS idx_validation_errors_resolved ON validation_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_processing_history_document ON processing_history(document_id);

-- 9. Vector search index (ivfflat for cosine distance)
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Migration complete.
SELECT 'docintel database migration applied successfully.' AS message;
