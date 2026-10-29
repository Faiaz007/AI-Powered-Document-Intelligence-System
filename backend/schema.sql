CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded',
    page_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extracted_text (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    ocr_confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS structured_results (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    invoice_number TEXT,
    invoice_date DATE,
    supplier_name TEXT,
    customer_name TEXT,
    subtotal NUMERIC(12,2),
    tax NUMERIC(12,2),
    total NUMERIC(12,2),
    currency TEXT DEFAULT 'USD',
    line_items JSONB DEFAULT '[]'::jsonb,
    confidence DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS validation_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    error_type TEXT,
    severity TEXT,
    description TEXT,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    embedding VECTOR(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    step TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_status
    ON documents(status);

CREATE INDEX IF NOT EXISTS idx_documents_file_type
    ON documents(file_type);

CREATE INDEX IF NOT EXISTS idx_extracted_text_document_id
    ON extracted_text(document_id);

CREATE INDEX IF NOT EXISTS idx_structured_results_document_id
    ON structured_results(document_id);

CREATE INDEX IF NOT EXISTS idx_validation_errors_document_id
    ON validation_errors(document_id);

CREATE INDEX IF NOT EXISTS idx_validation_errors_resolved
    ON validation_errors(resolved);

CREATE INDEX IF NOT EXISTS idx_processing_history_document_id
    ON processing_history(document_id);
