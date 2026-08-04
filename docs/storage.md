# Winstem — Storage Architecture

Winstem stores file *bytes* in **Supabase Storage** (private buckets) and file
*metadata* in PostgreSQL tables. The two are linked by `files.storage_path`.

---

## Buckets

| Bucket | Public? | Purpose |
|---|---|---|
| `winstem-files` | **Private** | All user files, organized as `{user_id}/{file_id}` |
| `winstem-avatars` | **Private** | Profile images |

Both buckets are created by `supabase/storage.sql` and are `public = false`.

---

## Storage path layout

```
winstem-files/
└── <owner_uuid>/
    ├── <file_uuid>              ← one object per file
    └── ...
```

- The `file_uuid` is the same UUID as the `files.id` row — folders are represented
  **only** in the database, never as storage paths. This keeps rename/move instant
  (a metadata update) and avoids path-collision bugs.
- Folders are pure database concepts (`folders` table with `parent_id`), so moving
  or renaming a folder never touches storage objects.

## Access model

- **Owner:** reads/writes everything in their own `{user_id}/` prefix.
- **Others:** never access the bucket directly.
- **Shares:** the frontend requests a **signed URL** from the owner's session and
  hands it to the recipient; the link expires automatically.
- **Trash:** deleting a file moves the metadata row to `trash`; the storage object is
  removed on purge or immediate delete.

## Policies (in `supabase/storage.sql`)

Storage RLS policies scope every operation with `(storage.foldername(name))[1] = auth.uid()::text`:

| Operation | Policy |
|---|---|
| SELECT (download/signed URL) | Owner only |
| INSERT (upload) | Owner only |
| UPDATE | Owner only |
| DELETE | Owner only |

## Signed URLs

- Downloads: `createSignedUrl(path, 60)` — 60 second window.
- Share links: the share token is validated server-side against `shares` (expiry,
  revocation, permission), then a signed URL is produced. No public bucket exposure.

## Quota

`profiles.quota_bytes` (default 1 GB) is enforced client-side by computing the sum of
`files.size_bytes` for the user before upload, and server-side with a per-user trigger
in `policies.sql`/`schema.sql` that rejects inserts that would exceed the quota.

---

## Storage dashboard

The Settings → Storage screen computes, from the live `files` rows:

- Total used / available
- Breakdown by category (Documents, Images, Video, Audio, Other)
- Trash size
