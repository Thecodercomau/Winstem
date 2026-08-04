/* Headless smoke test: stubs minimal browser globals, loads core modules
   in dependency order, and reports namespace wiring + obvious runtime bugs.
   Usage: node scripts/smoke-boot.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
globalThis.window = globalThis;
globalThis.addEventListener = function () {};
globalThis.Winstem = {};

/* ---- minimal DOM stub ---- */
const elStub = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {}, getAttribute: () => null, appendChild() {}, append() {},
  addEventListener() {}, removeEventListener() {}, querySelector: () => elStub(),
  querySelectorAll: () => [], innerHTML: "", textContent: "", value: "",
  dataset: {}, focus() {}, click() {}, closest: () => null,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  matches: () => false, contains: () => false, offsetWidth: 0, offsetHeight: 0
});
const elements = {};
const proxyDoc = new Proxy({}, {
  get(t, k) {
    if (k === "documentElement") return elStub();
    if (k === "body") return elStub();
    if (k === "head") return { appendChild() {}, append() {} };
    if (k === "createElement") return () => elStub();
    if (k === "querySelector" || k === "getElementById") return () => elStub();
    if (k === "querySelectorAll") return () => [];
    if (k === "addEventListener") return () => {};
    if (k === "createTextNode") return () => ({});
    if (k === "hidden" || k === "readyState") return false;
    return () => elStub();
  },
  set() { return true; }
});
globalThis.document = proxyDoc;
try {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, userAgent: "Node", language: "en", clipboard: { writeText: async () => {} }, mediaSession: undefined, share: undefined, storage: undefined },
    configurable: true
  });
} catch (e) {
  // Node >= 24 has a read-only navigator; patch what we can onto it
  Object.assign(globalThis.navigator, { onLine: true, language: "en", clipboard: { writeText: async () => {} }, mediaSession: undefined, share: undefined, storage: undefined });
}
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = undefined;
globalThis.fetch = () => Promise.resolve({ ok: true, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), blob: async () => new Blob() });
globalThis.Blob = class Blob { constructor(parts) { this.size = String(parts).length; } };
globalThis.File = class File extends Blob {};
globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
if (!globalThis.crypto) globalThis.crypto = require("crypto").webcrypto;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {}, removeListener() {} });
globalThis.Notification = undefined;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.HTMLInputElement = function () {}; globalThis.HTMLDivElement = function () {};
globalThis.CustomEvent = class CustomEvent { constructor(t, o) { this.type = t; Object.assign(this, o); } };
globalThis.Event = class Event { constructor(t) { this.type = t; } };
globalThis.KeyboardEvent = class KeyboardEvent { constructor(t, o) { this.type = t; Object.assign(this, o); } };
globalThis.PointerEvent = class PointerEvent { constructor(t, o) { this.type = t; Object.assign(this, o); } };
globalThis.DragEvent = class DragEvent { constructor(t, o) { this.type = t; Object.assign(this, o); } };
globalThis.Audio = class Audio { play() {} };
globalThis.Worker = function () {};
globalThis.serviceWorker = { register: async () => {}, getRegistrations: async () => [] };

/* order matters — mirrors index.html script order */
const modules = [
  "js/config.js", "js/utils.js", "js/filetypes.js", "js/database.js",
  "js/notifications.js", "js/themes.js", "js/auth.js", "js/storage.js",
  "js/filesystem.js", "js/sharing.js", "js/windows.js", "js/desktop.js",
  "js/taskbar.js", "js/launcher.js", "js/applications.js",
  "js/apps/calculator.js", "js/apps/editor.js", "js/apps/media.js",
  "js/apps/viewers.js", "js/apps/notes.js", "js/apps/files.js",
  "js/settings.js", "js/search.js", "js/shortcuts.js", "js/app.js"
];

let failures = 0;
for (const rel of modules) {
  const full = path.join(root, rel);
  const code = fs.readFileSync(full, "utf8");
  try {
    vm.runInThisContext(code, { filename: rel });
    console.log("  ✓", rel);
  } catch (e) {
    failures++;
    console.log("  ✗", rel, "→", e.message);
  }
}

/* verify key namespace surfaces exist (real API names) */
const checks = [
  ["Config.init", typeof Winstem.Config.init],
  ["Config.isConfigured", typeof Winstem.Config.isConfigured],
  ["Utils.escapeHtml", typeof Winstem.Utils.escapeHtml],
  ["Utils.storage", typeof Winstem.Utils.storage, "object"],
  ["FileTypes.info", typeof Winstem.FileTypes.info],
  ["DB.getClient", typeof Winstem.DB.getClient],
  ["DB.isConfigured", typeof Winstem.DB.isConfigured],
  ["Notifications.init", typeof Winstem.Notifications.init],
  ["Notifications.notify", typeof Winstem.Notifications.notify],
  ["Notifications.success", typeof Winstem.Notifications.success],
  ["Auth.init", typeof Winstem.Auth.init],
  ["Auth.signUp", typeof Winstem.Auth.signUp],
  ["Auth.signIn", typeof Winstem.Auth.signIn],
  ["Auth.signOut", typeof Winstem.Auth.signOut],
  ["Auth.isSignedIn", typeof Winstem.Auth.isSignedIn],
  ["Storage.upload", typeof Winstem.Storage.upload],
  ["Storage.download", typeof Winstem.Storage.download],
  ["FS.createFolder", typeof Winstem.FS.createFolder],
  ["FS.listFolder", typeof Winstem.FS.listFolder],
  ["FS.trash", typeof Winstem.FS.trash],
  ["FS.restore", typeof Winstem.FS.restore],
  ["FS.search", typeof Winstem.FS.search],
  ["Sharing.createLinkShare", typeof Winstem.Sharing.createLinkShare],
  ["WindowManager.open", typeof Winstem.WindowManager.open],
  ["WindowManager.close", typeof Winstem.WindowManager.close],
  ["Desktop.init", typeof Winstem.Desktop.init],
  ["Taskbar.init", typeof Winstem.Taskbar.init],
  ["Apps.register", typeof Winstem.Apps.register],
  ["Apps.all", typeof Winstem.Apps.all],
  ["Themes.apply", typeof Winstem.Themes.apply],
  ["Search.init", typeof Winstem.Search.init],
  ["Shortcuts.init", typeof Winstem.Shortcuts.init],
  ["App.emit", typeof Winstem.App.emit],
  ["App.on", typeof Winstem.App.on]
];
console.log("\nNamespace surface checks:");
for (const [name, type, expected] of checks) {
  const ok = type === (expected || "function");
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name} → ${type}`);
}

/* sanity: apps registered? */
console.log("\nRegistered apps:");
const apps = Winstem.Apps && Winstem.Apps.all ? Winstem.Apps.all() : [];
if (Array.isArray(apps)) {
  apps.forEach((a) => console.log("  -", a.id, "|", a.name, "| create:", typeof a.create));
} else {
  console.log("  (no Apps.all)");
}

console.log(failures === 0 ? "\nSMOKE TEST PASSED" : `\nSMOKE TEST FAILED (${failures} issues)`);
process.exit(failures === 0 ? 0 : 1);
