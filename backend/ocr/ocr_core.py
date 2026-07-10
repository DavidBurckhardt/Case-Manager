"""
Core OCR logic — shared by the HTTP endpoint (main.py) and the NATS worker (worker.py).

EasyOCR is lazy-loaded on first use so importing this module stays cheap.
"""
from __future__ import annotations

import io
import logging
import os
import time
from typing import Optional

import easyocr
import numpy as np
from pdf2image import convert_from_bytes
from PIL import Image

OCR_DEBUG = os.environ.get("OCR_DEBUG", "").lower() in ("1", "true", "yes")

logger = logging.getLogger("ocr-service.core")

# EasyOCR reader is expensive to build (~seconds + model load) — keep a singleton.
_reader: Optional[easyocr.Reader] = None


def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        logger.info("Loading EasyOCR model (first use)…")
        start = time.monotonic()
        _reader = easyocr.Reader(["es", "en"], gpu=False, verbose=False)
        logger.info(f"EasyOCR ready in {(time.monotonic() - start):.1f}s")
    return _reader


def image_to_text(image: Image.Image) -> str:
    """Run EasyOCR on a single PIL image and return concatenated text."""
    reader = get_reader()
    arr = np.array(image)
    results = reader.readtext(arr, detail=0, paragraph=True)
    return "\n".join(results)


class UnsupportedFileType(Exception):
    """Raised when the file MIME/extension is not something we can OCR."""


def run_ocr(content: bytes, mime: str, filename: str) -> tuple[str, int]:
    """
    Extract text from raw file bytes.

    Returns (full_text, page_count).
    Raises UnsupportedFileType for unknown types and ValueError for decode failures.
    """
    mime = mime or ""
    filename = filename or ""

    if not content:
        raise ValueError("Empty file.")

    # ── PDF ──────────────────────────────────────────────────────────────────
    if "pdf" in mime or filename.lower().endswith(".pdf"):
        start = time.monotonic()
        try:
            images = convert_from_bytes(content, dpi=200, fmt="jpeg")
        except Exception as exc:
            raise ValueError(f"PDF conversion failed: {exc}") from exc
        logger.info(f"[ocr] PDF → {len(images)} page(s) in {(time.monotonic() - start):.1f}s")

        page_texts: list[str] = []
        for i, img in enumerate(images):
            page_start = time.monotonic()
            text = image_to_text(img)
            elapsed = time.monotonic() - page_start
            page_texts.append(text)
            logger.info(
                f"[ocr] page {i + 1}/{len(images)} — {elapsed:.1f}s "
                f"({len(text.split())} words, {len(text)} chars)"
            )

        full_text = "\n\n--- PAGE BREAK ---\n\n".join(page_texts)
        return full_text, len(images)

    # ── Image ─────────────────────────────────────────────────────────────────
    if any(t in mime for t in ("image/jpeg", "image/png", "image/webp")) or \
            filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        try:
            img = Image.open(io.BytesIO(content)).convert("RGB")
        except Exception as exc:
            raise ValueError(f"Image decode failed: {exc}") from exc
        start = time.monotonic()
        full_text = image_to_text(img)
        logger.info(f"[ocr] image OCR'd in {(time.monotonic() - start):.1f}s ({len(full_text.split())} words)")
        return full_text, 1

    raise UnsupportedFileType(f"Unsupported file type: {mime or filename}")
