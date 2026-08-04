/* ═══════════════════════════════════════════════════════════
   WINSTEM — Configuration
   Central, safe configuration for the whole application.

   🔒 SECURITY NOTES
   — Only the public Supabase project URL and the publishable
     (anon) key belong here. These are safe to expose.
   — NEVER put the service_role key or any secret in this file
     or anywhere in the frontend.
   — For a real deployment, create `js/config.local.js` with
     window.WINSTEM_CONFIG = { supabaseUrl: "...", supabaseAnonKey: "..." }
     (see js/config.local.example.js). config.local.js is gitignored.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    appName: "Winstem",
    appVersion: "1.0.0",
    appEdition: "Web Edition",
    tagline: "Cloud Operating Environment",

    /* Supabase — replace with your own project values */
    supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
    supabaseAnonKey: "YOUR-PUBLIC-ANON-KEY",

    /* Storage buckets (must be created in Supabase, see supabase/storage.sql) */
    filesBucket: "winstem-files",
    avatarsBucket: "winstem-avatars",

    /* Default quota applied to new profiles (bytes) — 1 GB */
    defaultQuotaBytes: 1024 * 1024 * 1024,

    /* Local persistence keys */
    localStoragePrefix: "winstem:",

    /* Uploads */
    maxUploadQueueSize: 20,
    chunkRetryCount: 2,

    /* Search */
    searchDebounceMs: 250,

    /* Share links */
    defaultShareExpiryDays: 7,
    maxShareExpiryDays: 30,

    /* PWA / SW */
    serviceWorkerPath: "service-worker.js",

    /* Which built-in apps appear on a fresh desktop */
    pinnedApps: ["files", "notes", "settings", "recycle"],
    desktopApps: ["files", "notes", "settings", "recycle", "calculator", "editor"]
  });

  const state = {
    ready: false,
    config: Object.assign({}, DEFAULTS)
  };

  Winstem.Config = {
    /** Merge any values provided by js/config.local.js (window.WINSTEM_CONFIG). */
    init: function () {
      const local = window.WINSTEM_CONFIG;
      if (local && typeof local === "object") {
        Object.assign(state.config, local);
      }
      state.ready = true;
      state.config.supabaseConfigured =
        state.config.supabaseUrl &&
        !/YOUR-PROJECT/.test(state.config.supabaseUrl) &&
        state.config.supabaseAnonKey &&
        state.config.supabaseAnonKey.length > 20 &&
        state.config.supabaseAnonKey.indexOf("YOUR-") === -1;
      return state.config;
    },

    /** All configuration values. */
    all: function () {
      return state.config;
    },

    /** A single configuration value. */
    get: function (key) {
      return state.config[key];
    },

    /** True when the user has configured real Supabase credentials. */
    isConfigured: function () {
      return state.config.supabaseConfigured === true;
    },

    /** Namespaced localStorage key. */
    key: function (name) {
      return state.config.localStoragePrefix + name;
    }
  };
})();
