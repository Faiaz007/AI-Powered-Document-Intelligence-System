"""Spreadsheet parser for XLSX, XLS, and CSV files.

Reads all sheets from Excel files and all rows from CSV files,
converting to plain text for downstream LLM extraction.
"""

from typing import Optional
import pandas as pd


def parse_csv(file_path: str) -> str:
    """Parse a CSV file into text."""
    df = pd.read_csv(file_path)
    return df.to_string(index=False)


def parse_excel(file_path: str) -> str:
    """Parse an XLSX or XLS file, reading ALL sheets."""
    excel_file = pd.ExcelFile(file_path)
    parts = []
    for sheet_name in excel_file.sheet_names:
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        parts.append(f"=== Sheet: {sheet_name} ===")
        parts.append(df.to_string(index=False))
        parts.append("")
    return "\n".join(parts)


def parse_spreadsheet(file_path: str, file_type: str) -> str:
    """Main entry point for spreadsheet text extraction.

    Args:
        file_path: Absolute path to the spreadsheet file.
        file_type: One of 'xlsx', 'xls', 'csv'.

    Returns:
        Combined text from all sheets/rows.
    """
    file_type = file_type.lower()

    if file_type == "csv":
        return parse_csv(file_path)

    if file_type in ("xlsx", "xls"):
        return parse_excel(file_path)

    return ""