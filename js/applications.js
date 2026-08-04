/* ═══════════════════════════════════════════════════════════
   WINSTEM — Application Registry
   Every application registers here and launches through the
   Window Manager. Also provides shared dialogs: properties,
   share, confirm, prompt, new-folder, generic file view.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const registry = {};
  const order = [];

  function $id(id) { return document.getElementById(id); }

  function modalRoot() {
    let root = $id("modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "modal-root";
      document.body.appendChild(root);
    }
    return root;
  }

  Winstem.Apps = {
    /* ── registry ───────────────────────────────────────── */
    register: function (app) {
      if (!app || !app.id) throw new Error("App requires an id");
      registry[app.id] = app;
      if (!order.includes(app.id)) order.push(app.id);
    },

    get: function (id) { return registry[id] || null; },

    all: function () { return order.map(function (id) { return registry[id]; }); },

    launch: function (appId, params) {
      const app = registry[appId];
      if (!app) {
        Winstem.Notifications.error("Application unavailable", "Unknown app: " + appId);
        return null;
      }
      if (typeof app.beforeLaunch === "function") {
        const ok = app.beforeLaunch(params);
        if (ok === false) return null;
      }
      /* single instance → navigate existing window */
      const existing = Winstem.WindowManager.all().find(function (w) { return w.appId === appId; });
      if (existing) {
        Winstem.WindowManager.restore(existing.id);
        if (typeof app.focus === "function") {
          try { app.focus(existing, params); } catch (e) { console.error(e); }
        }
        return existing;
      }
      const win = Winstem.WindowManager.open({
        appId: appId,
        title: app.name,
        icon: app.icon,
        singleInstance: app.singleInstance,
        w: app.width, h: app.height,
        data: Object.assign({}, params || {}),
        onCreate: function (w, content) {
          if (typeof app.create === "function") {
            app.create(w, content, params || {});
          } else {
            content.innerHTML = '<div class="win-empty"><i class="bi ' + app.icon + '"></i><p>' + Winstem.Utils.escapeHtml(app.name) + ' has no view.</p></div>';
          }
        }
      });
      return win;
    },

    /* ═══════════════ shared dialogs ═══════════════ */

    /** Generic Bootstrap modal. Returns {root, modal, body, close}. */
    dialog: function (opts) {
      opts = opts || {};
      const root = modalRoot();
      const el = Winstem.Utils.el(
        '<div class="modal fade win-modal" tabindex="-1" role="dialog" aria-modal="true" aria-hidden="true">' +
          '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-' + (opts.size || "md") + '">' +
            '<div class="modal-content">' +
              (opts.title ? '<div class="modal-header"><h5 class="modal-title">' + Winstem.Utils.escapeHtml(opts.title) + '</h5>' +
                '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' : "") +
              '<div class="modal-body"></div>' +
              (opts.buttons !== false ? '<div class="modal-footer"></div>' : "") +
            '</div>' +
          '</div>' +
        '</div>'
      );
      root.appendChild(el);
      const modal = new bootstrap.Modal(el, { backdrop: opts.backdrop !== false });
      const body = el.querySelector(".modal-body");
      if (opts.body) {
        if (typeof opts.body === "string") body.innerHTML = opts.body;
        else body.appendChild(opts.body);
      }
      const footer = el.querySelector(".modal-footer");
      if (footer) {
        (opts.buttons || []).forEach(function (b) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn " + (b.class || "btn-secondary") + " btn-sm";
          btn.innerHTML = b.html || Winstem.Utils.escapeHtml(b.label || "");
          if (b.dismiss !== false) btn.setAttribute("data-bs-dismiss", "modal");
          btn.addEventListener("click", function () {
            if (b.action) b.action(modal);
            if (b.dismiss !== false) modal.hide();
          });
          footer.appendChild(btn);
        });
      }
      el.addEventListener("hidden.bs.modal", function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (opts.onClose) opts.onClose();
      });
      modal.show();
      return { root: el, modal: modal, body: body, close: function () { modal.hide(); } };
    },

    confirm: function (message, title) {
      return new Promise(function (resolve) {
        Winstem.Apps.dialog({
          title: title || "Confirm",
          body: '<p class="mb-0">' + Winstem.Utils.escapeHtml(message) + '</p>',
          buttons: [
            { label: "Cancel", class: "btn-outline-secondary" },
            { label: "Confirm", class: "btn-primary", dismiss: false, action: function (m) { resolve(true); m.hide(); } }
          ],
          onClose: function () { resolve(false); }
        });
      });
    },

    prompt: function (opts) {
      return new Promise(function (resolve) {
        const dlg = Winstem.Apps.dialog({
          title: opts.title || "Enter a name",
          body: '<label class="form-label" for="dlg-prompt-input">' + Winstem.Utils.escapeHtml(opts.label || "Name") + '</label>' +
                '<input type="text" class="form-control" id="dlg-prompt-input" value="' + Winstem.Utils.escapeAttr(opts.value || "") + '" autocomplete="off">',
          buttons: [
            { label: "Cancel", class: "btn-outline-secondary" },
            { label: opts.okLabel || "OK", class: "btn-primary", dismiss: false, action: function (m) {
                const input = dlg.body.querySelector("#dlg-prompt-input");
                resolve(input.value);
                m.hide();
            }}
          ],
          onClose: function () { resolve(null); }
        });
        setTimeout(function () {
          const input = dlg.body.querySelector("#dlg-prompt-input");
          if (input) {
            input.focus();
            input.select();
            input.addEventListener("keydown", function (e) {
              if (e.key === "Enter") {
                const ok = dlg.root.querySelector(".modal-footer .btn-primary");
                if (ok) ok.click();
              }
            });
          }
        }, 80);
      });
    },

    /* ── File metadata dialog ───────────────────────────── */
    propertiesDialog: function (item) {
      const info = Winstem.FileTypes.info(item.name);
      const cat = info.categoryInfo;
      const body = document.createElement("div");
      body.innerHTML =
        '<div class="prop-hero">' +
          '<span class="prop-icon" style="color:' + cat.color + '"><i class="bi ' + cat.icon + '"></i></span>' +
          '<div><div class="prop-name">' + Winstem.Utils.escapeHtml(item.name) + '</div>' +
          '<div class="prop-type">' + Winstem.Utils.escapeHtml(cat.label) + (info.extension ? " · ." + Winstem.Utils.escapeHtml(info.extension) : "") + '</div></div>' +
        '</div>' +
        '<div class="prop-grid">' +
          '<div class="prop-row"><span>Type</span><span>' + Winstem.Utils.escapeHtml(cat.label) + '</span></div>' +
          '<div class="prop-row"><span>Category</span><span>' + Winstem.Utils.escapeHtml(info.category) + '</span></div>' +
          '<div class="prop-row"><span>Size</span><span>' + Winstem.Utils.formatBytes(item.size_bytes) + '</span></div>' +
          '<div class="prop-row"><span>Created</span><span>' + Winstem.Utils.formatDate(item.created_at, true) + '</span></div>' +
          '<div class="prop-row"><span>Modified</span><span>' + Winstem.Utils.formatDate(item.updated_at, true) + '</span></div>' +
          (item.last_accessed_at ? '<div class="prop-row"><span>Last opened</span><span>' + Winstem.Utils.formatDate(item.last_accessed_at, true) + '</span></div>' : "") +
          (item.storage_path ? '<div class="prop-row"><span>Storage path</span><span class="prop-mono">' + Winstem.Utils.escapeHtml(Winstem.Utils.truncateMiddle(item.storage_path, 40)) + '</span></div>' : "") +
          (item.mime_type ? '<div class="prop-row"><span>MIME</span><span class="prop-mono">' + Winstem.Utils.escapeHtml(item.mime_type) + '</span></div>' : "") +
        '</div>';
      Winstem.Apps.dialog({
        title: "Properties",
        size: "md",
        body: body,
        buttons: [
          { label: "Close", class: "btn-outline-secondary" }
        ]
      });
    },

    /* ── Generic (non-previewable) file dialog ──────────── */
    genericFileDialog: function (file) {
      const info = Winstem.FileTypes.info(file.name);
      const cat = info.categoryInfo;
      const dlg = Winstem.Apps.dialog({
        title: "No preview available",
        size: "md",
        body: '<div class="generic-file">' +
          '<span class="generic-file-icon" style="color:' + cat.color + '"><i class="bi ' + cat.icon + '" style="font-size:3rem"></i></span>' +
          '<div class="generic-file-name">' + Winstem.Utils.escapeHtml(file.name) + '</div>' +
          '<div class="generic-file-meta">' + Winstem.Utils.escapeHtml(cat.label) + ' · ' + Winstem.Utils.formatBytes(file.size_bytes) + '</div>' +
          '<p class="generic-file-note">This file type cannot be previewed in the browser, but it is fully managed: you can download, rename, move, share and organize it.</p>' +
        '</div>',
        buttons: [
          { label: "Close", class: "btn-outline-secondary" },
          { label: "Properties", class: "btn-outline-primary", dismiss: true, action: function () {
              Winstem.Apps.propertiesDialog(file);
          }},
          { label: "Download", class: "btn-primary", dismiss: true, action: function () {
              Winstem.Files.downloadFiles([file]);
          }}
        ]
      });
      void dlg;
    },

    /* ── Storage dashboard ──────────────────────────────── */
    storageDashboard: function (win) {
      const content = win ? win.querySelector(".win-content") : null;
      if (!content) return;
      content.innerHTML = '<div class="storage-loading p-5 text-center"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Calculating storage usage…</p></div>';
      Winstem.FS.usage().then(function (u) {
        const pct = Math.min(100, (u.usage / u.quota) * 100);
        const cats = [
          { label: "Documents", key: "document", icon: "bi-file-earmark-text", color: "#4f8cff" },
          { label: "Images", key: "image", icon: "bi-image", color: "#a06ef0" },
          { label: "Audio", key: "audio", icon: "bi-music-note", color: "#31c48d" },
          { label: "Videos", key: "video", icon: "bi-film", color: "#f59e0b" },
          { label: "Archives", key: "archive", icon: "bi-file-earmark-zip", color: "#f97316" },
          { label: "PDF", key: "pdf", icon: "bi-file-earmark-pdf", color: "#f87171" },
          { label: "Code", key: "code", icon: "bi-code-slash", color: "#38bdf8" },
          { label: "Other", key: "generic", icon: "bi-file-earmark", color: "#94a3b8" }
        ];
        const rows = cats.map(function (c) {
          const bytes = u.categories[c.key] || 0;
          return '<div class="sd-row"><span class="sd-label"><i class="bi ' + c.icon + '" style="color:' + c.color + '"></i> ' + c.label + '</span>' +
            '<div class="sd-bar"><div class="sd-bar-fill" style="width:' + (u.usage ? Math.max(2, (bytes / u.usage) * 100) : 0) + '%;background:' + c.color + '"></div></div>' +
            '<span class="sd-val">' + Winstem.Utils.formatBytes(bytes) + '</span></div>';
        }).join("");
        content.innerHTML =
          '<div class="storage-dash">' +
            '<div class="sd-hero">' +
              '<div class="sd-title"><i class="bi bi-cloud-hdd"></i> Winstem Cloud Storage</div>' +
              '<div class="sd-total">' + Winstem.Utils.formatBytes(u.usage) + ' <span class="sd-of">of ' + Winstem.Utils.formatBytes(u.quota) + ' used</span></div>' +
              '<div class="progress sd-progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
              '<div class="sd-files">' + u.fileCount + ' file' + (u.fileCount === 1 ? "" : "s") + ' · ' + pct.toFixed(1) + '% used</div>' +
            '</div>' +
            '<div class="sd-list">' + rows + '</div>' +
          '</div>';
      }).catch(function (err) {
        content.innerHTML = '<div class="win-empty"><i class="bi bi-hdd"></i><p>Could not load storage usage.</p></div>';
        Winstem.Notifications.error("Storage error", err.message);
      });
    }
  };
})();
