# ─────────────────────────────────────────────────────────────────────────────
# EasyOCR microservice
# Base: Python 3.11 slim — smaller than full, still has pip
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# System deps:
#   poppler-utils → pdf2image (PDF → images)
#   libgl1        → OpenCV used internally by EasyOCR
#   libglib2.0-0  → glib required by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils \
      libgl1 \
      libglib2.0-0 \
      curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install in layers so Docker caches each one — a timeout only restarts the failing layer.
# torch is ~800 MB and the most likely to time out, so it gets its own step.
RUN pip install --no-cache-dir --timeout 300 --retries 10 \
      torch torchvision --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir --timeout 300 --retries 10 \
      easyocr==1.7.1

RUN pip install --no-cache-dir --timeout 120 --retries 5 \
      fastapi==0.115.0 \
      "uvicorn[standard]==0.30.6" \
      pdf2image==1.17.0 \
      Pillow==10.4.0 \
      python-multipart==0.0.9 \
      numpy==1.26.4

# Pre-download EasyOCR models at build time so the container starts instantly.
# Models are saved to /root/.EasyOCR (default cache dir).
RUN python -c "import easyocr; easyocr.Reader(['es', 'en'], gpu=False, verbose=False)"

COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
