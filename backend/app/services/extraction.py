"""AI extraction service using LLM (Gemini/OpenAI) for structured invoice data.

Extracts: invoice_number, invoice_date, supplier_name, customer_name,
subtotal, tax, total, currency, line_items, confidence.

Uses Decimal for monetary values. Never invents missing values (null + 0.0 confidence).
"""

from decimal import Decimal, InvalidOperation
from typing import Optional
import json
import os

# Try Gemini first, fall back to OpenAI
try:
    import google.generativeai as genai
    _GEMINI_AVAILABLE = True
except ImportError:
    _GEMINI_AVAILABLE = False

try:
    from openai import OpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False


from app.core.config import GEMINI_MODEL

def _get_llm_client():
    """Initialize and return an LLM client based on available API keys."""
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if _GEMINI_AVAILABLE and gemini_key:
        genai.configure(api_key=gemini_key)
        return ("gemini", genai.GenerativeModel(GEMINI_MODEL))

    if _OPENAI_AVAILABLE and openai_key:
        return ("openai", OpenAI(api_key=openai_key))

    return (None, None)


def _build_prompt(text: str) -> str:
    """Build the LLM prompt for invoice extraction.

    The prompt instructs the model to return valid JSON only,
    use null for missing fields, and never invent values.
    """
    return """
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
""" + text + """

JSON only:
"""


def _safe_decimal(value: Optional[str]) -> Optional[Decimal]:
    """Convert a string to Decimal, returning None on failure."""
    if value is None:
        return None
    try:
        return Decimal(str(value).replace(",", "").replace("$", "").strip())
    except (InvalidOperation, ValueError, TypeError):
        return None


def _parse_llm_response(response_text: str) -> dict:
    """Parse the LLM JSON response into a structured dict with Decimal money values."""
    # Clean up the response: remove markdown code fences if present
    cleaned = response_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "invoice_number": None,
            "invoice_date": None,
            "supplier_name": None,
            "customer_name": None,
            "subtotal": None,
            "tax": None,
            "total": None,
            "currency": None,
            "line_items": [],
            "confidence": 0.0,
        }

    # Ensure Decimal for monetary values
    if result.get("subtotal") is not None:
        result["subtotal"] = _safe_decimal(str(result["subtotal"]))
    if result.get("tax") is not None:
        result["tax"] = _safe_decimal(str(result["tax"]))
    if result.get("total") is not None:
        result["total"] = _safe_decimal(str(result["total"]))

    # Ensure line_items is a list
    if not isinstance(result.get("line_items"), list):
        result["line_items"] = []

    # Ensure confidence is a float
    try:
        result["confidence"] = float(result.get("confidence", 0.0))
    except (ValueError, TypeError):
        result["confidence"] = 0.0

    return result


def call_llm(prompt: str, model: str = "gemini-1.5-flash", temperature: float = 0) -> str:
    """Call the LLM API and return the raw response text.

    Tries Gemini first, then OpenAI. Raises RuntimeError if no client available.
    """
    client_type, client = _get_llm_client()

    if client_type == "gemini":
        response = client.generate_content(
            prompt,
            generation_config={"temperature": temperature},
        )
        return response.text

    if client_type == "openai":
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
        return response.choices[0].message.content or ""

    raise RuntimeError(
        "No LLM client available. Set GEMINI_API_KEY or OPENAI_API_KEY."
    )


def extract_invoice_info(text: str) -> dict:
    """Extract structured invoice data from raw text using an LLM.

    Args:
        text: Raw OCR or spreadsheet text.

    Returns:
        dict with keys: invoice_number, invoice_date, supplier_name,
        customer_name, subtotal (Decimal), tax (Decimal), total (Decimal),
        currency, line_items (list), confidence (float).

    Fail-closed: missing fields -> null, confidence -> 0.0.
    """
    if not text or not text.strip():
        return {
            "invoice_number": None,
            "invoice_date": None,
            "supplier_name": None,
            "customer_name": None,
            "subtotal": None,
            "tax": None,
            "total": None,
            "currency": None,
            "line_items": [],
            "confidence": 0.0,
        }

    prompt = _build_prompt(text)

    try:
        response_text = call_llm(prompt, model=GEMINI_MODEL, temperature=0)
    except Exception:
        return {
            "invoice_number": None,
            "invoice_date": None,
            "supplier_name": None,
            "customer_name": None,
            "subtotal": None,
            "tax": None,
            "total": None,
            "currency": None,
            "line_items": [],
            "confidence": 0.0,
        }

    return _parse_llm_response(response_text)