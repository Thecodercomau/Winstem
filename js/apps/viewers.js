/* ═══════════════════════════════════════════════════════════
   WINSTEM — Markdown & JSON Viewers
   Markdown is rendered with a small XSS-safe renderer: all
   input is HTML-escaped first, then formatting is applied.
   JSON gets a collapsible tree with search.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── XSS-safe markdown renderer ───────────────────────── */
  function escapeMd(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inlineMd(s) {
    let out = escapeMd(s);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    /* links — only http(s) and mailto, always escaped & rel=noopener */
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return out;
  }

  function renderMarkdown(src) {
    const lines = String(src).replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let list = null, code = null, codeBuf = [], quote = false;

    const flushList = function () {
      if (list) { html.push(list === "ul" ? "</ul>" : "</ol>"); list = null; }
    };
    const flushCode = function () {
      if (code) { html.push('<pre class="md-code"><code>' + escapeMd(codeBuf.join("\n")) + "</code></pre>"); code = null; codeBuf = []; }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trim();

      if (/^```/.test(t)) {
        flushList(); flushCode();
        if (code) { flushCode(); } else { code = true; }
        continue;
      }
      if (code) { codeBuf.push(line); continue; }

      if (!t) { flushList(); flushCode(); html.push(""); continue; }

      if (/^#{1,6}\s/.test(t)) {
        flushList(); flushCode();
        const level = t.match(/^#+/)[0].length;
        html.push("<h" + level + ">" + inlineMd(t.replace(/^#+\s*/, "")) + "</h" + level + ">");
        continue;
      }
      if (/^---+$/.test(t)) { flushList(); flushCode(); html.push("<hr>"); continue; }
      if (/^&gt;/.test(t) || /^>\s/.test(t)) {
        flushList(); flushCode();
        html.push("<blockquote>" + inlineMd(t.replace(/^>\s?/, "")) + "</blockquote>");
        continue;
      }
      const ul = t.match(/^[-*+]\s+(.+)/);
      if (ul) {
        flushCode();
        if (list !== "ul") { flushList(); html.push("<ul>"); list = "ul"; }
        html.push("<li>" + inlineMd(ul[1]) + "</li>");
        continue;
      }
      const ol = t.match(/^\d+[.)]\s+(.+)/);
      if (ol) {
        flushCode();
        if (list !== "ol") { flushList(); html.push("<ol>"); list = "ol"; }
        html.push("<li>" + inlineMd(ol[1]) + "</li>");
        continue;
      }
      flushList(); flushCode();
      html.push("<p>" + inlineMd(t) + "</p>");
    }
    flushList(); flushCode();
    return html.join("\n");
  }

  /* ═══════════════ MARKDOWN APP ═══════════════ */
  Winstem.Apps.register({
    id: "markdown",
    name: "Markdown Viewer",
    icon: "bi-file-earmark-richtext",
    description: "Preview Markdown documents safely",
    category: "Productivity",
    tags: ["markdown", "md", "preview", "document"],
    width: 760,
    height: 600,
    create: function (win, content, params) {
      const file = params.file;
      if (!file) {
        content.innerHTML = '<div class="win-empty"><i class="bi bi-file-earmark-richtext"></i><p>Open a .md file from Files.</p></div>';
        return;
      }
      content.innerHTML = '<div class="md-view-loading p-5 text-center"><div class="spinner-border text-primary"></div></div>';
      const load = function () {
        return Winstem.Storage.getSignedUrl(file.storage_path, 3600).then(function (url) {
          return fetch(url).then(function (r) { return r.ok ? r.text() : Promise.reject(new Error("load failed")); });
        }).catch(function () {
          return Winstem.Storage.download(file.storage_path).then(function (b) { return Winstem.Utils.readFileAsText(b); });
        });
      };
      load().then(function (text) {
        content.innerHTML =
          '<div class="md-view">' +
            '<div class="md-view-head">' +
              '<span class="md-view-title"><i class="bi bi-file-earmark-richtext"></i> ' + Winstem.Utils.escapeHtml(file.name) + '</span>' +
              '<button class="btn btn-sm btn-outline-secondary" id="md-download"><i class="bi bi-download"></i> Download</button>' +
              '<button class="btn btn-sm btn-outline-secondary" id="md-edit"><i class="bi bi-pencil-square"></i> Edit</button>' +
            '</div>' +
            '<div class="md-view-body">' + renderMarkdown(text) + '</div>' +
          '</div>';
        content.querySelector("#md-download").addEventListener("click", function () {
          Winstem.Utils.downloadBlob(new Blob([text], { type: "text/markdown" }), file.name);
        });
        content.querySelector("#md-edit").addEventListener("click", function () {
          Winstem.Apps.launch("editor", { file: file });
        });
      }).catch(function (err) {
        content.innerHTML = '<div class="win-empty"><i class="bi bi-file-earmark-x"></i><p>Could not load ' + Winstem.Utils.escapeHtml(file.name) + '</p></div>';
        Winstem.Notifications.error("Open failed", err.message);
      });
    }
  });

  /* ═══════════════ JSON APP ═══════════════ */
  Winstem.Apps.register({
    id: "json",
    name: "JSON Viewer",
    icon: "bi-braces",
    description: "Inspect JSON with a collapsible tree",
    category: "Developer",
    tags: ["json", "viewer", "tree", "data"],
    width: 720,
    height: 580,
    create: function (win, content, params) {
      const file = params.file;
      const build = function (text) {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          content.innerHTML =
            '<div class="win-empty"><i class="bi bi-file-earmark-x"></i><p>This file is not valid JSON.</p></div>';
          return;
        }
        const tree = buildTree(parsed, "$");
        content.innerHTML =
          '<div class="json-view">' +
            '<div class="json-view-head">' +
              '<span class="md-view-title"><i class="bi bi-braces"></i> ' + Winstem.Utils.escapeHtml(file.name) + '</span>' +
              '<div class="json-search"><i class="bi bi-search"></i><input type="text" id="json-search-input" placeholder="Search keys…" aria-label="Search JSON"></div>' +
              '<button class="btn btn-sm btn-outline-secondary" id="json-expand"><i class="bi bi-arrows-expand"></i> Expand all</button>' +
              '<button class="btn btn-sm btn-outline-secondary" id="json-collapse"><i class="bi bi-arrows-collapse"></i> Collapse</button>' +
            '</div>' +
            '<div class="json-tree" id="json-tree"></div>' +
          '</div>';
        const treeEl = content.querySelector("#json-tree");
        treeEl.appendChild(tree);

        content.querySelector("#json-expand").addEventListener("click", function () {
          treeEl.querySelectorAll("details").forEach(function (d) { d.open = true; });
        });
        content.querySelector("#json-collapse").addEventListener("click", function () {
          treeEl.querySelectorAll("details").forEach(function (d) { d.open = false; });
        });
        const searchInput = content.querySelector("#json-search-input");
        searchInput.addEventListener("input", Winstem.Utils.debounce(function () {
          const q = searchInput.value.toLowerCase().trim();
          treeEl.querySelectorAll(".json-key").forEach(function (k) {
            const key = k.textContent.toLowerCase();
            k.parentElement.parentElement.style.display = !q || key.indexOf(q) !== -1 ? "" : "none";
          });
        }, 200));
      };

      if (!file) {
        content.innerHTML =
          '<div class="json-view">' +
            '<div class="json-view-head"><span class="md-view-title"><i class="bi bi-braces"></i> JSON Viewer</span></div>' +
            '<div class="json-tree"><textarea class="json-paste" id="json-paste" placeholder="Paste JSON here to view it as a tree…"></textarea></div>' +
          '</div>';
        const ta = content.querySelector("#json-paste");
        const tryParse = function () {
          try { build(ta.value); } catch (e) { /* keep editing */ }
        };
        ta.addEventListener("change", tryParse);
        ta.addEventListener("blur", tryParse);
        return;
      }

      content.innerHTML = '<div class="json-view-loading p-5 text-center"><div class="spinner-border text-primary"></div></div>';
      Winstem.Storage.getSignedUrl(file.storage_path, 3600).then(function (url) {
        return fetch(url).then(function (r) { return r.ok ? r.text() : Promise.reject(new Error("load")); });
      }).catch(function () {
        return Winstem.Storage.download(file.storage_path).then(function (b) { return Winstem.Utils.readFileAsText(b); });
      }).then(build).catch(function (err) {
        content.innerHTML = '<div class="win-empty"><i class="bi bi-file-earmark-x"></i><p>Could not load ' + Winstem.Utils.escapeHtml(file.name) + '</p></div>';
      });
    }
  });

  /* ── JSON tree builder ────────────────────────────────── */
  function typeOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  function esc(v) { return Winstem.Utils.escapeHtml(String(v)); }

  function buildTree(value, keyName) {
    const type = typeOf(value);
    if (type === "object" || type === "array") {
      const isArr = type === "array";
      const entries = isArr ? value.map(function (v, i) { return { k: i, v: v }; }) : Object.keys(value).map(function (k) { return { k: k, v: value[k] }; });
      const summary = (isArr ? "[" : "{") + entries.length + (isArr ? "]" : "}");
      const el = document.createElement("details");
      el.open = entries.length < 8;
      const summaryEl = document.createElement("summary");
      summaryEl.innerHTML = '<span class="json-key">' + esc(keyName === "$" ? "$" : keyName) + '</span>' +
        '<span class="json-punct">: </span><span class="json-bracket">' + summary + '</span>';
      el.appendChild(summaryEl);
      const children = document.createElement("div");
      children.className = "json-children";
      entries.forEach(function (e) {
        children.appendChild(buildTree(e.v, e.k));
      });
      el.appendChild(children);
      return el;
    }
    const el = document.createElement("div");
    el.className = "json-leaf";
    const color = type === "string" ? "#31c48d" : type === "number" ? "#f59e0b" : type === "boolean" ? "#a06ef0" : "#f87171";
    const val = type === "string" ? '"' + esc(value) + '"' : esc(value);
    el.innerHTML = '<span class="json-key">' + esc(keyName === "$" ? "$" : keyName) + '</span>' +
      '<span class="json-punct">: </span><span class="json-val" style="color:' + color + '">' + val + '</span>';
    return el;
  }
})();
