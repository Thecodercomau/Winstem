# Winstem — Deployment Guide

Winstem is a fully static frontend. It deploys to **GitHub Pages** and talks to **Supabase**
for authentication, the database, and cloud storage.

---

## 1. Prerequisites

- A GitHub account
- A Supabase project (free tier is fine for personal use)
- The two public Supabase values from your project:
  - **Project URL** — e.g. `https://abcd1234.supabase.co`
  - **Anon / publishable key** — `sb_publishable_...` (older projects: the `anon` key)

> 🔒 The **service_role** key must **never** be placed in frontend code or committed.
> The anon key is public by design — it is safe to embed, and Row Level Security
> (RLS) is what actually protects your data.

---

## 2. Configure Winstem

The app loads configuration from `js/config.local.js` if present (it is gitignored).
Create it by copying the example:

```bash
cp js/config.local.example.js js/config.local.js
```

Then fill in your values:

```js
window.WINSTEM_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR-PUBLIC-ANON-KEY"
};
```

If `js/config.local.js` is absent, Winstem falls back to the placeholder values in
`js/config.js` and shows a friendly "Supabase is not configured" notice on the login
screen so the app never silently breaks.

### Publishing your config to GitHub Pages

Because `config.local.js` is gitignored (to keep secrets out of git history when you
fork or make the repo public), for GitHub Pages you have two options:

1. **Recommended:** keep `js/config.local.js` locally, and use **GitHub Actions**
   (see below) which builds `config.local.js` from repository **secrets** during deploy.
2. Simply remove the file from `.gitignore` and commit it — the anon key is public
   anyway, so this is acceptable. You just must not do the same with a service_role key.

---

## 3. Set up the backend (Supabase)

Full instructions in [supabase.md](supabase.md). The short version:

1. Create a new Supabase project.
2. Open **SQL Editor**, paste `supabase/setup.sql` and run it — this applies
   schema → policies → storage in the correct order (running the pieces
   individually out of order causes `relation … does not exist` errors).
   It is idempotent, so re-running it after a schema update is safe.
5. In **Authentication → URL Configuration**, set your Site URL and add
   `https://<you>.github.io` (and the repo URL) to **Redirect URLs** — this is
   required for password-reset email links to return to the right page.
6. Optionally enable **Email → Confirm email** (recommended for production).

---

## 4. Deploy to GitHub Pages

### Option A — GitHub Actions (recommended)

The workflow already ships in the repo at `.github/workflows/deploy.yml`. On every
push to `main` it builds `js/config.local.js` from repository secrets and deploys
to Pages automatically.

All you need to do:

1. **Add two repository secrets** (**Settings → Secrets and variables → Actions**):

   | Secret | Value |
   |---|---|
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_ANON_KEY` | `sb_publishable_...` / legacy anon key |

2. **Enable Pages with Actions as source** (**Settings → Pages → Source →
   GitHub Actions**). The first push will then deploy the site.

3. Optionally trigger a manual deploy from the **Actions** tab
   (the workflow supports `workflow_dispatch`).

### Option B — Manual

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `/ (root)`**.
3. Save. Your site is live at `https://<user>.github.io/<repo>/`.

---

## 5. Post-deploy checks

- [ ] Login screen renders, no console errors
- [ ] Registration works
- [ ] Upload / download / rename / move / trash work
- [ ] Storage dashboard shows real numbers
- [ ] Notes sync across devices (sign in on two devices, create a note on one)
- [ ] Share link opens on a second, signed-out device
- [ ] PWA install prompt appears (Chrome/Edge) and offline shell loads
- [ ] Password reset email link returns to the reset screen

---

## 6. Updating

GitHub Pages re-deploys automatically on every push to `main`. Supabase schema
changes are applied manually through the SQL Editor (always back up first).

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Supabase is not configured" | `js/config.local.js` missing or placeholder values |
| Reset emails 404 | Redirect URLs in Supabase Auth settings are wrong |
| Uploads fail | Buckets not created — run `supabase/setup.sql` |
| Can't sign up | `profiles` trigger missing — run `supabase/setup.sql` fully |
| "Row-level security violation" | Policies not applied — run `supabase/setup.sql` |
| 404 on page refresh | GitHub Pages SPA fallback — `404.html` redirects to index |
