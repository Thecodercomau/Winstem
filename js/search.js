/* ═══════════════════════════════════════════════════════════
   WINSTEM — Universal Search
   Ctrl/Cmd+K overlay that searches files, folders, notes,
   applications and settings across Winstem.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  let active = false;
  let results = { files: [], folders: [], notes: [] };
  let cursor = -1;

  function $id(id) { return document.getElementById(id); }

  function open(initialQuery) {
    const overlay = $id("search-overlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    active = true;
    const input = $id("search-input");
    input.value = initialQuery || "";
    cursor = -1;
    setTimeout(function () { input.focus(); input.select(); }, 50);
    if (initialQuery) runSearch(initialQuery);
    else renderResults();
  }

  function close() {
    const overlay = $id("search-overlay");
    if (overlay) overlay.classList.add("hidden");
    active = false;
  }

  function isOpen() { return active; }

  function renderResults() {
    const box = $id("search-results");
    if (!box) return;
    const q = $id("search-input").value.trim().toLowerCase();
    const appHits = q ? Winstem.Apps.all().filter(function (a) {
      return a.name.toLowerCase().indexOf(q) !== -1 || a.id.indexOf(q) !== -1 ||
        (a.tags || []).some(function (t) { return t.indexOf(q) !== -1; });
    }) : [];
    const settingHits = q ? [
      { label: "Personalization", key: "appearance" },
      { label: "Account", key: "account" },
      { label: "Storage", key: "storage" },
      { label: "Privacy & security", key: "privacy" },
      { label: "Notifications", key: "notifications" },
      { label: "System", key: "system" },
      { label: "About", key: "about" }
    ].filter(function (s) { return s.label.toLowerCase().indexOf(q) !== -1; }) : [];

    const rows = [];
    if (q && appHits.length) {
      rows.push({ group: "Applications", items: appHits.map(function (a) {
        return { id: "app:" + a.id, icon: a.icon, title: a.name, sub: a.category, action: function () {
            close(); Winstem.Apps.launch(a.id);
        }};
      })});
    }
    if (results.folders.length) {
      rows.push({ group: "Folders", items: results.folders.map(function (f) {
        return { id: "folder:" + f.id, icon: "bi-folder-fill", iconColor: "#f0b429", title: f.name, sub: "Folder", action: function () {
            close(); Winstem.Apps.launch("files", { folderId: f.id });
        }};
      })});
    }
    if (results.files.length) {
      rows.push({ group: "Files", items: results.files.map(function (f) {
        const meta = Winstem.FileTypes.info(f.name);
        return { id: "file:" + f.id, icon: meta.categoryInfo.icon, iconColor: meta.categoryInfo.color, title: f.name,
          sub: Winstem.Utils.formatBytes(f.size_bytes) + " · " + (f.extension || "").toUpperCase(), action: function () {
            close();
            const appId = Winstem.FileTypes.openAppFor(f.name);
            if (appId) Winstem.Apps.launch(appId, { file: f });
            else Winstem.Apps.genericFileDialog(f);
        }};
      })});
    }
    if (results.notes.length) {
      rows.push({ group: "Notes", items: results.notes.map(function (n) {
        return { id: "note:" + n.id, icon: "bi-journal-text", title: n.title || "Untitled", sub: "Note", action: function () {
            close(); Winstem.Apps.launch("notes", { noteId: n.id });
        }};
      })});
    }
    if (settingHits.length) {
      rows.push({ group: "Settings", items: settingHits.map(function (s) {
        return { id: "setting:" + s.key, icon: "bi-gear", title: s.label, sub: "Settings", action: function () {
            close(); Winstem.Apps.launch("settings", { page: s.key });
        }};
      })});
    }

    if (!q && !rows.length) {
      box.innerHTML =
        '<div class="search-empty">' +
          '<i class="bi bi-search"></i>' +
          '<div>Search files, folders, notes, apps and settings</div>' +
          '<div class="search-empty-hint">Tip: Ctrl + K from anywhere</div>' +
        '</div>';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<div class="search-empty"><i class="bi bi-search"></i><div>No results for "' + Winstem.Utils.escapeHtml(q) + '"</div></div>';
      return;
    }

    box.innerHTML = "";
    const allItems = [];
    rows.forEach(function (group) {
      const gEl = Winstem.Utils.el('<div class="search-group"><div class="search-group-title">' + group.group + '</div></div>');
      box.appendChild(gEl);
      group.items.forEach(function (item) {
        const el = Winstem.Utils.el(
          '<button class="search-item" data-id="' + Winstem.Utils.escapeAttr(item.id) + '">' +
            '<span class="search-item-icon" style="' + (item.iconColor ? "color:" + item.iconColor : "") + '"><i class="bi ' + item.icon + '"></i></span>' +
            '<span class="search-item-text"><span class="search-item-title">' + Winstem.Utils.escapeHtml(item.title) + '</span>' +
            '<span class="search-item-sub">' + Winstem.Utils.escapeHtml(item.sub) + '</span></span>' +
          '</button>'
        );
        el.addEventListener("click", item.action);
        el.addEventListener("mousemove", function () { setCursor(allItems.length); });
        allItems.push(el);
        box.appendChild(el);
      });
    });

    /* keyboard navigation state */
    const items = Array.from(box.querySelectorAll(".search-item"));
    function setCursor(i) {
      cursor = i;
      items.forEach(function (el, idx) { el.classList.toggle("active", idx === cursor); });
      if (items[cursor]) items[cursor].scrollIntoView({ block: "nearest" });
    }
    function move(d) {
      if (!items.length) return;
      setCursor((cursor + d + items.length) % items.length);
    }
    function activate() {
      if (items[cursor]) items[cursor].click();
      else if (items[0]) items[0].click();
    }
    box._nav = { move: move, activate: activate };
  }

  function runSearch(q) {
    if (!Winstem.Auth.isSignedIn() || !q.trim()) {
      results = { files: [], folders: [], notes: [] };
      renderResults();
      return;
    }
    Winstem.FS.search(q).then(function (r) {
      results = r;
      renderResults();
    }).catch(function () {
      results = { files: [], folders: [], notes: [] };
      renderResults();
    });
  }

  Winstem.Search = {
    init: function () {
      const overlay = $id("search-overlay");
      if (!overlay) return;

      /* build overlay */
      overlay.innerHTML =
        '<div class="search-panel" role="dialog" aria-modal="true" aria-label="Universal search">' +
          '<div class="search-input-wrap">' +
            '<i class="bi bi-search"></i>' +
            '<input type="text" id="search-input" placeholder="Search files, folders, notes, apps, settings…" autocomplete="off" aria-label="Search Winstem">' +
            '<kbd>Esc</kbd>' +
          '</div>' +
          '<div class="search-results" id="search-results"></div>' +
        '</div>';

      const input = $id("search-input");
      const debounced = Winstem.Utils.debounce(function () { runSearch(input.value); }, Winstem.Config.get("searchDebounceMs"));
      input.addEventListener("input", debounced);

      input.addEventListener("keydown", function (e) {
        const box = $id("search-results");
        if (e.key === "ArrowDown") { e.preventDefault(); if (box._nav) box._nav.move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); if (box._nav) box._nav.move(-1); }
        else if (e.key === "Enter") { e.preventDefault(); if (box._nav) box._nav.activate(); }
        else if (e.key === "Escape") { e.preventDefault(); close(); }
      });

      overlay.addEventListener("pointerdown", function (e) {
        if (e.target === overlay) close();
      });
    },

    open: open,
    close: close,
    isOpen: isOpen
  };
})();
