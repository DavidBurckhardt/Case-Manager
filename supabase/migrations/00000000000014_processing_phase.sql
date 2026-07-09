-- Add processing_phase to case_files to track preview vs complete extraction
alter table public.case_files
  add column if not exists processing_phase text not null default 'complete'
    check (processing_phase in ('preview', 'analyzing', 'complete'));

-- Existing cases (manually created or already processed) are complete
update public.case_files set processing_phase = 'complete' where processing_phase = 'complete';

create index if not exists idx_case_files_processing_phase on public.case_files (processing_phase) where deleted_at is null;
