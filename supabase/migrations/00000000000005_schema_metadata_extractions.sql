-- Metadata Extractions table
create table if not exists public.metadata_extractions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents(id) on delete cascade,
  extractor       text not null,
  extractor_version text,
  extraction_type text not null default 'full'
                    check (extraction_type in ('full', 'partial', 'reprocess')),
  status          text not null default 'pending'
                    check (status in ('pending', 'running', 'completed', 'failed')),
  error_message   text,
  raw_output      jsonb,
  extracted_data  jsonb not null default '{}',
  confidence_score numeric(5, 4)
                     check (confidence_score between 0 and 1),
  prompt_tokens   int,
  completion_tokens int,
  total_tokens    int,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.metadata_extractions is 'AI/OCR extraction results for uploaded documents.';

drop trigger if exists metadata_extractions_updated_at on public.metadata_extractions;
create trigger metadata_extractions_updated_at
  before update on public.metadata_extractions
  for each row execute function public.handle_updated_at();

alter table public.metadata_extractions enable row level security;

drop policy if exists "Users can view extractions of accessible documents" on public.metadata_extractions;
create policy "Users can view extractions of accessible documents"
  on public.metadata_extractions for select
  to authenticated
  using (
    exists (
      select 1
      from public.documents d
      join public.cases c on c.id = d.case_id
      where d.id = document_id
        and (
          c.created_by = auth.uid()
          or c.assigned_to = auth.uid()
          or exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.role = 'admin'
          )
        )
    )
  );

drop policy if exists "Service role can manage extractions" on public.metadata_extractions;
create policy "Service role can manage extractions"
  on public.metadata_extractions for all
  to service_role
  using (true)
  with check (true);

create index if not exists idx_extractions_document_id    on public.metadata_extractions (document_id);
create index if not exists idx_extractions_extractor      on public.metadata_extractions (extractor);
create index if not exists idx_extractions_status         on public.metadata_extractions (status);
create index if not exists idx_extractions_created_at     on public.metadata_extractions (created_at desc);
create index if not exists idx_extractions_extracted_data on public.metadata_extractions using gin (extracted_data);
