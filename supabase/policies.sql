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
