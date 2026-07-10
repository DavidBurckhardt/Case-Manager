# Generador de Expedientes

## Architecture

```
Browser ──HTTP+JWT──► API gateway (NestJS) ──NATS JetStream──► OCR worker (Python)
  (Next.js UI)            │  orquesta pipeline                    │ descarga por URL firmada
                          │  llama al LLM                         │ corre EasyOCR
                          ◄──────────── ocr.result ───────────────┘ publica texto
                          │
                          └─► Supabase (Postgres + Storage)
```

- **frontend** — Next.js. UI + Supabase Auth y lecturas. El upload de documentos y
  el estado de procesamiento ya van contra la API gateway.
- **backend/api** — NestJS. Único punto de entrada al backend: controllers, services,
  models. Sube a Storage, crea el expediente, publica jobs de OCR, consume los
  resultados, llama al LLM y enriquece el caso.
- **backend/ocr** — Python. Worker de OCR (EasyOCR). Consume `ocr.request` de NATS
  JetStream, hace OCR y publica `ocr.result`. Mantiene además `POST /ocr` HTTP legacy.
- **nats** — broker JetStream entre la API y el worker (durabilidad + reintentos).

## Project structure

```
.
├── frontend/            # Next.js app (UI + Supabase auth/reads)
├── backend/
│   ├── api/             # NestJS API gateway (entry point to the backend)
│   └── ocr/             # Python EasyOCR service (HTTP + NATS worker)
├── supabase/            # Supabase migrations & config
├── docker-compose.yml   # Orchestrates nats + ocr + api + frontend
├── .env.local           # Local secrets (gitignored, symlinked into frontend/)
├── .env.production       # Production secrets (gitignored, symlinked into frontend/)
└── .env.example          # Template for the env vars above
```

`.env.local` and `.env.production` live at the repo root as the single source of
truth (used directly by `docker-compose.yml`'s `env_file:`), and are symlinked
into `frontend/` because Next.js only loads `.env*` files from its own project
root.

## Getting started (local, no Docker)

```bash
cp .env.example .env.local   # fill in real values
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The API gateway (`backend/api/`) needs Node 20+:

```bash
cd backend/api
npm install
cp .env.example .env   # fill in real values
npm run start:dev      # port 3001
```

The OCR service (`backend/ocr/`) needs Python 3.11+ and a running NATS server:

```bash
cd backend/ocr
pip install -r requirements.txt
uvicorn main:app --reload --port 8001   # set NATS_ENABLED=false to skip the worker
```

## Getting started (Docker)

From the repo root:

```bash
docker compose --env-file .env.local up --build
```

This builds the `nats` (JetStream, ports 4222/8222), `ocr` (EasyOCR, port 8001),
`api` (NestJS, port 3001) and `frontend` (Next.js, port 3000) containers.

## Database (Supabase)

Supabase CLI commands (`supabase start`, `supabase db push`, etc.) can be run
from `frontend/` — the CLI walks up to find the `supabase/` folder at the repo
root — or via the `npm run db:*` / `npm run supabase:*` scripts in
[frontend/package.json](frontend/package.json).
