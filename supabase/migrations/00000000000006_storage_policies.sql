-- Refine storage RLS policies with path-scoped rules.

drop policy if exists "Authenticated users can upload documents"        on storage.objects;
drop policy if exists "Authenticated users can read documents"          on storage.objects;
drop policy if exists "Authenticated users can delete their documents"  on storage.objects;
drop policy if exists "Case members can read their documents"           on storage.objects;
drop policy if exists "Case members can upload documents"               on storage.objects;
drop policy if exists "Case owners and admins can delete documents"     on storage.objects;

-- Helper in public schema (storage schema write is restricted to supabase_admin)
create or replace function public.get_case_id_from_path(object_name text)
returns uuid language sql immutable
as $$
  select (string_to_array(object_name, '/'))[2]::uuid
$$;

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
          or exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.role = 'admin'
          )
        )
    )
  );

create policy "Case members can upload documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.cases c
      where c.id = public.get_case_id_from_path(name)
        and c.deleted_at is null
        and (
          c.created_by  = auth.uid()
          or c.assigned_to = auth.uid()
        )
    )
  );

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
          or exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.role = 'admin'
          )
        )
    )
  );
