# Generador de Expedientes

## Project structure

```
.
├── frontend/           # Next.js app (UI, API routes, server actions)
├── backend/            # Python FastAPI OCR microservice (EasyOCR)
├── supabase/            # Supabase migrations & config
├── docker-compose.yml   # Orchestrates frontend + ocr containers
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

The OCR service (`backend/`) needs Python 3.11+:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## Getting started (Docker)

From the repo root:

```bash
docker compose --env-file .env.local up --build
```

This builds both the `frontend` (Next.js, port 3000) and `ocr` (EasyOCR, port
8001) containers.

## Database (Supabase)

Supabase CLI commands (`supabase start`, `supabase db push`, etc.) can be run
from `frontend/` — the CLI walks up to find the `supabase/` folder at the repo
root — or via the `npm run db:*` / `npm run supabase:*` scripts in
[frontend/package.json](frontend/package.json).
