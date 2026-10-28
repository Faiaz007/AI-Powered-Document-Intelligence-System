"""OCR service for extracting text from PDFs and images.

Supports:
- Digital PDFs via PyMuPDF (text layer extraction)
- Scanned PDFs/images via Tesseract + OpenCV preprocessing
- Multi-page PDFs processed page-by-page
- Poor image quality handled with grayscale, blur, Otsu thresholding
"""

import os
from typing import Optional
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
import pytesseract
from pdf2image import convert_from_path

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


def extract_text_pymupdf(file_path: str) -> str:
    """Extract text from a digital PDF using PyMuPDF.

    Falls back to empty string if the PDF has no text layer
    (scanned document), in which case the caller should use OCR.
    """
    if fitz is None:
        return ""

    doc = fitz.open(file_path)
    texts = []
    for page in doc:
        texts.append(page.get_text())
    doc.close()
    return "\n".join(texts)


def preprocess_image(image: Image.Image) -> np.ndarray:
    """Apply OpenCV preprocessing to improve OCR accuracy on poor-quality images.

    Steps:
    1. Convert to grayscale
    2. Gaussian blur to reduce noise
    3. Otsu thresholding for binarization
    """
    img_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(
        blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )
    return binary


def ocr_image(image: Image.Image) -> str:
    """Run Tesseract OCR on a single PIL image with preprocessing."""
    binary = preprocess_image(image)
    pil_binary = Image.fromarray(binary)
    text = pytesseract.image_to_string(
        pil_binary,
        config="--psm 6 --oem 3",
    )
    return text


def extract_text_from_pdf_ocr(file_path: str) -> str:
    """Extract text from a scanned PDF by converting pages to images and OCR.

    Each page is rendered at 300 DPI for quality, then preprocessed and OCR'd.
    """
    images = convert_from_path(file_path, dpi=300)
    texts = []
    for image in images:
        page_text = ocr_image(image)
        texts.append(page_text)
    return "\n".join(texts)


def extract_text_from_image(file_path: str) -> str:
    """Extract text from a single image file (JPG, PNG, TIFF)."""
    image = Image.open(file_path)
    return ocr_image(image)


def extract_text_ocr(file_path: str, file_type: str) -> str:
    """Main entry point for OCR text extraction.

    Args:
        file_path: Absolute path to the document file.
        file_type: One of 'pdf', 'jpg', 'png', 'tiff'.

    Returns:
        Extracted text string (may be empty if no text found or file missing).
    """
    file_type = file_type.lower()

    if not os.path.exists(file_path):
        return ""

    if file_type == "pdf":
        # Try digital text extraction first (PyMuPDF)
        try:
            digital_text = extract_text_pymupdf(file_path)
        except Exception:
            digital_text = ""
        if digital_text.strip():
            return digital_text
        # Fall back to OCR for scanned PDFs
        try:
            return extract_text_from_pdf_ocr(file_path)
        except Exception:
            return ""

    if file_type in ("jpg", "png", "tiff"):
        try:
            return extract_text_from_image(file_path)
        except Exception:
            return ""

    return ""