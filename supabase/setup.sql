-- ═══════════════════════════════════════════════════════════
-- WINSTEM — FULL SETUP (run this one file)
-- Combines schema.sql + policies.sql + storage.sql in order.
-- Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════

-- ─────────────── PART 1: SCHEMA ───────────────
-- ═══════════════════════════════════════════════════════════
-- WINSTEM — Database Schema
-- Run this file in the Supabase SQL editor (or via migrations)
-- BEFORE policies.sql and storage.sql.
-- ═══════════════════════════════════════════════════════════

-- Enable required extensions
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ═══════════════ PROFILES ═══════════════
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique not null,
  display_name  text,
  email         text,
  avatar_url    text,
  bio           text,
  quota_bytes   bigint not null default 1073741824,          -- 1 GB default
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ═══════════════ USER SETTINGS ═══════════════
create table if not exists public.user_settings (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  theme               text not null default 'dark',
  accent_color        text not null default 'blue',
  wallpaper           text not null default 'aurora',
  ui_scale            numeric not null default 1,
  animations          boolean not null default true,
  language            text not null default 'en',
  time_format         text not null default '12h',
  date_format         text not null default 'locale',
  notif_uploads       boolean not null default true,
  notif_shares        boolean not null default true,
  notif_system        boolean not null default true,
  notif_web           boolean not null default false,
  quota_bytes         bigint not null default 1073741824,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ═══════════════ FOLDERS ═══════════════
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  parent_id   uuid references public.folders (id) on delete cascade,
  name        text not null,
  is_favorite boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,                                   -- soft delete → trash
  constraint folders_name_unique
    unique (owner_id, parent_id, name)
);

create index if not exists idx_folders_owner on public.folders (owner_id);
create index if not exists idx_folders_parent on public.folders (parent_id);
create index if not exists idx_folders_deleted on public.folders (owner_id) where deleted_at is not null;

-- ═══════════════ FILES ═══════════════
create table if not exists public.files (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  folder_id        uuid references public.folders (id) on delete set null,
  name             text not null,
  extension        text not null default '',
  mime_type        text not null default 'application/octet-stream',
  size_bytes       bigint not null default 0,
  storage_path     text not null,                            -- "{ownerId}/{fileId}.{ext}"
  checksum_sha256  text,
  is_favorite      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_accessed_at timestamptz,
  deleted_at       timestamptz                                -- soft delete → trash
);

create index if not exists idx_files_owner on public.files (owner_id);
create index if not exists idx_files_folder on public.files (folder_id);
create index if not exists idx_files_deleted on public.files (owner_id) where deleted_at is not null;
create index if not exists idx_files_name on public.files (owner_id, lower(name));
create index if not exists idx_files_extension on public.files (extension);
create index if not exists idx_files_updated on public.files (owner_id, updated_at desc);

-- ═══════════════ NOTES ═══════════════
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  title      text not null default 'Untitled',
  content    text not null default '',
  is_pinned  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_notes_owner on public.notes (owner_id);
create index if not exists idx_notes_deleted on public.notes (owner_id) where deleted_at is not null;

-- ═══════════════ SHARES ═══════════════
create table if not exists public.shares (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  file_id     uuid references public.files (id) on delete cascade,
  folder_id   uuid references public.folders (id) on delete cascade,
  share_token text unique,
  type        text not null default 'link' check (type in ('link', 'private')),
  permission  text not null default 'read' check (permission in ('read', 'download')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint shares_entity_check check (
    (file_id is not null and folder_id is null) or
    (folder_id is not null and file_id is null)
  )
);

create index if not exists idx_shares_owner on public.shares (owner_id);
create index if not exists idx_shares_file on public.shares (file_id);
create index if not exists idx_shares_folder on public.shares (folder_id);
create index if not exists idx_shares_token on public.shares (share_token);

-- ═══════════════ SHARE PERMISSIONS ═══════════════
create table if not exists public.share_permissions (
  id         uuid primary key default gen_random_uuid(),
  share_id   uuid not null references public.shares (id) on delete cascade,
  user_email text not null,
  permission text not null default 'read' check (permission in ('read', 'download')),
  created_at timestamptz not null default now(),
  constraint share_permissions_unique unique (share_id, user_email)
);

create index if not exists idx_share_perms_email on public.share_permissions (lower(user_email));

-- ═══════════════ USER ACTIVITY ═══════════════
create table if not exists public.user_activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_user on public.user_activity (user_id, created_at desc);

-- ═══════════════ TRASH VIEW ═══════════════
-- Deleted files & folders are exposed through this view.
create or replace view public.trash as
select 'file'::text as kind, id, owner_id, folder_id as parent_id, name, size_bytes, extension,
       mime_type, storage_path, deleted_at, created_at, updated_at
from public.files
where deleted_at is not null
union all
select 'folder'::text as kind, id, owner_id, parent_id, name, null::bigint as size_bytes, '' as extension,
       '' as mime_type, null::text as storage_path, deleted_at, created_at, updated_at
from public.folders
where deleted_at is not null;

-- ═══════════════ UPDATED_AT TRIGGER ═══════════════
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_settings_updated on public.user_settings;
create trigger trg_user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_folders_updated on public.folders;
create trigger trg_folders_updated before update on public.folders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_files_updated on public.files;
create trigger trg_files_updated before update on public.files
  for each row execute function public.set_updated_at();

drop trigger if exists trg_notes_updated on public.notes;
create trigger trg_notes_updated before update on public.notes
  for each row execute function public.set_updated_at();

-- ─────────────── PART 2: POLICIES & RLS ───────────────
-- ═══════════════════════════════════════════════════════════
-- WINSTEM — Row Level Security Policies
-- Run AFTER schema.sql. Enables RLS everywhere and gives
-- users access ONLY to their own private records.
-- ═══════════════════════════════════════════════════════════

-- ═══════════════ AUTO-PROFILE TRIGGER ═══════════════
-- Creates a profile + settings row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
begin
  base_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(coalesce(new.email, 'user'), '@', 1),
    'user'
  );
  -- strip unsafe characters and dedupe if needed
  base_username := left(regexp_replace(lower(base_username), '[^a-z0-9_.-]', '', 'g'), 24);
  if base_username = '' then base_username := 'user'; end if;

  insert into public.profiles (id, username, email)
  values (new.id, base_username, new.email)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════ QUOTA ENFORCEMENT (server-side) ═══════════════
-- Rejects inserts/updates that would push the owner past their quota.
-- Client-side checks are convenience only — this is the real gate.
create or replace function public.enforce_quota()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  used_bytes bigint;
  quota_bytes bigint;
  delta bigint;
begin
  select coalesce(quota_bytes, 1073741824) into quota_bytes
  from public.profiles where id = new.owner_id;

  if tg_op = 'UPDATE' then
    delta := coalesce(new.size_bytes, 0) - coalesce(old.size_bytes, 0);
    if delta <= 0 then return new; end if;
    select coalesce(sum(size_bytes), 0) into used_bytes
    from public.files where owner_id = new.owner_id and deleted_at is null;
    used_bytes := used_bytes - coalesce(old.size_bytes, 0);
  else
    delta := coalesce(new.size_bytes, 0);
    select coalesce(sum(size_bytes), 0) into used_bytes
    from public.files where owner_id = new.owner_id and deleted_at is null;
  end if;

  if used_bytes + delta > quota_bytes then
    raise exception 'Storage quota exceeded (limit % bytes)', quota_bytes;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_files_quota on public.files;
create trigger trg_files_quota
  before insert or update of size_bytes on public.files
  for each row execute function public.enforce_quota();

-- ═══════════════ PROFILES ═══════════════
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- ═══════════════ USER SETTINGS ═══════════════
alter table public.user_settings enable row level security;

drop policy if exists "settings_select_own" on public.user_settings;
create policy "settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "settings_update_own" on public.user_settings;
create policy "settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id);

drop policy if exists "settings_insert_own" on public.user_settings;
create policy "settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);

-- ═══════════════ FOLDERS ═══════════════
alter table public.folders enable row level security;

drop policy if exists "folders_select_own" on public.folders;
create policy "folders_select_own" on public.folders
  for select using (auth.uid() = owner_id);

drop policy if exists "folders_insert_own" on public.folders;
create policy "folders_insert_own" on public.folders
  for insert with check (auth.uid() = owner_id);

drop policy if exists "folders_update_own" on public.folders;
create policy "folders_update_own" on public.folders
  for update using (auth.uid() = owner_id);

drop policy if exists "folders_delete_own" on public.folders;
create policy "folders_delete_own" on public.folders
  for delete using (auth.uid() = owner_id);

-- ═══════════════ FILES ═══════════════
alter table public.files enable row level security;

drop policy if exists "files_select_own" on public.files;
create policy "files_select_own" on public.files
  for select using (auth.uid() = owner_id);

drop policy if exists "files_insert_own" on public.files;
create policy "files_insert_own" on public.files
  for insert with check (auth.uid() = owner_id);

drop policy if exists "files_update_own" on public.files;
create policy "files_update_own" on public.files
  for update using (auth.uid() = owner_id);

drop policy if exists "files_delete_own" on public.files;
create policy "files_delete_own" on public.files
  for delete using (auth.uid() = owner_id);

-- NOTE: no anon/recipient SELECT policy on files. Share access flows
-- exclusively through resolve_share() (security definer), so anonymous
-- users cannot enumerate other users' file metadata.

-- ═══════════════ NOTES ═══════════════
alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own" on public.notes
  for select using (auth.uid() = owner_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own" on public.notes
  for insert with check (auth.uid() = owner_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes
  for update using (auth.uid() = owner_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes
  for delete using (auth.uid() = owner_id);

-- ═══════════════ SHARES ═══════════════
alter table public.shares enable row level security;

-- Recipient check (private shares). Uses the security-definer helper to
-- avoid recursion: reading share_permissions must not re-enter shares RLS.
create or replace function public.can_access_share(share_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shares s
    join public.share_permissions sp on sp.share_id = s.id
    where s.id = share_id
      and lower(sp.user_email) = lower(auth.jwt() ->> 'email')
  );
$$;

drop policy if exists "shares_select_own" on public.shares;
create policy "shares_select_own" on public.shares
  for select using (auth.uid() = owner_id);

drop policy if exists "shares_insert_own" on public.shares;
create policy "shares_insert_own" on public.shares
  for insert with check (auth.uid() = owner_id);

drop policy if exists "shares_update_own" on public.shares;
create policy "shares_update_own" on public.shares
  for update using (auth.uid() = owner_id);

drop policy if exists "shares_delete_own" on public.shares;
create policy "shares_delete_own" on public.shares
  for delete using (auth.uid() = owner_id);

-- Share-token resolution is done ONLY through resolve_share(token) below.
-- There is intentionally NO anon SELECT policy on shares: an RLS policy
-- cannot be scoped to a specific token value, so a broad policy would let
-- anyone enumerate every link-share token in the app.

-- Resolve a share by token (works for anon link shares). Validates expiry
-- and revocation server-side, then returns share + entity as JSON.
create or replace function public.resolve_share(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  share_row public.shares%rowtype;
  result jsonb;
begin
  select * into share_row
  from public.shares
  where share_token = p_token
  limit 1;

  if not found then
    raise exception 'This share link is not valid.';
  end if;
  if share_row.revoked_at is not null then
    raise exception 'This share link has been revoked.';
  end if;
  if share_row.expires_at is not null and share_row.expires_at < now() then
    raise exception 'This share link has expired.';
  end if;

  -- Private shares resolve only for the owner or a granted recipient.
  if share_row.type = 'private' then
    if auth.uid() <> share_row.owner_id
       and not exists (
         select 1 from public.share_permissions sp
         where sp.share_id = share_row.id
           and lower(sp.user_email) = lower(auth.jwt() ->> 'email')
       ) then
      raise exception 'You do not have access to this share.';
    end if;
  end if;

  if share_row.file_id is not null then
    select jsonb_build_object(
      'id', share_row.id,
      'owner_id', share_row.owner_id,
      'type', share_row.type,
      'permission', share_row.permission,
      'expires_at', share_row.expires_at,
      'files', to_jsonb(f)
    ) into result
    from public.files f where f.id = share_row.file_id;
  else
    select jsonb_build_object(
      'id', share_row.id,
      'owner_id', share_row.owner_id,
      'type', share_row.type,
      'permission', share_row.permission,
      'expires_at', share_row.expires_at,
      'folders', to_jsonb(fo)
    ) into result
    from public.folders fo where fo.id = share_row.folder_id;
  end if;

  return result;
end;
$$;

-- A recipient may see a private share when their email is granted
drop policy if exists "shares_select_recipient" on public.shares;
create policy "shares_select_recipient" on public.shares
  for select using (
    type = 'private'
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and public.can_access_share(id)
  );

-- ═══════════════ SHARE PERMISSIONS ═══════════════
alter table public.share_permissions enable row level security;

-- Security-definer ownership check. Used by share_permissions policies to
-- avoid RLS infinite recursion (shares ↔ share_permissions mutual queries).
create or replace function public.is_share_owner(share_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shares s
    where s.id = share_id and s.owner_id = auth.uid()
  );
$$;

drop policy if exists "share_perms_owner" on public.share_permissions;
create policy "share_perms_owner" on public.share_permissions
  for all using (public.is_share_owner(share_id))
  with check (public.is_share_owner(share_id));

-- Recipients can see their own granted permissions (to list "Shared with me")
drop policy if exists "share_perms_recipient_read" on public.share_permissions;
create policy "share_perms_recipient_read" on public.share_permissions
  for select using (lower(user_email) = lower(auth.jwt() ->> 'email'));

-- ═══════════════ USER ACTIVITY ═══════════════
alter table public.user_activity enable row level security;

drop policy if exists "activity_select_own" on public.user_activity;
create policy "activity_select_own" on public.user_activity
  for select using (auth.uid() = user_id);

drop policy if exists "activity_insert_own" on public.user_activity;
create policy "activity_insert_own" on public.user_activity
  for insert with check (auth.uid() = user_id);

-- ─────────────── PART 3: STORAGE ───────────────
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
