# Winstem — Cloud Operating Environment

> A browser-based cloud operating system. Your desktop, files, applications and
> settings — in any modern browser, on every device, powered by Supabase.

![Winstem](assets/icons/system/favicon.svg)

Winstem is a **cloud workspace designed like an operating system**. Sign in, land
on a real desktop with a taskbar, start menu, window manager, draggable icons and
a system tray — then manage cloud files, edit documents, listen to audio, view
PDFs, take notes and share files with anyone. Everything syncs to your Supabase
project so the same data follows you across devices.

---

## ✨ Features

| Area | Capabilities |
| --- | --- |
| **Desktop** | Wallpaper, movable desktop icons, taskbar, start menu, app launcher, system tray, clock, quick settings, context menus, snap windows |
| **Window manager** | Open/close/minimize/maximize/move/resize/focus, z-index, snap left/right/top, fullscreen, taskbar integration |
| **Cloud storage** | Upload (multi-file, drag-and-drop, queue with progress/retry), download, rename, move, copy, duplicate, folders, favorites, recent, trash & restore |
| **File manager** | Sidebar locations (Home, Desktop, Documents, Downloads, Pictures, Music, Videos, Favorites, Recent, Trash, Shared), grid/list views, sorting, multi-select, search, properties, storage dashboard |
| **Applications** | Files, Text Editor (syntax highlighting), Image Viewer, Audio Player, Video Player, PDF Viewer, Markdown Viewer, JSON Viewer, Calculator, Notes, Settings |
| **Search** | Universal search (Ctrl+K) across files, folders, notes, apps and settings |
| **Sharing** | Link shares (token, permission, expiration, revoke) and private email shares |
| **Accounts** | Supabase Auth: register, sign in, password recovery, sessions, profiles, avatars, per-user settings |
| **PWA** | Installable, offline app shell, app icons, standalone mode |
| **Security** | Row Level Security, private storage buckets, signed URLs, safe share-gated reads, XSS-safe rendering |

## 🧱 Technology stack

- **Frontend:** HTML5, CSS3, vanilla JavaScript, Bootstrap 5, Bootstrap Icons
- **Backend:** Supabase (Auth, PostgreSQL, Storage, RLS)
- **Hosting:** GitHub Pages (fully static, zero server runtime)
- **Browser APIs:** File API, Blob, FileReader, Fetch, IndexedDB, LocalStorage,
  Drag & Drop, Clipboard, Web Crypto, Service Workers, Fullscreen, Notifications,
  Canvas (indirectly), matchMedia, pointer events

**Deliberately not used:** React, Vue, Svelte, Angular, Next.js, Electron, Tauri,
any server-side runtime, any bundler requirement.

## 📁 Architecture

```
Browser (GitHub Pages)  ────────  Supabase Cloud
        │                              │
  HTML · CSS · JS                Auth · PostgreSQL · Storage
        │                              │
        └────────── Supabase JS client ─┘
```

All JavaScript is organized into focused modules under `js/`:

```
js/
├── app.js          boot sequence, event bus, routing, lock screen
├── config.js       safe configuration (public URL + anon key)
├── utils.js        helpers (debounce, formatting, escaping, clipboard…)
├── filetypes.js    file-type detection & preview mapping
├── database.js     Supabase client + IndexedDB cache layer
├── auth.js         registration, login, logout, recovery, profiles
├── storage.js      upload/download/signed URLs
├── filesystem.js   cloud folders, files, trash, favorites, search, queue
├── sharing.js      link & private shares, share landing resolution
├── windows.js      window manager
├── desktop.js      desktop icons, selection, context menus
├── taskbar.js      taskbar, tray, clock, flyouts
├── launcher.js     start menu + launcher overlay
├── applications.js app registry + shared dialogs
├── settings.js     Settings app
├── search.js       universal search
├── shortcuts.js    keyboard shortcuts
├── apps/           Files, editor, media, viewers, notes, calculator
└── vendor/         Bootstrap + Supabase (local copies — offline friendly)
```

## ✅ Requirements

- A **Supabase project** (free tier is fine) — the only backend you need.
- **GitHub** account for Pages hosting (or any static host).
- A modern browser: **Chrome, Edge, Firefox, Safari** (desktop & mobile).

## 🚀 Quick start

1. **Clone or download** this repository.
2. **Create a Supabase project** at <https://supabase.com>.
3. **Run the SQL**: open the SQL editor and run **one file**:
   `supabase/setup.sql` (combines schema + policies + storage in the right
   order — safe to re-run). If you prefer to run them individually, the order
   is `supabase/schema.sql` → `supabase/policies.sql` → `supabase/storage.sql`.
4. **Add your keys**: copy `js/config.local.example.js` to
   `js/config.local.js` and paste your **Project URL** and **anon (publishable) key**.

   ```js
   window.WINSTEM_CONFIG = {
     supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
     supabaseAnonKey: "YOUR-ANON-KEY"
   };
   ```

5. **Serve it** (`python -m http.server`, `npx serve`, VS Code Live Server…)
   and open the page. Register an account and you're in.

Full step-by-step: [docs/supabase.md](docs/supabase.md) and [docs/deployment.md](docs/deployment.md).

## ☁️ Supabase setup (summary)

| Thing | What to do |
| --- | --- |
| **Project URL / anon key** | Dashboard → Settings → API. Safe to expose. |
| **Tables + RLS + buckets** | Run `supabase/setup.sql` — everything in order, idempotent. |
| **Email confirmations** | Optional. You can disable "Confirm email" in Auth settings for instant sign-in during testing. |

> ⚠️ **Never put your `service_role` key in this repo.** The `service_role` key
> bypasses RLS and must stay in server-only code (there is none in this project).

## 🔐 Security model

- **RLS everywhere** — users can only see their own rows.
- **Private buckets** — file bytes are never public.
- **Signed URLs** — private previews/downloads use short-lived signed URLs.
- **Share links** — a token-based link lets anon users read *only* the shared
  object while the share is valid; revoking or expiring kills access instantly
  (policies re-check every request).
- **Input safety** — names are sanitized, HTML is escaped, the Markdown renderer
  escapes before formatting, and there is no `eval()` anywhere.

See [docs/security.md](docs/security.md) for the full audit.

## 🚢 Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Source: Deploy from branch → `main` → `/ (root)` → Save.**
3. Your Winstem is live at `https://<user>.github.io/<repo>/`.

Everything uses relative paths and hash routing, so no base URL configuration is
needed. A `404.html` fallback keeps deep links (`#/s/<token>`) working. See
[docs/deployment.md](docs/deployment.md).

## 📱 Install as a PWA

- **Desktop:** the install icon appears in the address bar (or Chrome → ⋮ → Install).
- **iOS/iPadOS:** Safari → Share → Add to Home Screen.
- **Android:** Chrome → ⋮ → Add to Home screen / Install app.

Offline, the app shell stays available. Cloud files require a connection — the UI
clearly shows when you're offline and sync resumes automatically.

## 🧭 Troubleshooting

| Problem | Fix |
| --- | --- |
| Login screen says "not connected to Supabase" | Create `js/config.local.js` with your URL + anon key |
| "relation … does not exist" (SQL error) | Run `supabase/setup.sql` — files must run in order |
| Uploads return 403 | Run `supabase/storage.sql` (policies missing) |
| Can't see your own files | Check that RLS was enabled (run `policies.sql`) |
| Share link 404s | Ensure `404.html` is deployed (GitHub Pages fallback) |
| PWA won't install | Requires HTTPS (GitHub Pages provides it) |

## 🌐 Browser compatibility

Chrome/Edge (latest), Firefox (latest), Safari 16+, iOS Safari 16+, Android Chrome.
Feature detection is used throughout — every optional API has a fallback.

## 📄 License

MIT — see [LICENSE](LICENSE).

## 🧩 More docs

- [docs/architecture.md](docs/architecture.md) — how the pieces fit
- [docs/database.md](docs/database.md) — schema reference
- [docs/storage.md](docs/storage.md) — storage design
- [docs/supabase.md](docs/supabase.md) — step-by-step backend setup
- [docs/deployment.md](docs/deployment.md) — GitHub Pages deployment
- [docs/security.md](docs/security.md) — security model & audit
