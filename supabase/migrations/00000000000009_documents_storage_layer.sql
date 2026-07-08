-- ─────────────────────────────────────────────────────────────────────────────
-- Extend case_file_documents with storage provenance, integrity, and versioning
-- ─────────────────────────────────────────────────────────────────────────────

-- Storage provenance
alter table public.case_file_documents
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 's3', 'r2', 'azure', 'gcs', 'minio')),
  add column if not exists storage_bucket   text not null default 'documents',
  add column if not exists storage_key      text,        -- canonical object key inside the bucket
  add column if not exists file_checksum    text;        -- SHA-256 hex digest of original file

-- Extend origin enum to match all planned ingestion sources
alter table public.case_file_documents
  drop constraint if exists case_file_documents_origin_check;

alter table public.case_file_documents
  add constraint case_file_documents_origin_check
  check (origin in ('MANUAL', 'EMAIL', 'PJN', 'SNEJ', 'SYSTEM', 'API', 'INTEGRATION'));

-- Future versioning fields (schema ready; logic not yet implemented)
alter table public.case_file_documents
  add column if not exists version_number          int  not null default 1,
  add column if not exists parent_document_id      uuid references public.case_file_documents(id) on delete set null,
  add column if not exists superseded_by_document_id uuid references public.case_file_documents(id) on delete set null;

comment on column public.case_file_documents.storage_provider      is 'Object storage backend used for this file.';
comment on column public.case_file_documents.storage_bucket        is 'Bucket / container name within the storage provider.';
comment on column public.case_file_documents.storage_key           is 'Canonical object key (path) inside the bucket. Immutable after write.';
comment on column public.case_file_documents.file_checksum         is 'SHA-256 hex digest of the original uploaded file for integrity verification.';
comment on column public.case_file_documents.version_number        is 'Monotonically increasing version counter within a document lineage.';
comment on column public.case_file_documents.parent_document_id    is 'Points to the previous version of this document. NULL for the initial upload.';
comment on column public.case_file_documents.superseded_by_document_id is 'Set when a newer version replaces this document.';

-- Backfill storage_key from storage_path for existing rows
update public.case_file_documents
set storage_key = storage_path
where storage_key is null;

-- Make storage_key NOT NULL now that existing rows are backfilled
alter table public.case_file_documents
  alter column storage_key set not null;

-- Enforce immutability: storage_key must be unique (no reuse of the same object path)
alter table public.case_file_documents
  drop constraint if exists uq_case_file_documents_storage_key;
alter table public.case_file_documents
  add constraint uq_case_file_documents_storage_key unique (storage_key);

-- Indexes for new columns
create index if not exists idx_cfd_storage_provider on public.case_file_documents (storage_provider);
create index if not exists idx_cfd_file_checksum    on public.case_file_documents (file_checksum) where file_checksum is not null;
create index if not exists idx_cfd_parent_doc       on public.case_file_documents (parent_document_id) where parent_document_id is not null;
create index if not exists idx_cfd_version          on public.case_file_documents (version_number);
