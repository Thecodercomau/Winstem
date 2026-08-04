/* ═══════════════════════════════════════════════════════════
   WINSTEM — Taskbar
   Start button, running window buttons, pinned apps, system
   tray (cloud sync, network, notifications, clock, quick
   settings), user menu and power menu.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function $id(id) { return document.getElementById(id); }

  const state = {
    pinned: [],
    clockInterval: null,
    online: navigator.onLine,
    syncing: false,
    lastSync: null
  };

  const PIN_KEY = "taskbar-pinned";

  function defaultPinned() {
    return ["files", "notes", "settings", "recycle"];
  }

  function loadPinned() {
    const saved = Winstem.Utils.storage.get(PIN_KEY, null);
    state.pinned = (saved && Array.isArray(saved) && saved.length) ? saved : defaultPinned();
  }

  function savePinned() {
    Winstem.Utils.storage.set(PIN_KEY, state.pinned);
  }

  function startClock() {
    const tick = function () {
      const now = new Date();
      const t = $id("tray-time");
      const d = $id("tray-date");
      if (t) t.textContent = Winstem.Utils.formatTime(now);
      if (d) d.textContent = Winstem.Utils.formatDate(now);
    };
    tick();
    state.clockInterval = setInterval(tick, 15000);
  }

  function setOnline(on) {
    state.online = on;
    const icon = $id("tray-network-icon");
    const btn = $id("tray-network");
    const quickVal = $id("quick-network-value");
    if (icon) icon.className = "bi " + (on ? "bi-wifi" : "bi-wifi-off");
    if (btn) {
      btn.title = on ? "Online" : "Offline";
      btn.classList.toggle("offline", !on);
    }
    if (quickVal) {
      quickVal.textContent = on ? "Online" : "Offline";
      quickVal.classList.toggle("text-danger", !on);
    }
    const badge = $id("auth-offline-badge");
    if (badge) badge.classList.toggle("d-none", on);
  }

  function setSyncState(syncing, label) {
    state.syncing = syncing;
    const icon = $id("tray-sync-icon");
    const quickVal = $id("quick-sync-value");
    if (icon) {
      icon.className = "bi " + (syncing ? "bi-cloud-arrow-up sync-spin" : "bi-cloud-check");
    }
    if (quickVal) quickVal.textContent = label || (syncing ? "Syncing…" : "Up to date");
  }

  function renderPinned() {
    const box = $id("taskbar-pinned");
    if (!box) return;
    box.innerHTML = "";
    state.pinned.forEach(function (appId) {
      const app = Winstem.Apps.get(appId);
      if (!app) return;
      const btn = Winstem.Utils.el(
        '<button class="taskbar-app-btn" data-app="' + Winstem.Utils.escapeAttr(appId) + '" ' +
          'role="listitem" aria-label="' + Winstem.Utils.escapeAttr(app.name) + '" title="' + Winstem.Utils.escapeAttr(app.name) + '">' +
          (app.icon ? '<i class="bi ' + app.icon + '"></i>' : '<span>' + Winstem.Utils.escapeHtml(app.name.charAt(0)) + '</span>') +
        '</button>'
      );
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        Winstem.Apps.launch(appId);
      });
      btn.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const pinned = state.pinned.includes(appId);
        const menu = [
          { label: "Open " + app.name, icon: "bi-box-arrow-up-right", action: function () { Winstem.Apps.launch(appId); } },
          { sep: true },
          pinned
            ? { label: "Unpin from taskbar", icon: "bi-pin-angle", action: function () {
                state.pinned = state.pinned.filter(function (p) { return p !== appId; });
                savePinned(); renderPinned();
              }}
            : { label: "Pin to taskbar", icon: "bi-pin", action: function () {
                state.pinned.push(appId); savePinned(); renderPinned();
              }}
        ];
        Winstem.Desktop.showMenu(menu, e.clientX, e.clientY);
      });
      box.appendChild(btn);
    });
  }

  function renderWindows(windows) {
    const box = $id("taskbar-windows");
    if (!box) return;
    box.innerHTML = "";
    windows.forEach(function (w) {
      const app = w.appId ? Winstem.Apps.get(w.appId) : null;
      const btn = Winstem.Utils.el(
        '<button class="taskbar-app-btn win-btn' + (w.minimized ? " minimized" : "") + '" data-wid="' + w.id + '" ' +
          'title="' + Winstem.Utils.escapeAttr(w.title) + '" aria-label="' + Winstem.Utils.escapeAttr(w.title) + '">' +
          (w.icon ? '<i class="bi ' + w.icon + '"></i>' : (app && app.icon ? '<i class="bi ' + app.icon + '"></i>' : '<i class="bi bi-window"></i>')) +
          '<span class="win-btn-title">' + Winstem.Utils.escapeHtml(w.title) + '</span>' +
        '</button>'
      );
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (Winstem.WindowManager.focusedId() === w.id && !w.minimized) {
          Winstem.WindowManager.minimize(w.id);
        } else {
          Winstem.WindowManager.restore(w.id);
        }
      });
      btn.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        Winstem.Desktop.showMenu([
          { label: "Restore", icon: "bi-window", action: function () { Winstem.WindowManager.restore(w.id); } },
          { label: "Minimize", icon: "bi-dash", action: function () { Winstem.WindowManager.minimize(w.id); } },
          { label: "Maximize", icon: "bi-square", action: function () { Winstem.WindowManager.toggleMaximize(w.id); } },
          { sep: true },
          { label: "Close", icon: "bi-x-lg", danger: true, action: function () { Winstem.WindowManager.close(w.id); } }
        ], e.clientX, e.clientY);
      });
      box.appendChild(btn);
    });
  }

  function closeFlyouts() {
    ["startmenu", "notif-center", "user-menu", "quick-panel", "power-menu"].forEach(function (id) {
      const el = $id(id);
      if (el) el.classList.add("hidden");
    });
  }

  function toggleFlyout(id) {
    const el = $id(id);
    if (!el) return;
    const willOpen = el.classList.contains("hidden");
    closeFlyouts();
    if (willOpen) el.classList.remove("hidden");
  }

  Winstem.Taskbar = {
    init: function () {
      loadPinned();
      startClock();
      setOnline(state.online);
      renderPinned();

      window.addEventListener("online", function () { setOnline(true); Winstem.App.emit("network", true); });
      window.addEventListener("offline", function () {
        setOnline(false);
        Winstem.App.emit("network", false);
        Winstem.Notifications.notify({ title: "You're offline", message: "Some cloud features will be unavailable until you reconnect.", icon: "bi-wifi-off", tone: "warn" });
      });

      /* start */
      const startBtn = $id("start-btn");
      startBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFlyout("startmenu");
        const input = $id("start-search-input");
        if (input && !$id("startmenu").classList.contains("hidden")) setTimeout(function () { input.focus(); }, 60);
      });

      /* search button → launcher */
      const searchBtn = $id("taskbar-search-btn");
      searchBtn.addEventListener("click", function () { Winstem.Search.open(); });

      /* user button */
      $id("user-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFlyout("user-menu");
      });

      /* quick settings */
      $id("quick-settings-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFlyout("quick-panel");
        syncQuickControls();
      });

      /* power */
      $id("start-power-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFlyout("power-menu");
      });

      /* power menu actions */
      document.querySelectorAll(".power-item").forEach(function (item) {
        item.addEventListener("click", function () {
          const act = item.getAttribute("data-power");
          closeFlyouts();
          if (act === "lock") Winstem.App.lockScreen();
          else if (act === "signout") Winstem.App.signOutFlow();
          else if (act === "refresh") location.reload();
        });
      });

      /* user menu actions */
      document.querySelectorAll(".user-menu-item").forEach(function (item) {
        item.addEventListener("click", function () {
          const act = item.getAttribute("data-um");
          closeFlyouts();
          if (act === "profile") Winstem.Apps.launch("settings", { page: "account" });
          else if (act === "appearance") Winstem.Apps.launch("settings", { page: "appearance" });
          else if (act === "storage") Winstem.Apps.launch("settings", { page: "storage" });
          else if (act === "lock") Winstem.App.lockScreen();
          else if (act === "signout") Winstem.App.signOutFlow();
        });
      });

      /* quick panel controls */
      document.querySelectorAll(".quick-theme").forEach(function (btn) {
        btn.addEventListener("click", function () {
          Winstem.Themes.set("theme", btn.getAttribute("data-theme-opt"));
          syncQuickControls();
        });
      });
      $id("quick-scale").addEventListener("input", function () {
        Winstem.Themes.set("uiScale", parseFloat(this.value));
      });
      $id("quick-all-settings").addEventListener("click", function () {
        closeFlyouts();
        Winstem.Apps.launch("settings", { page: "appearance" });
      });

      /* global click closes flyouts */
      document.addEventListener("click", function (e) {
        const inside = ["startmenu", "notif-center", "user-menu", "quick-panel", "power-menu"]
          .some(function (id) {
            const el = $id(id);
            return el && !el.classList.contains("hidden") && (el.contains(e.target) || e.target.id === "start-btn" || e.target.id === "user-btn" || e.target.id === "quick-settings-btn" || e.target.id === "start-power-btn");
          });
        if (!inside) closeFlyouts();
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeFlyouts();
      });

      Winstem.App.on("upload-queue", function () { setSyncState(true, "Syncing…"); });
      Winstem.App.on("files-changed", function () {
        setSyncState(false, "Up to date");
        state.lastSync = Date.now();
        if ($id("desktop-status")) Winstem.Desktop.showStatus("Cloud synchronized", 2000);
      });
      Winstem.App.on("sync-done", function () { setSyncState(false, "Up to date"); });
    },

    renderWindows: renderWindows,
    closeFlyouts: closeFlyouts,
    toggleFlyout: toggleFlyout,
    setOnline: setOnline,
    setSync: setSyncState,
    getPinned: function () { return state.pinned.slice(); },
    pin: function (appId) {
      if (!state.pinned.includes(appId)) { state.pinned.push(appId); savePinned(); renderPinned(); }
    },
    unpin: function (appId) {
      state.pinned = state.pinned.filter(function (p) { return p !== appId; });
      savePinned(); renderPinned();
    },
    isOnline: function () { return state.online; }
  };

  function syncQuickControls() {
    const s = Winstem.Themes.getState();
    document.querySelectorAll(".quick-theme").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-theme-opt") === s.theme);
    });
    const scale = $id("quick-scale");
    if (scale) scale.value = String(s.uiScale || 1);
    const icon = $id("quick-settings-icon");
    if (icon) icon.className = "bi " + (s.theme === "light" ? "bi-sun-fill" : "bi-brightness-high-fill");
  }

  /* expose for theme changes */
  Winstem.Taskbar.syncQuickControls = syncQuickControls;
})();
