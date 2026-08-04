/* ═══════════════════════════════════════════════════════════
   WINSTEM — Themes & Appearance
   Light / dark / system themes, accent colors, wallpapers,
   UI scale and animation preferences. Preferences are cached
   locally and synchronized with the cloud when signed in.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const ACCENTS = {
    blue:   { name: "Winstem Blue",   value: "#4f8cff" },
    cyan:   { name: "Cyan",           value: "#22d3ee" },
    violet: { name: "Violet",         value: "#8b5cf6" },
    fuchsia:{ name: "Fuchsia",        value: "#d946ef" },
    emerald:{ name: "Emerald",        value: "#10b981" },
    amber:  { name: "Amber",          value: "#f59e0b" },
    rose:   { name: "Rose",           value: "#f43f5e" },
    slate:  { name: "Slate",          value: "#64748b" }
  };

  const WALLPAPERS = [
    { id: "aurora", label: "Aurora",      file: "aurora.svg" },
    { id: "dusk",    label: "Dusk",       file: "dusk.svg" },
    { id: "ocean",   label: "Ocean",      file: "ocean.svg" },
    { id: "mint",    label: "Mint",       file: "mint.svg" },
    { id: "light",   label: "Light Sands",file: "light.svg" },
    { id: "dark",    label: "Obsidian",   file: "dark.svg" }
  ];

  const state = {
    theme: "dark",
    accent: "blue",
    wallpaper: "aurora",
    uiScale: 1,
    animations: true,
    systemDark: window.matchMedia("(prefers-color-scheme: dark)").matches
  };

  function applyAll() {
    const cfg = state;

    /* Theme */
    let resolved = cfg.theme;
    if (cfg.theme === "system") resolved = cfg.systemDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", resolved);

    /* Accent */
    const accent = ACCENTS[cfg.accent] || ACCENTS.blue;
    document.documentElement.style.setProperty("--accent", accent.value);
    document.documentElement.style.setProperty("--accent-rgb", hexToRgb(accent.value));
    document.documentElement.style.setProperty("--accent-soft", accent.value + "26");

    /* Wallpaper */
    const desktop = document.getElementById("desktop");
    if (desktop) {
      const wp = WALLPAPERS.find(function (w) { return w.id === cfg.wallpaper; }) || WALLPAPERS[0];
      desktop.style.backgroundImage = "url('assets/images/wallpapers/" + wp.file + "')";
    }

    /* UI scale */
    document.documentElement.style.setProperty("--ui-scale", String(cfg.uiScale || 1));

    /* Animations */
    document.documentElement.style.setProperty("--anim-enabled", cfg.animations ? "1" : "0");

    /* Meta theme color */
    const meta = document.getElementById("meta-theme-color");
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0b0e14" : "#eef1f6");
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + "," + parseInt(h.slice(4, 6), 16);
  }

  function persistLocal() {
    Winstem.Utils.storage.set("appearance", {
      theme: state.theme, accent: state.accent, wallpaper: state.wallpaper,
      uiScale: state.uiScale, animations: state.animations
    });
  }

  function pushToCloud() {
    if (Winstem.Auth && Winstem.Auth.getUser()) {
      Winstem.Auth.updateSettings({
        theme: state.theme, accent_color: state.accent, wallpaper: state.wallpaper,
        ui_scale: state.uiScale, animations: state.animations
      }).catch(function () { /* non-fatal */ });
    }
  }

  Winstem.Themes = {
    init: function () {
      const saved = Winstem.Utils.storage.get("appearance", null);
      if (saved) Object.assign(state, saved);

      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
        state.systemDark = e.matches;
        if (state.theme === "system") applyAll();
      });

      document.addEventListener("DOMContentLoaded", function () { applyAll(); });
      applyAll();
    },

    apply: applyAll,

    getState: function () { return Object.assign({}, state); },

    set: function (key, value) {
      state[key] = value;
      applyAll();
      persistLocal();
      pushToCloud();
      this.emit("change", this.getState());
    },

    setFromCloud: function (settings) {
      if (!settings) return;
      let changed = false;
      if (settings.theme && settings.theme !== state.theme) { state.theme = settings.theme; changed = true; }
      if (settings.accent_color && settings.accent_color !== state.accent) { state.accent = settings.accent_color; changed = true; }
      if (settings.wallpaper && settings.wallpaper !== state.wallpaper) { state.wallpaper = settings.wallpaper; changed = true; }
      if (settings.ui_scale && settings.ui_scale !== state.uiScale) { state.uiScale = settings.ui_scale; changed = true; }
      if (settings.animations !== undefined && settings.animations !== state.animations) {
        state.animations = settings.animations; changed = true;
      }
      if (changed) { applyAll(); persistLocal(); }
    },

    /* Tiny event bus */
    _listeners: {},
    on: function (evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); },
    emit: function (evt, data) {
      (this._listeners[evt] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { /* noop */ } });
    },

    accents: ACCENTS,
    wallpapers: WALLPAPERS
  };
})();
