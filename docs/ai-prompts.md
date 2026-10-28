# AI Prompts — docintel

This file logs all LLM prompts used in the docintel system, per AGENTS.md rule #6.

## Prompt: Extract invoice information

- **Date**: 2026-10-28
- **Model**: gemini-1.5-flash
- **Purpose**: Structured information extraction from OCR/spreadsheet text
- **Temperature**: 0
- **Prompt length**: ~700 characters

```
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
{TEXT}

JSON only:
```

## Usage

This prompt is called from `backend/app/services/extraction.py` via the `_build_prompt()` function. The response is parsed by `_parse_llm_response()` which converts monetary values to `Decimal` and ensures fail-closed behavior (null for missing fields).

## Adding New Prompts

When adding a new LLM call:
1. Add the prompt to this file with date, model, purpose, temperature, and length
2. Log the full prompt text in a code block
3. Update AGENTS.md if new rules are needed