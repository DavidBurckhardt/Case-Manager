"""
OCR microservice.

Two ways in:
  • HTTP  POST /ocr   multipart file → { text, pages, word_count }   (legacy / direct)
  • NATS  ocr.request → runs OCR → publishes ocr.result               (event-driven)

The NATS worker is launched as a background asyncio task on startup, so this
stays a single process / single container with an unchanged /health probe.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ocr_core import OCR_DEBUG, UnsupportedFileType, run_ocr
from worker import run_worker

logging.basicConfig(
    level=logging.DEBUG if OCR_DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ocr-service")

# Set NATS_ENABLED=false to run OCR as an HTTP-only service (no broker needed).
NATS_ENABLED = os.environ.get("NATS_ENABLED", "true").lower() in ("1", "true", "yes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker_task: asyncio.Task | None = None
    if NATS_ENABLED:
        logger.info("Starting NATS OCR worker…")
        worker_task = asyncio.create_task(run_worker())
    else:
        logger.info("NATS_ENABLED=false — HTTP-only mode, worker not started")
    try:
        yield
    finally:
        if worker_task:
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="OCR Service", version="2.0.0", lifespan=lifespan)


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


class OCRResult(BaseModel):
    text: str
    pages: int
    word_count: int


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr", response_model=OCRResult)
async def ocr_file(file: UploadFile = File(...)):
    content = await file.read()
    mime = file.content_type or ""
    filename = file.filename or ""

    logger.info(f"[ocr] HTTP request — filename=\"{filename}\" mime=\"{mime}\" size={len(content)} bytes")

    try:
        # OCR is CPU-bound; run it off the event loop so /health stays responsive.
        full_text, pages = await asyncio.to_thread(run_ocr, content, mime, filename)
    except UnsupportedFileType as exc:
        raise HTTPException(status_code=415, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    word_count = len(full_text.split())
    logger.info(f"[ocr] HTTP done — filename=\"{filename}\" pages={pages} words={word_count}")
    return OCRResult(text=full_text, pages=pages, word_count=word_count)
