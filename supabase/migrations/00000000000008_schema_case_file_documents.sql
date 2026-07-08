-- Case File Documents
create table if not exists public.case_file_documents (
  id                  uuid primary key default gen_random_uuid(),
  case_file_id        uuid not null references public.case_files(id) on delete cascade,
  original_filename   text not null,
  file_extension      text not null,
  file_size           bigint not null,
  mime_type           text not null,
  storage_path        text not null unique,
  origin              text not null default 'MANUAL'
                        check (origin in ('MANUAL', 'EMAIL', 'API', 'INTEGRATION')),
  processing_status   text not null default 'UPLOADED'
                        check (processing_status in (
                          'UPLOADED', 'PROCESSING', 'REVIEW_REQUIRED', 'PROCESSED', 'FAILED'
                        )),
  uploaded_by         uuid not null references public.users(id) on delete restrict,
  uploaded_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  deleted_by          uuid references public.users(id) on delete set null
);

comment on table public.case_file_documents is 'Document metadata for files attached to case files.';

drop trigger if exists case_file_documents_updated_at on public.case_file_documents;
create trigger case_file_documents_updated_at
  before update on public.case_file_documents
  for each row execute function public.handle_updated_at();

alter table public.case_file_documents enable row level security;

drop policy if exists "Case members can view documents" on public.case_file_documents;
create policy "Case members can view documents"
  on public.case_file_documents for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.case_files cf
      where cf.id = case_file_id
        and cf.deleted_at is null
        and (
          cf.created_by              = auth.uid()
          or cf.responsible_attorney_id = auth.uid()
          or exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.role = 'admin'
          )
        )
    )
  );

drop policy if exists "Case members can upload documents" on public.case_file_documents;
create policy "Case members can upload documents"
  on public.case_file_documents for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.case_files cf
      where cf.id = case_file_id
        and cf.deleted_at is null
        and (
          cf.created_by              = auth.uid()
          or cf.responsible_attorney_id = auth.uid()
        )
    )
  );

drop policy if exists "Admins can update document status" on public.case_file_documents;
create policy "Admins can update document status"
  on public.case_file_documents for update
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

drop policy if exists "Service role has full document access" on public.case_file_documents;
create policy "Service role has full document access"
  on public.case_file_documents for all
  to service_role
  using (true)
  with check (true);

create index if not exists idx_cfd_case_file_id       on public.case_file_documents (case_file_id)        where deleted_at is null;
create index if not exists idx_cfd_uploaded_by        on public.case_file_documents (uploaded_by);
create index if not exists idx_cfd_processing_status  on public.case_file_documents (processing_status)   where deleted_at is null;
create index if not exists idx_cfd_origin             on public.case_file_documents (origin);
create index if not exists idx_cfd_file_extension     on public.case_file_documents (file_extension);
create index if not exists idx_cfd_uploaded_at        on public.case_file_documents (uploaded_at desc);
create index if not exists idx_cfd_deleted_at         on public.case_file_documents (deleted_at)          where deleted_at is null;
