-- ─────────────────────────────────────────────────────────────────────────────
-- Remove OCR vestiges
--
-- The OCR step was removed: raw PDFs/images now go straight to the LLM (one
-- extract job per case). This drops the leftovers from the old OCR pipeline:
--   1. the 'OCR_IN_PROGRESS' processing_status value (backend never sets it)
--   2. the case_file_documents.ocr_text column (never written anymore)
--   3. the increment_phase2_progress() RPC (used only by the old per-document
--      ocr.result aggregation, which no longer exists)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Migrate any straggler rows off OCR_IN_PROGRESS before tightening the check.
--    METADATA_EXTRACTION is the nearest still-valid "in progress" stage.
update public.case_file_documents
set processing_status = 'METADATA_EXTRACTION'
where processing_status = 'OCR_IN_PROGRESS';

-- 2. Re-create the check constraint without OCR_IN_PROGRESS.
alter table public.case_file_documents
  drop constraint if exists case_file_documents_processing_status_check;

alter table public.case_file_documents
  add constraint case_file_documents_processing_status_check
  check (processing_status in (
    'UPLOADED',
    'METADATA_EXTRACTION',
    'CASE_GENERATION',
    'COMPLETED',
    'ERROR'
  ));

comment on column public.case_file_documents.processing_error_stage is 'The pipeline stage where the error occurred (e.g. CASE_GENERATION).';

-- 3. Drop the unused OCR text column.
alter table public.case_file_documents
  drop column if exists ocr_text;

-- 4. Drop the unused progress RPC.
drop function if exists public.increment_phase2_progress(uuid);
