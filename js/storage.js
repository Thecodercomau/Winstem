/* ═══════════════════════════════════════════════════════════
   WINSTEM — Storage (Supabase Storage)
   Upload with progress + retry, downloads, signed URLs and
   object removal. Files are stored in a private bucket at
   `${ownerId}/${fileId}.${ext}` and are never exposed publicly
   except through an explicitly shared, policy-gated object.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function bucket() {
    return Winstem.DB.getClient().storage.from(Winstem.Config.get("filesBucket"));
  }

  function avatarsBucket() {
    return Winstem.DB.getClient().storage.from(Winstem.Config.get("avatarsBucket"));
  }

  /** Build the storage object path for a file row. */
  function pathFor(ownerId, fileId, extension) {
    const ext = extension ? "." + extension.replace(/^\./, "") : "";
    return ownerId + "/" + fileId + ext;
  }

  Winstem.Storage = {
    pathFor: pathFor,

    /** Upload a File/Blob with progress. Returns {path, signedUrl}. */
    upload: async function (ownerId, fileId, file, opts) {
      opts = opts || {};
      const ext = Winstem.FileTypes.extOf(file.name);
      const path = pathFor(ownerId, fileId, ext);
      const client = Winstem.DB.getClient();

      const { error } = await client.storage
        .from(Winstem.Config.get("filesBucket"))
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type || Winstem.FileTypes.mimeOf(file.name),
          upsert: true,
          onUploadProgress: function (progress) {
            if (opts.onProgress) opts.onProgress(progress.total ? progress.loaded / progress.total : 0);
          }
        });
      if (error) throw error;
      if (opts.onProgress) opts.onProgress(1);
      return { path: path };
    },

    /** Download a file by storage path → Blob. */
    download: async function (storagePath) {
      const client = Winstem.DB.getClient();
      const { data, error } = await client.storage
        .from(Winstem.Config.get("filesBucket"))
        .download(storagePath);
      if (error) throw error;
      return data; /* Blob */
    },

    /** Get a temporary signed URL for a storage path (for previews / private sharing). */
    getSignedUrl: async function (storagePath, expiresInSeconds) {
      const client = Winstem.DB.getClient();
      const { data, error } = await client.storage
        .from(Winstem.Config.get("filesBucket"))
        .createSignedUrl(storagePath, expiresInSeconds || 3600);
      if (error) throw error;
      return data.signedUrl;
    },

    /** Delete objects from storage (used on trash-purge / overwrite). */
    removeObjects: async function (paths) {
      if (!paths || !paths.length) return;
      const client = Winstem.DB.getClient();
      const { error } = await client.storage
        .from(Winstem.Config.get("filesBucket"))
        .remove(paths);
      if (error) throw error;
    },

    /** Upload a profile avatar. Returns public or signed URL. */
    uploadAvatar: async function (ownerId, file) {
      const ext = Winstem.FileTypes.extOf(file.name) || "png";
      const path = ownerId + "/avatar." + ext;
      const { error } = await avatarsBucket().upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data, error: sigErr } = await avatarsBucket().createSignedUrl(path, 86400 * 30);
      if (sigErr) throw sigErr;
      return data.signedUrl;
    },

    /**
     * Compute storage usage by category from file metadata.
     * We rely on the files table (size_bytes) rather than bucket
     * listing, which keeps it fast and quota-aware.
     */
    usageByCategory: async function (ownerId) {
      const client = Winstem.DB.getClient();
      const { data, error } = await client
        .from("files")
        .select("size_bytes, extension, storage_path")
        .eq("owner_id", ownerId)
        .is("deleted_at", null);
      if (error) throw error;

      const cats = { document: 0, image: 0, audio: 0, video: 0, archive: 0, code: 0, pdf: 0, spreadsheet: 0, presentation: 0, font: 0, generic: 0 };
      let total = 0;
      (data || []).forEach(function (f) {
        const cat = Winstem.FileTypes.category(f.extension).label === "File"
          ? Winstem.FileTypes.detectFromMime(f.mime_type) || "generic"
          : Winstem.FileTypes.categoryOf(f.extension);
        const size = Number(f.size_bytes) || 0;
        cats[cat] = (cats[cat] || 0) + size;
        total += size;
      });
      return { total: total, categories: cats, fileCount: (data || []).length };
    }
  };
})();
