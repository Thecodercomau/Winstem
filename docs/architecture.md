# Winstem — Architecture

```
                         WINSTEM
                            |
             ┌──────────────┴──────────────┐
             │                             │
        GitHub Pages                   Supabase
             │                             │
     ┌───────┼────────┐          ┌─────────┼──────────┐
     │       │        │          │         │          │
    HTML    CSS    JavaScript    Auth   PostgreSQL  Storage
     │       │        │
     └───────┴────────┘
             |
       Browser APIs
             |
      Winstem Desktop
```

---

## Module map (`js/`)

| Module | Responsibility |
|---|---|
| `config.js` | Central config; merges `config.local.js`; `Winstem.Config` |
| `utils.js` | DOM helpers, escaping, format helpers, debounce, IDs |
| `filetypes.js` | Extension → category/icon/MIME detection |
| `database.js` | Supabase client creation; `Winstem.DB` |
| `auth.js` | Login, register, logout, recovery, session restore; `Winstem.Auth` |
| `storage.js` | Upload/download/signed URLs, quota math; `Winstem.Storage` |
| `filesystem.js` | Files/folders CRUD, trash, move/copy; `Winstem.FileSystem` |
| `sharing.js` | Create/revoke/consume share links; `Winstem.Sharing` |
| `windows.js` | Window manager; `Winstem.WindowManager` |
| `desktop.js` | Wallpaper, icons, selection, context menus; `Winstem.Desktop` |
| `taskbar.js` | Taskbar, tray, clock, start menu wiring; `Winstem.Taskbar` |
| `launcher.js` | Full-screen app launcher |
| `applications.js` | App registry, shared dialogs, app icons; `Winstem.Apps` |
| `settings.js` | Settings application |
| `search.js` | Universal search overlay |
| `shortcuts.js` | Platform-aware keyboard shortcuts |
| `notifications.js` | Toast + notification center; `Winstem.Notifications` |
| `themes.js` | Theme/accent/wallpaper/scale application; `Winstem.Themes` |
| `app.js` | Boot sequence, view switching, global events |
| `apps/*.js` | Files, Editor, Media, Viewers, Notes, Calculator |
| `vendor/` | Bootstrap bundle + Supabase client (local, offline-friendly) |

## App registry

Applications declare themselves with `Winstem.Apps.register({ id, name, icon,
launch })`. Every app runs inside a `Winstem.WindowManager` window; apps never
implement their own window system.

```js
Winstem.WindowManager.open({ app: "files", title: "Files" });
```

## Boot sequence (`app.js`)

1. Splash shown; `Winstem.Config.init()`, `DB.init()` (creates Supabase client)
2. `Winstem.Auth.restoreSession()` → signed in or not
3. Signed out → auth view; signed in → seed defaults → `Winstem.Themes.apply()`
4. `Desktop.init()` → taskbar → launcher → shortcuts → service worker registration

## Data flow

- **Files:** `filesystem.js` reads/writes `files`/`folders`/`trash` tables;
  `storage.js` moves bytes through the private bucket. UI renders from DB rows only.
- **Settings:** `user_settings` rows (cloud) merged over `localStorage` defaults,
  written back debounced; themes applied instantly to `documentElement`.
- **Shares:** `shares` + `share_permissions` rows; `#/share/:token` route renders
  the viewer, checks expiry/revocation, then requests a signed URL.

## Cross-platform

- Feature detection everywhere (`showOpenFilePicker`, `showSaveFilePicker`,
  `mediaSession`, notifications, etc.) with graceful fallbacks.
- Dedicated responsive layouts for phones/tablets — the desktop is not merely
  scaled down.
- PWA: `manifest.json` + `service-worker.js` (offline shell, cached static assets;
  cloud data always requires a connection and the UI says so).

## Sync

Any device signs into the same Supabase project and sees the same files, folders,
notes and settings. `user_activity` keeps an audit trail of key actions.
