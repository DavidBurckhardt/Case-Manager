-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: infinite recursion in RLS policies checking for the 'admin' role.
--
-- Every "admin can also access this row" policy inlined
--   exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
-- Because that subquery selects from public.users, Postgres must evaluate
-- public.users' own RLS policies to plan it — including "Admins can view all
-- users", which contains the same subquery. The query rewriter detects this
-- self-reference and raises "infinite recursion detected in policy for
-- relation \"users\"" (42P17), for ANY query that reaches an admin check,
-- not just queries against public.users directly.
--
-- Fix: move the admin check into a SECURITY DEFINER function. Functions
-- execute as their owner (the migration role), which is the table owner and
-- therefore bypasses RLS (row security isn't FORCE'd on public.users), so
-- the internal lookup never re-enters policy evaluation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'Bypasses RLS (SECURITY DEFINER) to check the current user''s admin role without recursive policy evaluation.';

-- ── public.users ────────────────────────────────────────────────────────────

drop policy if exists "Admins can view all users" on public.users;
create policy "Admins can view all users"
  on public.users for select
  to authenticated
  using (public.is_admin());

-- ── public.cases ─────────────────────────────────────────────────────────────

drop policy if exists "Users can view their own cases" on public.cases;
create policy "Users can view their own cases"
  on public.cases for select
  to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or public.is_admin()
  );

drop policy if exists "Owners and admins can update cases" on public.cases;
create policy "Owners and admins can update cases"
  on public.cases for update
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
  );

drop policy if exists "Admins can delete cases" on public.cases;
create policy "Admins can delete cases"
  on public.cases for delete
  to authenticated
  using (public.is_admin());

-- ── public.documents ─────────────────────────────────────────────────────────

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
          or public.is_admin()
        )
    )
  );

drop policy if exists "Uploaders and admins can update documents" on public.documents;
create policy "Uploaders and admins can update documents"
  on public.documents for update
  to authenticated
  using (
    uploaded_by = auth.uid()
    or public.is_admin()
  );

drop policy if exists "Admins can delete documents" on public.documents;
create policy "Admins can delete documents"
  on public.documents for delete
  to authenticated
  using (public.is_admin());

-- ── public.metadata_extractions ──────────────────────────────────────────────

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
          or public.is_admin()
        )
    )
  );

-- ── storage.objects ───────────────────────────────────────────────────────────

drop policy if exists "Case members can read their documents" on storage.objects;
create policy "Case members can read their documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.cases c
      where c.id = public.get_case_id_from_path(name)
        and c.deleted_at is null
        and (
          c.created_by  = auth.uid()
          or c.assigned_to = auth.uid()
          or public.is_admin()
        )
    )
  );

drop policy if exists "Case owners and admins can delete documents" on storage.objects;
create policy "Case owners and admins can delete documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.cases c
      where c.id = public.get_case_id_from_path(name)
        and (
          c.created_by = auth.uid()
          or public.is_admin()
        )
    )
  );

-- ── public.case_files ─────────────────────────────────────────────────────────

drop policy if exists "Users can view accessible case files" on public.case_files;
create policy "Users can view accessible case files"
  on public.case_files for select
  to authenticated
  using (
    deleted_at is null
    and (
      created_by              = auth.uid()
      or responsible_attorney_id = auth.uid()
      or public.is_admin()
    )
  );

drop policy if exists "Owners and admins can update case files" on public.case_files;
create policy "Owners and admins can update case files"
  on public.case_files for update
  to authenticated
  using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or responsible_attorney_id = auth.uid()
      or public.is_admin()
    )
  )
  with check (updated_by = auth.uid());

-- ── public.case_file_parties ──────────────────────────────────────────────────

drop policy if exists "Case file parties visible to case members" on public.case_file_parties;
create policy "Case file parties visible to case members"
  on public.case_file_parties for select
  to authenticated
  using (
    exists (
      select 1 from public.case_files cf
      where cf.id = case_file_id
        and cf.deleted_at is null
        and (
          cf.created_by              = auth.uid()
          or cf.responsible_attorney_id = auth.uid()
          or public.is_admin()
        )
    )
  );

drop policy if exists "Case members can manage parties" on public.case_file_parties;
create policy "Case members can manage parties"
  on public.case_file_parties for all
  to authenticated
  using (
    exists (
      select 1 from public.case_files cf
      where cf.id = case_file_id
        and cf.deleted_at is null
        and (
          cf.created_by = auth.uid()
          or cf.responsible_attorney_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- ── public.case_file_documents ────────────────────────────────────────────────
-- Current definition of "Case members can view documents" comes from
-- 00000000000011_nullable_case_file_id.sql (inbox + case-member access).

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
              or public.is_admin()
            )
        )
      )
    )
  );

drop policy if exists "Admins can update document status" on public.case_file_documents;
create policy "Admins can update document status"
  on public.case_file_documents for update
  to authenticated
  using (
    deleted_at is null
    and public.is_admin()
  );
