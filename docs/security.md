# Winstem — Security

Winstem follows a **zero-trust** model: the browser is treated as untrusted, and
every piece of user data is protected by Supabase Row Level Security.

---

## Principles

1. **No service_role key in the frontend.** Only the public project URL and anon key
   live client-side. The anon key is safe *because* RLS gates every query.
2. **RLS is the security boundary.** Every table has policies scoped to
   `auth.uid()`; storage policies scope access to the user's own path prefix.
3. **Never trust the client.** All authorization is enforced in the database.
4. **Signed URLs for sharing.** Private files are never exposed via public buckets.

---

## Authentication

- Email/password via Supabase Auth (PBKDF2-hashed by Supabase; we never see or store
  passwords).
- Sessions stored in `localStorage` by the Supabase JS client (configurable).
- Password reset uses Supabase's email flow with configured Redirect URLs.
- All auth errors are mapped to friendly messages; raw database errors are never
  shown to users.

## Row Level Security

- `profiles`: user can select/update their own row.
- `user_settings`: user can select/update their own row.
- `files` / `folders`: owner-only select/insert/update/delete.
- `trash`: owner-only.
- `notes`: owner-only.
- `shares`: owner manages their own. **No anonymous SELECT policy exists** —
  share links resolve only through the `resolve_share(token)` security-definer
  RPC, which validates the token, expiry and revocation server-side and checks
  private-share recipients.
- `share_permissions`: owner manages via `is_share_owner()` (security definer,
  breaks RLS recursion); recipients can read their own granted rows.
- `user_activity`: owner-only.

All security-definer helpers (`resolve_share`, `is_share_owner`,
`can_access_share`, `is_shared_storage_object`, `enforce_quota`) exist to break
RLS recursion or to gate anonymous access without exposing metadata tables.

Run `supabase/policies.sql` to apply. **If you skip this, nothing will work or
everything will be open — so always run it.**

## Storage policies

See [storage.md](storage.md) — every bucket operation is scoped to the owner's
`{user_id}` prefix via `storage.foldername(name)`. Anonymous reads of shared
objects pass through `is_shared_storage_object()` (security definer) so the
`files`/`shares` metadata tables are never exposed.

## Input handling (frontend)

- Filenames are sanitized (`/`, `\`, control characters stripped, length capped).
- Usernames validated against `[a-zA-Z0-9_.-]` on the client *and* in the trigger.
- Markdown preview is rendered with an escape-first renderer — HTML/script in
  `.md` files is displayed as text, never executed.
- All dynamic content is inserted via `textContent` or escaped template helpers;
  file names and metadata are never injected as raw HTML.
- Share tokens are generated with `crypto.getRandomValues`.

## Error handling

- Every async operation has loading / success / error / empty states.
- Network and auth failures produce friendly messages with retry actions.
- The app detects offline state and communicates it clearly.

## Session & privacy

- Sign out clears local session data.
- "Clear local data" in Settings removes cached local storage (not cloud files).
- Users can revoke shares at any time; expired shares refuse to render.

---

## Deployment checklist

- [ ] `js/config.local.js` contains only public anon key — never service_role
- [ ] `supabase/schema.sql`, `policies.sql`, `storage.sql` all applied
- [ ] Service role key not present anywhere in the repo (search: `service_role`)
- [ ] Redirect URLs configured for password reset
- [ ] Buckets are private (`public = false`)
