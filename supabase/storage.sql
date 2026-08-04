-- ═══════════════════════════════════════════════════════════
-- WINSTEM — Storage Buckets & Policies
-- Run AFTER schema.sql and policies.sql.
--
-- Two PRIVATE buckets:
--   winstem-files    — every user's file bytes at "{ownerId}/{fileId}.{ext}"
--   winstem-avatars  — profile pictures at "{ownerId}/avatar.{ext}"
--
-- Files are NEVER in a public bucket. Unauthenticated access
-- is only possible for explicitly shared objects via the
-- share-state policies below (token-based, revocable, expiring).
-- ═══════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('winstem-files', 'winstem-files', false, 5368709120, null),    -- 5 GB per object, any type
  ('winstem-avatars', 'winstem-avatars', false, 2097152, null)     -- 2 MB
on conflict (id) do nothing;

-- ═══════════════ winstem-files ═══════════════

-- Owner: upload to their own folder prefix
drop policy if exists "files_upload_own" on storage.objects;
create policy "files_upload_own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'winstem-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Owner: read their own objects
drop policy if exists "files_read_own" on storage.objects;
create policy "files_read_own" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'winstem-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Owner: overwrite (re-save) and delete their own objects
drop policy if exists "files_update_own" on storage.objects;
create policy "files_update_own" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'winstem-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "files_delete_own" on storage.objects;
create policy "files_delete_own" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'winstem-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Anyone (anon included) may read an object when it is currently
-- covered by a valid *link* share. The check runs through the
-- security-definer helper because anon has no SELECT RLS on the
-- files/shares tables — this is how share links work without
-- exposing the bucket or the metadata tables.
create or replace function public.is_shared_storage_object(obj_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.files f
    join public.shares s on s.file_id = f.id
    where f.storage_path = obj_path
      and s.type = 'link'
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
      and s.permission in ('read', 'download')
  );
$$;

drop policy if exists "files_read_shared_link" on storage.objects;
create policy "files_read_shared_link" on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'winstem-files'
    and public.is_shared_storage_object(name)
  );

-- ═══════════════ winstem-avatars ═══════════════

-- Owner manages their own avatar
drop policy if exists "avatars_manage_own" on storage.objects;
create policy "avatars_manage_own" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'winstem-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'winstem-avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
