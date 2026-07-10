-- Event-driven pipeline support.
--
-- 1. Persist per-document OCR text so the API can aggregate a batch across
--    independent ocr.result messages (durable, survives an API restart).
alter table public.case_file_documents
  add column if not exists ocr_text text;

-- 2. Atomic "increment progress and tell me the new totals" used by the API
--    when an ocr.result arrives. A single UPDATE...RETURNING is atomic, so only
--    the message that brings completed up to total sees completed = total and
--    triggers the LLM extraction exactly once (no race between messages).
create or replace function public.increment_phase2_progress(p_case_id uuid)
returns table (completed int, total int)
language sql
as $$
  update public.case_files
     set phase2_docs_completed = phase2_docs_completed + 1
   where id = p_case_id
  returning phase2_docs_completed, phase2_docs_total;
$$;
