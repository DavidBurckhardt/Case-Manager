# Generador de Expedientes

## Architecture

```
Browser ──HTTP+JWT──► API gateway (NestJS) ──► LLM (Responses API)
  (Next.js UI)            │  sube a Storage           envía los PDF/imágenes en crudo
                          │  encola extract.request   (sin OCR) y devuelve JSON
                          │  (NATS JetStream, cola     ▲
                          │   durable auto-consumida) ─┘
                          └─► Supabase (Postgres + Storage)
```

Los documentos van **directo al LLM** (sin paso de OCR): la extracción es una sola
llamada por expediente con todos sus archivos, para que el modelo pueda cruzar
información entre ellos.

- **frontend** — Next.js. UI + Supabase Auth y lecturas. El upload de documentos y
  el estado de procesamiento van contra la API gateway.
- **backend/api** — NestJS. Único punto de entrada al backend. Sube a Storage, crea
  el expediente, encola un job de extracción, lo consume, descarga los documentos,
  se los pasa en crudo al LLM y enriquece el caso.
- **nats** — JetStream como cola de trabajo durable. La API publica y consume el job
  de extracción (uploads no bloqueantes + reintentos si la API se reinicia).

## Project structure

```
.
├── frontend/            # Next.js app (UI + Supabase auth/reads)
├── backend/
│   └── api/             # NestJS API gateway (entry point + LLM extraction)
├── supabase/            # Supabase migrations & config
├── docker-compose.yml   # Orchestrates nats + api + frontend
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

The API needs a running NATS server (JetStream) for its extraction queue. With
Docker Compose this is provided automatically; standalone, run one locally
(`nats-server -js`) and point `NATS_URL` at it.

## Getting started (Docker)

From the repo root:

```bash
docker compose --env-file .env.local up --build
```

This builds the `nats` (JetStream, ports 4222/8222), `api` (NestJS, port 3001)
and `frontend` (Next.js, port 3000) containers.

## Database (Supabase)

Supabase CLI commands (`supabase start`, `supabase db push`, etc.) can be run
from `frontend/` — the CLI walks up to find the `supabase/` folder at the repo
root — or via the `npm run db:*` / `npm run supabase:*` scripts in
[frontend/package.json](frontend/package.json).
