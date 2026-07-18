-- Procedural acts extracted by the LLM, consumed by the deadline engine.
-- Stored as JSONB on the case file (same pattern as important_dates / legal_claim).
-- Each element: { document_type, act_type, document_date, notification_date, description }

alter table public.case_files
  add column if not exists procedural_acts jsonb not null default '[]'::jsonb;

comment on column public.case_files.procedural_acts is
  'Procedural acts extracted from documents (LLM). Feeds the deadline engine. '
  'Array of { document_type, act_type, document_date, notification_date, description }.';
