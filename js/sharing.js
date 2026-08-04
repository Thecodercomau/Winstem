/* ═══════════════════════════════════════════════════════════
   WINSTEM — Sharing
   Link shares (token based) and private shares (by email).
   Permissions, expiration, revocation. Private files are never
   in a public bucket — access is gated by storage policies that
   check the live share state (see supabase/policies.sql).
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function db() { return Winstem.DB.getClient(); }

  function genToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  Winstem.Sharing = {
    /** Create a link share for a file or folder. */
    createLinkShare: async function (opts) {
      const user = Winstem.Auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const token = genToken();
      const { data, error } = await db().from("shares").insert([{
        owner_id: user.id,
        file_id: opts.fileId || null,
        folder_id: opts.folderId || null,
        share_token: token,
        type: "link",
        permission: opts.permission || "read",
        expires_at: opts.expiresAt || null
      }]).select().maybeSingle();
      if (error) throw error;
      Winstem.Auth.logActivity("create_share", "share", data.id, { token: token });
      return data;
    },

    /** Share with a specific email address. */
    shareWithEmail: async function (shareId, email, permission) {
      const user = Winstem.Auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const clean = String(email || "").trim().toLowerCase();
      if (!clean || clean.indexOf("@") === -1) throw new Error("Enter a valid email address.");
      const { data, error } = await db().from("share_permissions").insert([{
        share_id: shareId,
        user_email: clean,
        permission: permission || "read"
      }]).select().maybeSingle();
      if (error) throw error;
      return data;
    },

    /** List link shares for an entity. */
    listFor: async function (kind, id) {
      const user = Winstem.Auth.getUser();
      if (!user) return [];
      let q = db().from("shares").select("*, share_permissions(*)")
        .eq("owner_id", user.id);
      if (kind === "file") q = q.eq("file_id", id);
      else q = q.eq("folder_id", id);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    /** Revoke a share (link or private). */
    revoke: async function (shareId) {
      const user = Winstem.Auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const { error } = await db().from("shares")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", shareId).eq("owner_id", user.id);
      if (error) throw error;
    },

    /** Remove a specific email permission from a share. */
    removePermission: async function (permId) {
      const user = Winstem.Auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const { error } = await db().from("share_permissions").delete().eq("id", permId);
      if (error) throw error;
    },

    /** Share link URL (hash route — works on GitHub Pages). */
    linkUrl: function (token) {
      return window.location.origin + window.location.pathname + "#/s/" + token;
    },

    /** Resolve a share token → entity info (works anon for valid link shares).
        Goes through the security-definer RPC resolve_share(token), which
        validates expiry/revocation server-side. Never queries shares directly
        (anon has no SELECT policy on the table). */
    resolve: async function (token) {
      if (!token || !/^[a-f0-9]{20,64}$/i.test(token)) {
        throw new Error("This share link is not valid.");
      }
      const { data, error } = await db().rpc("resolve_share", { p_token: token });
      if (error) throw new Error(error.message || "This share link is not valid.");
      if (!data) throw new Error("This share link is not valid.");
      return data;
    },

    /** Download the shared entity's bytes (anon-friendly; storage policy gates access). */
    downloadShared: async function (share, opts) {
      const file = share.files;
      const folder = share.folders;
      if (file) {
        const blob = await Winstem.Storage.download(file.storage_path);
        if (opts && opts.asBlob) return blob;
        Winstem.Utils.downloadBlob(blob, file.name);
        return blob;
      }
      if (folder) {
        throw new Error("Folder downloads are not supported for shared links. Share files individually instead.");
      }
      throw new Error("Nothing to download.");
    },

    /** Map a shared entity to a preview type for the landing page. */
    previewInfo: function (share) {
      const file = share.files;
      if (!file) return null;
      return Winstem.FileTypes.info(file.name);
    }
  };
})();
