-- Track Phase 2 (OCR+LLM) progress per case so the UI can show "1/3 analyzed"
alter table public.case_files
  add column if not exists phase2_docs_total     int not null default 0,
  add column if not exists phase2_docs_completed int not null default 0;
