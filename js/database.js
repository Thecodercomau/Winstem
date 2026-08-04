/* ═══════════════════════════════════════════════════════════
   WINSTEM — Database
   Supabase client creation + local IndexedDB cache layer.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const state = {
    client: null,
    localDB: null,
    localReady: false
  };

  /* ── Tiny IndexedDB key/value + stores cache ───────────── */
  function openLocalDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const req = indexedDB.open("winstem-local", 1);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
        if (!db.objectStoreNames.contains("cache")) {
          const store = db.createObjectStore("cache", { keyPath: "key" });
          store.createIndex("by_key", "key", { unique: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  const LocalDB = {
    async init() {
      if (state.localReady) return;
      try {
        state.localDB = await openLocalDB();
        state.localReady = true;
      } catch (e) {
        state.localReady = false;
      }
    },

    tx(store, mode) {
      return state.localDB.transaction(store, mode).objectStore(store);
    },

    /** Set a plain key → value in the kv store. */
    async set(key, value) {
      if (!state.localReady) return;
      try {
        await new Promise(function (resolve, reject) {
          const r = LocalDB.tx("kv", "readwrite").put(value, key);
          r.onsuccess = resolve; r.onerror = function () { reject(r.error); };
        });
      } catch (e) { /* ignore */ }
    },

    async get(key, fallback) {
      if (!state.localReady) return fallback;
      try {
        const v = await new Promise(function (resolve, reject) {
          const r = LocalDB.tx("kv", "readonly").get(key);
          r.onsuccess = function () { resolve(r.result); };
          r.onerror = function () { reject(r.error); };
        });
        return v === undefined ? fallback : v;
      } catch (e) { return fallback; }
    },

    async remove(key) {
      if (!state.localReady) return;
      try {
        await new Promise(function (resolve, reject) {
          const r = LocalDB.tx("kv", "readwrite").delete(key);
          r.onsuccess = resolve; r.onerror = function () { reject(r.error); };
        });
      } catch (e) { /* ignore */ }
    },

    /** Cache API with expiry (ms). */
    async cacheSet(key, value, ttlMs) {
      if (!state.localReady) return;
      const entry = { key: key, value: value, expires: Date.now() + (ttlMs || 5 * 60 * 1000) };
      try {
        await new Promise(function (resolve, reject) {
          const r = LocalDB.tx("cache", "readwrite").put(entry);
          r.onsuccess = resolve; r.onerror = function () { reject(r.error); };
        });
      } catch (e) { /* ignore */ }
    },

    async cacheGet(key, maxAgeMs) {
      if (!state.localReady) return null;
      try {
        const entry = await new Promise(function (resolve, reject) {
          const r = LocalDB.tx("cache", "readonly").get(key);
          r.onsuccess = function () { resolve(r.result); };
          r.onerror = function () { reject(r.error); };
        });
        if (!entry) return null;
        if (maxAgeMs && Date.now() - (Date.now() - (entry.expires - (maxAgeMs || 0))) > maxAgeMs) return null;
        if (entry.expires && Date.now() > entry.expires) return null;
        return entry.value;
      } catch (e) { return null; }
    },

    async cacheDelete(key) {
      if (!state.localReady) return;
      try {
        await new Promise(function (resolve, reject) {
          const r = LocalDB.tx("cache", "readwrite").delete(key);
          r.onsuccess = resolve; r.onerror = function () { reject(r.error); };
        });
      } catch (e) { /* ignore */ }
    },

    async clear() {
      if (!state.localReady) return;
      try {
        const stores = ["kv", "cache"];
        for (const s of stores) {
          await new Promise(function (resolve, reject) {
            const r = LocalDB.tx(s, "readwrite").clear();
            r.onsuccess = resolve; r.onerror = function () { reject(r.error); };
          });
        }
      } catch (e) { /* ignore */ }
    }
  };

  Winstem.DB = {
    /** Create (or return) the Supabase client. Safe to call multiple times. */
    getClient: function () {
      if (state.client) return state.client;
      if (!Winstem.Config.isConfigured()) {
        throw new Error("Supabase is not configured. Add js/config.local.js with your project URL and anon key.");
      }
      const cfg = Winstem.Config.all();
      if (!window.supabase || !window.supabase.createClient) {
        throw new Error("Supabase client library failed to load.");
      }
      state.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "winstem-auth"
        }
      });
      return state.client;
    },

    isConfigured: function () {
      return Winstem.Config.isConfigured();
    },

    LocalDB: LocalDB,

    initLocalDB: function () {
      return LocalDB.init();
    }
  };
})();
