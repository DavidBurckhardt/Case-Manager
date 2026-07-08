-- ─────────────────────────────────────────────────────────────────────────────
-- Inbox documents: allow case_file_documents without an associated case.
--
-- Documents uploaded via drag & drop land in the "inbox" (case_file_id = NULL).
-- The processing pipeline (OCR → metadata extraction → case generation) fills
-- in case_file_id once a case is created or matched.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the NOT NULL constraint on case_file_id
alter table public.case_file_documents
  alter column case_file_id drop not null;

-- 2. Drop the existing FK so we can re-add it as deferrable (nullable FK)
--    The FK name may differ; drop by introspection.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.case_file_documents'::regclass
    and contype = 'f'
    and conname ilike '%case_file_id%';
  if cname is not null then
    execute format(
      'alter table public.case_file_documents drop constraint %I', cname
    );
  end if;
end$$;

alter table public.case_file_documents
  add constraint case_file_documents_case_file_id_fkey
  foreign key (case_file_id)
  references public.case_files(id)
  on delete cascade
  deferrable initially deferred;

-- 3. Update RLS policies to handle both inbox (null) and case-attached docs.

-- SELECT: own inbox docs OR case-member docs
drop policy if exists "Case members can view documents" on public.case_file_documents;
create policy "Case members can view documents"
  on public.case_file_documents for select
  to authenticated
  using (
    deleted_at is null
    and (
      -- Inbox: doc belongs to the authenticated user, no case yet
      (case_file_id is null and uploaded_by = auth.uid())
      or
      -- Case-attached: user is a member of the parent case
      (
        case_file_id is not null
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
      )
    )
  );

-- INSERT: authenticated users can insert into inbox (no case required)
drop policy if exists "Case members can upload documents" on public.case_file_documents;
create policy "Users can upload documents"
  on public.case_file_documents for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      -- Inbox upload — no case association required
      case_file_id is null
      or
      -- Direct case upload — must be a case member
      exists (
        select 1 from public.case_files cf
        where cf.id = case_file_id
          and cf.deleted_at is null
          and (
            cf.created_by              = auth.uid()
            or cf.responsible_attorney_id = auth.uid()
          )
      )
    )
  );

-- UPDATE: service role advances processing status (policy unchanged)
-- The existing "Service role has full document access" policy covers this.

-- 4. Index for inbox queries (case_file_id IS NULL)
create index if not exists idx_cfd_inbox
  on public.case_file_documents (uploaded_by, uploaded_at desc)
  where case_file_id is null and deleted_at is null;
