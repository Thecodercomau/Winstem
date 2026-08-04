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
