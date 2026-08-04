/* DOM-level boot test: loads the REAL index.html in jsdom, runs every
   <script> (including the config.local.js loader), stubs the Supabase
   client, and reports every console error/warning thrown during boot.
   Usage: node scripts/dom-test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require(path.join(process.env.TEMP || "/tmp", "wscheck/node_modules/jsdom"));

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const errors = [];
const warnings = [];
const vc = new VirtualConsole();
vc.on("error", (msg) => errors.push(String(msg).split("\n")[0]));
vc.on("warn", (msg) => warnings.push(String(msg).split("\n")[0]));
vc.on("jsdomError", (e) => errors.push("[jsdom] " + (e.detail ? e.detail.message : e.message)));

const dom = new JSDOM(html, {
  url: "http://localhost:4173/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
  resources: "usable"
});
const { window } = dom;
const { document } = window;

/* ── stub browser APIs jsdom lacks ── */
window.matchMedia = window.matchMedia || function () {
  return { matches: false, addEventListener() {}, addListener() {}, removeListener() {} };
};
window.URL.createObjectURL = window.URL.createObjectURL || function () { return "blob:fake"; };
window.URL.revokeObjectURL = window.URL.revokeObjectURL || function () {};
window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
window.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id));
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = window.scrollTo || function () {};

/* IndexedDB stub — local cache layer will gracefully skip */
window.indexedDB = undefined;

/* ── fetch: answer Supabase REST calls with empty/valid responses ── */
window.fetch = async function (url, opts) {
  const u = String(url);
  if (u.indexOf("supabase") === -1) {
    throw new Error("fetch to non-supabase URL (jsdom cannot load network): " + u.slice(0, 80));
  }
  if (u.indexOf("/auth/v1/token") !== -1 || u.indexOf("/auth/v1/verify") !== -1) {
    return { ok: true, status: 200, json: async () => ({}) };
  }
  return { ok: true, status: 200, json: async () => [], arrayBuffer: async () => new ArrayBuffer(0) };
};

/* ── minimal Supabase client stub ── */
function makeQueryStub() {
  const chain = {
    select: () => chain, eq: () => chain, is: () => chain, order: () => chain,
    limit: () => chain, single: () => chain, maybeSingle: () => chain,
    insert: () => chain, update: () => chain, delete: () => chain, rpc: () => chain,
    then: undefined
  };
  return chain;
}
const queryStub = makeQueryStub();
window.supabase = {
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { session: null }, error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: null }, error: null })
    },
    from: () => Object.assign({}, queryStub, {
      select: (cols) => Object.assign({}, queryStub, { eq: () => Object.assign({}, queryStub, { maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: () => Object.assign({}, queryStub, { select: () => Object.assign({}, queryStub, { maybeSingle: async () => ({ data: null, error: null }) }) }),
      update: () => Object.assign({}, queryStub, { eq: () => Object.assign({}, queryStub, { select: () => Object.assign({}, queryStub, { maybeSingle: async () => ({ data: null, error: null }) }) }) })
    }),
    rpc: async () => ({ data: null, error: { message: "This share link is not valid." } }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "blob:fake" }, error: null }) }) }
  })
};

/* ── run every <script src> in order (vendor + app modules) ── */
function loadScripts() {
  return new Promise((resolve) => {
    const scripts = Array.from(document.querySelectorAll("script[src]"));
    let i = 0;
    const next = function () {
      if (i >= scripts.length) return resolve();
      const s = scripts[i++];
      const code = fs.readFileSync(path.join(root, s.getAttribute("src")), "utf8");
      try {
        window.eval(code);
      } catch (e) {
        errors.push("[script " + s.getAttribute("src") + "] " + e.message);
      }
      next();
    };
    next();
  });
}

/* inline loader runs config.local.js — simulate it */
function runInlineConfigLoader() {
  try {
    const cfgPath = path.join(root, "js/config.local.js");
    if (fs.existsSync(cfgPath)) {
      window.eval(fs.readFileSync(cfgPath, "utf8"));
    }
  } catch (e) { errors.push("[config.local.js] " + e.message); }
}

(async function () {
  window.Winstem = window.Winstem || {};  // as index.html now declares it
  runInlineConfigLoader();
  await loadScripts();

  /* Give async boot a moment; dispatch DOMContentLoaded like a browser */
  if (document.readyState !== "complete") {
    document.dispatchEvent(new window.Event("DOMContentLoaded"));
  }
  await new Promise((r) => setTimeout(r, 1500));

  const bootSplash = document.getElementById("boot-splash");
  const osHidden = document.getElementById("os").classList.contains("hidden");
  const authHidden = document.getElementById("auth-view").classList.contains("hidden");
  const splashState = bootSplash ? (bootSplash.parentNode ? "visible" : "removed") : "gone";

  console.log("=== DOM BOOT TEST ===");
  console.log("splash:", splashState);
  console.log("os hidden:", osHidden, "| auth hidden:", authHidden);
  console.log("console errors:", errors.length ? errors.length : 0);
  errors.slice(0, 30).forEach((e) => console.log("  ✗ " + e));
  console.log("console warnings:", warnings.length ? warnings.length : 0);
  warnings.slice(0, 15).forEach((w) => console.log("  ⚠ " + w));
  console.log(errors.length === 0 ? "NO ERRORS ✓" : "ERRORS FOUND ✗");
  process.exit(errors.length ? 1 : 0);
})();
