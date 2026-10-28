"""Tests for validation rules."""

import os
import sys
from decimal import Decimal

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.validation import validate_invoice


class TestValidationMissingFields:
    """Test detection of missing required fields."""

    def test_missing_total_is_error(self):
        """Missing total should generate a high-severity missing error."""
        data = {
            "invoice_number": "INV-001",
            "invoice_date": "2024-01-15",
            "supplier_name": "Acme Corp",
            "total": None,
        }
        errors = validate_invoice(data)
        assert len(errors) > 0
        assert any(e["error_type"] == "missing" and e["field_name"] == "total" for e in errors)
        assert any(e["severity"] == "high" for e in errors)

    def test_missing_invoice_number_is_error(self):
        """Missing invoice_number should generate an error."""
        data = {
            "invoice_date": "2024-01-15",
            "supplier_name": "Acme Corp",
            "total": Decimal("100.00"),
        }
        errors = validate_invoice(data)
        assert any(e["field_name"] == "invoice_number" for e in errors)

    def test_all_required_fields_present_no_missing_errors(self):
        """All required fields present should not generate missing errors."""
        data = {
            "invoice_number": "INV-001",
            "invoice_date": "2024-01-15",
            "supplier_name": "Acme Corp",
            "total": Decimal("100.00"),
        }
        errors = validate_invoice(data)
        missing_errors = [e for e in errors if e["error_type"] == "missing"]
        assert len(missing_errors) == 0


class TestValidationNumericConsistency:
    """Test detection of numeric inconsistencies."""

    def test_subtotal_plus_tax_equals_total_no_error(self):
        """Valid math should not generate inconsistency errors."""
        data = {
            "invoice_number": "INV-001",
            "subtotal": Decimal("100.00"),
            "tax": Decimal("20.00"),
            "total": Decimal("120.00"),
        }
        errors = validate_invoice(data)
        inconsistency_errors = [e for e in errors if e["error_type"] == "inconsistency"]
        assert len(inconsistency_errors) == 0

    def test_subtotal_plus_tax_not_equal_total_is_error(self):
        """Invalid math should generate high-severity inconsistency error."""
        data = {
            "invoice_number": "INV-001",
            "subtotal": Decimal("100.00"),
            "tax": Decimal("20.00"),
            "total": Decimal("150.01"),  # Wrong! Should be 120.00
        }
        errors = validate_invoice(data)
        assert len(errors) > 0
        assert any(
            e["error_type"] == "inconsistency" and e["severity"] == "high"
            for e in errors
        )

    def test_decimal_arithmetic_exact(self):
        """Decimal arithmetic should be exact, no float rounding."""
        data = {
            "subtotal": Decimal("0.10"),
            "tax": Decimal("0.20"),
            "total": Decimal("0.30"),
        }
        errors = validate_invoice(data)
        inconsistency_errors = [e for e in errors if e["error_type"] == "inconsistency"]
        assert len(inconsistency_errors) == 0


class TestValidationLineItems:
    """Test line items sum validation."""

    def test_line_items_sum_equals_total_no_error(self):
        """Line items summing to total should not generate errors."""
        data = {
            "invoice_number": "INV-001",
            "total": Decimal("100.00"),
            "line_items": [
                {"description": "Item A", "amount": Decimal("60.00")},
                {"description": "Item B", "amount": Decimal("40.00")},
            ],
        }
        errors = validate_invoice(data)
        item_errors = [e for e in errors if e["field_name"] == "line_items"]
        assert len(item_errors) == 0

    def test_line_items_sum_not_equal_total_is_error(self):
        """Line items not summing to total should generate medium-severity error."""
        data = {
            "invoice_number": "INV-001",
            "total": Decimal("100.00"),
            "line_items": [
                {"description": "Item A", "amount": Decimal("30.00")},
                {"description": "Item B", "amount": Decimal("30.00")},
            ],  # Sum = 60, not 100
        }
        errors = validate_invoice(data)
        assert any(
            e["field_name"] == "line_items" and e["error_type"] == "inconsistency"
            for e in errors
        )


class TestValidationErrorStructure:
    """Test that validation errors have correct structure."""

    def test_error_has_required_keys(self):
        """Each error should have field_name, error_type, severity, description."""
        data = {"total": None}
        errors = validate_invoice(data)
        assert len(errors) > 0
        for e in errors:
            assert "field_name" in e
            assert "error_type" in e
            assert "severity" in e
            assert "description" in e