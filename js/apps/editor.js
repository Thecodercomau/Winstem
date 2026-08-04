/* ═══════════════════════════════════════════════════════════
   WINSTEM — Text Editor
   Edit TXT/MD/JSON/HTML/CSS/JS/XML/CSV/LOG with a lightweight
   syntax-highlighting overlay, find & replace, cloud save,
   save-as and download.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const state = {
    file: null,
    dirty: false,
    savedText: "",
    readonly: false
  };

  /* ── tiny tokenizer-based highlighter ─────────────────── */
  const LANG_RULES = {
    js:    ["js", "ts", "mjs", "cjs", "tsx", "jsx", "json", "java", "c", "cpp", "h", "hpp", "go", "rs", "kt", "swift", "scala", "php"],
    css:   ["css", "scss", "sass", "less"],
    html:  ["html", "htm", "xml", "svg"],
    shell: ["sh", "bat", "ps1", "py", "rb", "lua", "pl"],
    ini:   ["ini", "toml", "yaml", "yml", "conf", "cfg", "env", "sql"]
  };

  const KEYWORDS = {
    js: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","new","class","extends","super","this","typeof","instanceof","in","of","try","catch","finally","throw","async","await","yield","import","export","from","default","delete","void","null","undefined","true","false","static","get","set"],
    css: [],
    html: [],
    shell: ["def","import","from","class","return","if","elif","else","for","while","print","lambda","self","True","False","None","pass","raise","with","as","in","not","and","or"],
    ini: []
  };

  function langFor(ext) {
    if (!ext) return "js";
    if (LANG_RULES.js.includes(ext)) return "js";
    if (LANG_RULES.css.includes(ext)) return "css";
    if (LANG_RULES.html.includes(ext)) return "html";
    if (LANG_RULES.shell.includes(ext)) return "shell";
    if (LANG_RULES.ini.includes(ext)) return "ini";
    return null;
  }

  function escapeForHl(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function highlight(code, ext) {
    const lang = langFor(ext);
    if (!lang) return escapeForHl(code);
    const esc = escapeForHl(code);
    const kws = KEYWORDS[lang] || [];

    let out = esc;
    /* strings */
    out = out.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="hl-string">$1</span>');
    /* comments */
    if (lang === "js" || lang === "shell" || lang === "css" && ext !== "css") {
      out = out.replace(/(\/\/[^\n]*|#.*$)/gm, '<span class="hl-comment">$1</span>');
    }
    if (lang === "css" && ext === "css") {
      out = out.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');
    }
    if (lang === "html") {
      out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>');
    }
    /* tags for html */
    if (lang === "html") {
      out = out.replace(/(&lt;\/?[a-zA-Z][\w-]*)/g, '<span class="hl-tag">$1</span>');
      out = out.replace(/([a-zA-Z-]+=)/g, '<span class="hl-attr">$1</span>');
    }
    /* keywords */
    if (kws.length) {
      const re = new RegExp("\\b(" + kws.join("|") + ")\\b", "g");
      out = out.replace(re, '<span class="hl-keyword">$1</span>');
    }
    /* numbers */
    out = out.replace(/(\b\d+(\.\d+)?\b)/g, '<span class="hl-number">$1</span>');
    return out;
  }

  /* ── editor build ─────────────────────────────────────── */
  function create(win, content, params) {
    const file = params.file;
    if (!file) {
      /* new unsaved document */
      state.file = { id: null, name: "Untitled.txt", extension: "txt", mime_type: "text/plain", size_bytes: 0, storage_path: null };
      state.savedText = "";
      state.readonly = false;
      state.dirty = true;
      buildEditor(win, content, "");
      return;
    }
    state.file = file;
    state.readonly = !!(file._shared && file._permission === "read");
    content.innerHTML =
      '<div class="ed-loading p-5 text-center"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Loading ' +
      Winstem.Utils.escapeHtml(file.name) + '…</p></div>';
    Winstem.Storage.getSignedUrl(file.storage_path, 3600).then(function (url) {
      return fetch(url).then(function (r) { return r.ok ? r.text() : Promise.reject(new Error("Failed to load file")); });
    }).then(function (text) {
      state.savedText = text;
      buildEditor(win, content, text);
    }).catch(function () {
      /* fallback: client-side download */
      return Winstem.Storage.download(file.storage_path).then(function (blob) {
        return Winstem.Utils.readFileAsText(blob);
      }).then(function (text) {
        state.savedText = text;
        buildEditor(win, content, text);
      }).catch(function (err) {
        content.innerHTML = '<div class="win-empty"><i class="bi bi-file-earmark-x"></i><p>Could not open ' +
          Winstem.Utils.escapeHtml(file.name) + '</p></div>';
        Winstem.Notifications.error("Open failed", err.message);
      });
    });
  }

  function buildEditor(win, content, text) {
    const ext = state.file.extension || Winstem.FileTypes.extOf(state.file.name);
    content.innerHTML =
      '<div class="editor">' +
        '<div class="editor-toolbar">' +
          '<button class="btn btn-sm btn-outline-secondary" data-ed="save" title="Save (Ctrl+S)"><i class="bi bi-cloud-arrow-up"></i> Save</button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-ed="saveas" title="Save as…"><i class="bi bi-file-earmark-plus"></i> Save as</button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-ed="download"><i class="bi bi-download"></i> Download</button>' +
          '<div class="editor-tb-spacer"></div>' +
          '<div class="ed-find hidden">' +
            '<input type="text" class="form-control form-control-sm" id="ed-find-input" placeholder="Find…" aria-label="Find">' +
            '<input type="text" class="form-control form-control-sm" id="ed-replace-input" placeholder="Replace…" aria-label="Replace">' +
            '<button class="btn btn-sm btn-outline-secondary" data-ed="find-next" title="Next"><i class="bi bi-arrow-down"></i></button>' +
            '<button class="btn btn-sm btn-outline-primary" data-ed="replace" title="Replace all"><i class="bi bi-arrow-repeat"></i> All</button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-ed="find-close" aria-label="Close find"><i class="bi bi-x-lg"></i></button>' +
          '</div>' +
          '<button class="btn btn-sm btn-outline-secondary" data-ed="find" title="Find (Ctrl+F)"><i class="bi bi-search"></i></button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-ed="hl" title="Syntax highlight"><i class="bi bi-palette"></i></button>' +
        '</div>' +
        '<div class="editor-wrap">' +
          '<pre class="editor-hl" aria-hidden="true"></pre>' +
          '<textarea class="editor-ta" spellcheck="false" aria-label="Document text" ' +
            (state.readonly ? "readonly" : "") + '></textarea>' +
        '</div>' +
        '<div class="editor-status">' +
          '<span id="ed-status-file">' + Winstem.Utils.escapeHtml(state.file.name) + '</span>' +
          '<span id="ed-status-info">' + (state.readonly ? "Read-only · " : "") + '</span>' +
          '<span id="ed-status-pos"></span>' +
        '</div>' +
      '</div>';

    const ta = content.querySelector(".editor-ta");
    const hl = content.querySelector(".editor-hl");
    ta.value = text;
    hl.innerHTML = highlight(text, ext);

    function syncHl() {
      hl.innerHTML = highlight(ta.value, ext);
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
    }
    ta.addEventListener("input", function () {
      syncHl();
      state.dirty = ta.value !== state.savedText;
      Winstem.WindowManager.setTitle(win.id, state.file.name + (state.dirty ? " •" : ""));
      updateStatus();
    });
    ta.addEventListener("scroll", function () {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
    });
    ta.addEventListener("keyup", updateCursorPos);
    ta.addEventListener("click", updateCursorPos);

    function updateCursorPos() {
      const pos = ta.selectionStart;
      const textUpTo = ta.value.slice(0, pos);
      const line = (textUpTo.match(/\n/g) || []).length + 1;
      const col = pos - (textUpTo.lastIndexOf("\n") + 1);
      const info = content.querySelector("#ed-status-info");
      if (info) info.textContent = (state.readonly ? "Read-only · " : "") + "Ln " + line + ", Col " + col + " · " + ta.value.length + " chars";
    }

    function updateStatus() {
      const f = content.querySelector("#ed-status-file");
      if (f) f.textContent = state.file.name + (state.dirty ? " • unsaved" : "");
    }

    /* toolbar wiring */
    content.querySelectorAll("[data-ed]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const act = btn.getAttribute("data-ed");
        if (act === "save") save(win, content, ta, false);
        else if (act === "saveas") save(win, content, ta, true);
        else if (act === "download") download(ta);
        else if (act === "find") content.querySelector(".ed-find").classList.toggle("hidden");
        else if (act === "find-close") content.querySelector(".ed-find").classList.add("hidden");
        else if (act === "find-next") findNext(ta, content);
        else if (act === "replace") replaceAll(ta, content);
        else if (act === "hl") {
          const on = content.querySelector(".editor-wrap").classList.toggle("no-hl");
          btn.classList.toggle("active", !on);
        }
      });
    });

    /* find inputs */
    const findInput = content.querySelector("#ed-find-input");
    const replaceInput = content.querySelector("#ed-replace-input");
    findInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); findNext(ta, content); } });
    replaceInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); replaceAll(ta, content); } });

    content.querySelector(".editor-ta").focus();

    /* window close guard */
    win._dirtyCheck = function () {
      return state.dirty;
    };

    /* keyboard shortcuts inside editor */
    function onKey(e) {
      if (!Winstem.Utils.isMod(e)) return;
      if (e.key === "s" || e.key === "S") { e.preventDefault(); save(win, content, ta, false); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); content.querySelector(".ed-find").classList.remove("hidden"); findInput.focus(); }
    }
    ta.addEventListener("keydown", onKey);
    updateStatus();
    updateCursorPos();
  }

  function findNext(ta, content) {
    const q = content.querySelector("#ed-find-input").value;
    if (!q) return;
    const idx = ta.value.indexOf(q, ta.selectionEnd);
    const from = idx === -1 ? 0 : idx;
    ta.focus();
    ta.setSelectionRange(from, from + q.length);
    ta.scrollTop = Math.max(0, (ta.value.slice(0, from).match(/\n/g) || []).length * 16 - 40);
  }

  function replaceAll(ta, content) {
    const q = content.querySelector("#ed-find-input").value;
    const r = content.querySelector("#ed-replace-input").value;
    if (!q) return;
    const before = ta.value;
    ta.value = before.split(q).join(r);
    ta.dispatchEvent(new Event("input"));
  }

  function download(ta) {
    const blob = new Blob([ta.value], { type: "text/plain;charset=utf-8" });
    Winstem.Utils.downloadBlob(blob, state.file.name);
  }

  function save(win, content, ta, saveAs) {
    const user = Winstem.Auth.getUser();
    if (!user) {
      Winstem.Notifications.error("Sign in required", "You must be signed in to save files.");
      return;
    }
    const doSave = async function (name, fileId, storagePath, folderId) {
      const blob = new Blob([ta.value], { type: state.file.mime_type || "text/plain;charset=utf-8" });
      const ext = Winstem.FileTypes.extOf(name);
      await Winstem.Storage.upload(user.id, fileId, new File([blob], name, { type: "text/plain" }));
      const client = Winstem.DB.getClient();
      const payload = {
        name: name,
        extension: ext,
        mime_type: "text/plain;charset=utf-8",
        size_bytes: new Blob([ta.value]).size,
        storage_path: storagePath,
        updated_at: new Date().toISOString()
      };
      if (state.file.id) {
        const { error } = await client.from("files").update(payload).eq("id", fileId).eq("owner_id", user.id);
        if (error) throw error;
      } else {
        payload.id = fileId;
        payload.owner_id = user.id;
        payload.folder_id = folderId || null;
        const { error } = await client.from("files").insert([payload]);
        if (error) throw error;
      }
    };

    const perform = function (name, folderId) {
      const newId = (crypto.randomUUID ? crypto.randomUUID() : Winstem.Utils.uid());
      const ext = Winstem.FileTypes.extOf(name);
      const path = Winstem.Storage.pathFor(user.id, saveAs || !state.file.id ? newId : state.file.id, ext);
      doSave(name, saveAs || !state.file.id ? newId : state.file.id, path, folderId).then(function () {
        state.file.id = saveAs || !state.file.id ? newId : state.file.id;
        state.file.name = name;
        state.file.extension = ext;
        state.file.storage_path = path;
        state.savedText = ta.value;
        state.dirty = false;
        Winstem.Notifications.success("Saved", name);
        Winstem.App.emit("files-changed", {});
        Winstem.WindowManager.setTitle(win.id, name);
        updateAfterSave(content);
      }).catch(function (err) {
        Winstem.Notifications.error("Save failed", err.message);
      });
    };

    if (saveAs || !state.file.id) {
      Winstem.Apps.prompt({ title: "Save as", label: "File name", value: state.file.name, okLabel: "Save" }).then(function (value) {
        if (value === null || value === undefined || !value.trim()) return;
        /* pick folder (optional) */
        Winstem.Files.pickFolder("Where to save?").then(function (folderId) {
          perform(value.trim(), folderId === undefined ? null : folderId);
        });
      });
    } else {
      perform(state.file.name, state.file.folder_id || null);
    }
  }

  function updateAfterSave(content) {
    const f = content.querySelector("#ed-status-file");
    if (f) f.textContent = state.file.name;
  }

  Winstem.Apps.register({
    id: "editor",
    name: "Text Editor",
    icon: "bi-file-earmark-text",
    description: "Edit text documents with cloud saving",
    category: "Productivity",
    tags: ["editor", "text", "code", "notes"],
    width: 820,
    height: 580,
    create: create
  });
})();
