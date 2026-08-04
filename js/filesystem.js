/* ═══════════════════════════════════════════════════════════
   WINSTEM — File System (Supabase)
   Virtual cloud filesystem: folders, files, trash, favorites,
   recent, move/copy/duplicate, upload queue and search.
   Metadata lives in PostgreSQL; bytes live in Storage.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* Well-known root locations (virtual folders at parent_id = null) */
  const LOCATIONS = {
    home:       { id: null, label: "Home",      icon: "bi-house-door" },
    desktop:    { id: null, label: "Desktop",   icon: "bi-display" },
    documents:  { id: null, label: "Documents", icon: "bi-folder2-open" },
    downloads:  { id: null, label: "Downloads", icon: "bi-download" },
    pictures:   { id: null, label: "Pictures",  icon: "bi-images" },
    music:      { id: null, label: "Music",     icon: "bi-music-note-beamed" },
    videos:     { id: null, label: "Videos",    icon: "bi-film" },
    favorites:  { id: null, label: "Favorites", icon: "bi-star" },
    recent:     { id: null, label: "Recent",    icon: "bi-clock-history" },
    trash:      { id: null, label: "Trash",     icon: "bi-trash" },
    shared:     { id: null, label: "Shared",    icon: "bi-people" }
  };

  const state = {
    currentFolder: null,      /* {id, name, location} or null for Home */
    currentLocation: "home",
    selection: [],
    sort: { key: "name", dir: "asc" },
    view: "grid",
    queue: [],                /* upload queue */
    rootFolders: null,        /* cache of top-level folders */
    allFolders: null,         /* folder tree cache */
    filesCache: new Map(),    /* folderId → {files, folders, ts} */
    lastRecent: null
  };

  const QUEUE_KEY = "upload-queue-state";

  function db() { return Winstem.DB.getClient(); }

  function requireAuth() {
    const user = Winstem.Auth.getUser();
    if (!user) throw new Error("You must be signed in.");
    return user;
  }

  function normalizeRow(r) { return Object.assign({}, r); }

  /* ═══════════════ CACHING ═══════════════ */
  function cacheFolder(id, data) {
    state.filesCache.set(id || "root", { data: data, ts: Date.now() });
  }
  function cachedFolder(id) {
    const c = state.filesCache.get(id || "root");
    if (c && Date.now() - c.ts < 15000) return c.data;
    return null;
  }
  function invalidate(id) {
    state.filesCache.delete(id || "root");
    if (id) state.filesCache.delete("root");
  }

  /* ═══════════════ FOLDERS ═══════════════ */
  Winstem.FS = {
    LOCATIONS: LOCATIONS,

    /* ── Listing ────────────────────────────────────────── */
    listFolder: async function (folderId, opts) {
      opts = opts || {};
      const user = requireAuth();
      const cacheKey = folderId || "root";
      if (!opts.noCache) {
        const hit = cachedFolder(cacheKey);
        if (hit) return hit;
      }
      const client = db();

      const folderQuery = client.from("folders")
        .select("id, name, parent_id, is_favorite, created_at, updated_at")
        .eq("owner_id", user.id)
        .is("deleted_at", null);

      let folders;
      if (folderId) {
        folders = await folderQuery.eq("parent_id", folderId).order("name", { ascending: true });
      } else {
        folders = await folderQuery.is("parent_id", null).order("name", { ascending: true });
      }
      if (folders.error) throw folders.error;

      const fileQuery = client.from("files")
        .select("id, name, extension, mime_type, size_bytes, folder_id, is_favorite, created_at, updated_at, last_accessed_at")
        .eq("owner_id", user.id)
        .is("deleted_at", null);

      let files;
      if (folderId) {
        files = await fileQuery.eq("folder_id", folderId);
      } else {
        files = await fileQuery.is("folder_id", null);
      }
      if (files.error) throw files.error;

      const data = {
        folders: (folders.data || []).map(normalizeRow),
        files: (files.data || []).map(normalizeRow),
        folderId: folderId || null
      };
      cacheFolder(cacheKey, data);
      return data;
    },

    /** Fetch a single folder (for breadcrumbs / restore). */
    getFolder: async function (folderId) {
      const user = requireAuth();
      if (!folderId) return null;
      const { data, error } = await db().from("folders")
        .select("*").eq("id", folderId).eq("owner_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },

    /** Resolve breadcrumb chain for a folder id. */
    breadcrumbs: async function (folderId) {
      const chain = [];
      let cur = folderId;
      let guard = 0;
      while (cur && guard++ < 64) {
        const f = await Winstem.FS.getFolder(cur);
        if (!f) break;
        chain.unshift({ id: f.id, name: f.name });
        cur = f.parent_id;
      }
      return chain;
    },

    createFolder: async function (name, parentId) {
      const user = requireAuth();
      const clean = Winstem.Utils.sanitizeName(name);
      if (!clean) throw new Error("Folder name is not valid.");
      const { data, error } = await db().from("folders").insert([{
        owner_id: user.id, parent_id: parentId || null, name: clean
      }]).select().maybeSingle();
      if (error) throw error;
      invalidate(parentId);
      Winstem.Auth.logActivity("create_folder", "folder", data.id, { name: clean });
      return data;
    },

    renameFolder: async function (folderId, newName) {
      const user = requireAuth();
      const clean = Winstem.Utils.sanitizeName(newName);
      if (!clean) throw new Error("Folder name is not valid.");
      const { data: before } = await db().from("folders").select("parent_id, name").eq("id", folderId).eq("owner_id", user.id).maybeSingle();
      const { data, error } = await db().from("folders")
        .update({ name: clean, updated_at: new Date().toISOString() })
        .eq("id", folderId).eq("owner_id", user.id).select().maybeSingle();
      if (error) throw error;
      invalidate(before ? before.parent_id : null);
      Winstem.Auth.logActivity("rename_folder", "folder", folderId, { from: before && before.name, to: clean });
      return data;
    },

    /* ── File metadata ops ──────────────────────────────── */
    renameFile: async function (fileId, newName) {
      const user = requireAuth();
      const cleanBase = Winstem.Utils.sanitizeName(newName);
      if (!cleanBase) throw new Error("File name is not valid.");
      const { data: before } = await db().from("files").select("name, extension, storage_path, folder_id").eq("id", fileId).eq("owner_id", user.id).maybeSingle();
      if (!before) throw new Error("File not found.");

      const ext = Winstem.FileTypes.extOf(cleanBase);
      const base = ext ? cleanBase.slice(0, -(ext.length + 1)) : cleanBase;
      const finalName = ext ? base + "." + ext : cleanBase;

      /* storage path stays the same — the id identifies the object */
      const { data, error } = await db().from("files")
        .update({ name: finalName, extension: ext, updated_at: new Date().toISOString() })
        .eq("id", fileId).eq("owner_id", user.id).select().maybeSingle();
      if (error) throw error;
      invalidate(before.folder_id);
      Winstem.Auth.logActivity("rename_file", "file", fileId, { from: before.name, to: finalName });
      return data;
    },

    /* ── Move ───────────────────────────────────────────── */
    move: async function (kind, ids, destFolderId) {
      const user = requireAuth();
      const client = db();
      if (kind === "files") {
        const { error } = await client.from("files")
          .update({ folder_id: destFolderId || null, updated_at: new Date().toISOString() })
          .in("id", ids).eq("owner_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await client.from("folders")
          .update({ parent_id: destFolderId || null, updated_at: new Date().toISOString() })
          .in("id", ids).eq("owner_id", user.id);
        if (error) throw error;
      }
      invalidate(destFolderId);
      Winstem.Auth.logActivity("move_" + kind, null, null, { ids: ids, to: destFolderId });
    },

    /* ── Copy / duplicate ───────────────────────────────── */
    copyFile: async function (fileId, destFolderId) {
      const user = requireAuth();
      const { data: src } = await db().from("files")
        .select("*").eq("id", fileId).eq("owner_id", user.id).maybeSingle();
      if (!src) throw new Error("File not found.");

      const newId = crypto.randomUUID ? crypto.randomUUID() : Winstem.Utils.uid();
      const base = src.name.replace(/\.[^.]+$/, "");
      const newName = base + " (copy)" + (src.extension ? "." + src.extension : "");
      const newPath = Winstem.Storage.pathFor(user.id, newId, src.extension);

      /* Copy the bytes via download → re-upload (avoids server-side copy of a private object) */
      const blob = await Winstem.Storage.download(src.storage_path);
      await Winstem.Storage.upload(user.id, newId, new File([blob], newName, { type: src.mime_type }));

      const { data, error } = await db().from("files").insert([{
        id: newId, owner_id: user.id, folder_id: destFolderId === undefined ? src.folder_id : destFolderId,
        name: newName, extension: src.extension, mime_type: src.mime_type,
        size_bytes: src.size_bytes, storage_path: newPath
      }]).select().maybeSingle();
      if (error) throw error;
      invalidate(destFolderId === undefined ? src.folder_id : destFolderId);
      return data;
    },

    copyFolder: async function (folderId, destParentId) {
      const user = requireAuth();
      const src = await Winstem.FS.getFolder(folderId);
      if (!src) throw new Error("Folder not found.");

      const { data: created, error } = await db().from("folders").insert([{
        owner_id: user.id, parent_id: destParentId === undefined ? src.parent_id : destParentId,
        name: src.name + " (copy)"
      }]).select().maybeSingle();
      if (error) throw error;
      invalidate(destParentId === undefined ? src.parent_id : destParentId);

      /* Recursively copy contents (shallow queue; deep copy done iteratively) */
      await Winstem.FS._copyTree(folderId, created.id);
      return created;
    },

    _copyTree: async function (srcFolderId, destFolderId) {
      const { folders, files } = await Winstem.FS.listFolder(srcFolderId, { noCache: true });
      for (const f of files) {
        await Winstem.FS.copyFile(f.id, destFolderId);
      }
      for (const fo of folders) {
        const copy = await db().from("folders").insert([{
          owner_id: requireAuth().id, parent_id: destFolderId, name: fo.name
        }]).select().maybeSingle();
        if (copy.error) throw copy.error;
        await Winstem.FS._copyTree(fo.id, copy.data.id);
      }
    },

    /* ── Trash / delete ─────────────────────────────────── */
    trash: async function (kind, ids) {
      const user = requireAuth();
      const client = db();
      const now = new Date().toISOString();
      if (kind === "files") {
        const { error } = await client.from("files")
          .update({ deleted_at: now }).in("id", ids).eq("owner_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await client.from("folders")
          .update({ deleted_at: now }).in("id", ids).eq("owner_id", user.id);
        if (error) throw error;
      }
      invalidate();
      Winstem.Auth.logActivity("trash_" + kind, null, null, { ids: ids });
    },

    listTrash: async function () {
      const user = requireAuth();
      const client = db();
      const [files, folders] = await Promise.all([
        client.from("files").select("*").eq("owner_id", user.id).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
        client.from("folders").select("*").eq("owner_id", user.id).not("deleted_at", "is", null).order("deleted_at", { ascending: false })
      ]);
      if (files.error) throw files.error;
      if (folders.error) throw folders.error;
      return {
        files: (files.data || []).map(function (f) {
          return Object.assign(normalizeRow(f), { kind: "file" });
        }),
        folders: (folders.data || []).map(function (f) {
          return Object.assign(normalizeRow(f), { kind: "folder" });
        })
      };
    },

    restore: async function (kind, ids) {
      const user = requireAuth();
      const client = db();
      const table = kind === "files" ? "files" : "folders";
      const { error } = await client.from(table)
        .update({ deleted_at: null }).in("id", ids).eq("owner_id", user.id);
      if (error) throw error;
      invalidate();
    },

    /** Permanently delete from metadata + storage objects. */
    purge: async function (kind, ids) {
      const user = requireAuth();
      const client = db();
      const paths = [];
      if (kind === "files") {
        const { data } = await client.from("files").select("storage_path").in("id", ids).eq("owner_id", user.id);
        (data || []).forEach(function (f) { if (f.storage_path) paths.push(f.storage_path); });
        const { error } = await client.from("files").delete().in("id", ids).eq("owner_id", user.id);
        if (error) throw error;
      } else {
        /* Delete folders + their descendants (metadata only; storage objects handled via file rows) */
        const idsToDelete = [ids];
        let frontier = ids;
        let guard = 0;
        while (frontier.length && guard++ < 32) {
          const { data: kids } = await client.from("folders").select("id").in("parent_id", frontier);
          const childIds = (kids || []).map(function (k) { return k.id; });
          if (!childIds.length) break;
          idsToDelete.push(childIds);
          frontier = childIds;
        }
        const flat = idsToDelete.flat();
        const { data: childFiles } = await client.from("files").select("storage_path").in("folder_id", flat);
        (childFiles || []).forEach(function (f) { if (f.storage_path) paths.push(f.storage_path); });
        const { error: ef } = await client.from("files").delete().in("folder_id", flat);
        if (ef) throw ef;
        const { error: eo } = await client.from("folders").delete().in("id", flat);
        if (eo) throw eo;
      }
      if (paths.length) {
        try { await Winstem.Storage.removeObjects(paths); } catch (e) { console.warn("storage purge:", e.message); }
      }
      invalidate();
      Winstem.Auth.logActivity("purge_" + kind, null, null, { ids: ids });
    },

    emptyTrash: async function () {
      const { files, folders } = await Winstem.FS.listTrash();
      const fIds = files.map(function (f) { return f.id; });
      const foIds = folders.map(function (f) { return f.id; });
      if (fIds.length) await Winstem.FS.purge("files", fIds);
      if (foIds.length) await Winstem.FS.purge("folders", foIds);
    },

    /* ── Favorites ──────────────────────────────────────── */
    setFavorite: async function (kind, id, fav) {
      const user = requireAuth();
      const table = kind === "files" ? "files" : "folders";
      const { error } = await db().from(table)
        .update({ is_favorite: !!fav, updated_at: new Date().toISOString() })
        .eq("id", id).eq("owner_id", user.id);
      if (error) throw error;
      invalidate();
    },

    favorites: async function () {
      const user = requireAuth();
      const client = db();
      const [files, folders] = await Promise.all([
        client.from("files").select("*").eq("owner_id", user.id).eq("is_favorite", true).is("deleted_at", null).order("updated_at", { ascending: false }),
        client.from("folders").select("*").eq("owner_id", user.id).eq("is_favorite", true).is("deleted_at", null).order("updated_at", { ascending: false })
      ]);
      if (files.error) throw files.error;
      if (folders.error) throw folders.error;
      return {
        files: (files.data || []).map(function (f) { return Object.assign(normalizeRow(f), { kind: "file" }); }),
        folders: (folders.data || []).map(function (f) { return Object.assign(normalizeRow(f), { kind: "folder" }); })
      };
    },

    /* ── Recent ──────────────────────────────────────────── */
    recent: async function (limit) {
      const user = requireAuth();
      const client = db();
      const { data, error } = await client.from("files")
        .select("*").eq("owner_id", user.id).is("deleted_at", null)
        .order("updated_at", { ascending: false }).limit(limit || 25);
      if (error) throw error;
      return (data || []).map(normalizeRow);
    },

    touch: async function (fileId) {
      const user = requireAuth();
      await db().from("files").update({ last_accessed_at: new Date().toISOString() })
        .eq("id", fileId).eq("owner_id", user.id);
    },

    /* ── Search ─────────────────────────────────────────── */
    search: async function (query, filters) {
      filters = filters || {};
      const user = requireAuth();
      const client = db();
      const q = "%" + String(query || "").toLowerCase() + "%";
      const results = { files: [], folders: [], notes: [] };

      const baseFiles = client.from("files")
        .select("*").eq("owner_id", user.id).is("deleted_at", null)
        .ilike("name", q);
      if (filters.category) {
        /* category → extension filter */
        const cats = Array.isArray(filters.category) ? filters.category : [filters.category];
        results.files = await Winstem.FS._searchByCategory(baseFiles, cats, filters);
      } else {
        const { data, error } = await baseFiles.order("updated_at", { ascending: false }).limit(60);
        if (error) throw error;
        results.files = (data || []).map(normalizeRow);
      }

      const { data: folders, error: fe } = await client.from("folders")
        .select("*").eq("owner_id", user.id).is("deleted_at", null).ilike("name", q).limit(30);
      if (fe) throw fe;
      results.folders = (folders || []).map(normalizeRow);

      const { data: notes, error: ne } = await client.from("notes")
        .select("*").eq("owner_id", user.id).is("deleted_at", null)
        .or("title.ilike." + q + ",content.ilike." + q).limit(15);
      if (ne) throw ne;
      results.notes = (notes || []).map(normalizeRow);

      return results;
    },

    _searchByCategory: async function (baseFiles, cats, filters) {
      const user = requireAuth();
      const files = [];
      for (const cat of cats) {
        const exts = [];
        /* build extension list for category via a scan of known extensions */
        const allExts = ["txt","md","rtf","log","doc","docx","odt","csv","tsv","xls","xlsx","html","htm","xml","json","yaml","yml",
          "pdf","jpg","jpeg","png","gif","webp","svg","bmp","ico","tiff","avif","heic","mp3","wav","ogg","opus","flac","m4a","aac",
          "mp4","webm","mov","avi","mkv","zip","tar","gz","7z","rar","js","ts","css","py","rs","go","java","cpp","sql","sh"];
        allExts.forEach(function (e) {
          if (Winstem.FileTypes.categoryOf(e) === cat || (cat === "document" && Winstem.FileTypes.categoryOf(e) === "spreadsheet")) {
            exts.push(e);
          }
        });
        if (!exts.length) continue;
        const { data, error } = await baseFiles.in("extension", exts).limit(40);
        if (error) throw error;
        (data || []).forEach(function (f) { files.push(normalizeRow(f)); });
      }
      return files;
    },

    /* ── Quota / storage info ───────────────────────────── */
    usage: async function () {
      const user = requireAuth();
      const quota = (Winstem.Auth.getSettings() && Winstem.Auth.getSettings().quota_bytes) ||
        Winstem.Config.get("defaultQuotaBytes");
      const usage = await Winstem.Storage.usageByCategory(user.id);
      return { usage: usage.total, quota: quota, categories: usage.categories, fileCount: usage.fileCount };
    },

    /* ── Upload queue ───────────────────────────────────── */
    enqueueUploads: function (files, folderId) {
      const user = requireAuth();
      const items = Array.from(files).slice(0, Winstem.Config.get("maxUploadQueueSize")).map(function (f) {
        return {
          id: Winstem.Utils.uid("u"),
          name: f.name,
          file: f,
          size: f.size,
          folderId: folderId || null,
          status: "queued",
          progress: 0,
          fileId: (crypto.randomUUID ? crypto.randomUUID() : Winstem.Utils.uid())
        };
      });
      state.queue = state.queue.concat(items);
      Winstem.App.emit("upload-queue", state.queue.slice());
      Winstem.FS.processQueue();
      return items;
    },

    processQueue: async function () {
      const user = requireAuth();
      const pending = state.queue.filter(function (i) { return i.status === "queued"; });
      if (!pending.length) return;

      for (const item of pending) {
        if (item.status !== "queued") continue;
        item.status = "uploading";
        Winstem.App.emit("upload-queue", state.queue.slice());
        try {
          const ext = Winstem.FileTypes.extOf(item.file.name);
          const path = Winstem.Storage.pathFor(user.id, item.fileId, ext);
          await Winstem.Storage.upload(user.id, item.fileId, item.file, {
            onProgress: function (p) { item.progress = p; Winstem.App.emit("upload-queue", state.queue.slice()); }
          });
          const { error } = await db().from("files").insert([{
            id: item.fileId,
            owner_id: user.id,
            folder_id: item.folderId || null,
            name: item.file.name,
            extension: ext,
            mime_type: item.file.type || Winstem.FileTypes.mimeOf(item.file.name),
            size_bytes: item.file.size,
            storage_path: path
          }]);
          if (error) throw error;
          item.status = "done";
          item.progress = 1;
          invalidate(item.folderId);
          Winstem.App.emit("upload-queue", state.queue.slice());
          Winstem.App.emit("files-changed", { folderId: item.folderId });
          Winstem.Auth.logActivity("upload", "file", item.fileId, { name: item.name });
          Winstem.Notifications.success("Upload complete", item.name);
        } catch (err) {
          item.status = "error";
          item.error = (err && err.message) || "Upload failed";
          Winstem.App.emit("upload-queue", state.queue.slice());
          Winstem.Notifications.error("Upload failed", item.name + " — " + item.error);
        }
      }
    },

    retryUpload: function (id) {
      const item = state.queue.find(function (i) { return i.id === id; });
      if (!item) return;
      item.status = "queued";
      item.progress = 0;
      item.error = null;
      Winstem.App.emit("upload-queue", state.queue.slice());
      Winstem.FS.processQueue();
    },

    cancelUpload: function (id) {
      const item = state.queue.find(function (i) { return i.id === id; });
      if (!item || item.status === "done") return;
      item.status = "canceled";
      Winstem.App.emit("upload-queue", state.queue.slice());
    },

    clearUploadQueue: function () {
      state.queue = [];
      Winstem.App.emit("upload-queue", state.queue.slice());
    },

    getQueue: function () { return state.queue.slice(); },

    /* ── Shared with me ─────────────────────────────────── */
    sharedWithMe: async function () {
      const user = requireAuth();
      const client = db();
      const { data: perms, error } = await client.from("share_permissions")
        .select("share_id, permission, share:shares(*)")
        .eq("user_email", user.email.toLowerCase());
      if (error) throw error;
      return (perms || [])
        .filter(function (p) {
          const s = p.share;
          return s && !s.revoked_at && (!s.expires_at || new Date(s.expires_at) > new Date());
        })
        .map(function (p) {
          return { permission: p.permission, share: p.share };
        });
    }
  };

  Winstem.FS._state = state;
})();
