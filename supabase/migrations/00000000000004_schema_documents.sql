-- Documents table
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.cases(id) on delete cascade,
  uploaded_by     uuid not null references public.users(id) on delete restrict,
  file_name       text not null,
  file_path       text not null,
  file_size       bigint not null,
  mime_type       text not null,
  document_type   text,
  description     text,
  processing_status text not null default 'pending'
                      check (processing_status in (
                        'pending', 'processing', 'completed', 'failed'
                      )),
  uploaded_at     timestamptz not null default now(),
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.documents is 'Files uploaded and attached to legal cases.';

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.handle_updated_at();

alter table public.documents enable row level security;

drop policy if exists "Users can view documents of accessible cases" on public.documents;
create policy "Users can view documents of accessible cases"
  on public.documents for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_id
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

drop policy if exists "Users can upload documents to accessible cases" on public.documents;
create policy "Users can upload documents to accessible cases"
  on public.documents for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.cases c
      where c.id = case_id
        and (c.created_by = auth.uid() or c.assigned_to = auth.uid())
    )
  );

drop policy if exists "Uploaders and admins can update documents" on public.documents;
create policy "Uploaders and admins can update documents"
  on public.documents for update
  to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

drop policy if exists "Admins can delete documents" on public.documents;
create policy "Admins can delete documents"
  on public.documents for delete
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

create index if not exists idx_documents_case_id           on public.documents (case_id);
create index if not exists idx_documents_uploaded_by       on public.documents (uploaded_by);
create index if not exists idx_documents_document_type     on public.documents (document_type);
create index if not exists idx_documents_processing_status on public.documents (processing_status);
create index if not exists idx_documents_uploaded_at       on public.documents (uploaded_at desc);
create index if not exists idx_documents_created_at        on public.documents (created_at desc);
create index if not exists idx_documents_deleted_at        on public.documents (deleted_at) where deleted_at is null;
create index if not exists idx_documents_metadata          on public.documents using gin (metadata);
