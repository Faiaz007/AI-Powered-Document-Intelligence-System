-- ============================================================================
-- docintel Database Schema
-- Run this script in pgAdmin Query Tool after creating the database
-- ============================================================================

-- Step 1: Enable pgvector extension (required for semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Documents table - stores file metadata
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- pdf, jpg, png, tiff, xlsx, csv
  status VARCHAR(50) DEFAULT 'uploaded', -- uploaded, processing, completed, failed
  page_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 3: Extracted text table - stores OCR/spreadsheet text per page
CREATE TABLE extracted_text (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER,
  text TEXT,
  ocr_confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Step 4: Structured results table - stores AI extracted invoice fields
CREATE TABLE structured_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  invoice_number TEXT,
  invoice_date DATE,
  supplier_name TEXT,
  customer_name TEXT,
  subtotal DECIMAL(19, 2), -- Money: exact decimal, never float
  tax DECIMAL(19, 2),
  total DECIMAL(19, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  line_items JSONB DEFAULT '[]', -- Array of line items stored as JSON
  confidence FLOAT DEFAULT 0.0, -- 0.0 to 1.0
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 5: Validation errors table - stores rule-based validation issues
CREATE TABLE validation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  field_name VARCHAR(100), -- Which field has the error
  error_type VARCHAR(50), -- missing, inconsistency, duplicate
  severity VARCHAR(20), -- low, medium, high
  description TEXT,
  resolved BOOLEAN DEFAULT FALSE, -- Set to TRUE after manual correction
  created_at TIMESTAMP DEFAULT NOW()
);

-- Step 6: Vector embeddings table - for semantic search
CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  embedding VECTOR(768), -- all-MiniLM-L6-v2 produces 768-dimensional vectors
  created_at TIMESTAMP DEFAULT NOW()
);

-- Step 7: Processing history table - logs each step of the pipeline
CREATE TABLE processing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  step VARCHAR(50), -- ocr, extraction, validation, processing
  status VARCHAR(20), -- started, completed, failed
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_details JSONB, -- Stores error info if step failed
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Indexes for common queries (improves performance)
-- ============================================================================

CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_file_type ON documents(file_type);
CREATE INDEX idx_documents_created_at ON documents(created_at);

CREATE INDEX idx_extracted_text_document ON extracted_text(document_id);
CREATE INDEX idx_extracted_text_page ON extracted_text(page_number);

CREATE INDEX idx_structured_results_document ON structured_results(document_id);
CREATE INDEX idx_structured_results_invoice_number ON structured_results(invoice_number);

CREATE INDEX idx_validation_errors_document ON validation_errors(document_id);
CREATE INDEX idx_validation_errors_resolved ON validation_errors(resolved);
CREATE INDEX idx_validation_errors_severity ON validation_errors(severity);

CREATE INDEX idx_processing_history_document ON processing_history(document_id);
CREATE INDEX idx_processing_history_step ON processing_history(step);

-- Vector search index (ivfflat for cosine distance - good for semantic search)
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- Verification queries (run these to confirm everything is set up)
-- ============================================================================

-- List all tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check document count (should be 0 initially)
SELECT count(*) FROM documents;