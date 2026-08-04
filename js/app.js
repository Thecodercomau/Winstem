/* ═══════════════════════════════════════════════════════════
   WINSTEM — App Bootstrap
   Boot sequence, global event bus, auth gating, share-link
   routing (#/s/token), lock screen and standard folder setup.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function $id(id) { return document.getElementById(id); }

  const bootTimings = [];

  function mark(step) { bootTimings.push([step, Date.now()]); }

  /* Event bus is created in utils.js (early module) so that modules can
     subscribe at load time. Here we just hook boot timings onto it. */
  function setupEventBus() {
    Winstem.App.mark = mark;
  }

  /* ── online/offline + error handling ─────────────────── */
  function setupGlobals() {
    window.addEventListener("error", function (e) {
      console.error("[Winstem]", e.message);
    });
    window.addEventListener("unhandledrejection", function (e) {
      console.error("[Winstem:promise]", e.reason && e.reason.message ? e.reason.message : e.reason);
    });
    window.addEventListener("online", function () {
      Winstem.Notifications.info("Back online", "Cloud synchronization has resumed.");
      Winstem.App.emit("sync-done");
    });
    window.addEventListener("offline", function () {
      Winstem.Notifications.notify({
        title: "You're offline",
        message: "Cloud files stay safe. Reconnect to sync changes.",
        icon: "bi-wifi-off", tone: "warn"
      });
    });
  }

  /* ── auth gates ──────────────────────────────────────── */
  function showAuth() {
    $id("os").classList.add("hidden");
    $id("auth-view").classList.remove("hidden");
  }

  function showOS() {
    $id("auth-view").classList.add("hidden");
    $id("os").classList.remove("hidden");
  }

  /* ── share link routing ──────────────────────────────── */
  async function handleShareRoute() {
    const m = window.location.hash.match(/^#\/s\/([a-f0-9]+)$/);
    if (!m) return false;
    const token = m[1];
    const os = $id("os");
    const auth = $id("auth-view");
    os.classList.add("hidden");
    auth.classList.add("hidden");
    $id("share-view").classList.remove("hidden");

    try {
      const share = await Winstem.Sharing.resolve(token);
      const file = share.files;
      const folder = share.folders;
      const name = file ? file.name : folder ? folder.name : "Shared item";
      const meta = file ? Winstem.FileTypes.info(file.name) : null;
      const body = $id("share-body");

      body.innerHTML =
        '<div class="share-hero">' +
          '<span class="share-icon" style="color:' + (meta ? meta.categoryInfo.color : "#94a3b8") + '">' +
            '<i class="bi ' + (meta ? meta.categoryInfo.icon : "bi-folder-fill") + '"></i></span>' +
          '<div class="share-name">' + Winstem.Utils.escapeHtml(name) + '</div>' +
          '<div class="share-meta">Shared via Winstem' +
            (file ? " · " + Winstem.Utils.formatBytes(file.size_bytes) : " · Folder") +
            " · " + Winstem.Utils.escapeHtml(share.permission === "download" ? "Can view & download" : "Can view") + '</div>' +
        '</div>' +
        '<div class="share-actions">' +
          (file ? '<button class="btn btn-primary" id="share-download"><i class="bi bi-download"></i> Download</button>' : "") +
          '<button class="btn btn-outline-secondary" id="share-save"><i class="bi bi-bookmark-plus"></i> Save to my Winstem</button>' +
        '</div>' +
        '<div id="share-preview" class="share-preview"></div>' +
        '<div class="share-foot"><i class="bi bi-shield-check"></i> Secured by Winstem · link is ' +
          (share.expires_at ? "valid until " + Winstem.Utils.formatDate(share.expires_at, true) : "active until revoked") + '</div>';

      const dl = $id("share-download");
      if (dl) dl.addEventListener("click", async function () {
        try {
          await Winstem.Sharing.downloadShared(share);
        } catch (e) {
          Winstem.Notifications.error("Download failed", e.message);
        }
      });
      $id("share-save").addEventListener("click", function () {
        if (!Winstem.Auth.isSignedIn()) {
          Winstem.Notifications.info("Sign in required", "Sign in to save this file to your cloud.");
          showAuth();
          return;
        }
        if (!file) { Winstem.Notifications.info("Folders cannot be saved via link", "Open the folder owner's share instead."); return; }
        Winstem.Notifications.info("Saving…", file.name);
        Winstem.Storage.download(file.storage_path).then(function (blob) {
          return Winstem.FS.enqueueUploads([new File([blob], file.name, { type: file.mime_type })], null);
        }).then(function () {
          Winstem.Notifications.success("Saved to your cloud", file.name);
        }).catch(function (e) {
          Winstem.Notifications.error("Save failed", e.message);
        });
      });

      /* preview when browser can */
      if (file && meta) {
        const preview = $id("share-preview");
        const info = Winstem.FileTypes.info(file.name);
        if (info.previewableImage || info.previewableAudio || info.previewableVideo || file.extension === "pdf" || info.isEditable) {
          preview.innerHTML = '<div class="share-preview-loading"><div class="spinner-border text-primary"></div></div>';
          Winstem.Storage.getSignedUrl(file.storage_path, 3600).then(function (url) {
            if (info.previewableImage) {
              preview.innerHTML = '<img src="' + Winstem.Utils.escapeAttr(url) + '" alt="' + Winstem.Utils.escapeAttr(file.name) + '">';
            } else if (info.previewableAudio) {
              preview.innerHTML = '<audio controls src="' + Winstem.Utils.escapeAttr(url) + '"></audio>';
            } else if (info.previewableVideo) {
              preview.innerHTML = '<video controls playsinline src="' + Winstem.Utils.escapeAttr(url) + '"></video>';
            } else if (file.extension === "pdf") {
              preview.innerHTML = '<iframe src="' + Winstem.Utils.escapeAttr(url) + '" title="PDF preview"></iframe>';
            } else {
              fetch(url).then(function (r) { return r.text(); }).then(function (text) {
                if (file.extension === "md" || file.extension === "markdown") {
                  /* reuse safe renderer via a temp app instance is overkill — render plain pre */
                  preview.innerHTML = '<pre>' + Winstem.Utils.escapeHtml(text.slice(0, 6000)) + '</pre>';
                } else {
                  preview.innerHTML = '<pre>' + Winstem.Utils.escapeHtml(text.slice(0, 6000)) + '</pre>';
                }
              }).catch(function () { preview.innerHTML = ""; });
            }
          }).catch(function () {
            preview.innerHTML = '<div class="share-preview-none">Preview unavailable.</div>';
          });
        } else {
          preview.innerHTML = '<div class="share-preview-none"><i class="bi bi-file-earmark"></i> No in-browser preview for this file type — download it instead.</div>';
        }
      }
      return true;
    } catch (err) {
      const body = $id("share-body");
      body.innerHTML =
        '<div class="share-error">' +
          '<i class="bi bi-shield-exclamation"></i>' +
          '<div class="share-error-title">This link is unavailable</div>' +
          '<div class="share-error-msg">' + Winstem.Utils.escapeHtml(err.message) + '</div>' +
          '<button class="btn btn-primary mt-3" id="share-open-winstem"><i class="bi bi-box-arrow-up-right"></i> Open Winstem</button>' +
        '</div>';
      const openBtn = $id("share-open-winstem");
      if (openBtn) openBtn.addEventListener("click", function () { location.hash = "#/"; });
      return true;
    }
  }

  /* ── lock screen ─────────────────────────────────────── */
  function setupLock() {
    const lock = $id("lock-screen");
    if (!lock) return;
    /* keep the lock clock ticking */
    const tickLock = function () {
      const lt = $id("lock-time");
      const ld = $id("lock-date");
      if (lt) lt.textContent = Winstem.Utils.formatTime(new Date());
      if (ld) ld.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    };
    tickLock();
    setInterval(tickLock, 10000);
    const unlockBtn = $id("lock-unlock");
    const pw = $id("lock-password");
    unlockBtn.addEventListener("click", function () {
      if (!Winstem.Auth.isSignedIn()) {
        lock.classList.add("hidden");
        showAuth();
        return;
      }
      if (pw.value.length === 0) {
        lock.classList.add("hidden");
        return;
      }
      /* local unlock — the real session is Supabase-protected */
      lock.classList.add("hidden");
      pw.value = "";
      Winstem.Notifications.info("Welcome back");
    });
    pw.addEventListener("keydown", function (e) {
      if (e.key === "Enter") unlockBtn.click();
    });
  }

  /* ── standard folders on first sign-in ───────────────── */
  async function ensureStandardFolders() {
    try {
      const { folders } = await Winstem.FS.listFolder(null, { noCache: true });
      const names = folders.map(function (f) { return f.name.toLowerCase(); });
      const want = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"];
      const missing = want.filter(function (n) { return !names.includes(n.toLowerCase()); });
      for (const name of missing) {
        await Winstem.FS.createFolder(name, null);
      }
    } catch (e) {
      console.warn("ensureStandardFolders:", e.message);
    }
  }

  /* ── PWA / service worker ────────────────────────────── */
  function registerSW() {
    if (!Winstem.Utils.supports.serviceWorker() || !location.protocol.startsWith("http")) return;
    navigator.serviceWorker.register(Winstem.Config.get("serviceWorkerPath"))
      .then(function () { console.log("[Winstem] service worker registered"); })
      .catch(function (e) { console.warn("[Winstem] SW registration failed:", e.message); });
  }

  /* ── boot ────────────────────────────────────────────── */
  function boot() {
    mark("start");
    Winstem.Config.init();
    mark("config");

    setupEventBus();
    Winstem.App.markReady = function () {
      const t0 = bootTimings.length ? bootTimings[0][1] : null;
      const t1 = Date.now();
      if (t0) console.log("[Winstem] booted in " + (t1 - t0) + "ms");
    };
    setupGlobals();
    setupLock();
    mark("globals");

    Winstem.Utils.storage.set("booted", Date.now());

    /* module init order */
    try {
      Winstem.Notifications.init();
      Winstem.Themes.init();
      Winstem.Search.init();
      Winstem.Shortcuts.init();
      mark("modules");
    } catch (e) {
      console.error("[Winstem] module init:", e);
    }

    /* service worker */
    registerSW();

    /* route to auth, share landing, or desktop */
    const onReady = async function () {
      mark("ready");
      if (Winstem.App.markReady) Winstem.App.markReady();
      const handledShare = await handleShareRoute();
      if (handledShare) return;

      if (!Winstem.Config.isConfigured()) {
        Winstem.Auth._viewHelpers.hideSplash();
        Winstem.Auth._viewHelpers.showAuth();
        return;
      }
      Winstem.Auth.wireAuthUI();
      await Winstem.Auth.init();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady);
    } else {
      onReady();
    }
  }

  /* ── public API ──────────────────────────────────────── */
  Winstem.App.onAuthenticated = function () {
    /* desktop is visible now */
    Winstem.Desktop.init();
    Winstem.Taskbar.init();
    Winstem.Launcher.init();
    ensureStandardFolders().then(function () {
      Winstem.App.emit("sync-done");
    });
    Winstem.Desktop.showStatus("Welcome back", 2500);
  };

  Winstem.App.onUserReady = function () {
    /* profile may have changed */
    if (Winstem.Launcher && Winstem.Launcher.refreshStartMenu) Winstem.Launcher.refreshStartMenu();
  };

  Winstem.App.onSignOut = function () {
    /* reset per-user local caches but keep appearance */
    const keepAppearance = Winstem.Utils.storage.get("appearance", null);
    Object.keys(localStorage).filter(function (k) { return k.indexOf("winstem:") === 0 && k.indexOf("winstem:appearance") !== 0; })
      .forEach(function (k) { localStorage.removeItem(k); });
    if (keepAppearance) Winstem.Utils.storage.set("appearance", keepAppearance);
    Winstem.WindowManager.closeAll();
  };

  Winstem.App.signOutFlow = async function () {
    try {
      await Winstem.Auth.signOut();
      Winstem.Notifications.info("Signed out", "See you soon!");
    } catch (e) {
      Winstem.Notifications.error("Sign out failed", e.message);
    }
  };

  Winstem.App.lockScreen = function () {
    const lock = $id("lock-screen");
    if (lock) {
      lock.classList.remove("hidden");
      const pw = $id("lock-password");
      if (pw) setTimeout(function () { pw.focus(); }, 100);
    }
  };

  Winstem.App.showAuth = showAuth;
  Winstem.App.showOS = showOS;
  Winstem.App.handleShareRoute = handleShareRoute;

  /* go */
  boot();
})();
