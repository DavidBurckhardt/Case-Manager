-- Storage buckets for document uploads
-- Run after enabling the Storage extension in the Supabase dashboard.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documents',
    'documents',
    false,
    52428800,  -- 50 MB
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/xml',
      'text/xml',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  )
on conflict (id) do nothing;

-- RLS: only authenticated users can read/write their own files
-- Policies will be tightened per feature once auth and roles are defined.
drop policy if exists "Authenticated users can upload documents" on storage.objects;
create policy "Authenticated users can upload documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

drop policy if exists "Authenticated users can read documents" on storage.objects;
create policy "Authenticated users can read documents"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents');

drop policy if exists "Authenticated users can delete their documents" on storage.objects;
create policy "Authenticated users can delete their documents"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');
