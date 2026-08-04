/* ═══════════════════════════════════════════════════════════
   WINSTEM — Launcher & Start Menu
   Renders the start menu (pinned + all apps) and the full
   screen launcher overlay with live app search.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const PIN_KEY = "launcher-pinned";

  function $id(id) { return document.getElementById(id); }

  function loadPinned() {
    return Winstem.Utils.storage.get(PIN_KEY, null) || ["files", "notes", "settings", "recycle", "editor", "calculator"];
  }

  function savePinned(list) {
    Winstem.Utils.storage.set(PIN_KEY, list);
  }

  function appGlyph(app) {
    if (app.icon) return '<i class="bi ' + app.icon + '"></i>';
    return '<span>' + Winstem.Utils.escapeHtml(app.name.charAt(0)) + '</span>';
  }

  function renderStartMenu() {
    const pinnedBox = $id("start-pinned");
    const appsBox = $id("start-apps");
    if (!pinnedBox || !appsBox) return;

    const pinned = loadPinned();
    const all = Winstem.Apps.all();

    pinnedBox.innerHTML = "";
    all.filter(function (a) { return pinned.includes(a.id); }).forEach(function (app) {
      const el = Winstem.Utils.el(
        '<button class="start-app-tile" data-app="' + Winstem.Utils.escapeAttr(app.id) + '" title="' + Winstem.Utils.escapeAttr(app.name) + '">' +
          '<span class="start-app-glyph">' + appGlyph(app) + '</span>' +
          '<span class="start-app-name">' + Winstem.Utils.escapeHtml(app.name) + '</span>' +
        '</button>'
      );
      el.addEventListener("click", function () {
        Winstem.Taskbar.closeFlyouts();
        Winstem.Apps.launch(app.id);
      });
      el.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        Winstem.Desktop.showMenu([
          { label: "Open", icon: "bi-box-arrow-up-right", action: function () { Winstem.Apps.launch(app.id); } },
          { label: "Unpin from Start", icon: "bi-pin-angle", action: function () {
              const next = pinned.filter(function (p) { return p !== app.id; });
              savePinned(next);
              renderStartMenu();
          }},
          { label: "Pin to taskbar", icon: "bi-pin", action: function () { Winstem.Taskbar.pin(app.id); } }
        ], e.clientX, e.clientY);
      });
      pinnedBox.appendChild(el);
    });

    if (!pinnedBox.children.length) {
      pinnedBox.innerHTML = '<div class="start-empty">Pin apps here</div>';
    }

    appsBox.innerHTML = "";
    all.forEach(function (app) {
      const el = Winstem.Utils.el(
        '<button class="start-app-row" data-app="' + Winstem.Utils.escapeAttr(app.id) + '">' +
          '<span class="start-app-glyph">' + appGlyph(app) + '</span>' +
          '<span class="start-app-name">' + Winstem.Utils.escapeHtml(app.name) + '</span>' +
        '</button>'
      );
      el.addEventListener("click", function () {
        Winstem.Taskbar.closeFlyouts();
        Winstem.Apps.launch(app.id);
      });
      appsBox.appendChild(el);
    });
  }

  function renderLauncher(filter) {
    const grid = $id("launcher-grid");
    if (!grid) return;
    const q = (filter || "").toLowerCase().trim();
    grid.innerHTML = "";
    const apps = Winstem.Apps.all().filter(function (a) {
      if (!q) return true;
      return a.name.toLowerCase().indexOf(q) !== -1 ||
             a.id.toLowerCase().indexOf(q) !== -1 ||
             (a.tags || []).some(function (t) { return t.toLowerCase().indexOf(q) !== -1; });
    });
    if (!apps.length) {
      grid.innerHTML = '<div class="launcher-empty"><i class="bi bi-search"></i><div>No apps match "' + Winstem.Utils.escapeHtml(q) + '"</div></div>';
      return;
    }
    apps.forEach(function (app) {
      const tile = Winstem.Utils.el(
        '<button class="launcher-tile" data-app="' + Winstem.Utils.escapeAttr(app.id) + '" title="' + Winstem.Utils.escapeAttr(app.name) + '">' +
          '<span class="launcher-tile-glyph">' + appGlyph(app) + '</span>' +
          '<span class="launcher-tile-name">' + Winstem.Utils.escapeHtml(app.name) + '</span>' +
        '</button>'
      );
      tile.addEventListener("click", function () {
        Winstem.Launcher.close();
        Winstem.Apps.launch(app.id);
      });
      grid.appendChild(tile);
    });
  }

  Winstem.Launcher = {
    init: function () {
      const startSearch = $id("start-search-input");
      if (startSearch) {
        startSearch.addEventListener("input", Winstem.Utils.debounce(function () {
          renderStartMenu(startSearch.value);
        }, 120));
        startSearch.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            const q = startSearch.value.trim();
            if (q) { Winstem.Taskbar.closeFlyouts(); Winstem.Search.open(q); }
          }
        });
      }

      const launcherInput = $id("launcher-input");
      if (launcherInput) {
        launcherInput.addEventListener("input", Winstem.Utils.debounce(function () {
          renderLauncher(launcherInput.value);
        }, 100));
        launcherInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            const first = document.querySelector("#launcher-grid .launcher-tile");
            if (first) { Winstem.Launcher.close(); Winstem.Apps.launch(first.getAttribute("data-app")); }
          }
          if (e.key === "Escape") Winstem.Launcher.close();
        });
      }

      /* escape closes launcher */
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") Winstem.Launcher.close();
      });

      /* clicking backdrop closes launcher */
      const launcher = $id("launcher");
      launcher.addEventListener("pointerdown", function (e) {
        if (e.target === launcher) Winstem.Launcher.close();
      });
    },

    open: function () {
      renderStartMenu();
      renderLauncher("");
      const launcher = $id("launcher");
      launcher.classList.remove("hidden");
      setTimeout(function () { $id("launcher-input").focus(); }, 60);
    },

    close: function () {
      const launcher = $id("launcher");
      if (launcher) launcher.classList.add("hidden");
    },

    refreshStartMenu: renderStartMenu
  };
})();
