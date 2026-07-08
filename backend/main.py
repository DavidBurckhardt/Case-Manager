"""
EasyOCR microservice — extracts text from PDF and image files.

Endpoints:
  POST /ocr   multipart file → { text, pages, word_count }
  GET  /health
"""
from __future__ import annotations

import io
import logging
import os
import tempfile
import time
from typing import Optional

import easyocr
import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pdf2image import convert_from_bytes
from PIL import Image
from pydantic import BaseModel

OCR_DEBUG = os.environ.get("OCR_DEBUG", "").lower() in ("1", "true", "yes")

logging.basicConfig(
    level=logging.DEBUG if OCR_DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ocr-service")

if OCR_DEBUG:
    logger.debug("OCR_DEBUG mode enabled — extracted text will be logged per page")

app = FastAPI(title="OCR Service", version="1.0.0")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    logger.info(f"→ {request.method} {request.url.path}")
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.monotonic() - start) * 1000
        logger.exception(f"✗ {request.method} {request.url.path} unhandled error after {duration_ms:.0f}ms")
        raise
    duration_ms = (time.monotonic() - start) * 1000
    logger.info(f"← {request.method} {request.url.path} {response.status_code} in {duration_ms:.0f}ms")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Initialize EasyOCR with Spanish + English (lazy-loaded on first request)
_reader: Optional[easyocr.Reader] = None

def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        logger.info("Loading EasyOCR model (first request)…")
        start = time.monotonic()
        _reader = easyocr.Reader(
            ["es", "en"],
            gpu=False,   # set True if CUDA is available
            verbose=False,
        )
        logger.info(f"EasyOCR ready in {(time.monotonic() - start):.1f}s")
    return _reader


class OCRResult(BaseModel):
    text: str
    pages: int
    word_count: int


def image_to_text(image: Image.Image) -> str:
    """Run EasyOCR on a single PIL image and return concatenated text."""
    reader = get_reader()
    t0 = time.monotonic()
    arr = np.array(image)
    t1 = time.monotonic()
    results = reader.readtext(arr, detail=0, paragraph=True)
    t2 = time.monotonic()
    if OCR_DEBUG:
        logger.debug(
            f"[ocr] image_to_text — array_convert={((t1-t0)*1000):.0f}ms "
            f"readtext={((t2-t1)*1000):.0f}ms "
            f"regions={len(results)} chars={sum(len(r) for r in results)}"
        )
    return "\n".join(results)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr", response_model=OCRResult)
async def ocr_file(file: UploadFile = File(...)):
    content = await file.read()
    mime = file.content_type or ""
    filename = file.filename or ""

    logger.info(f"[ocr] request received — filename=\"{filename}\" mime=\"{mime}\" size={len(content)} bytes")

    if not content:
        logger.error(f"[ocr] rejected — empty file — filename=\"{filename}\"")
        raise HTTPException(status_code=400, detail="Empty file.")

    # ── PDF ──────────────────────────────────────────────────────────────────
    if "pdf" in mime or filename.lower().endswith(".pdf"):
        start = time.monotonic()
        try:
            images = convert_from_bytes(content, dpi=200, fmt="jpeg")
        except Exception as exc:
            logger.exception(f"[ocr] PDF conversion failed — filename=\"{filename}\"")
            raise HTTPException(status_code=422, detail=f"PDF conversion failed: {exc}")
        logger.info(f"[ocr] PDF converted to {len(images)} page(s) in {(time.monotonic() - start):.1f}s")

        page_texts: list[str] = []
        page_times: list[float] = []
        for i, img in enumerate(images):
            page_start = time.monotonic()
            text = image_to_text(img)
            elapsed = time.monotonic() - page_start
            page_times.append(elapsed)
            page_texts.append(text)
            logger.info(
                f"[ocr] page {i + 1}/{len(images)} — {elapsed:.1f}s "
                f"({len(text.split())} words, {len(text)} chars)"
            )
            if OCR_DEBUG:
                preview = text[:500].replace("\n", "↵")
                logger.debug(f"[ocr] page {i + 1} text preview: {preview!r}")

        total_ocr = sum(page_times)
        avg_ocr = total_ocr / len(page_times) if page_times else 0
        logger.info(
            f"[ocr] all pages done — total_ocr={total_ocr:.1f}s avg_per_page={avg_ocr:.1f}s "
            f"slowest_page={max(page_times):.1f}s fastest_page={min(page_times):.1f}s"
        )

        full_text = "\n\n--- PAGE BREAK ---\n\n".join(page_texts)
        pages = len(images)

    # ── Image ─────────────────────────────────────────────────────────────────
    elif any(t in mime for t in ("image/jpeg", "image/png", "image/webp")):
        try:
            img = Image.open(io.BytesIO(content)).convert("RGB")
        except Exception as exc:
            logger.exception(f"[ocr] image decode failed — filename=\"{filename}\"")
            raise HTTPException(status_code=422, detail=f"Image decode failed: {exc}")
        start = time.monotonic()
        full_text = image_to_text(img)
        elapsed = time.monotonic() - start
        logger.info(f"[ocr] image OCR'd in {elapsed:.1f}s ({len(full_text.split())} words)")
        if OCR_DEBUG:
            preview = full_text[:500].replace("\n", "↵")
            logger.debug(f"[ocr] image text preview: {preview!r}")
        pages = 1

    else:
        logger.error(f"[ocr] rejected — unsupported type — filename=\"{filename}\" mime=\"{mime}\"")
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {mime or filename}",
        )

    word_count = len(full_text.split())
    logger.info(f"[ocr] done — filename=\"{filename}\" pages={pages} words={word_count} chars={len(full_text)}")
    if OCR_DEBUG:
        logger.debug(f"[ocr] FULL EXTRACTED TEXT for \"{filename}\":\n{'='*60}\n{full_text}\n{'='*60}")
    return OCRResult(text=full_text, pages=pages, word_count=word_count)
