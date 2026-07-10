"""
NATS JetStream OCR worker.

Consumes `ocr.request`, downloads the file from a signed URL, runs OCR, and
publishes the extracted text to `ocr.result`. Runs as a background task inside
the FastAPI process (see main.py).

Message contracts
-----------------
ocr.request : { jobId, caseId, documentId, filename, mime, downloadUrl }
ocr.result  : { jobId, caseId, documentId, ok, text?, pages?, error? }
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

import httpx
import nats
import nats.errors
from nats.js.api import ConsumerConfig, RetentionPolicy, StreamConfig

from ocr_core import UnsupportedFileType, run_ocr

logger = logging.getLogger("ocr-service.worker")

NATS_URL = os.environ.get("NATS_URL", "nats://nats:4222")

JOBS_STREAM = "OCR_JOBS"
JOBS_SUBJECT = "ocr.request"
RESULTS_STREAM = "OCR_RESULTS"
RESULTS_SUBJECT = "ocr.result"
DURABLE = "ocr-workers"

# OCR of a large PDF can take minutes — give the message plenty of ack time and
# reset the timer with in_progress() before we start the CPU-bound work.
ACK_WAIT_SECONDS = 20 * 60
MAX_DELIVER = 3
DOWNLOAD_TIMEOUT = 120


async def _ensure_streams(js) -> None:
    """Create the JetStream streams if they don't exist yet (idempotent)."""
    for name, subject, retention in (
        (JOBS_STREAM, JOBS_SUBJECT, RetentionPolicy.WORK_QUEUE),
        (RESULTS_STREAM, RESULTS_SUBJECT, RetentionPolicy.LIMITS),
    ):
        try:
            await js.add_stream(StreamConfig(name=name, subjects=[subject], retention=retention))
            logger.info(f"[worker] stream ready — {name} ({subject})")
        except Exception as exc:  # already exists / concurrent create
            logger.debug(f"[worker] add_stream {name}: {exc}")


async def _publish_result(js, payload: dict) -> None:
    await js.publish(RESULTS_SUBJECT, json.dumps(payload).encode())


async def _handle_message(js, msg) -> None:
    try:
        job = json.loads(msg.data.decode())
    except Exception:
        logger.exception("[worker] undecodable message — dropping")
        await msg.term()
        return

    job_id = job.get("jobId")
    document_id = job.get("documentId")
    case_id = job.get("caseId")
    filename = job.get("filename") or ""
    mime = job.get("mime") or ""
    url = job.get("downloadUrl")

    logger.info(f"[worker] job {job_id} — documentId={document_id} filename=\"{filename}\"")

    # Reset the ack timer before the long CPU-bound OCR pass.
    await msg.in_progress()

    try:
        if not url:
            raise ValueError("Missing downloadUrl")

        async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.content

        full_text, pages = await asyncio.to_thread(run_ocr, content, mime, filename)

        await _publish_result(js, {
            "jobId": job_id,
            "caseId": case_id,
            "documentId": document_id,
            "ok": True,
            "text": full_text,
            "pages": pages,
        })
        await msg.ack()
        logger.info(f"[worker] job {job_id} ✓ — pages={pages} words={len(full_text.split())}")

    except (UnsupportedFileType, ValueError) as exc:
        # Permanent failure — don't redeliver, report the error downstream.
        logger.error(f"[worker] job {job_id} permanent failure: {exc}")
        await _publish_result(js, {
            "jobId": job_id, "caseId": case_id, "documentId": document_id,
            "ok": False, "error": str(exc),
        })
        await msg.term()

    except Exception as exc:
        # Transient failure (download error, etc.) — nak for redelivery.
        logger.exception(f"[worker] job {job_id} transient failure: {exc}")
        await msg.nak()


async def run_worker() -> None:
    """Connect to NATS and consume OCR jobs forever, reconnecting on failure."""
    while True:
        try:
            nc = await nats.connect(
                servers=[NATS_URL],
                reconnect_time_wait=2,
                max_reconnect_attempts=-1,
                name="ocr-worker",
            )
            logger.info(f"[worker] connected to NATS at {NATS_URL}")
            js = nc.jetstream()
            await _ensure_streams(js)

            sub = await js.pull_subscribe(
                JOBS_SUBJECT,
                durable=DURABLE,
                config=ConsumerConfig(ack_wait=ACK_WAIT_SECONDS, max_deliver=MAX_DELIVER),
            )

            while True:
                try:
                    msgs = await sub.fetch(1, timeout=5)
                except (nats.errors.TimeoutError, asyncio.TimeoutError):
                    continue
                for msg in msgs:
                    await _handle_message(js, msg)

        except asyncio.CancelledError:
            logger.info("[worker] shutdown requested")
            raise
        except Exception as exc:
            logger.exception(f"[worker] connection loop error, retrying in 3s: {exc}")
            await asyncio.sleep(3)
