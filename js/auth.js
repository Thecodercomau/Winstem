/* ═══════════════════════════════════════════════════════════
   WINSTEM — Authentication (Supabase)
   Registration, login, logout, password recovery, session
   restoration, profile and user-settings management.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const state = {
    user: null,
    profile: null,
    settings: null,
    initializing: true,
    booted: false
  };

  function $id(id) { return document.getElementById(id); }

  function showPane(paneId) {
    document.querySelectorAll(".auth-pane").forEach(function (p) {
      p.classList.toggle("hidden", p.id !== paneId);
    });
  }

  function showAlert(message, tone) {
    const el = $id("auth-alert");
    if (!el) return;
    if (!message) { el.classList.add("hidden"); return; }
    el.textContent = message;
    el.className = "auth-alert " + (tone || "error");
  }

  function friendlyError(err) {
    const msg = (err && err.message) ? String(err.message) : "";
    if (!msg) return "Something went wrong. Please try again.";
    if (/Invalid login credentials/i.test(msg)) return "Incorrect email or password.";
    if (/Email not confirmed/i.test(msg)) return "Please confirm your email address before signing in.";
    if (/already registered/i.test(msg)) return "An account with this email already exists.";
    if (/Password should be at least/i.test(msg)) return "Password must be at least 8 characters.";
    if (/rate limit/i.test(msg)) return "Too many attempts. Please wait a moment and try again.";
    if (/network|fetch|Failed to fetch/i.test(msg)) return "Network error. Check your internet connection.";
    if (/Email address is not valid/i.test(msg)) return "Please enter a valid email address.";
    if (/user already exists/i.test(msg)) return "An account with this email already exists.";
    if (/session/i.test(msg)) return "Your session has expired. Please sign in again.";
    return "Unable to complete that action. Please try again.";
  }

  function hydrateUserMenu() {
    const p = state.profile;
    const name = p && p.display_name ? p.display_name : (p && p.username ? p.username : "User");
    const email = state.user ? state.user.email : "";
    const set = function (id, val) { const el = $id(id); if (el) el.textContent = val; };
    set("start-username", name);
    set("user-menu-name", name);
    set("user-menu-email", email);
    const avatarEls = [$id("user-avatar"), $id("start-user-avatar"), $id("user-menu-avatar")];
    avatarEls.forEach(function (el) {
      if (!el) return;
      if (p && p.avatar_url) {
        el.innerHTML = '<img src="' + Winstem.Utils.escapeAttr(p.avatar_url) + '" alt="">';
      } else {
        const initial = (name || "?").charAt(0).toUpperCase();
        el.innerHTML = '<span class="user-avatar-initial">' + Winstem.Utils.escapeHtml(initial) + '</span>';
        el.classList.add("initialized");
      }
    });
  }

  Winstem.Auth = {
    init: async function () {
      try {
        Winstem.DB.initLocalDB();

        if (!Winstem.Config.isConfigured()) {
          state.initializing = false;
          showAlert(
            "Winstem is not connected to Supabase yet. Create a project and add your URL + anon key to js/config.local.js (see README → Supabase Setup).",
            "warn"
          );
          hideSplash();
          showAuth();
          return;
        }

        const client = Winstem.DB.getClient();

        client.auth.onAuthStateChange(function (event, session) {
          const u = session ? session.user : null;
          state.user = u;
          if (event === "SIGNED_IN" && u) {
            Winstem.Auth.bootstrapUser(u).catch(function () { /* handled inside */ });
          } else if (event === "SIGNED_OUT") {
            Winstem.Auth.onSignedOut();
          }
        });

        /* Handle password-recovery link (recovery flow) */
        const hash = window.location.hash;
        if (hash && hash.indexOf("type=recovery") !== -1) {
          showPane("reset-form");
          showAlert("");
        }

        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        state.initializing = false;

        if (data.session && data.session.user) {
          state.user = data.session.user;
          await Winstem.Auth.bootstrapUser(data.session.user);
        } else {
          hideSplash();
          showAuth();
        }
      } catch (err) {
        state.initializing = false;
        hideSplash();
        showAuth();
        showAlert(friendlyError(err), "error");
      }
    },

    bootstrapUser: async function (user) {
      state.user = user;
      try {
        const client = Winstem.DB.getClient();
        const { data: profile } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
        let p = profile;
        if (!p) {
          /* First sign-in — create the profile row */
          const username = (user.email || "user").split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 24) || "user";
          const { data: created, error: createErr } = await client.from("profiles")
            .insert([{ id: user.id, username: username, email: user.email }])
            .select()
            .maybeSingle();
          if (createErr && !/duplicate/i.test(createErr.message)) {
            console.warn("profile create:", createErr.message);
          }
          p = created || profile || { id: user.id, username: username, email: user.email };
        }
        state.profile = p;

        const { data: settings } = await client.from("user_settings")
          .select("*").eq("user_id", user.id).maybeSingle();
        if (settings) {
          state.settings = settings;
          Winstem.Themes.setFromCloud(settings);
        }
      } catch (e) {
        /* Non-fatal — still enter the desktop with cached data */
        console.warn("bootstrap profile:", e.message);
        state.profile = state.profile || null;
      }

      if (!state.booted) {
        state.booted = true;
        hideSplash();
        showOS();
        Winstem.App.onAuthenticated();
      }
      hydrateUserMenu();
      Winstem.App.onUserReady();
      return state.profile;
    },

    onSignedOut: function () {
      state.user = null;
      state.profile = null;
      state.settings = null;
      state.booted = false;
      Winstem.App.onSignOut();
      showAuth();
    },

    getUser: function () { return state.user; },
    getProfile: function () { return state.profile; },
    getSettings: function () { return state.settings; },

    isSignedIn: function () { return !!state.user; },

    /* ── Auth operations ────────────────────────────────── */
    signUp: async function (email, password, username) {
      const client = Winstem.DB.getClient();
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password: password,
        options: { data: { username: username }, emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      return data;
    },

    signIn: async function (email, password) {
      const client = Winstem.DB.getClient();
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password: password });
      if (error) throw error;
      return data;
    },

    signOut: async function () {
      const client = Winstem.DB.getClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },

    resetPassword: async function (email) {
      const client = Winstem.DB.getClient();
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
    },

    updatePassword: async function (newPassword) {
      const client = Winstem.DB.getClient();
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },

    updateProfile: async function (fields) {
      if (!state.user) throw new Error("Not signed in");
      const client = Winstem.DB.getClient();
      const payload = Object.assign({ updated_at: new Date().toISOString() }, fields);
      const { data, error } = await client.from("profiles")
        .update(payload).eq("id", state.user.id).select().maybeSingle();
      if (error) throw error;
      if (data) state.profile = Object.assign(state.profile || {}, data);
      hydrateUserMenu();
      Winstem.App.onUserReady();
      return data;
    },

    updateSettings: async function (fields) {
      if (!state.user) return null;
      const client = Winstem.DB.getClient();
      const payload = Object.assign({ updated_at: new Date().toISOString() }, fields);
      const { data, error } = await client.from("user_settings")
        .update(payload).eq("user_id", state.user.id).select().maybeSingle();
      if (error) throw error;
      if (data) state.settings = Object.assign(state.settings || {}, data);
      return data;
    },

    logActivity: async function (action, entityType, entityId, details) {
      if (!state.user) return;
      try {
        const client = Winstem.DB.getClient();
        await client.from("user_activity").insert([{
          user_id: state.user.id,
          action: action,
          entity_type: entityType || null,
          entity_id: entityId || null,
          details: details || null
        }]);
      } catch (e) { /* non-fatal */ }
    },

    /* ── UI wiring ──────────────────────────────────────── */
    wireAuthUI: function () {
      document.querySelectorAll("[data-auth-pane]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          showPane(btn.getAttribute("data-auth-pane"));
          showAlert("");
        });
      });

      $id("login-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const email = $id("login-email").value;
        const password = $id("login-password").value;
        const btn = $id("login-submit");
        Winstem.Utils.setLoading(btn, true, "Signing in…");
        showAlert("");
        try {
          await Winstem.Auth.signIn(email, password);
        } catch (err) {
          showAlert(friendlyError(err), "error");
          Winstem.Utils.setLoading(btn, false, "Sign in");
        }
      });

      $id("register-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const username = $id("reg-username").value.trim();
        const email = $id("reg-email").value;
        const pw = $id("reg-password").value;
        const confirm = $id("reg-confirm").value;
        const btn = $id("register-submit");
        if (pw !== confirm) { showAlert("Passwords do not match.", "error"); return; }
        Winstem.Utils.setLoading(btn, true, "Creating account…");
        showAlert("");
        try {
          const res = await Winstem.Auth.signUp(email, pw, username);
          if (res.session) {
            /* Auto-confirmed (no email verification) — continue */
          } else {
            showAlert("Account created! Check your email to confirm your account, then sign in.", "success");
            showPane("login-form");
            $id("login-email").value = email;
          }
          Winstem.Utils.setLoading(btn, false, "Create account");
        } catch (err) {
          showAlert(friendlyError(err), "error");
          Winstem.Utils.setLoading(btn, false, "Create account");
        }
      });

      $id("forgot-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const btn = $id("forgot-submit");
        Winstem.Utils.setLoading(btn, true, "Sending…");
        showAlert("");
        try {
          await Winstem.Auth.resetPassword($id("forgot-email").value);
          showAlert("If that email exists, a reset link is on its way.", "success");
          Winstem.Utils.setLoading(btn, false, "Send reset link");
        } catch (err) {
          showAlert(friendlyError(err), "error");
          Winstem.Utils.setLoading(btn, false, "Send reset link");
        }
      });

      $id("reset-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const pw = $id("reset-password").value;
        const confirm = $id("reset-confirm").value;
        const btn = $id("reset-submit");
        if (pw !== confirm) { showAlert("Passwords do not match.", "error"); return; }
        Winstem.Utils.setLoading(btn, true, "Updating…");
        try {
          await Winstem.Auth.updatePassword(pw);
          showAlert("Password updated. You can now sign in.", "success");
          showPane("login-form");
          Winstem.Utils.setLoading(btn, false, "Update password");
        } catch (err) {
          showAlert(friendlyError(err), "error");
          Winstem.Utils.setLoading(btn, false, "Update password");
        }
      });

      $id("login-forgot-link").addEventListener("click", function () {
        showPane("forgot-form");
        showAlert("");
      });
    }
  };

  /* ── view helpers (used by app.js) ─────────────────────── */
  function showAuth() {
    const os = $id("os");
    const auth = $id("auth-view");
    const share = $id("share-view");
    if (os) os.classList.add("hidden");
    if (share) share.classList.add("hidden");
    if (auth) auth.classList.remove("hidden");
    const firstInput = auth.querySelector("input");
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 300);
  }

  function showOS() {
    const auth = $id("auth-view");
    const share = $id("share-view");
    const os = $id("os");
    if (auth) auth.classList.add("hidden");
    if (share) share.classList.add("hidden");
    if (os) os.classList.remove("hidden");
  }

  function hideSplash() {
    const splash = $id("boot-splash");
    if (splash) {
      splash.classList.add("leaving");
      setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 500);
    }
  }

  Winstem.Auth._viewHelpers = { showAuth: showAuth, showOS: showOS, hideSplash: hideSplash, friendlyError: friendlyError };
})();
