/* ═══════════════════════════════════════════════════════════
   WINSTEM — Files App
   Full cloud file manager: sidebar locations, breadcrumbs,
   toolbar, grid/list views, multi-select, drag-and-drop
   uploads, upload queue, trash, favorites, sharing.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const state = {
    location: "home",        /* home | folder | favorites | recent | trash | shared */
    folderId: null,
    query: "",
    sort: { key: "name", dir: "asc" },
    view: "grid",
    selected: { files: [], folders: [] },
    data: null,              /* current listing */
    win: null,
    content: null,
    el: null
  };

  const SPECIAL = {
    home: "Home", desktop: "Desktop", documents: "Documents", downloads: "Downloads",
    pictures: "Pictures", music: "Music", videos: "Videos"
  };

  /* ═══════════════ DOM construction ═══════════════ */
  function create(win, content, params) {
    state.win = win;
    state.content = content;
    state.location = "home";
    state.folderId = null;
    state.selected = { files: [], folders: [] };

    content.innerHTML =
      '<div class="fm">' +
        '<aside class="fm-sidebar" id="fm-sidebar">' +
          '<div class="fm-newbtn" id="fm-newbtn"><i class="bi bi-plus-lg"></i><span>New</span></div>' +
          '<nav class="fm-nav" id="fm-nav"></nav>' +
          '<div class="fm-storage-card" id="fm-storage-card">' +
            '<div class="fm-storage-title"><i class="bi bi-cloud-hdd"></i> Cloud storage</div>' +
            '<div class="fm-storage-used" id="fm-storage-used">—</div>' +
            '<div class="progress fm-storage-progress"><div class="progress-bar" id="fm-storage-bar" style="width:0%"></div></div>' +
          '</div>' +
        '</aside>' +
        '<div class="fm-main">' +
          '<div class="fm-toolbar">' +
            '<button class="fm-tb-btn" id="fm-back" title="Back" aria-label="Back"><i class="bi bi-arrow-left"></i></button>' +
            '<div class="fm-breadcrumbs" id="fm-breadcrumbs"></div>' +
            '<div class="fm-tb-spacer"></div>' +
            '<div class="fm-tb-group">' +
              '<div class="fm-search"><i class="bi bi-search"></i><input type="text" id="fm-search-input" placeholder="Filter this folder…" aria-label="Filter files"></div>' +
            '</div>' +
            '<div class="fm-tb-group">' +
              '<div class="btn-group btn-group-sm" role="group" aria-label="View">' +
                '<button class="btn btn-outline-secondary fm-view-btn" data-view="grid" title="Grid view"><i class="bi bi-grid-3x3-gap"></i></button>' +
                '<button class="btn btn-outline-secondary fm-view-btn" data-view="list" title="List view"><i class="bi bi-list-ul"></i></button>' +
              '</div>' +
              '<div class="dropdown">' +
                '<button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-label="Sort"><i class="bi bi-arrow-down-up"></i></button>' +
                '<ul class="dropdown-menu dropdown-menu-end fm-sort-menu">' +
                  '<li><a class="dropdown-item" data-sort="name">Name</a></li>' +
                  '<li><a class="dropdown-item" data-sort="size">Size</a></li>' +
                  '<li><a class="dropdown-item" data-sort="updated_at">Modified</a></li>' +
                  '<li><a class="dropdown-item" data-sort="extension">Type</a></li>' +
                  '<li><hr class="dropdown-divider"></li>' +
                  '<li><a class="dropdown-item" data-sort-dir="asc"><i class="bi bi-sort-alpha-down"></i> Ascending</a></li>' +
                  '<li><a class="dropdown-item" data-sort-dir="desc"><i class="bi bi-sort-alpha-up-alt"></i> Descending</a></li>' +
                '</ul>' +
              '</div>' +
              '<button class="btn btn-outline-secondary btn-sm" id="fm-refresh" title="Refresh" aria-label="Refresh"><i class="bi bi-arrow-clockwise"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="fm-content" id="fm-content"></div>' +
          '<div class="fm-uploadbar hidden" id="fm-uploadbar"></div>' +
        '</div>' +
      '</div>';

    state.el = content.querySelector(".fm");
    buildSidebar();
    buildToolbar();
    refreshStorageCard();

    /* initial location from params */
    if (params) {
      if (params.folderId) { state.location = "folder"; state.folderId = params.folderId; }
      else if (params.location) state.location = params.location;
      if (params.newFolder) { state.query = ""; }
      if (params.upload) { openFilePicker(); return; }
    }
    loadAndRender();

    if (params && params.newFolder) {
      setTimeout(function () { Winstem.Files.newFolder(); }, 250);
    }
  }

  function focus(win, params) {
    if (!params) return;
    if (params.folderId) { state.location = "folder"; state.folderId = params.folderId; }
    else if (params.location) { state.location = params.location; state.folderId = null; }
    if (params.newFolder) { setTimeout(function () { Winstem.Files.newFolder(); }, 200); }
    if (params.upload) { openFilePicker(); return; }
    if (params.showQueue) { renderUploadBar(); }
    loadAndRender();
  }

  /* ═══════════════ Sidebar ═══════════════ */
  function buildSidebar() {
    const nav = state.content.querySelector("#fm-nav");
    const locations = [
      { id: "home", label: "Home", icon: "bi-house-door" },
      { id: "desktop", label: "Desktop", icon: "bi-display" },
      { id: "documents", label: "Documents", icon: "bi-file-earmark-text" },
      { id: "downloads", label: "Downloads", icon: "bi-download" },
      { id: "pictures", label: "Pictures", icon: "bi-images" },
      { id: "music", label: "Music", icon: "bi-music-note-beamed" },
      { id: "videos", label: "Videos", icon: "bi-film" },
      { sep: true },
      { id: "favorites", label: "Favorites", icon: "bi-star" },
      { id: "recent", label: "Recent", icon: "bi-clock-history" },
      { id: "shared", label: "Shared with me", icon: "bi-people" },
      { sep: true },
      { id: "trash", label: "Trash", icon: "bi-trash" }
    ];
    nav.innerHTML = "";
    locations.forEach(function (loc) {
      if (loc.sep) { nav.appendChild(Winstem.Utils.el('<div class="fm-nav-sep"></div>')); return; }
      const el = Winstem.Utils.el(
        '<button class="fm-nav-item" data-loc="' + loc.id + '" role="treeitem" aria-label="' + loc.label + '">' +
          '<i class="bi ' + loc.icon + '"></i><span>' + loc.label + '</span>' +
        '</button>'
      );
      el.addEventListener("click", function () { navigate(loc.id); });
      nav.appendChild(el);
    });

    const newbtn = state.content.querySelector("#fm-newbtn");
    newbtn.addEventListener("click", function () {
      Winstem.Desktop.showMenu([
        { label: "New folder", icon: "bi-folder-plus", action: function () { Winstem.Files.newFolder(); } },
        { label: "Upload files", icon: "bi-cloud-arrow-up", action: openFilePicker },
        { sep: true },
        { label: "Storage dashboard", icon: "bi-hdd", action: function () {
            Winstem.Apps.launch("settings", { page: "storage" });
        }}
      ], newbtn.getBoundingClientRect().left, newbtn.getBoundingClientRect().bottom);
    });
  }

  function navigate(loc) {
    if (loc === "folder") return;
    state.location = loc;
    state.folderId = null;
    state.query = "";
    const searchInput = state.content.querySelector("#fm-search-input");
    if (searchInput) searchInput.value = "";
    loadAndRender();
    highlightNav();
  }

  function highlightNav() {
    state.content.querySelectorAll(".fm-nav-item").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-loc") === state.location);
    });
  }

  /* ═══════════════ Toolbar ═══════════════ */
  function buildToolbar() {
    const c = state.content;
    c.querySelector("#fm-back").addEventListener("click", function () { navigate("home"); });

    c.querySelector("#fm-refresh").addEventListener("click", function () {
      state.query = "";
      const input = c.querySelector("#fm-search-input");
      if (input) input.value = "";
      loadAndRender(true);
      Winstem.Notifications.info("Refreshed", "Folder contents updated");
    });

    const searchInput = c.querySelector("#fm-search-input");
    searchInput.addEventListener("input", Winstem.Utils.debounce(function () {
      state.query = searchInput.value.trim();
      render();
    }, 200));

    c.querySelectorAll(".fm-view-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.view = btn.getAttribute("data-view");
        c.querySelectorAll(".fm-view-btn").forEach(function (b) { b.classList.toggle("active", b === btn); });
        render();
      });
    });

    c.querySelectorAll(".fm-sort-menu [data-sort]").forEach(function (item) {
      item.addEventListener("click", function () {
        state.sort.key = item.getAttribute("data-sort");
        render();
      });
    });
    c.querySelectorAll(".fm-sort-menu [data-sort-dir]").forEach(function (item) {
      item.addEventListener("click", function () {
        state.sort.dir = item.getAttribute("data-sort-dir");
        render();
      });
    });

    /* drag & drop upload onto content */
    const contentEl = c.querySelector("#fm-content");
    contentEl.addEventListener("dragover", function (e) {
      e.preventDefault();
      contentEl.classList.add("fm-drop");
    });
    contentEl.addEventListener("dragleave", function () { contentEl.classList.remove("fm-drop"); });
    contentEl.addEventListener("drop", function (e) {
      e.preventDefault();
      contentEl.classList.remove("fm-drop");
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      const targetFolder = state.location === "folder" ? state.folderId : null;
      Winstem.FS.enqueueUploads(e.dataTransfer.files, targetFolder);
      renderUploadBar();
      Winstem.Notifications.info("Uploading", e.dataTransfer.files.length + " file(s) added to queue");
    });
  }

  /* ═══════════════ Loading & rendering ═══════════════ */
  function loadAndRender(force) {
    const contentEl = state.content.querySelector("#fm-content");
    contentEl.innerHTML = '<div class="fm-loading"><div class="spinner-border text-primary" role="status"></div><p>Loading files…</p></div>';
    renderBreadcrumbs();
    highlightNav();

    const loader = (function () {
      switch (state.location) {
        case "favorites": return Winstem.FS.favorites();
        case "recent": return Winstem.FS.recent(40).then(function (files) { return { files: files, folders: [] }; });
        case "trash": return Winstem.FS.listTrash();
        case "shared": return Winstem.FS.sharedWithMe().then(function (list) {
            return { shared: list };
        });
        default: return Winstem.FS.listFolder(state.location === "folder" ? state.folderId : null, { noCache: force });
      }
    })();

    loader.then(function (data) {
      state.data = data;
      render();
    }).catch(function (err) {
      contentEl.innerHTML = '<div class="fm-error"><i class="bi bi-cloud-slash"></i><p>' +
        Winstem.Utils.escapeHtml(err && err.message ? err.message : "Could not load files.") + '</p>' +
        '<button class="btn btn-primary btn-sm" id="fm-retry">Try again</button></div>';
      const retry = contentEl.querySelector("#fm-retry");
      if (retry) retry.addEventListener("click", function () { loadAndRender(true); });
    });
  }

  function renderBreadcrumbs() {
    const bc = state.content.querySelector("#fm-breadcrumbs");
    bc.innerHTML = "";
    const crumbs = [];
    if (state.location === "home") crumbs.push({ label: "Home" });
    else if (state.location === "folder") {
      crumbs.push({ label: "Home", id: null });
      const pending = state.folderId;
      const chain = [{ label: "…", id: null }];
      crumbs.push.apply(crumbs, chain);
    } else {
      crumbs.push({ label: SPECIAL[state.location] || state.location, icon: "bi-folder2-open" });
    }
    crumbs.forEach(function (c, i) {
      const el = Winstem.Utils.el(
        '<span class="fm-crumb' + (i === crumbs.length - 1 ? " current" : "") + '" role="button">' +
          (c.icon ? '<i class="bi ' + c.icon + '"></i>' : "") + Winstem.Utils.escapeHtml(c.label) +
        '</span>'
      );
      if (i === crumbs.length - 1) {
        el.addEventListener("click", function () { if (c.id === undefined) navigate("home"); });
      }
      bc.appendChild(el);
      if (i < crumbs.length - 1) {
        bc.appendChild(Winstem.Utils.el('<span class="fm-crumb-sep">/</span>'));
      }
    });

    /* async full breadcrumb chain for folder view */
    if (state.location === "folder") {
      Winstem.FS.breadcrumbs(state.folderId).then(function (chain) {
        renderBreadcrumbsWithChain(chain);
      }).catch(function () { /* keep current */ });
    }
  }

  function renderBreadcrumbsWithChain(chain) {
    const bc = state.content.querySelector("#fm-breadcrumbs");
    bc.innerHTML = "";
    const items = [{ label: "Home", id: null }].concat(chain);
    items.forEach(function (c, i) {
      const el = Winstem.Utils.el(
        '<span class="fm-crumb' + (i === items.length - 1 ? " current" : "") + '" role="button">' +
          Winstem.Utils.escapeHtml(c.label) + '</span>'
      );
      el.addEventListener("click", function () {
        state.location = c.id ? "folder" : "home";
        state.folderId = c.id || null;
        loadAndRender();
      });
      bc.appendChild(el);
      if (i < items.length - 1) bc.appendChild(Winstem.Utils.el('<span class="fm-crumb-sep">/</span>'));
    });
  }

  function sortEntries(folders, files) {
    const key = state.sort.key;
    const dir = state.sort.dir === "desc" ? -1 : 1;
    const cmp = function (a, b) {
      let r = 0;
      if (key === "name") r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      else if (key === "size") r = (Number(a.size_bytes) || 0) - (Number(b.size_bytes) || 0);
      else if (key === "updated_at") r = new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
      else if (key === "extension") r = (a.extension || "").localeCompare(b.extension || "");
      return r * dir;
    };
    return { folders: folders.slice().sort(cmp), files: files.slice().sort(cmp) };
  }

  function filterEntries(folders, files) {
    if (!state.query) return { folders: folders, files: files };
    const q = state.query.toLowerCase();
    return {
      folders: folders.filter(function (f) { return f.name.toLowerCase().indexOf(q) !== -1; }),
      files: files.filter(function (f) { return f.name.toLowerCase().indexOf(q) !== -1; })
    };
  }

  function render() {
    const contentEl = state.content.querySelector("#fm-content");
    if (!state.data) return;
    if (state.location === "shared") { renderShared(contentEl, state.data.shared); return; }
    if (state.location === "trash") { renderTrash(contentEl, state.data); return; }
    if (state.location === "recent") {
      const f = filterEntries([], state.data.files);
      renderListing(contentEl, { folders: [], files: f.files }, true);
      return;
    }
    if (state.location === "favorites") {
      const f = filterEntries(state.data.folders, state.data.files);
      renderListing(contentEl, f, true);
      return;
    }
    const filtered = filterEntries(state.data.folders, state.data.files);
    const sorted = sortEntries(filtered.folders, filtered.files);
    renderListing(contentEl, sorted, false);
  }

  /* ═══════════════ listing render ═══════════════ */
  function renderListing(contentEl, sorted, isSmart) {
    state.selected = { files: [], folders: [] };
    const total = sorted.folders.length + sorted.files.length;
    if (!total) {
      renderEmpty(contentEl);
      return;
    }
    contentEl.innerHTML = "";
    contentEl.classList.toggle("fm-grid", state.view === "grid");
    contentEl.classList.toggle("fm-list", state.view === "list");

    if (state.view === "list") {
      const header = Winstem.Utils.el(
        '<div class="fm-list-head"><span>Name</span><span>Size</span><span>Modified</span><span></span></div>'
      );
      contentEl.appendChild(header);
    }

    sorted.folders.forEach(function (f) {
      contentEl.appendChild(buildItemEl(f, "folder", isSmart));
    });
    sorted.files.forEach(function (f) {
      contentEl.appendChild(buildItemEl(f, "file", isSmart));
    });
  }

  function renderEmpty(contentEl) {
    contentEl.classList.remove("fm-grid", "fm-list");
    const isTrash = state.location === "trash";
    const isFav = state.location === "favorites";
    contentEl.innerHTML =
      '<div class="fm-empty">' +
        '<div class="fm-empty-icon">' +
          (state.query
            ? '<i class="bi bi-search"></i>'
            : isTrash ? '<i class="bi bi-trash3"></i>' : isFav ? '<i class="bi bi-star"></i>' : '<i class="bi bi-cloud-arrow-up"></i>') +
        '</div>' +
        '<div class="fm-empty-title">' +
          (state.query ? "No matches" : isTrash ? "Trash is empty" : isFav ? "No favorites yet" : "No files here yet") +
        '</div>' +
        '<div class="fm-empty-sub">' +
          (state.query
            ? "Try a different search term."
            : isTrash ? "Deleted files and folders appear here for 30 days."
            : isFav ? "Star files and folders to find them quickly."
            : "Upload your first file to Winstem Cloud, or drag and drop anywhere in this window.") +
        '</div>' +
        (!isTrash && !isFav && !state.query && state.location !== "shared"
          ? '<div class="fm-empty-actions"><button class="btn btn-primary btn-sm" id="fm-empty-upload"><i class="bi bi-cloud-arrow-up"></i> Upload files</button>' +
            '<button class="btn btn-outline-secondary btn-sm" id="fm-empty-folder"><i class="bi bi-folder-plus"></i> New folder</button></div>'
          : "") +
      '</div>';
    const up = contentEl.querySelector("#fm-empty-upload");
    if (up) up.addEventListener("click", openFilePicker);
    const nf = contentEl.querySelector("#fm-empty-folder");
    if (nf) nf.addEventListener("click", function () { Winstem.Files.newFolder(); });
  }

  function renderShared(contentEl, list) {
    contentEl.classList.remove("fm-grid", "fm-list");
    if (!list || !list.length) {
      contentEl.innerHTML =
        '<div class="fm-empty"><div class="fm-empty-icon"><i class="bi bi-people"></i></div>' +
        '<div class="fm-empty-title">Nothing shared with you yet</div>' +
        '<div class="fm-empty-sub">When someone shares a file with your email, it will appear here.</div></div>';
      return;
    }
    contentEl.innerHTML = "";
    contentEl.classList.add("fm-grid");
    list.forEach(function (item) {
      const s = item.share;
      const file = s.files;
      const folder = s.folders;
      const name = file ? file.name : folder ? folder.name : "Shared item";
      const meta = Winstem.FileTypes.info(name);
      const el = Winstem.Utils.el(
        '<div class="fm-item fm-file" role="button" tabindex="0">' +
          '<div class="fm-item-icon"><i class="bi ' + meta.categoryInfo.icon + '" style="color:' + meta.categoryInfo.color + '"></i></div>' +
          '<div class="fm-item-name">' + Winstem.Utils.escapeHtml(name) + '</div>' +
          '<div class="fm-item-sub">' + (file ? Winstem.Utils.formatBytes(file.size_bytes) : "Folder") + ' · ' +
            Winstem.Utils.escapeHtml(s.permission || item.permission || "read") + '</div>' +
        '</div>'
      );
      el.addEventListener("dblclick", function () {
        if (file) {
          Winstem.Files.previewShared(file, s);
        }
      });
      el.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        Winstem.Desktop.showMenu([
          { label: "Open", icon: "bi-box-arrow-up-right", action: function () {
              if (file) Winstem.Files.previewShared(file, s);
          }},
          { label: "Download", icon: "bi-download", action: function () {
              Winstem.Files.downloadShared(file, s);
          }}
        ], e.clientX, e.clientY);
      });
      contentEl.appendChild(el);
    });
  }

  function renderTrash(contentEl, data) {
    const all = (data.files || []).concat(data.folders || []);
    if (!all.length) {
      renderEmpty(contentEl);
      return;
    }
    contentEl.innerHTML = "";
    contentEl.classList.add("fm-list");
    const header = Winstem.Utils.el(
      '<div class="fm-list-head"><span>Name</span><span>Deleted</span><span>Size</span><span></span></div>'
    );
    contentEl.appendChild(header);
    all.forEach(function (item) {
      const isFile = item.kind === "file";
      const meta = Winstem.FileTypes.info(item.name);
      const el = Winstem.Utils.el(
        '<div class="fm-item fm-list-item ' + (isFile ? "fm-file" : "fm-folder") + '" role="button" tabindex="0">' +
          '<span class="fm-item-icon"><i class="bi ' + (isFile ? meta.categoryInfo.icon : "bi-folder") + '" style="color:' + (isFile ? meta.categoryInfo.color : "#f0b429") + '"></i></span>' +
          '<span class="fm-item-name">' + Winstem.Utils.escapeHtml(item.name) + '</span>' +
          '<span class="fm-item-meta">' + Winstem.Utils.formatDate(item.deleted_at) + '</span>' +
          '<span class="fm-item-meta">' + (isFile ? Winstem.Utils.formatBytes(item.size_bytes) : "—") + '</span>' +
          '<span class="fm-item-actions"></span>' +
        '</div>'
      );
      el.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        Winstem.Desktop.showMenu([
          { label: "Restore", icon: "bi-arrow-counterclockwise", action: function () {
              Winstem.FS.restore(isFile ? "files" : "folders", [item.id]).then(function () {
                Winstem.Notifications.success("Restored", item.name);
                loadAndRender(true);
              }).catch(function (err) { Winstem.Notifications.error("Restore failed", err.message); });
          }},
          { label: "Delete forever", icon: "bi-trash3", danger: true, action: function () {
              Winstem.Files.purgeItem(item);
          }}
        ], e.clientX, e.clientY);
      });
      contentEl.appendChild(el);
    });
    contentEl.appendChild(Winstem.Utils.el(
      '<div class="fm-trash-actions"><button class="btn btn-outline-danger btn-sm" id="fm-empty-trash"><i class="bi bi-trash3"></i> Empty trash</button></div>'
    ));
    const emptyTrash = contentEl.querySelector("#fm-empty-trash");
    if (emptyTrash) {
      emptyTrash.addEventListener("click", function () {
        Winstem.Apps.confirm("Permanently delete everything in Trash? This cannot be undone.", "Empty trash").then(function (ok) {
          if (!ok) return;
          Winstem.FS.emptyTrash().then(function () {
            Winstem.Notifications.success("Trash emptied");
            loadAndRender(true);
          }).catch(function (err) { Winstem.Notifications.error("Error", err.message); });
        });
      });
    }
  }

  /* ═══════════════ item rendering ═══════════════ */
  function buildItemEl(item, kind, isSmart) {
    const meta = kind === "file" ? Winstem.FileTypes.info(item.name) : null;
    const isSelected = state.selected[kind + "s"].includes(item.id);
    const el = Winstem.Utils.el(
      '<div class="fm-item ' + (kind === "folder" ? "fm-folder" : "fm-file") + (isSelected ? " selected" : "") + '" ' +
        'role="button" tabindex="0" data-id="' + item.id + '" data-kind="' + kind + '">' +
        '<div class="fm-item-icon">' +
          (kind === "folder"
            ? (item.is_favorite
                ? '<i class="bi bi-folder-fill fm-starred-folder" style="color:#f0b429"></i><i class="bi bi-star-fill fm-fav-star"></i>'
                : '<i class="bi bi-folder-fill" style="color:#f0b429"></i>')
            : '<i class="bi ' + meta.categoryInfo.icon + '" style="color:' + meta.categoryInfo.color + '"></i>' +
              (item.is_favorite ? '<i class="bi bi-star-fill fm-fav-star"></i>' : "")) +
        '</div>' +
        '<div class="fm-item-name" title="' + Winstem.Utils.escapeAttr(item.name) + '">' + Winstem.Utils.escapeHtml(item.name) + '</div>' +
        '<div class="fm-item-sub">' + (kind === "file" ? Winstem.Utils.formatBytes(item.size_bytes) : "Folder") + '</div>' +
        '<div class="fm-item-date">' + (kind === "file" ? Winstem.Utils.formatDate(item.updated_at) : "") + '</div>' +
      '</div>'
    );

    /* selection */
    el.addEventListener("pointerdown", function (e) {
      if (e.button === 2) return;
      if (e.shiftKey) {
        selectRange(item, kind);
      } else if (Winstem.Utils.isMod(e)) {
        toggleSelect(item, kind);
      } else if (!isSelected) {
        state.selected = { files: [], folders: [] };
        selectOne(item, kind);
      }
      updateSelectionUI();
    });

    el.addEventListener("dblclick", function (e) {
      e.stopPropagation();
      if (kind === "folder") {
        openFolder(item);
      } else {
        openFile(item);
      }
    });

    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        if (kind === "folder") openFolder(item); else openFile(item);
      }
      if (e.key === "Delete") trashSelection();
      if (e.key === "F2") renameSelection();
    });

    el.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!isSelected) {
        state.selected = { files: [], folders: [] };
        selectOne(item, kind);
        updateSelectionUI();
      }
      Winstem.Files.showItemContextMenu(e.clientX, e.clientY, item, kind);
    });

    return el;
  }

  function selectOne(item, kind) {
    state.selected[kind + "s"].push(item.id);
  }

  function toggleSelect(item, kind) {
    const arr = state.selected[kind + "s"];
    const idx = arr.indexOf(item.id);
    if (idx === -1) arr.push(item.id); else arr.splice(idx, 1);
  }

  function selectRange(item, kind) {
    const contentEl = state.content.querySelector("#fm-content");
    const items = Array.from(contentEl.querySelectorAll(".fm-item[data-kind='" + kind + "']"));
    const clickIdx = items.findIndex(function (x) { return x.getAttribute("data-id") === item.id; });
    const selIds = state.selected[kind + "s"];
    if (!selIds.length) { selectOne(item, kind); return; }
    const lastId = selIds[selIds.length - 1];
    const lastIdx = items.findIndex(function (x) { return x.getAttribute("data-id") === lastId; });
    if (lastIdx === -1) { selectOne(item, kind); return; }
    const from = Math.min(clickIdx, lastIdx), to = Math.max(clickIdx, lastIdx);
    for (let i = from; i <= to; i++) {
      const id = items[i].getAttribute("data-id");
      if (!selIds.includes(id)) selIds.push(id);
    }
  }

  function updateSelectionUI() {
    const contentEl = state.content.querySelector("#fm-content");
    if (!contentEl) return;
    contentEl.querySelectorAll(".fm-item").forEach(function (el) {
      const kind = el.getAttribute("data-kind");
      const id = el.getAttribute("data-id");
      el.classList.toggle("selected", state.selected[kind + "s"].includes(id));
    });
    const count = state.selected.files.length + state.selected.folders.length;
    if (count) Winstem.App.emit("fm-selection", count);
  }

  /* ═══════════════ open handlers ═══════════════ */
  function openFolder(item) {
    state.location = "folder";
    state.folderId = item.id;
    state.query = "";
    const input = state.content.querySelector("#fm-search-input");
    if (input) input.value = "";
    loadAndRender();
  }

  function openFile(item) {
    Winstem.FS.touch(item.id).catch(function () { /* non-fatal */ });
    const appId = Winstem.FileTypes.openAppFor(item.name);
    if (appId) {
      Winstem.Apps.launch(appId, { file: item });
    } else {
      /* no previewer — offer generic dialog */
      Winstem.Apps.genericFileDialog(item);
    }
  }

  /* ═══════════════ context menus ═══════════════ */
  function currentFolderId() {
    return state.location === "folder" ? state.folderId : null;
  }

  function showItemContextMenu(x, y, item, kind) {
    const multi = state.selected.files.length + state.selected.folders.length > 1;
    const items = [];

    items.push({ label: "Open", icon: "bi-box-arrow-up-right", action: function () {
        (kind === "folder" ? openFolder(item) : openFile(item));
    }});
    if (kind === "file" && Winstem.FileTypes.info(item.name).isEditable) {
      items.push({ label: "Edit with Text Editor", icon: "bi-pencil-square", action: function () {
          Winstem.Apps.launch("editor", { file: item });
      }});
    }
    items.push({ label: "Download", icon: "bi-download", disabled: kind === "folder", action: function () {
        downloadSelection();
    }});
    items.push({ sep: true });
    items.push({ label: "Rename", icon: "bi-pencil", disabled: multi, action: function () { renameSelection(); } });
    items.push({ label: "Move to…", icon: "bi-folder-symlink", action: function () { moveSelection(); } });
    if (kind === "file") {
      items.push({ label: "Make a copy", icon: "bi-files", disabled: multi, action: function () { duplicateSelection(); } });
    }
    items.push({ sep: true });
    items.push({ label: "Share…", icon: "bi-share", disabled: multi, action: function () {
        Winstem.Files.shareDialog(item);
    }});
    items.push({ label: item.is_favorite ? "Remove from favorites" : "Add to favorites", icon: item.is_favorite ? "bi-star" : "bi-star", action: function () {
        Winstem.FS.setFavorite(kind, item.id, !item.is_favorite)
          .then(function () { Winstem.Notifications.success(item.is_favorite ? "Removed from favorites" : "Added to favorites", item.name); loadAndRender(true); })
          .catch(function (err) { Winstem.Notifications.error("Error", err.message); });
    }});
    items.push({ sep: true });
    items.push({ label: "Properties", icon: "bi-info-circle", action: function () {
        Winstem.Apps.propertiesDialog(item);
    }});
    items.push({ label: "Move to Trash", icon: "bi-trash", danger: true, action: function () { trashSelection(); } });

    Winstem.Desktop.showMenu(items, x, y);
  }

  /* ═══════════════ operations ═══════════════ */
  function openFilePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.addEventListener("change", function () {
      if (input.files && input.files.length) {
        Winstem.FS.enqueueUploads(input.files, currentFolderId());
        renderUploadBar();
        Winstem.Notifications.info("Uploading", input.files.length + " file(s) added to queue");
      }
    });
    input.click();
  }

  async function downloadSelection() {
    const ids = state.selected.files;
    if (!ids.length) return;
    Winstem.Notifications.info("Preparing download…", ids.length + " file(s)");
    for (const id of ids) {
      try {
        const list = state.data ? state.data.files : [];
        const file = list.find(function (f) { return f.id === id; });
        if (!file) continue;
        await Winstem.Files.downloadFile(file);
      } catch (e) {
        Winstem.Notifications.error("Download failed", e.message);
      }
    }
  }

  function renameSelection() {
    const kind = state.selected.files.length ? "files" : state.selected.folders.length ? "folders" : null;
    if (!kind) return;
    const list = state.data[kind];
    const item = list.find(function (i) { return state.selected[kind].includes(i.id); });
    if (!item) return;
    Winstem.Apps.prompt({ title: "Rename", label: "New name", value: item.name, okLabel: "Rename" })
      .then(function (value) {
        if (value === null || value === undefined) return;
        const op = kind === "files"
          ? Winstem.FS.renameFile(item.id, value)
          : Winstem.FS.renameFolder(item.id, value);
        op.then(function () {
          Winstem.Notifications.success("Renamed", item.name + " → " + value);
          loadAndRender(true);
        }).catch(function (err) { Winstem.Notifications.error("Rename failed", err.message); });
      });
  }

  function trashSelection() {
    const has = state.selected.files.length || state.selected.folders.length;
    if (!has) return;
    const n = state.selected.files.length + state.selected.folders.length;
    Winstem.Apps.confirm("Move " + n + " item" + (n === 1 ? "" : "s") + " to Trash?", "Move to Trash").then(function (ok) {
      if (!ok) return;
      const ops = [];
      if (state.selected.files.length) ops.push(Winstem.FS.trash("files", state.selected.files));
      if (state.selected.folders.length) ops.push(Winstem.FS.trash("folders", state.selected.folders));
      Promise.all(ops).then(function () {
        Winstem.Notifications.success("Moved to Trash", n + " item" + (n === 1 ? "" : "s"));
        state.selected = { files: [], folders: [] };
        loadAndRender(true);
      }).catch(function (err) { Winstem.Notifications.error("Error", err.message); });
    });
  }

  function purgeItem(item) {
    const isFile = item.kind === "file";
    Winstem.Apps.confirm("Permanently delete \"" + item.name + "\"? This cannot be undone.", "Delete forever").then(function (ok) {
      if (!ok) return;
      Winstem.FS.purge(isFile ? "files" : "folders", [item.id]).then(function () {
        Winstem.Notifications.success("Deleted", item.name);
        loadAndRender(true);
      }).catch(function (err) { Winstem.Notifications.error("Error", err.message); });
    });
  }

  function moveSelection() {
    const has = state.selected.files.length || state.selected.folders.length;
    if (!has) return;
    Winstem.Files.pickFolder("Move to…").then(function (destId) {
      if (destId === undefined || destId === null) return;
      const ops = [];
      if (state.selected.files.length) ops.push(Winstem.FS.move("files", state.selected.files, destId));
      if (state.selected.folders.length) ops.push(Winstem.FS.move("folders", state.selected.folders, destId));
      Promise.all(ops).then(function () {
        Winstem.Notifications.success("Moved");
        state.selected = { files: [], folders: [] };
        loadAndRender(true);
      }).catch(function (err) { Winstem.Notifications.error("Move failed", err.message); });
    });
  }

  function duplicateSelection() {
    const kind = state.selected.files.length ? "files" : state.selected.folders.length ? "folders" : null;
    if (!kind) return;
    const item = state.data[kind].find(function (i) { return state.selected[kind].includes(i.id); });
    if (!item) return;
    const op = kind === "files"
      ? Winstem.FS.copyFile(item.id, currentFolderId())
      : Winstem.FS.copyFolder(item.id, currentFolderId());
    Winstem.Notifications.info("Copying", item.name + "…");
    op.then(function () {
      Winstem.Notifications.success("Copy created");
      loadAndRender(true);
    }).catch(function (err) { Winstem.Notifications.error("Copy failed", err.message); });
  }

  /* ═══════════════ new folder ═══════════════ */
  function newFolder() {
    Winstem.Apps.prompt({ title: "New folder", label: "Folder name", value: "New Folder", okLabel: "Create" })
      .then(function (value) {
        if (value === null || value === undefined) return;
        Winstem.FS.createFolder(value, currentFolderId()).then(function () {
          Winstem.Notifications.success("Folder created", value);
          loadAndRender(true);
        }).catch(function (err) { Winstem.Notifications.error("Could not create folder", err.message); });
      });
  }

  /* ═══════════════ upload queue UI ═══════════════ */
  function renderUploadBar() {
    const bar = state.content.querySelector("#fm-uploadbar");
    if (!bar) return;
    const queue = Winstem.FS.getQueue();
    if (!queue.length) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
    bar.classList.remove("hidden");
    bar.innerHTML = "";
    const active = queue.filter(function (i) { return i.status === "queued" || i.status === "uploading"; }).length;
    const done = queue.filter(function (i) { return i.status === "done"; }).length;
    bar.innerHTML = '<div class="fm-uploadbar-head">' +
      '<span><i class="bi bi-cloud-arrow-up"></i> Uploading files…' +
      (active ? ' <span class="fm-upload-count">' + active + ' remaining</span>' : "") +
      (done ? ' <span class="fm-upload-done">' + done + ' complete</span>' : "") +
      '</span>' +
      '<button class="fm-upload-clear" id="fm-upload-clear" aria-label="Clear queue"><i class="bi bi-x-lg"></i></button>' +
      '</div>';
    const list = Winstem.Utils.el('<div class="fm-upload-list"></div>');
    bar.appendChild(list);
    queue.forEach(function (item) {
      const pct = Math.round((item.progress || 0) * 100);
      const statusTxt = item.status === "done" ? "Complete"
        : item.status === "error" ? "Failed"
        : item.status === "canceled" ? "Canceled"
        : item.status === "uploading" ? pct + "%" : "Waiting…";
      const row = Winstem.Utils.el(
        '<div class="fm-upload-row" data-id="' + item.id + '">' +
          '<div class="fm-upload-info">' +
            '<span class="fm-upload-name">' + Winstem.Utils.escapeHtml(item.name) + '</span>' +
            '<span class="fm-upload-status ' + item.status + '">' + statusTxt + '</span>' +
          '</div>' +
          '<div class="progress fm-upload-progress" style="height:6px">' +
            '<div class="progress-bar" style="width:' + Math.min(100, pct) + '%' + (item.status === "error" ? ';background:#f87171' : "") + '"></div>' +
          '</div>' +
          (item.status === "error" ?
            '<div class="fm-upload-actions"><button class="btn btn-outline-secondary btn-sm" data-act="retry"><i class="bi bi-arrow-clockwise"></i> Retry</button>' +
            '<button class="btn btn-outline-danger btn-sm" data-act="cancel"><i class="bi bi-x-lg"></i></button></div>' : "") +
        '</div>'
      );
      const retry = row.querySelector('[data-act="retry"]');
      if (retry) retry.addEventListener("click", function () { Winstem.FS.retryUpload(item.id); });
      const cancel = row.querySelector('[data-act="cancel"]');
      if (cancel) cancel.addEventListener("click", function () { Winstem.FS.cancelUpload(item.id); });
      list.appendChild(row);
    });
    const clear = bar.querySelector("#fm-upload-clear");
    if (clear) {
      clear.addEventListener("click", function () {
        Winstem.FS.clearUploadQueue();
        Winstem.App.emit("upload-queue", []);
        renderUploadBar();
      });
    }
  }

  /* ═══════════════ folder picker (move/copy) ═══════════════ */
  function pickFolder(title) {
    return new Promise(function (resolve) {
      const dlg = Winstem.Apps.dialog({
        title: title || "Choose folder",
        size: "md",
        body: '<div class="folder-picker"><div class="folder-picker-path"><i class="bi bi-house-door"></i> Home</div><div class="folder-picker-list" id="fp-list"></div></div>',
        buttons: [
          { label: "Cancel", class: "btn-outline-secondary" },
          { label: "Move here", class: "btn-primary", dismiss: false, action: function (m) {
              const chosen = dlg.body.querySelector(".folder-picker-path");
              const id = chosen.getAttribute("data-id");
              resolve(id === "root" ? null : id);
              m.hide();
          }}
        ],
        onClose: function () { resolve(undefined); }
      });
      const listEl = dlg.body.querySelector("#fp-list");
      buildPickerLevel(listEl, null, function (id, name, parentPath) {
        const pathEl = dlg.body.querySelector(".folder-picker-path");
        pathEl.setAttribute("data-id", id === null ? "root" : id);
        pathEl.innerHTML = '<i class="bi bi-house-door"></i> ' + Winstem.Utils.escapeHtml(parentPath || (id === null ? "Home" : name));
      });
    });
  }

  async function buildPickerLevel(listEl, parentId, onPick) {
    listEl.innerHTML = '<div class="fp-loading"><div class="spinner-border spinner-border-sm"></div></div>';
    try {
      const { folders } = await Winstem.FS.listFolder(parentId, { noCache: true });
      listEl.innerHTML = "";
      if (!folders.length) {
        listEl.innerHTML = '<div class="fp-empty">No subfolders here</div>';
        return;
      }
      folders.forEach(function (f) {
        const row = Winstem.Utils.el(
          '<div class="fp-row"><i class="bi bi-folder-fill" style="color:#f0b429"></i><span>' + Winstem.Utils.escapeHtml(f.name) + '</span></div>'
        );
        row.addEventListener("click", function () {
          buildPickerLevel(listEl, f.id, onPick);
        });
        listEl.appendChild(row);
      });
      onPick(parentId, null, null);
    } catch (e) {
      listEl.innerHTML = '<div class="fp-empty">Could not load folders</div>';
    }
  }

  /* ═══════════════ share dialog ═══════════════ */
  function shareDialog(item) {
    const isFile = !item.parent_id && !item.kind ? true : item.kind !== "folder";
    const kind = item.kind ? item.kind : (item.extension !== undefined ? "file" : "folder");
    const dlg = Winstem.Apps.dialog({
      title: "Share \"" + item.name + "\"",
      size: "md",
      body: '<div class="share-dialog">' +
        '<div class="sd-section-title">Anyone with the link</div>' +
        '<div class="sd-link-row">' +
          '<select class="form-select form-select-sm sd-perm" aria-label="Permission">' +
            '<option value="read">Can view</option>' +
            '<option value="download">Can view &amp; download</option>' +
          '</select>' +
          '<select class="form-select form-select-sm sd-expiry" aria-label="Expiration">' +
            '<option value="7">7 days</option><option value="1">1 day</option>' +
            '<option value="30">30 days</option><option value="0" selected>No expiration</option>' +
          '</select>' +
          '<button class="btn btn-primary btn-sm" id="sd-create-link"><i class="bi bi-link-45deg"></i> Create link</button>' +
        '</div>' +
        '<div id="sd-links"></div>' +
        '<div class="sd-section-title mt-3">Share with people</div>' +
        '<div class="sd-people-row">' +
          '<input type="email" class="form-control form-control-sm" id="sd-email" placeholder="name@example.com" aria-label="Email address">' +
          '<select class="form-select form-select-sm sd-perm2" aria-label="Permission"><option value="read">Can view</option><option value="download">Can view &amp; download</option></select>' +
          '<button class="btn btn-primary btn-sm" id="sd-share-email">Share</button>' +
        '</div>' +
        '<div id="sd-people"></div>' +
      '</div>',
      buttons: [{ label: "Done", class: "btn-primary" }]
    });

    const body = dlg.body;
    const linksBox = body.querySelector("#sd-links");
    const peopleBox = body.querySelector("#sd-people");

    function refresh() {
      Winstem.Sharing.listFor(kind === "folder" ? "folder" : "file", item.id).then(function (shares) {
        linksBox.innerHTML = "";
        peopleBox.innerHTML = "";
        shares.forEach(function (s) {
          if (s.type === "link") {
            const url = Winstem.Sharing.linkUrl(s.share_token);
            const expired = s.expires_at && new Date(s.expires_at) < new Date();
            const row = Winstem.Utils.el(
              '<div class="sd-share-row">' +
                '<i class="bi bi-link-45deg sd-share-icon"></i>' +
                '<div class="sd-share-info"><div class="sd-share-url">' + Winstem.Utils.escapeHtml(Winstem.Utils.truncateMiddle(url, 44)) + '</div>' +
                '<div class="sd-share-meta">' + (expired ? '<span class="text-danger">Expired</span> · ' : "") +
                  Winstem.Utils.escapeHtml(s.permission === "download" ? "Can view &amp; download" : "Can view") + ' · ' +
                  (s.expires_at ? "Expires " + Winstem.Utils.formatDate(s.expires_at) : "Never expires") + '</div></div>' +
                '<div class="sd-share-actions">' +
                  '<button class="btn btn-outline-secondary btn-sm" data-act="copy"><i class="bi bi-clipboard"></i></button>' +
                  '<button class="btn btn-outline-danger btn-sm" data-act="revoke"><i class="bi bi-slash-circle"></i></button>' +
                '</div>' +
              '</div>'
            );
            const copy = row.querySelector('[data-act="copy"]');
            copy.addEventListener("click", function () {
              Winstem.Utils.copyText(url).then(function (ok) {
                Winstem.Notifications.success(ok ? "Link copied" : "Copy failed");
              });
            });
            const revoke = row.querySelector('[data-act="revoke"]');
            revoke.addEventListener("click", function () {
              Winstem.Sharing.revoke(s.id).then(refresh).catch(function (e) { Winstem.Notifications.error("Revoke failed", e.message); });
            });
            linksBox.appendChild(row);
          } else {
            (s.share_permissions || []).forEach(function (perm) {
              const row = Winstem.Utils.el(
                '<div class="sd-share-row">' +
                  '<i class="bi bi-person sd-share-icon"></i>' +
                  '<div class="sd-share-info"><div class="sd-share-url">' + Winstem.Utils.escapeHtml(perm.user_email) + '</div>' +
                  '<div class="sd-share-meta">' + Winstem.Utils.escapeHtml(perm.permission) + ' · ' +
                    (s.revoked_at ? '<span class="text-danger">revoked</span>' : "active") + '</div></div>' +
                  '<div class="sd-share-actions"><button class="btn btn-outline-danger btn-sm" data-act="revoke"><i class="bi bi-slash-circle"></i></button></div>' +
                '</div>'
              );
              const revoke = row.querySelector('[data-act="revoke"]');
              revoke.addEventListener("click", function () {
                Winstem.Sharing.removePermission(perm.id).then(refresh).catch(function (e) { Winstem.Notifications.error("Error", e.message); });
              });
              peopleBox.appendChild(row);
            });
          }
        });
        if (!linksBox.children.length) {
          linksBox.innerHTML = '<div class="sd-empty">No links yet — create one to share this ' + kind + '.</div>';
        }
        if (!peopleBox.children.length) {
          peopleBox.innerHTML = '<div class="sd-empty">No people yet — share with an email address.</div>';
        }
      }).catch(function (e) { Winstem.Notifications.error("Share error", e.message); });
    }

    body.querySelector("#sd-create-link").addEventListener("click", function () {
      const permission = body.querySelector(".sd-perm").value;
      const days = parseInt(body.querySelector(".sd-expiry").value, 10);
      const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
      Winstem.Sharing.createLinkShare({
        fileId: kind === "file" ? item.id : null,
        folderId: kind === "folder" ? item.id : null,
        permission: permission,
        expiresAt: expiresAt
      }).then(function (s) {
        Winstem.Notifications.success("Share link created");
        refresh();
      }).catch(function (e) { Winstem.Notifications.error("Share failed", e.message); });
    });

    body.querySelector("#sd-share-email").addEventListener("click", async function () {
      const email = body.querySelector("#sd-email").value;
      const permission = body.querySelector(".sd-perm2").value;
      try {
        let shareId = null;
        const existing = await Winstem.Sharing.listFor(kind === "folder" ? "folder" : "file", item.id);
        const priv = existing.find(function (s) { return s.type === "private"; });
        if (priv) shareId = priv.id;
        else {
          const created = await Winstem.Sharing.createLinkShare({
            fileId: kind === "file" ? item.id : null,
            folderId: kind === "folder" ? item.id : null,
            permission: permission,
            expiresAt: null
          });
          /* convert to private share */
          await Winstem.DB.getClient().from("shares").update({ type: "private" }).eq("id", created.id);
          shareId = created.id;
        }
        await Winstem.Sharing.shareWithEmail(shareId, email, permission);
        Winstem.Notifications.success("Shared with " + email);
        refresh();
      } catch (e) {
        Winstem.Notifications.error("Share failed", e.message);
      }
    });

    refresh();
  }

  /* ═══════════════ download & shared preview helpers ═══════════════ */
  function downloadFile(file) {
    return Winstem.Storage.getSignedUrl(file.storage_path, 900).then(function (url) {
      Winstem.Utils.downloadUrl(url, file.name);
    }).catch(function (err) {
      /* fallback: full download through client */
      return Winstem.Storage.download(file.storage_path).then(function (blob) {
        Winstem.Utils.downloadBlob(blob, file.name);
      });
    });
  }

  function previewShared(file, share) {
    const appId = Winstem.FileTypes.openAppFor(file.name);
    if (appId) {
      /* wrap as a read-only file item for viewer apps */
      const wrapped = Object.assign({}, file, { _shared: true, _permission: share.permission || "read" });
      Winstem.Apps.launch(appId, { file: wrapped });
      return;
    }
    Winstem.Apps.genericFileDialog(file);
  }

  function downloadShared(file) {
    Winstem.Notifications.info("Preparing download…", file.name);
    Winstem.Storage.getSignedUrl(file.storage_path, 900).then(function (url) {
      Winstem.Utils.downloadUrl(url, file.name);
    }).catch(function () {
      Winstem.Storage.download(file.storage_path).then(function (blob) {
        Winstem.Utils.downloadBlob(blob, file.name);
      }).catch(function (e) { Winstem.Notifications.error("Download failed", e.message); });
    });
  }

  /* ═══════════════ storage card ═══════════════ */
  function refreshStorageCard() {
    Winstem.FS.usage().then(function (u) {
      const used = state.content.querySelector("#fm-storage-used");
      const bar = state.content.querySelector("#fm-storage-bar");
      if (used) used.textContent = Winstem.Utils.formatBytes(u.usage);
      if (bar) bar.style.width = Math.min(100, (u.usage / u.quota) * 100) + "%";
    }).catch(function () { /* not signed in / offline — leave placeholder */ });
  }

  /* ═══════════════ global listeners ═══════════════ */
  Winstem.App.on("upload-queue", function () {
    if (state.content && state.content.querySelector("#fm-uploadbar")) renderUploadBar();
  });
  Winstem.App.on("files-changed", function () {
    if (state.content && state.content.querySelector("#fm-content")) loadAndRender(true);
  });

  /* ═══════════════ public API ═══════════════ */
  Winstem.Files = {
    newFolder: newFolder,
    openFilePicker: openFilePicker,
    downloadFile: downloadFile,
    downloadShared: downloadShared,
    previewShared: previewShared,
    shareDialog: shareDialog,
    pickFolder: pickFolder,
    showItemContextMenu: showItemContextMenu
  };

  Winstem.Apps.register({
    id: "files",
    name: "Files",
    icon: "bi-folder2-open",
    description: "Your cloud files, folders and storage",
    category: "System",
    tags: ["files", "storage", "cloud", "explorer"],
    singleInstance: true,
    width: 980,
    height: 640,
    create: create,
    focus: focus
  });

  Winstem.Apps.register({
    id: "recycle",
    name: "Recycle Bin",
    icon: "bi-trash3",
    description: "Restore or permanently delete files",
    category: "System",
    tags: ["trash", "recycle", "delete"],
    singleInstance: true,
    width: 860,
    height: 560,
    create: function (win, content, params) {
      Winstem.Apps.launch("files", { location: "trash" });
      Winstem.WindowManager.close(win.id);
    },
    focus: function (win, params) {
      const filesWin = Winstem.WindowManager.all().find(function (w) { return w.appId === "files"; });
      if (filesWin) Winstem.Apps.launch("files", { location: "trash" });
    }
  });
})();
