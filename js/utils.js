/* ═══════════════════════════════════════════════════════════
   WINSTEM — Utils
   Small, dependency-free helpers used across all modules.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ═══ Global event bus ═══════════════════════════════════
     Created here (early-loading module) so any module can
     subscribe at load time. app.js boot may extend it. */
  if (!Winstem.App) {
    const _listeners = {};
    Winstem.App = {
      on: function (evt, fn) {
        (_listeners[evt] = _listeners[evt] || []).push(fn);
      },
      emit: function (evt, data) {
        (_listeners[evt] || []).slice().forEach(function (fn) {
          try { fn(data); } catch (e) { console.error("listener(" + evt + "):", e); }
        });
      },
      mark: function () { /* boot timings hooked in app.js */ }
    };
  }

  Winstem.Utils = {
    /* ── Timing ─────────────────────────────────────────── */
    debounce: function (fn, wait) {
      let t = null;
      const f = function () {
        const ctx = this, args = arguments;
        if (t) clearTimeout(t);
        t = setTimeout(function () { t = null; fn.apply(ctx, args); }, wait);
      };
      f.cancel = function () { if (t) clearTimeout(t); t = null; };
      return f;
    },

    throttle: function (fn, limit) {
      let last = 0, pending = null;
      const f = function () {
        const ctx = this, args = arguments, now = Date.now();
        if (now - last >= limit) {
          last = now;
          fn.apply(ctx, args);
        } else if (!pending) {
          pending = setTimeout(function () {
            pending = null;
            last = Date.now();
            fn.apply(ctx, args);
          }, limit - (now - last));
        }
      };
      f.cancel = function () { if (pending) clearTimeout(pending); pending = null; };
      return f;
    },

    /* ── Identifiers ────────────────────────────────────── */
    uid: function (prefix) {
      const rnd = (typeof crypto !== "undefined" && crypto.getRandomValues)
        ? Array.from(crypto.getRandomValues(new Uint8Array(8)), function (b) {
            return b.toString(16).padStart(2, "0");
          }).join("")
        : Math.random().toString(16).slice(2) + Date.now().toString(16);
      return (prefix || "") + rnd;
    },

    /* ── Formatting ─────────────────────────────────────── */
    formatBytes: function (bytes, decimals) {
      if (bytes === null || bytes === undefined || isNaN(bytes)) return "—";
      if (bytes === 0) return "0 B";
      const k = 1024;
      const dm = decimals === undefined ? 1 : decimals;
      const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    },

    formatDate: function (d, withTime) {
      if (!d) return "—";
      const date = (d instanceof Date) ? d : new Date(d);
      if (isNaN(date.getTime())) return "—";
      const opts = { year: "numeric", month: "short", day: "numeric" };
      if (withTime) { opts.hour = "2-digit"; opts.minute = "2-digit"; }
      return date.toLocaleDateString(undefined, opts);
    },

    formatTime: function (d) {
      const date = (d instanceof Date) ? d : new Date(d);
      return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    },

    timeAgo: function (d) {
      if (!d) return "—";
      const date = (d instanceof Date) ? d : new Date(d);
      const sec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (sec < 5) return "just now";
      if (sec < 60) return sec + "s ago";
      const min = Math.floor(sec / 60);
      if (min < 60) return min + "m ago";
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + "h ago";
      const day = Math.floor(hr / 24);
      if (day < 7) return day + "d ago";
      return this.formatDate(date, true);
    },

    /* ── Strings / escaping ─────────────────────────────── */
    escapeHtml: function (str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    escapeAttr: function (str) {
      return this.escapeHtml(str).replace(/`/g, "&#96;");
    },

    sanitizeName: function (name) {
      /* Strip path separators and control characters from a file/folder name. */
      let n = String(name || "").trim();
      n = n.replace(/[\/\\:*?"<>|\u0000-\u001f]/g, "");
      n = n.replace(/[.\s]+$/g, "");
      n = n.slice(0, 255);
      return n;
    },

    slugify: function (s) {
      return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    },

    /* ── Data ───────────────────────────────────────────── */
    deepClone: function (obj) {
      if (obj === null || typeof obj !== "object") return obj;
      return JSON.parse(JSON.stringify(obj));
    },

    /* ── DOM ────────────────────────────────────────────── */
    el: function (html) {
      const t = document.createElement("template");
      t.innerHTML = html.trim();
      return t.content.firstChild;
    },

    setLoading: function (button, loading, label) {
      if (!button) return;
      const spinner = button.querySelector(".spinner-border");
      const lbl = button.querySelector(".btn-label");
      if (loading) {
        button.disabled = true;
        if (spinner) spinner.classList.remove("d-none");
        if (lbl) lbl.textContent = label || "Please wait…";
      } else {
        button.disabled = false;
        if (spinner) spinner.classList.add("d-none");
        if (lbl) lbl.textContent = label || "Submit";
      }
    },

    /* ── Files / Blobs ──────────────────────────────────── */
    downloadBlob: function (blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 400);
    },

    downloadUrl: function (url, filename) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); }, 400);
    },

    readFileAsText: function (file) {
      return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
        r.readAsText(file);
      });
    },

    readFileAsArrayBuffer: function (file) {
      return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
        r.readAsArrayBuffer(file);
      });
    },

    /* ── Clipboard ──────────────────────────────────────── */
    copyText: async function (text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (e) { /* fall through */ }
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    },

    /* ── Feature detection ──────────────────────────────── */
    supports: {
      fileSystemAccess: function () { return "showOpenFilePicker" in window; },
      notifications: function () { return "Notification" in window; },
      serviceWorker: function () { return "serviceWorker" in navigator; },
      indexedDB: function () { return "indexedDB" in window; },
      webAudio: function () { return typeof AudioContext !== "undefined" || typeof webkitAudioContext !== "undefined"; },
      fullscreen: function () { return document.fullscreenEnabled; }
    },

    isTouchDevice: function () {
      return ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    },

    isMobile: function () {
      return window.matchMedia("(max-width: 768px)").matches;
    },

    platform: (function () {
      const ua = navigator.userAgent || "";
      if (/Mac/.test(ua)) return "mac";
      if (/Win/.test(ua)) return "win";
      if (/Linux|CrOS/.test(ua)) return "linux";
      return "other";
    })(),

    isMod: function (e) { return Winstem.Utils.platform === "mac" ? e.metaKey : e.ctrlKey; },

    /* ── Storage (safe wrappers) ────────────────────────── */
    storage: {
      get: function (key, fallback) {
        try {
          const raw = localStorage.getItem(Winstem.Config.key(key));
          if (raw === null) return fallback;
          return JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (key, value) {
        try { localStorage.setItem(Winstem.Config.key(key), JSON.stringify(value)); }
        catch (e) { /* quota or private mode */ }
      },
      remove: function (key) {
        try { localStorage.removeItem(Winstem.Config.key(key)); } catch (e) { /* noop */ }
      }
    },

    /* ── Misc ───────────────────────────────────────────── */
    hash: async function (buffer) {
      try {
        if (crypto && crypto.subtle) {
          const digest = await crypto.subtle.digest("SHA-256", buffer);
          return Array.from(new Uint8Array(digest), function (b) {
            return b.toString(16).padStart(2, "0");
          }).join("");
        }
      } catch (e) { /* fall through */ }
      return null;
    },

    truncateMiddle: function (str, max) {
      if (!str || str.length <= max) return str || "";
      const half = Math.floor((max - 1) / 2);
      return str.slice(0, half) + "…" + str.slice(str.length - half);
    }
  };
})();
