"""Tests for AI information extraction."""

import os
import sys
from decimal import Decimal

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.extraction import (
    extract_invoice_info,
    _safe_decimal,
    _parse_llm_response,
)


class TestExtractionNullHandling:
    """Test that extraction never invents values - missing fields get null."""

    def test_empty_text_returns_all_null(self):
        """Empty text should return all null values with 0.0 confidence."""
        result = extract_invoice_info("")
        assert result["invoice_number"] is None
        assert result["invoice_date"] is None
        assert result["supplier_name"] is None
        assert result["customer_name"] is None
        assert result["subtotal"] is None
        assert result["tax"] is None
        assert result["total"] is None
        assert result["confidence"] == 0.0

    def test_whitespace_text_returns_all_null(self):
        """Whitespace-only text should return all null values."""
        result = extract_invoice_info("   \n\n   ")
        assert result["invoice_number"] is None
        assert result["confidence"] == 0.0

    def test_confidence_is_float_between_0_and_1(self):
        """Confidence should always be a float between 0.0 and 1.0."""
        result = extract_invoice_info("Invoice #123 from Acme Corp total $100.00")
        assert isinstance(result["confidence"], float)
        assert 0.0 <= result["confidence"] <= 1.0


class TestDecimalMoney:
    """Test that monetary values use Decimal, never float."""

    def test_safe_decimal_converts_string(self):
        """_safe_decimal should convert valid strings to Decimal."""
        result = _safe_decimal("100.00")
        assert isinstance(result, Decimal)
        assert result == Decimal("100.00")

    def test_safe_decimal_handles_currency_symbols(self):
        """_safe_decimal should strip currency symbols and commas."""
        result = _safe_decimal("$1,234.56")
        assert result == Decimal("1234.56")

    def test_safe_decimal_returns_none_on_invalid(self):
        """_safe_decimal should return None for invalid input."""
        assert _safe_decimal("abc") is None
        assert _safe_decimal(None) is None


class TestLLMResponseParsing:
    """Test parsing of LLM JSON responses."""

    def test_parse_valid_json(self):
        """Valid JSON should be parsed correctly."""
        response = '{"invoice_number": "INV-001", "total": "100.00", "confidence": 0.95}'
        result = _parse_llm_response(response)
        assert result["invoice_number"] == "INV-001"
        assert result["total"] == Decimal("100.00")
        assert result["confidence"] == 0.95

    def test_parse_json_with_markdown_fences(self):
        """JSON wrapped in markdown code fences should be cleaned."""
        response = '```json\n{"invoice_number": "INV-002"}\n```'
        result = _parse_llm_response(response)
        assert result["invoice_number"] == "INV-002"

    def test_parse_invalid_json_returns_nulls(self):
        """Invalid JSON should return all-null result."""
        response = "not json at all"
        result = _parse_llm_response(response)
        assert result["invoice_number"] is None
        assert result["confidence"] == 0.0

    def test_line_items_defaults_to_empty_list(self):
        """Missing line_items should default to empty list."""
        response = '{"invoice_number": "INV-003"}'
        result = _parse_llm_response(response)
        assert result["line_items"] == []