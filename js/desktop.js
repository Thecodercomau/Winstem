/* ═══════════════════════════════════════════════════════════
   WINSTEM — Desktop
   Wallpaper, desktop icons (draggable, renameable), rubber-band
   selection and desktop context menu.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const state = {
    icons: [],          /* [{id, appId, label, icon, x, y, pinned}] */
    selection: [],      /* icon ids */
    dragState: null,
    selRect: null
  };

  const ICON_KEY = "desktop-icons";
  const GRID = 86;

  function $id(id) { return document.getElementById(id); }

  function defaultIcons() {
    return Winstem.Config.get("desktopApps").map(function (appId, i) {
      return { id: "d" + i, appId: appId, label: null, x: 16, y: 16 + i * GRID, pinned: true };
    });
  }

  function loadIcons() {
    const saved = Winstem.Utils.storage.get(ICON_KEY, null);
    if (saved && Array.isArray(saved) && saved.length) {
      state.icons = saved;
    } else {
      state.icons = defaultIcons();
    }
  }

  function saveIcons() {
    Winstem.Utils.storage.set(ICON_KEY, state.icons.map(function (i) {
      return { id: i.id, appId: i.appId, label: i.label, x: i.x, y: i.y, pinned: i.pinned };
    }));
  }

  function render() {
    const container = $id("desktop-icons");
    if (!container) return;
    container.innerHTML = "";
    state.icons.forEach(function (icon) {
      const app = Winstem.Apps.get(icon.appId);
      const label = icon.label || (app ? app.name : "Item");
      const el = Winstem.Utils.el(
        '<div class="desktop-icon" data-id="' + Winstem.Utils.escapeAttr(icon.id) + '" ' +
          'style="transform:translate(' + icon.x + 'px,' + icon.y + 'px)" ' +
          'tabindex="0" role="button" aria-label="' + Winstem.Utils.escapeAttr(label) + '">' +
          '<div class="desktop-icon-glyph">' +
            (app && app.glyph ? app.glyph :
              '<svg viewBox="0 0 64 64" width="46" height="46"><rect x="8" y="8" width="48" height="48" rx="12" fill="#4f8cff"/><text x="32" y="41" text-anchor="middle" font-size="22" fill="#fff" font-family="Segoe UI, sans-serif">' +
              Winstem.Utils.escapeHtml(label.charAt(0).toUpperCase()) + '</text></svg>') +
          '</div>' +
          '<div class="desktop-icon-label">' + Winstem.Utils.escapeHtml(label) + '</div>' +
        '</div>'
      );
      if (app && app.icon) el.querySelector(".desktop-icon-glyph").innerHTML =
        '<i class="bi ' + app.icon + '"></i>';
      bindIconEvents(el, icon);
      container.appendChild(el);
    });
  }

  function bindIconEvents(el, icon) {
    /* double click to open */
    let clickTimer = null;
    el.addEventListener("pointerdown", function (e) {
      if (e.button === 2) return;
      if (state.selRect) return;
      if (!state.selection.includes(icon.id)) {
        clearSelection();
      }
      state.dragState = { id: icon.id, startX: e.clientX, startY: e.clientY, origX: icon.x, origY: icon.y, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", function (e) {
      const d = state.dragState;
      if (!d || d.id !== icon.id) return;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        d.moved = true;
        clearSelection();
        state.selection = [icon.id];
        updateSelectionUI();
      }
      if (d.moved) {
        const maxX = Math.max(0, (window.innerWidth - 40) - 92);
        const maxY = Math.max(0, (window.innerHeight - $id("taskbar").offsetHeight) - 100);
        icon.x = Math.max(0, Math.min(d.origX + dx, maxX));
        icon.y = Math.max(0, Math.min(d.origY + dy, maxY));
        el.style.transform = "translate(" + icon.x + "px," + icon.y + "px)";
      }
    });
    el.addEventListener("pointerup", function () {
      if (state.dragState && state.dragState.id === icon.id) {
        const moved = state.dragState.moved;
        state.dragState = null;
        if (moved) { saveIcons(); return; }
        /* simple click handling */
        if (state.selection.includes(icon.id) && state.selection.length === 1) {
          clickTimer = setTimeout(function () {
            /* single click → focus window if app running */
            const win = Winstem.WindowManager.all().find(function (w) { return w.appId === icon.appId; });
            if (win) Winstem.WindowManager.focus(win.id);
          }, 260);
        }
      }
    });
    el.addEventListener("dblclick", function () {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      openIcon(icon);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { openIcon(icon); }
      if (e.key === "F2") { renameIcon(icon); }
      if (e.key === "Delete") { removeIcon(icon); }
    });
    el.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!state.selection.includes(icon.id)) {
        clearSelection();
        state.selection = [icon.id];
        updateSelectionUI();
      }
      Winstem.Desktop.showIconContextMenu(e.clientX, e.clientY, icon);
    });
  }

  function openIcon(icon) {
    const app = Winstem.Apps.get(icon.appId);
    if (app) {
      Winstem.Apps.launch(icon.appId, { via: "desktop" });
    }
  }

  function clearSelection() {
    state.selection = [];
    updateSelectionUI();
  }

  function updateSelectionUI() {
    document.querySelectorAll(".desktop-icon").forEach(function (el) {
      el.classList.toggle("selected", state.selection.includes(el.getAttribute("data-id")));
    });
  }

  function renameIcon(icon) {
    const app = Winstem.Apps.get(icon.appId);
    const current = icon.label || (app ? app.name : "Item");
    const label = prompt("Rename desktop icon:", current);
    if (label === null) return;
    const clean = Winstem.Utils.sanitizeName(label);
    if (!clean) return;
    icon.label = clean;
    saveIcons();
    render();
  }

  function removeIcon(icon) {
    if (!confirm("Remove \"" + (icon.label || Winstem.Apps.get(icon.appId).name) + "\" from the desktop?")) return;
    state.icons = state.icons.filter(function (i) { return i.id !== icon.id; });
    saveIcons();
    render();
  }

  /* ═══════════════ rubber-band selection ═══════════════ */
  function startSelection(e) {
    if (state.dragState) return;
    clearSelection();
    const rect = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY };
    state.selRect = rect;
    const selEl = $id("desktop-selection");
    selEl.classList.remove("hidden");
    updateRect(selEl, rect);
    document.addEventListener("pointermove", selMove);
    document.addEventListener("pointerup", selEnd, { once: true });
  }

  function selMove(e) {
    if (!state.selRect) return;
    state.selRect.x2 = e.clientX;
    state.selRect.y2 = e.clientY;
    updateRect($id("desktop-selection"), state.selRect);
    /* hit test icons */
    const r = normalizeRect(state.selRect);
    state.selection = [];
    document.querySelectorAll(".desktop-icon").forEach(function (el) {
      const b = el.getBoundingClientRect();
      const hit = !(b.right < r.left || b.left > r.right || b.bottom < r.top || b.top > r.bottom);
      el.classList.toggle("selected", hit);
      if (hit) state.selection.push(el.getAttribute("data-id"));
    });
  }

  function selEnd() {
    state.selRect = null;
    const selEl = $id("desktop-selection");
    selEl.classList.add("hidden");
    document.removeEventListener("pointermove", selMove);
  }

  function normalizeRect(r) {
    return { left: Math.min(r.x1, r.x2), top: Math.min(r.y1, r.y2), right: Math.max(r.x1, r.x2), bottom: Math.max(r.y1, r.y2) };
  }

  function updateRect(el, r) {
    const left = Math.min(r.x1, r.x2), top = Math.min(r.y1, r.y2);
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.width = Math.abs(r.x2 - r.x1) + "px";
    el.style.height = Math.abs(r.y2 - r.y1) + "px";
  }

  /* ═══════════════ context menu ═══════════════ */
  function showContextMenu(items, x, y) {
    Winstem.Desktop._contextItems = items;
    const menu = $id("contextmenu");
    menu.innerHTML = "";
    items.forEach(function (item) {
      if (item.sep) {
        menu.appendChild(Winstem.Utils.el('<div class="context-sep"></div>'));
        return;
      }
      const el = Winstem.Utils.el(
        '<button class="context-item' + (item.danger ? " danger" : "") + (item.disabled ? " disabled" : "") + '"' +
        (item.disabled ? ' disabled' : '') + ' role="menuitem">' +
          (item.icon ? '<i class="bi ' + item.icon + '"></i>' : '<span class="context-icongap"></span>') +
          '<span>' + Winstem.Utils.escapeHtml(item.label) + '</span>' +
          (item.shortcut ? '<kbd class="context-kbd">' + Winstem.Utils.escapeHtml(item.shortcut) + '</kbd>' : "") +
        '</button>'
      );
      if (!item.disabled) {
        el.addEventListener("click", function () {
          Winstem.Desktop.hideContextMenu();
          item.action();
        });
      }
      menu.appendChild(el);
    });
    menu.classList.remove("hidden");
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - mw - 8) + "px";
    menu.style.top = Math.min(y, window.innerHeight - mh - 8) + "px";
  }

  Winstem.Desktop = {
    init: function () {
      loadIcons();
      render();

      const desktop = $id("desktop");

      /* desktop click → clear selection / close menus */
      desktop.addEventListener("pointerdown", function (e) {
        if (e.target === desktop || e.target.id === "desktop-icons") {
          clearSelection();
          Winstem.Desktop.hideContextMenu();
          Winstem.Taskbar.closeFlyouts();
        }
      });

      /* right click on empty desktop */
      desktop.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        if (!e.target.closest(".desktop-icon")) {
          Winstem.Desktop.showDesktopContextMenu(e.clientX, e.clientY);
        }
      });

      /* rubber band via middle/left drag on empty space */
      desktop.addEventListener("pointerdown", function (e) {
        if (e.button === 2) return;
        if (e.target === desktop || e.target.id === "desktop-icons") {
          startSelection(e);
        }
      });

      /* file drop onto desktop → upload to Home */
      desktop.addEventListener("dragover", function (e) {
        e.preventDefault();
        desktop.classList.add("drop-target");
      });
      desktop.addEventListener("dragleave", function (e) {
        if (e.target === desktop) desktop.classList.remove("drop-target");
      });
      desktop.addEventListener("drop", function (e) {
        e.preventDefault();
        desktop.classList.remove("drop-target");
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          if (!Winstem.Auth.isSignedIn()) return;
          Winstem.FS.enqueueUploads(e.dataTransfer.files, null);
          Winstem.Notifications.info("Uploading", e.dataTransfer.files.length + " file(s) added to the queue");
          const files = Winstem.Apps.get("files");
          if (files) Winstem.Apps.launch("files", { location: "home" });
        }
      });

      window.addEventListener("resize", Winstem.Utils.debounce(function () {
        Winstem.WindowManager.onViewportResize();
      }, 150));
    },

    refresh: function () { render(); },

    getSelection: function () { return state.selection.slice(); },

    showDesktopContextMenu: function (x, y) {
      showContextMenu([
        { label: "New folder", icon: "bi-folder-plus", action: function () {
            Winstem.Apps.launch("files", { location: "home", newFolder: true });
        }},
        { label: "Upload files", icon: "bi-cloud-arrow-up", action: function () {
            Winstem.Apps.launch("files", { location: "home", upload: true });
        }},
        { label: "Refresh", icon: "bi-arrow-clockwise", action: function () { render(); } },
        { sep: true },
        { label: "Change wallpaper", icon: "bi-image", action: function () {
            Winstem.Apps.launch("settings", { page: "appearance" });
        }},
        { label: "Display settings", icon: "bi-display", action: function () {
            Winstem.Apps.launch("settings", { page: "appearance" });
        }},
        { label: "Sort icons by name", icon: "bi-sort-alpha-down", action: function () {
            state.icons.sort(function (a, b) {
              const na = (a.label || Winstem.Apps.get(a.appId).name).toLowerCase();
              const nb = (b.label || Winstem.Apps.get(b.appId).name).toLowerCase();
              return na < nb ? -1 : na > nb ? 1 : 0;
            });
            /* re-flow positions */
            state.icons.forEach(function (i, idx) { i.x = 16; i.y = 16 + idx * GRID; });
            saveIcons();
            render();
        }},
        { sep: true },
        { label: "Open Files", icon: "bi-folder2-open", action: function () { Winstem.Apps.launch("files"); } },
        { label: "About Winstem", icon: "bi-info-circle", action: function () {
            Winstem.Apps.launch("settings", { page: "about" });
        }}
      ], x, y);
    },

    showIconContextMenu: function (x, y, icon) {
      const app = Winstem.Apps.get(icon.appId);
      const label = icon.label || (app ? app.name : "Item");
      const multi = state.selection.length > 1;
      showContextMenu([
        { label: "Open", icon: "bi-box-arrow-up-right", action: function () {
            state.selection.forEach(function (selId) {
              const ic = state.icons.find(function (i) { return i.id === selId; });
              if (ic) openIcon(ic);
            });
        }},
        { label: "Rename", icon: "bi-pencil", disabled: multi, action: function () { renameIcon(icon); } },
        { sep: true },
        { label: "Remove from desktop", icon: "bi-x-circle", action: function () {
            state.icons = state.icons.filter(function (i) { return !state.selection.includes(i.id); });
            saveIcons();
            render();
        }},
        { sep: true },
        { label: "About " + label, icon: "bi-info-circle", action: function () {
            if (app && app.about) app.about();
        }}
      ], x, y);
    },

    hideContextMenu: function () {
      const menu = $id("contextmenu");
      if (menu) menu.classList.add("hidden");
      Winstem.Desktop._contextItems = null;
    },

    showMenu: showContextMenu,

    /* desktop status bar (sync indicator) */
    showStatus: function (text, ms) {
      const el = $id("desktop-status");
      if (!el) return;
      const t = $id("desktop-status-text");
      t.textContent = text;
      el.classList.remove("hidden");
      clearTimeout(el._t);
      if (ms) el._t = setTimeout(function () { el.classList.add("hidden"); }, ms);
    }
  };
})();
