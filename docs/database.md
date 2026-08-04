# Winstem — Database Schema

Tables are defined in `supabase/schema.sql`. All user tables use `uuid` primary keys
and are guarded by Row Level Security (see [policies.sql](../supabase/policies.sql)).

---

## `profiles`

One row per user, created automatically by a trigger on sign-up.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| username | text | Unique, sanitized |
| full_name | text | Display name |
| avatar_url | text | Path in `winstem-avatars` |
| quota_bytes | bigint | Default 1 GB |
| plan | text | e.g. `free` |
| created_at / updated_at | timestamptz | |

## `user_settings`

Per-user preferences, synced across devices.

| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK | FK → profiles.id |
| theme | text | `light` / `dark` / `system` |
| accent | text | Accent color id |
| wallpaper | text | Wallpaper id |
| ui_scale | real | 0.85 – 1.25 |
| animations | boolean | |
| time_format | text | `12h` / `24h` |
| date_format | text | |
| language | text | |
| notif_settings | jsonb | Per-category toggles |
| updated_at | timestamptz | |

## `folders`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | FK → profiles.id |
| parent_id | uuid nullable | FK → folders.id (NULL = root) |
| name | text | Sanitized |
| is_desktop | boolean | Desktop special folder |
| created_at / updated_at | timestamptz | |

## `files`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | FK → profiles.id |
| folder_id | uuid nullable | FK → folders.id (NULL = Home root) |
| name | text | Original filename, sanitized |
| extension | text | Lowercased extension |
| mime_type | text | Detected MIME |
| size_bytes | bigint | |
| storage_path | text | Path inside `winstem-files`, e.g. `{user_id}/{file_id}` |
| favorite | boolean | |
| tags | text[] | User tags |
| created_at / updated_at | timestamptz | |

## `trash`

Soft-deleted files. Restored by moving back; purged by deleting the row + storage object.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | |
| file_id | uuid nullable | Deleted file |
| folder_id | uuid nullable | Deleted folder (recursive) |
| name | text | Original name for restore |
| storage_path | text nullable | |
| deleted_at | timestamptz | Indexed for cleanup |

## `notes`

Cloud-synchronized notes.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | |
| title | text | |
| body | text | Plain text |
| color | text nullable | Card color id |
| pinned | boolean | |
| created_at / updated_at | timestamptz | |

## `shares`

Link + user sharing for files and folders.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | |
| file_id | uuid nullable | |
| folder_id | uuid nullable | |
| token | text unique | Random share slug |
| mode | text | `link` or `user` |
| permission | text | `view` / `download` / `edit` |
| allow_download | boolean | |
| expires_at | timestamptz nullable | |
| revoked | boolean | |
| created_at | timestamptz | |

## `share_permissions`

Who can access a `user`-mode share.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| share_id | uuid FK → shares.id | |
| user_id | uuid | FK → profiles.id |
| permission | text | Override for this user |
| created_at | timestamptz | |

## `user_activity`

Audit / history feed.

| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| user_id | uuid | |
| action | text | e.g. `upload`, `share`, `login` |
| detail | jsonb | |
| created_at | timestamptz | Indexed |

---

## Indexes

Performance-critical indexes are created in `schema.sql`:

- `files (owner_id, folder_id)`, `files (owner_id, name)`, `files (owner_id, favorite)`
- `folders (owner_id, parent_id)`
- `trash (owner_id, deleted_at)`
- `shares (owner_id)`, `shares (token)`
- `notes (owner_id, pinned)`
- `user_activity (user_id, created_at)`

## Triggers

- `on_auth_user_created` — creates `profiles` + default `user_settings` rows
- `on_updated_at` — maintains `updated_at` on core tables
