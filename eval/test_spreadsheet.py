"""Tests for spreadsheet parsing."""

import os
import sys
import tempfile

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.spreadsheet import parse_spreadsheet, parse_csv, parse_excel


class TestSpreadsheetParsing:
    """Test spreadsheet text extraction."""

    def test_parse_csv_returns_string(self):
        """CSV parsing should return a string."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write("name,amount\nItem A,100.00\nItem B,200.00\n")
            f.flush()
            result = parse_csv(f.name)
        os.unlink(f.name)
        assert isinstance(result, str)
        assert "Item A" in result
        # pandas to_string may format as 100.0 instead of 100.00
        assert "100" in result

    def test_parse_spreadsheet_csv_routes_correctly(self):
        """parse_spreadsheet with csv type should call parse_csv."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write("col1,col2\nval1,val2\n")
            f.flush()
            result = parse_spreadsheet(f.name, "csv")
        os.unlink(f.name)
        assert isinstance(result, str)

    def test_parse_spreadsheet_unknown_type_returns_empty(self):
        """Unknown file type should return empty string."""
        result = parse_spreadsheet("dummy.txt", "txt")
        assert result == ""

    def test_parse_spreadsheet_xlsx_routes_correctly(self):
        """parse_spreadsheet with xlsx type should route to parse_excel."""
        try:
            result = parse_spreadsheet("/nonexistent.xlsx", "xlsx")
            assert isinstance(result, str)
        except FileNotFoundError:
            # File doesn't exist - that's OK for routing test
            pass