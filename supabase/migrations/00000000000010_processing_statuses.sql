-- ─────────────────────────────────────────────────────────────────────────────
-- Processing Status Expansion
-- Replaces the generic PROCESSING/PROCESSED/FAILED pipeline with granular
-- stage-level statuses that map 1-to-1 with backend processing steps.
--
-- Old values → new values:
--   PROCESSING      → OCR_IN_PROGRESS
--   REVIEW_REQUIRED → METADATA_EXTRACTION
--   PROCESSED       → COMPLETED
--   FAILED          → ERROR
--   UPLOADED        → UPLOADED (unchanged)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the old check constraint (name from migration 00000000000008)
alter table public.case_file_documents
  drop constraint if exists case_file_documents_processing_status_check;

-- Also drop constraint added in migration 00000000000009 (storage layer) if it exists
-- (Supabase may have auto-named it differently; cover both patterns)
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.case_file_documents'::regclass
    and contype = 'c'
    and conname ilike '%processing_status%';
  if cname is not null then
    execute format('alter table public.case_file_documents drop constraint %I', cname);
  end if;
end$$;

-- 2. Migrate existing rows to the new value set
update public.case_file_documents
set processing_status = case processing_status
  when 'PROCESSING'      then 'OCR_IN_PROGRESS'
  when 'REVIEW_REQUIRED' then 'METADATA_EXTRACTION'
  when 'PROCESSED'       then 'COMPLETED'
  when 'FAILED'          then 'ERROR'
  else processing_status   -- UPLOADED stays
end;

-- 3. Add new check constraint with the expanded value set
alter table public.case_file_documents
  add constraint case_file_documents_processing_status_check
  check (processing_status in (
    'UPLOADED',
    'OCR_IN_PROGRESS',
    'METADATA_EXTRACTION',
    'CASE_GENERATION',
    'COMPLETED',
    'ERROR'
  ));

-- 4. Add error detail columns
alter table public.case_file_documents
  add column if not exists processing_error       text,
  add column if not exists processing_error_stage text,
  add column if not exists processing_stage_updated_at timestamptz not null default now();

comment on column public.case_file_documents.processing_error is 'Human-readable error message when processing_status = ERROR.';
comment on column public.case_file_documents.processing_error_stage is 'The pipeline stage where the error occurred (e.g. OCR_IN_PROGRESS).';
comment on column public.case_file_documents.processing_stage_updated_at is 'Timestamp of the most recent processing_status transition.';

-- 5. Keep the index current (processing_status is already indexed)
-- Re-create it in case the old one was created on a different set of values
drop index if exists idx_cfd_processing_status;
create index idx_cfd_processing_status on public.case_file_documents (processing_status)
  where deleted_at is null;
