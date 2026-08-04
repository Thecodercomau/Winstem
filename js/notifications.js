/* ═══════════════════════════════════════════════════════════
   WINSTEM — Notifications
   Toast system, notification center, and Web Notifications API
   integration (with permission handling and user preference).
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const state = {
    list: [],
    unread: 0,
    webPermission: "default",
    settings: { uploads: true, shares: true, system: true, web: false }
  };

  const STORE_KEY = "notif-settings";

  function loadSettings() {
    const saved = Winstem.Utils.storage.get(STORE_KEY, null);
    if (saved) state.settings = Object.assign(state.settings, saved);
  }

  function saveSettings() {
    Winstem.Utils.storage.set(STORE_KEY, state.settings);
  }

  function renderCenter() {
    const listEl = document.getElementById("notif-center-list");
    if (!listEl) return;
    const badge = document.getElementById("notif-badge");
    if (badge) {
      if (state.unread > 0) { badge.textContent = String(state.unread); badge.classList.remove("hidden"); }
      else badge.classList.add("hidden");
    }
    if (!state.list.length) {
      listEl.innerHTML =
        '<div class="notif-empty"><i class="bi bi-bell-slash"></i><div>No notifications yet</div></div>';
      return;
    }
    listEl.innerHTML = "";
    state.list.forEach(function (n) {
      const el = Winstem.Utils.el(
        '<div class="notif-item' + (n.unread ? " unread" : "") + '" data-id="' + n.id + '">' +
          '<div class="notif-item-icon ' + (n.tone || "info") + '"><i class="bi ' + (n.icon || "bi-info-circle") + '"></i></div>' +
          '<div class="notif-item-body">' +
            '<div class="notif-item-title">' + Winstem.Utils.escapeHtml(n.title) + '</div>' +
            (n.message ? '<div class="notif-item-msg">' + Winstem.Utils.escapeHtml(n.message) + '</div>' : "") +
            '<div class="notif-item-time">' + Winstem.Utils.timeAgo(n.time) + '</div>' +
          '</div>' +
          '<button class="notif-item-dismiss" aria-label="Dismiss"><i class="bi bi-x-lg"></i></button>' +
        '</div>'
      );
      el.querySelector(".notif-item-dismiss").addEventListener("click", function (e) {
        e.stopPropagation();
        Winstem.Notifications.dismiss(n.id);
      });
      listEl.appendChild(el);
    });
  }

  function persist() {
    state.unread = state.list.filter(function (n) { return n.unread; }).length;
    const trimmed = state.list.slice(0, 50);
    state.list = trimmed;
    Winstem.Utils.storage.set("notifications", trimmed);
    renderCenter();
  }

  function makeToast(n) {
    const toast = Winstem.Utils.el(
      '<div class="win-toast ' + (n.tone || "info") + '" role="alert" data-id="' + n.id + '">' +
        '<div class="win-toast-icon"><i class="bi ' + (n.icon || "bi-info-circle") + '"></i></div>' +
        '<div class="win-toast-body">' +
          '<div class="win-toast-title">' + Winstem.Utils.escapeHtml(n.title) + '</div>' +
          (n.message ? '<div class="win-toast-msg">' + Winstem.Utils.escapeHtml(n.message) + '</div>' : "") +
        '</div>' +
        '<button class="win-toast-close" aria-label="Dismiss"><i class="bi bi-x-lg"></i></button>' +
        '<div class="win-toast-progress"></div>' +
      '</div>'
    );
    const container = document.getElementById("toast-container");
    container.appendChild(toast);
    const close = toast.querySelector(".win-toast-close");
    close.addEventListener("click", function () { dismissToast(toast, n.id); });
    toast.addEventListener("click", function () {
      if (n.onClick) n.onClick();
      dismissToast(toast, n.id);
    });
    const duration = n.duration !== undefined ? n.duration : 5000;
    if (duration > 0) {
      const prog = toast.querySelector(".win-toast-progress");
      if (prog) prog.style.animationDuration = (duration / 1000) + "s";
      setTimeout(function () { dismissToast(toast, n.id); }, duration);
    }
    return toast;
  }

  function dismissToast(toastEl, id) {
    if (!toastEl || !toastEl.parentNode) return;
    toastEl.classList.add("leaving");
    setTimeout(function () {
      if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      Winstem.Notifications.markRead(id);
    }, 220);
  }

  Winstem.Notifications = {
    init: function () {
      loadSettings();
      const stored = Winstem.Utils.storage.get("notifications", []);
      state.list = stored.filter(function (n) { return n && n.id; });
      if ("Notification" in window && typeof Notification.permission === "string") state.webPermission = Notification.permission;
      const btn = document.getElementById("notif-btn");
      if (btn) btn.addEventListener("click", function (e) {
        e.stopPropagation();
        Winstem.Notifications.toggleCenter();
      });
      const clearAll = document.getElementById("notif-clear-all");
      if (clearAll) clearAll.addEventListener("click", function () {
        state.list = [];
        persist();
      });
      document.addEventListener("click", function (e) {
        const center = document.getElementById("notif-center");
        const trigger = document.getElementById("notif-btn");
        if (center && !center.classList.contains("hidden") &&
            !center.contains(e.target) && trigger && !trigger.contains(e.target)) {
          center.classList.add("hidden");
        }
      });
      persist();
    },

    /** Show a notification. opts: {title, message, icon, tone, duration, onClick, web} */
    notify: function (opts) {
      const n = {
        id: Winstem.Utils.uid("n"),
        title: opts.title || "Winstem",
        message: opts.message || "",
        icon: opts.icon || "bi-info-circle",
        tone: opts.tone || "info",
        time: new Date().toISOString(),
        unread: true,
        onClick: opts.onClick
      };
      state.list.unshift(n);
      persist();

      /* Web Notifications — only if user enabled and granted */
      const cat = opts.category;
      const enabled = cat ? state.settings[cat] !== false : true;
      if (enabled && opts.web !== false && "Notification" in window &&
          state.settings.web && Notification.permission === "granted") {
        try {
          const w = new Notification(n.title, { body: n.message, icon: "assets/icons/system/icon-192.png" });
          if (opts.onClick) w.onclick = function () { window.focus(); opts.onClick(); };
        } catch (e) { /* ignore */ }
      }
      makeToast(n);
      return n;
    },

    success: function (title, message, opts) {
      return this.notify(Object.assign({ title: title, message: message, icon: "bi-check-circle", tone: "success" }, opts));
    },

    error: function (title, message, opts) {
      return this.notify(Object.assign({ title: title, message: message, icon: "bi-x-circle", tone: "danger" }, opts));
    },

    info: function (title, message, opts) {
      return this.notify(Object.assign({ title: title, message: message, icon: "bi-info-circle", tone: "info" }, opts));
    },

    dismiss: function (id) {
      state.list = state.list.filter(function (n) { return n.id !== id; });
      persist();
    },

    markRead: function (id) {
      const n = state.list.find(function (x) { return x.id === id; });
      if (n && n.unread) { n.unread = false; persist(); }
    },

    toggleCenter: function () {
      const center = document.getElementById("notif-center");
      if (!center) return;
      const open = center.classList.toggle("hidden");
      if (!open) {
        state.list.forEach(function (n) { n.unread = false; });
        persist();
      }
    },

    /* Settings */
    getSettings: function () { return Object.assign({}, state.settings); },
    setSetting: function (key, value) {
      state.settings[key] = value;
      saveSettings();
    },

    requestWebPermission: async function () {
      if (!("Notification" in window)) return false;
      try {
        const res = await Notification.requestPermission();
        state.webPermission = res;
        return res === "granted";
      } catch (e) {
        try {
          const res = await Notification.requestPermission();
          state.webPermission = res;
          return res === "granted";
        } catch (e2) { return false; }
      }
    },

    unreadCount: function () { return state.unread; }
  };
})();
