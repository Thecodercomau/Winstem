/* ═══════════════════════════════════════════════════════════
   WINSTEM — Notes
   Cloud-synchronized notes backed by the `notes` table.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const state = {
    notes: [],
    activeId: null,
    query: "",
    dirty: false,
    savedText: ""
  };

  function db() { return Winstem.DB.getClient(); }

  function loadNotes() {
    const user = Winstem.Auth.getUser();
    if (!user) return Promise.resolve([]);
    return db().from("notes")
      .select("*").eq("owner_id", user.id).is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        state.notes = res.data || [];
        return state.notes;
      });
  }

  /* ═══════════════ app create ═══════════════ */
  function create(win, content, params) {
    content.innerHTML =
      '<div class="notes-app">' +
        '<aside class="notes-side">' +
          '<button class="notes-newbtn" id="notes-new"><i class="bi bi-plus-lg"></i> New note</button>' +
          '<div class="notes-search"><i class="bi bi-search"></i><input type="text" id="notes-search" placeholder="Search notes…" aria-label="Search notes"></div>' +
          '<div class="notes-list" id="notes-list"></div>' +
        '</aside>' +
        '<div class="notes-main">' +
          '<div class="notes-editor-wrap" id="notes-editor-wrap">' +
            '<div class="notes-empty" id="notes-empty">' +
              '<i class="bi bi-journal-text"></i><p>Select a note or create a new one.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const listEl = content.querySelector("#notes-list");

    /* ── list ── */
    function renderList() {
      listEl.innerHTML = "";
      const q = state.query.toLowerCase();
      const filtered = state.notes.filter(function (n) {
        return !q || n.title.toLowerCase().indexOf(q) !== -1 || n.content.toLowerCase().indexOf(q) !== -1;
      });
      if (!filtered.length) {
        listEl.innerHTML = '<div class="notes-none">' + (state.query ? "No matching notes" : "No notes yet") + '</div>';
        return;
      }
      filtered.forEach(function (n) {
        const snippet = (n.content || "").replace(/\s+/g, " ").slice(0, 60);
        const el = Winstem.Utils.el(
          '<button class="notes-item' + (n.id === state.activeId ? " active" : "") + '" data-id="' + n.id + '">' +
            '<div class="notes-item-title">' + Winstem.Utils.escapeHtml(n.title || "Untitled") + '</div>' +
            (snippet ? '<div class="notes-item-snippet">' + Winstem.Utils.escapeHtml(snippet) + '</div>' : "") +
            '<div class="notes-item-date">' + Winstem.Utils.timeAgo(n.updated_at) +
              (n.is_pinned ? ' · <i class="bi bi-pin-fill"></i>' : "") + '</div>' +
          '</button>'
        );
        el.addEventListener("click", function () { openNote(n.id); });
        el.addEventListener("contextmenu", function (e) {
          e.preventDefault(); e.stopPropagation();
          Winstem.Desktop.showMenu([
            { label: n.is_pinned ? "Unpin" : "Pin to top", icon: "bi-pin", action: function () { togglePin(n.id); } },
            { sep: true },
            { label: "Delete", icon: "bi-trash", danger: true, action: function () { deleteNote(n.id); } }
          ], e.clientX, e.clientY);
        });
        listEl.appendChild(el);
      });
    }

    /* ── editor ── */
    function openNote(id) {
      saveDirty();
      state.activeId = id;
      const n = state.notes.find(function (x) { return x.id === id; });
      if (!n) return;
      renderList();
      const wrap = content.querySelector("#notes-editor-wrap");
      wrap.innerHTML =
        '<div class="notes-editor">' +
          '<div class="notes-editor-tools">' +
            '<input type="text" class="notes-title-input" id="notes-title" value="' + Winstem.Utils.escapeAttr(n.title || "") + '" placeholder="Title…" aria-label="Note title">' +
            '<button class="btn btn-sm btn-outline-secondary" id="notes-save" title="Save (Ctrl+S)"><i class="bi bi-cloud-arrow-up"></i> Save</button>' +
            '<button class="btn btn-sm btn-outline-secondary" id="notes-pin" title="Pin"><i class="bi bi-pin' + (n.is_pinned ? "-fill" : "") + '"></i></button>' +
          '</div>' +
          '<textarea class="notes-content" id="notes-content" placeholder="Start writing…" aria-label="Note content">' +
            Winstem.Utils.escapeHtml(n.content || "") +
          '</textarea>' +
          '<div class="notes-status" id="notes-status">Saved ' + Winstem.Utils.timeAgo(n.updated_at) + '</div>' +
        '</div>';

      const ta = wrap.querySelector("#notes-content");
      state.savedText = ta.value;
      state.dirty = false;

      ta.addEventListener("input", function () {
        state.dirty = ta.value !== state.savedText;
        const status = wrap.querySelector("#notes-status");
        if (status) status.textContent = state.dirty ? "Unsaved changes…" : "Saved";
      });
      wrap.querySelector("#notes-title").addEventListener("input", function () { state.dirty = true; });
      wrap.querySelector("#notes-save").addEventListener("click", function () { saveDirty(true); });
      wrap.querySelector("#notes-pin").addEventListener("click", function () { togglePin(n.id); });
      ta.addEventListener("keydown", function (e) {
        if (Winstem.Utils.isMod(e) && (e.key === "s" || e.key === "S")) { e.preventDefault(); saveDirty(true); }
      });
      ta.focus();
    }

    function saveDirty(notify) {
      if (!state.activeId) return;
      const wrap = content.querySelector("#notes-editor-wrap");
      if (!wrap) return;
      const titleEl = wrap.querySelector("#notes-title");
      const textEl = wrap.querySelector("#notes-content");
      if (!titleEl || !textEl) return;
      if (!state.dirty) return;
      const n = state.notes.find(function (x) { return x.id === state.activeId; });
      if (!n) return;
      const title = titleEl.value.trim() || "Untitled";
      const text = textEl.value;
      db().from("notes")
        .update({ title: title, content: text, updated_at: new Date().toISOString() })
        .eq("id", n.id).eq("owner_id", Winstem.Auth.getUser().id)
        .then(function (res) {
          if (res.error) throw res.error;
          n.title = title; n.content = text; n.updated_at = new Date().toISOString();
          state.savedText = text;
          state.dirty = false;
          const status = wrap.querySelector("#notes-status");
          if (status) status.textContent = "Saved just now";
          if (notify) Winstem.Notifications.success("Note saved", title);
          renderList();
        }).catch(function (err) {
          Winstem.Notifications.error("Save failed", err.message);
        });
    }

    function togglePin(id) {
      const n = state.notes.find(function (x) { return x.id === id; });
      if (!n) return;
      db().from("notes").update({ is_pinned: !n.is_pinned, updated_at: new Date().toISOString() })
        .eq("id", id).eq("owner_id", Winstem.Auth.getUser().id)
        .then(function () {
          n.is_pinned = !n.is_pinned;
          renderList();
          const wrap = content.querySelector("#notes-editor-wrap");
          if (wrap) {
            const pin = wrap.querySelector("#notes-pin");
            if (pin) pin.innerHTML = '<i class="bi bi-pin' + (n.is_pinned ? "-fill" : "") + '"></i>';
          }
        });
    }

    function deleteNote(id) {
      Winstem.Apps.confirm("Delete this note permanently?", "Delete note").then(function (ok) {
        if (!ok) return;
        db().from("notes")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id).eq("owner_id", Winstem.Auth.getUser().id)
          .then(function () {
            state.notes = state.notes.filter(function (x) { return x.id !== id; });
            if (state.activeId === id) {
              state.activeId = null;
              content.querySelector("#notes-editor-wrap").innerHTML =
                '<div class="notes-empty"><i class="bi bi-journal-text"></i><p>Select a note or create a new one.</p></div>';
            }
            Winstem.Notifications.success("Note deleted");
            renderList();
          });
      });
    }

    /* ── events ── */
    content.querySelector("#notes-new").addEventListener("click", async function () {
      const user = Winstem.Auth.getUser();
      const id = crypto.randomUUID ? crypto.randomUUID() : Winstem.Utils.uid();
      const res = await db().from("notes").insert([{
        id: id, owner_id: user.id, title: "Untitled", content: ""
      }]).select().maybeSingle();
      if (res.error) { Winstem.Notifications.error("Could not create note", res.error.message); return; }
      state.notes.unshift(res.data);
      renderList();
      openNote(res.data.id);
    });

    content.querySelector("#notes-search").addEventListener("input", Winstem.Utils.debounce(function () {
      state.query = content.querySelector("#notes-search").value.trim();
      renderList();
    }, 200));

    win._dirtyCheck = function () { return state.dirty; };

    loadNotes().then(function () {
      renderList();
      if (params && params.noteId) openNote(params.noteId);
    }).catch(function (err) {
      listEl.innerHTML = '<div class="notes-none">Could not load notes: ' + Winstem.Utils.escapeHtml(err.message) + '</div>';
    });
  }

  Winstem.Apps.register({
    id: "notes",
    name: "Notes",
    icon: "bi-journal-text",
    description: "Cloud-synchronized notes",
    category: "Productivity",
    tags: ["notes", "write", "memo", "sync"],
    singleInstance: true,
    width: 860,
    height: 580,
    create: create
  });
})();
