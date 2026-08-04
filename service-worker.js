/* ═══════════════════════════════════════════════════════════
   WINSTEM — Service Worker
   Caches the static application shell for offline use.
   Cloud data is never cached here — files stream from
   Supabase and require a connection (the UI says so).
   ═══════════════════════════════════════════════════════════ */

const VERSION = "winstem-v1.0.1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/bootstrap.min.css",
  "./css/bootstrap-icons.css",
  "./css/winstem.css",
  "./css/desktop.css",
  "./css/taskbar.css",
  "./css/windows.css",
  "./css/file-manager.css",
  "./css/applications.css",
  "./css/settings.css",
  "./css/notifications.css",
  "./css/responsive.css",
  "./js/config.js",
  "./js/utils.js",
  "./js/filetypes.js",
  "./js/database.js",
  "./js/notifications.js",
  "./js/themes.js",
  "./js/auth.js",
  "./js/storage.js",
  "./js/filesystem.js",
  "./js/sharing.js",
  "./js/windows.js",
  "./js/desktop.js",
  "./js/taskbar.js",
  "./js/launcher.js",
  "./js/applications.js",
  "./js/apps/calculator.js",
  "./js/apps/editor.js",
  "./js/apps/media.js",
  "./js/apps/viewers.js",
  "./js/apps/notes.js",
  "./js/apps/files.js",
  "./js/settings.js",
  "./js/search.js",
  "./js/shortcuts.js",
  "./js/app.js",
  "./js/vendor/bootstrap.bundle.min.js",
  "./js/vendor/supabase.min.js",
  "./assets/fonts/bootstrap-icons.woff2",
  "./assets/fonts/bootstrap-icons.woff",
  "./assets/icons/system/favicon.svg",
  "./assets/icons/system/icon-192.png",
  "./assets/icons/system/icon-512.png"
];

/* Wallpapers are cached on demand (they may change). */
const RUNTIME_CACHE = "winstem-runtime";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== VERSION && key !== RUNTIME_CACHE;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;

  /* Only same-origin GET requests */
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Never cache Supabase API traffic (handled by the app layer) */
  if (url.hostname.indexOf("supabase") !== -1) return;

  /* App shell (navigation) → network-first with cache fallback.
     ⚠ Only cache OK responses: caching a 404 fallback page as the shell
     would poison the app and cause a redirect loop (see 404.html). */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(function (cache) { cache.put("./index.html", copy); });
          return res;
        }
        /* Error/redirect response — fall back to cached shell, don't cache it */
        return caches.match("./index.html").then(function (hit) {
          return hit || caches.match("./") || res;
        });
      }).catch(function () {
        return caches.match("./index.html").then(function (hit) {
          return hit || caches.match("./");
        });
      })
    );
    return;
  }

  /* Static assets → cache-first, then network + put in runtime cache */
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res.ok && (url.pathname.indexOf("/assets/") !== -1 || url.pathname.indexOf("/css/") !== -1)) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});

/* Message: update the version */
self.addEventListener("message", function (event) {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
