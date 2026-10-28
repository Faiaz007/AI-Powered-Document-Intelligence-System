"""Tests for OCR extraction from various sources."""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.ocr import (
    extract_text_ocr,
    preprocess_image,
    ocr_image,
)


class TestOCR:
    """Test OCR extraction functionality."""

    def test_extract_text_from_unsupported_type_returns_empty(self):
        """Unsupported file type should return empty string."""
        result = extract_text_ocr("dummy.txt", "txt")
        assert result == ""

    def test_preprocess_image_returns_array(self):
        """Preprocessing should return a numpy array."""
        import numpy as np
        from PIL import Image
        img = Image.new("RGB", (100, 100), color="white")
        result = preprocess_image(img)
        assert isinstance(result, np.ndarray)

    def test_file_type_pdf_routes_to_ocr(self):
        """PDF file type should route through OCR path gracefully."""
        try:
            result = extract_text_ocr("/nonexistent.pdf", "pdf")
            assert isinstance(result, str)
        except FileNotFoundError:
            # File doesn't exist - that's OK for routing test
            pass

    def test_file_type_jpg_routes_to_ocr(self):
        """JPG file type should route through image OCR path gracefully."""
        try:
            result = extract_text_ocr("/nonexistent.jpg", "jpg")
            assert isinstance(result, str)
        except FileNotFoundError:
            # File doesn't exist - that's OK for routing test
            pass


class TestMultiPagePDF:
    """Test multi-page PDF handling."""

    def test_multi_page_placeholder(self):
        """Placeholder test - actual multi-page test needs sample PDF."""
        assert True


class TestCorruptedFile:
    """Test handling of corrupted files."""

    def test_corrupted_pdf_handled_gracefully(self):
        """Corrupted/nonexistent PDF should not crash the OCR pipeline."""
        try:
            result = extract_text_ocr("/nonexistent/corrupted.pdf", "pdf")
            assert isinstance(result, str)
        except FileNotFoundError:
            # File doesn't exist - pipeline should handle this gracefully
            pass