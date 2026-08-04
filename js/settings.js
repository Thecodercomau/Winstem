/* ═══════════════════════════════════════════════════════════
   WINSTEM — Settings App
   Appearance, Account, Storage, Privacy, Notifications,
   System and About. Saves to user_settings (cloud) with
   instant local application.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const SECTIONS = [
    { id: "appearance", label: "Personalization", icon: "bi-palette" },
    { id: "account", label: "Account", icon: "bi-person-gear" },
    { id: "storage", label: "Storage", icon: "bi-hdd" },
    { id: "privacy", label: "Privacy & security", icon: "bi-shield-lock" },
    { id: "notifications", label: "Notifications", icon: "bi-bell" },
    { id: "system", label: "System", icon: "bi-gear-wide-connected" },
    { id: "about", label: "About", icon: "bi-info-circle" }
  ];

  function create(win, content, params) {
    content.innerHTML =
      '<div class="settings-app">' +
        '<aside class="settings-side">' +
          SECTIONS.map(function (s) {
            return '<button class="settings-nav-item" data-section="' + s.id + '">' +
              '<i class="bi ' + s.icon + '"></i><span>' + s.label + '</span></button>';
          }).join("") +
        '</aside>' +
        '<div class="settings-main" id="settings-main"></div>' +
      '</div>';

    const main = content.querySelector("#settings-main");

    function showSection(id) {
      content.querySelectorAll(".settings-nav-item").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-section") === id);
      });
      const renderers = {
        appearance: renderAppearance,
        account: renderAccount,
        storage: renderStorage,
        privacy: renderPrivacy,
        notifications: renderNotifications,
        system: renderSystem,
        about: renderAbout
      };
      (renderers[id] || renderAbout)(main);
    }

    content.querySelectorAll(".settings-nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showSection(btn.getAttribute("data-section"));
      });
    });

    /* initial section */
    showSection(params && params.page ? params.page : "appearance");
  }

  function focus(win, params) {
    const content = win ? win.el ? win.el.querySelector(".win-content") : null : null;
    if (!content) return;
    const btn = content.querySelector('.settings-nav-item[data-section="' + (params && params.page ? params.page : "appearance") + '"]');
    if (btn) btn.click();
  }

  function section(title, subtitle, bodyHtml) {
    return '<div class="settings-section"><h2>' + Winstem.Utils.escapeHtml(title) + '</h2>' +
      (subtitle ? '<p class="settings-sub">' + Winstem.Utils.escapeHtml(subtitle) + '</p>' : "") +
      '<div class="settings-card">' + bodyHtml + '</div></div>';
  }

  function row(label, desc, controlHtml) {
    return '<div class="settings-row"><div class="settings-row-text"><div>' + Winstem.Utils.escapeHtml(label) + '</div>' +
      (desc ? '<div class="settings-row-desc">' + Winstem.Utils.escapeHtml(desc) + '</div>' : "") + '</div>' +
      '<div class="settings-row-control">' + controlHtml + '</div></div>';
  }

  /* ── Appearance ── */
  function renderAppearance(main) {
    const s = Winstem.Themes.getState();
    main.innerHTML = section("Personalization", "Make Winstem yours — themes, accent color, wallpaper and scale.", "") +
      '<div class="settings-card mt-3">' + row("Theme", "Choose how Winstem looks.", "") + '</div>';
    main.innerHTML = "";

    const themeBtns = ["light", "dark", "system"].map(function (t) {
      return '<button class="theme-option' + (s.theme === t ? " active" : "") + '" data-theme="' + t + '">' +
        '<span class="theme-swatch ' + t + '"><i class="bi ' + (t === "light" ? "bi-sun" : t === "dark" ? "bi-moon-stars" : "bi-circle-half") + '"></i></span>' +
        '<span>' + t.charAt(0).toUpperCase() + t.slice(1) + '</span></button>';
    }).join("");

    const accents = Object.keys(Winstem.Themes.accents).map(function (key) {
      const a = Winstem.Themes.accents[key];
      return '<button class="accent-dot' + (s.accent === key ? " active" : "") + '" data-accent="' + key + '" ' +
        'style="--swatch:' + a.value + '" title="' + a.name + '" aria-label="' + a.name + '"></button>';
    }).join("");

    const wallpapers = Winstem.Themes.wallpapers.map(function (w) {
      return '<button class="wallpaper-opt' + (s.wallpaper === w.id ? " active" : "") + '" data-wallpaper="' + w.id + '">' +
        '<span class="wallpaper-thumb" style="background-image:url(assets/images/wallpapers/' + w.file + ')"></span>' +
        '<span>' + w.label + '</span></button>';
    }).join("");

    main.innerHTML =
      '<div class="settings-pane">' +
        '<h2>Personalization</h2>' +
        '<p class="settings-sub">Make Winstem yours — themes, accent color, wallpaper and scale. Changes sync to your cloud account.</p>' +

        '<div class="settings-card"><div class="settings-card-title"><i class="bi bi-moon-stars"></i> Theme</div>' +
          '<div class="theme-options">' + themeBtns + '</div></div>' +

        '<div class="settings-card"><div class="settings-card-title"><i class="bi bi-droplet"></i> Accent color</div>' +
          '<div class="accent-row">' + accents + '</div></div>' +

        '<div class="settings-card"><div class="settings-card-title"><i class="bi bi-image"></i> Wallpaper</div>' +
          '<div class="wallpaper-row">' + wallpapers + '</div></div>' +

        '<div class="settings-card">' + row("Interface scale", "Adjust the size of the desktop UI.", '') +
          '<div class="scale-row"><input type="range" id="set-scale" min="0.85" max="1.25" step="0.05" value="' + s.uiScale + '" class="form-range">' +
          '<span class="scale-value" id="set-scale-val">' + Math.round(s.uiScale * 100) + '%</span></div></div>' +

        '<div class="settings-card">' + row("Animations", "Enable smooth transitions and motion.", '') +
          '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="set-anim" ' + (s.animations ? "checked" : "") + '></div></div>' +
      '</div>';

    main.querySelectorAll(".theme-option").forEach(function (b) {
      b.addEventListener("click", function () {
        Winstem.Themes.set("theme", b.getAttribute("data-theme"));
        main.querySelectorAll(".theme-option").forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });
    main.querySelectorAll(".accent-dot").forEach(function (b) {
      b.addEventListener("click", function () {
        Winstem.Themes.set("accent", b.getAttribute("data-accent"));
        main.querySelectorAll(".accent-dot").forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });
    main.querySelectorAll(".wallpaper-opt").forEach(function (b) {
      b.addEventListener("click", function () {
        Winstem.Themes.set("wallpaper", b.getAttribute("data-wallpaper"));
        main.querySelectorAll(".wallpaper-opt").forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });
    const scale = main.querySelector("#set-scale");
    scale.addEventListener("input", function () {
      Winstem.Themes.set("uiScale", parseFloat(scale.value));
      main.querySelector("#set-scale-val").textContent = Math.round(scale.value * 100) + "%";
    });
    main.querySelector("#set-anim").addEventListener("change", function () {
      Winstem.Themes.set("animations", this.checked);
    });
  }

  /* ── Account ── */
  function renderAccount(main) {
    const p = Winstem.Auth.getProfile() || {};
    const user = Winstem.Auth.getUser() || {};
    main.innerHTML =
      '<div class="settings-pane">' +
        '<h2>Account</h2>' +
        '<p class="settings-sub">Your profile and sign-in details.</p>' +
        '<div class="settings-card">' +
          '<div class="account-hero">' +
            '<div class="account-avatar-wrap">' +
              (p.avatar_url ? '<img src="' + Winstem.Utils.escapeAttr(p.avatar_url) + '" class="account-avatar" alt="">' : '<span class="account-avatar account-avatar-init">' + Winstem.Utils.escapeHtml((p.username || "U").charAt(0).toUpperCase()) + '</span>') +
              '<button class="account-avatar-edit" id="set-avatar" title="Change avatar"><i class="bi bi-camera"></i></button>' +
            '</div>' +
            '<div><div class="account-name">' + Winstem.Utils.escapeHtml(p.display_name || p.username || "User") + '</div>' +
            '<div class="account-email">' + Winstem.Utils.escapeHtml(user.email || p.email || "") + '</div></div>' +
          '</div>' +
          '<div class="mt-3">' +
            row("Username", "Your public handle.", '<input type="text" class="form-control form-control-sm" id="set-username" value="' + Winstem.Utils.escapeAttr(p.username || "") + '">') +
            row("Display name", "Shown across Winstem.", '<input type="text" class="form-control form-control-sm" id="set-display" value="' + Winstem.Utils.escapeAttr(p.display_name || "") + '">') +
            row("Email address", "Used to sign in. Managed by Supabase Auth.", '<span class="settings-static">' + Winstem.Utils.escapeHtml(user.email || p.email || "—") + '</span>') +
          '</div>' +
          '<div class="mt-3"><button class="btn btn-primary btn-sm" id="set-save-profile"><i class="bi bi-check-lg"></i> Save changes</button>' +
          '<button class="btn btn-outline-secondary btn-sm ms-2" id="set-reset-pw"><i class="bi bi-key"></i> Reset password</button>' +
          '<button class="btn btn-outline-danger btn-sm ms-2" id="set-signout"><i class="bi bi-box-arrow-right"></i> Sign out</button></div>' +
        '</div>' +
      '</div>';

    main.querySelector("#set-save-profile").addEventListener("click", function () {
      const username = main.querySelector("#set-username").value.trim();
      const display = main.querySelector("#set-display").value.trim();
      Winstem.Auth.updateProfile({ username: username || p.username, display_name: display || null })
        .then(function () {
          Winstem.Notifications.success("Profile updated");
          Winstem.Auth.logActivity("update_profile");
        })
        .catch(function (e) { Winstem.Notifications.error("Update failed", e.message); });
    });
    main.querySelector("#set-reset-pw").addEventListener("click", function () {
      Winstem.Auth.resetPassword(user.email || "").then(function () {
        Winstem.Notifications.info("Password reset", "Check your email for a reset link.");
      }).catch(function (e) { Winstem.Notifications.error("Error", e.message); });
    });
    main.querySelector("#set-signout").addEventListener("click", function () { Winstem.App.signOutFlow(); });
    main.querySelector("#set-avatar").addEventListener("click", function () {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", function () {
        if (!input.files.length) return;
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) { Winstem.Notifications.error("Avatar too large", "Use an image under 2 MB."); return; }
        Winstem.Storage.uploadAvatar(user.id, file).then(function (url) {
          return Winstem.Auth.updateProfile({ avatar_url: url });
        }).then(function () {
          Winstem.Notifications.success("Avatar updated");
          renderAccount(main);
        }).catch(function (e) { Winstem.Notifications.error("Avatar failed", e.message); });
      });
      input.click();
    });
  }

  /* ── Storage ── */
  function renderStorage(main) {
    main.innerHTML =
      '<div class="settings-pane">' +
        '<h2>Storage</h2>' +
        '<p class="settings-sub">Cloud storage usage and management.</p>' +
        '<div id="set-storage-body"><div class="p-4 text-center"><div class="spinner-border text-primary"></div></div></div>' +
      '</div>';
    Winstem.FS.usage().then(function (u) {
      const pct = Math.min(100, (u.usage / u.quota) * 100);
      const cats = [
        { label: "Documents", key: "document", icon: "bi-file-earmark-text", color: "#4f8cff" },
        { label: "Images", key: "image", icon: "bi-image", color: "#a06ef0" },
        { label: "Audio", key: "audio", icon: "bi-music-note", color: "#31c48d" },
        { label: "Videos", key: "video", icon: "bi-film", color: "#f59e0b" },
        { label: "Archives", key: "archive", icon: "bi-file-earmark-zip", color: "#f97316" },
        { label: "PDF", key: "pdf", icon: "bi-file-earmark-pdf", color: "#f87171" },
        { label: "Other", key: "generic", icon: "bi-file-earmark", color: "#94a3b8" }
      ];
      const rows = cats.map(function (c) {
        const bytes = u.categories[c.key] || 0;
        return '<div class="sd-row"><span class="sd-label"><i class="bi ' + c.icon + '" style="color:' + c.color + '"></i> ' + c.label + '</span>' +
          '<div class="sd-bar"><div class="sd-bar-fill" style="width:' + (u.usage ? Math.max(2, bytes / u.usage * 100) : 0) + '%;background:' + c.color + '"></div></div>' +
          '<span class="sd-val">' + Winstem.Utils.formatBytes(bytes) + '</span></div>';
      }).join("");
      main.querySelector("#set-storage-body").innerHTML =
        '<div class="settings-card">' +
          '<div class="sd-title"><i class="bi bi-cloud-hdd"></i> Storage used</div>' +
          '<div class="sd-total">' + Winstem.Utils.formatBytes(u.usage) + ' <span class="sd-of">of ' + Winstem.Utils.formatBytes(u.quota) + '</span></div>' +
          '<div class="progress sd-progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="sd-files">' + u.fileCount + ' files · ' + pct.toFixed(1) + '% used</div>' +
        '</div>' +
        '<div class="settings-card"><div class="sd-list">' + rows + '</div></div>' +
        '<div class="settings-card d-flex justify-content-between align-items-center">' +
          '<div class="settings-row-text"><div>Recycle Bin</div><div class="settings-row-desc">Restore or permanently delete trashed items.</div></div>' +
          '<button class="btn btn-outline-secondary btn-sm" id="set-open-trash"><i class="bi bi-trash"></i> Open Trash</button>' +
        '</div>';
      const trashBtn = main.querySelector("#set-open-trash");
      if (trashBtn) trashBtn.addEventListener("click", function () { Winstem.Apps.launch("files", { location: "trash" }); });
    }).catch(function (e) {
      main.querySelector("#set-storage-body").innerHTML = '<div class="settings-card"><div class="settings-row-desc">' + Winstem.Utils.escapeHtml(e.message) + '</div></div>';
    });
  }

  /* ── Privacy ── */
  function renderPrivacy(main) {
    const session = Winstem.Auth.getUser();
    main.innerHTML =
      '<div class="settings-pane">' +
        '<h2>Privacy &amp; security</h2>' +
        '<p class="settings-sub">Session information and local data controls.</p>' +
        '<div class="settings-card">' +
          row("Signed in as", "Your authenticated session.", '<span class="settings-static">' + Winstem.Utils.escapeHtml((session && session.email) || "—") + '</span>') +
          row("Row Level Security", "Your data is protected by database policies.", '<span class="badge text-bg-success"><i class="bi bi-shield-check"></i> Enabled</span>') +
        '</div>' +
        '<div class="settings-card">' +
          row("Clear local cache", "Remove cached file listings and offline data (IndexedDB).", '<button class="btn btn-outline-secondary btn-sm" id="set-clear-cache"><i class="bi bi-trash"></i> Clear</button>') +
          row("Clear all local data", "Remove cached data AND appearance preferences on this device.", '<button class="btn btn-outline-danger btn-sm" id="set-clear-all"><i class="bi bi-database-x"></i> Clear all</button>') +
        '</div>' +
        '<div class="settings-card">' +
          '<div class="settings-row-desc"><i class="bi bi-info-circle"></i> Winstem stores file bytes and metadata in your private Supabase project. Only you can access your files — sharing is always opt-in and revocable.</div>' +
        '</div>' +
      '</div>';

    main.querySelector("#set-clear-cache").addEventListener("click", function () {
      Winstem.DB.LocalDB.clear().then(function () {
        Winstem.Notifications.success("Cache cleared");
      });
    });
    main.querySelector("#set-clear-all").addEventListener("click", function () {
      Winstem.Apps.confirm("Remove all local data on this device? Your cloud files are not affected.", "Clear local data").then(function (ok) {
        if (!ok) return;
        Winstem.DB.LocalDB.clear().then(function () {
          Object.keys(localStorage).filter(function (k) { return k.indexOf("winstem:") === 0; }).forEach(function (k) { localStorage.removeItem(k); });
          Winstem.Notifications.success("Local data cleared");
          setTimeout(function () { location.reload(); }, 600);
        });
      });
    });
  }

  /* ── Notifications ── */
  function renderNotifications(main) {
    const s = Winstem.Notifications.getSettings();
    const webOk = "Notification" in window;
    main.innerHTML =
      '<div class="settings-pane">' +
        '<h2>Notifications</h2>' +
        '<p class="settings-sub">Choose what Winstem tells you about.</p>' +
        '<div class="settings-card">' +
          row("Upload notifications", "Show a notification when uploads finish.", '') +
          row("Sharing notifications", "Notify about shares and collaborators.", '') +
          row("System notifications", "Sync, offline and maintenance messages.", '') +
          row("Browser notifications", "Mirror notifications to your operating system.", '') +
        '</div>' +
        '<div class="settings-card">' +
          (webOk
            ? '<div class="d-flex justify-content-between align-items-center"><div class="settings-row-text"><div>Web Notification permission</div><div class="settings-row-desc">' +
              (Notification.permission === "granted" ? "Granted — browser notifications are active." : Notification.permission === "denied" ? "Blocked in your browser settings." : "Not requested yet.") +
              '</div></div><button class="btn btn-outline-secondary btn-sm" id="set-notif-perm">' +
              (Notification.permission === "granted" ? "Granted" : "Request permission") + '</button></div>'
            : '<div class="settings-row-desc">Browser notifications are not supported in this browser.</div>') +
        '</div>' +
      '</div>';

    const toggles = [
      { id: "ntf-uploads", key: "uploads", checked: s.uploads },
      { id: "ntf-shares", key: "shares", checked: s.shares },
      { id: "ntf-system", key: "system", checked: s.system },
      { id: "ntf-web", key: "web", checked: s.web }
    ];
    toggles.forEach(function (t) {
      const rowEl = main.querySelectorAll(".settings-row")[toggles.indexOf(t)];
      const wrap = document.createElement("div");
      wrap.className = "form-check form-switch";
      wrap.innerHTML = '<input class="form-check-input" type="checkbox" id="' + t.id + '" ' + (t.checked ? "checked" : "") + '>';
      rowEl.querySelector(".settings-row-control").appendChild(wrap);
      wrap.querySelector("input").addEventListener("change", function () {
        Winstem.Notifications.setSetting(t.key, this.checked);
        if (t.key === "web" && this.checked && Notification.permission !== "granted") {
          Winstem.Notifications.requestWebPermission().then(function (granted) {
            if (!granted) { this.checked = false; Winstem.Notifications.setSetting("web", false); }
          });
        }
      });
    });
    const permBtn = main.querySelector("#set-notif-perm");
    if (permBtn) permBtn.addEventListener("click", function () {
      Winstem.Notifications.requestWebPermission().then(function (granted) {
        Winstem.Notifications.setSetting("web", granted);
        Winstem.Notifications.success(granted ? "Notifications enabled" : "Permission denied");
        renderNotifications(main);
      });
    });
  }

  /* ── System ── */
  function renderSystem(main) {
    main.innerHTML =
      '<div class="settings-pane">' +
        '<h2>System</h2>' +
        '<p class="settings-sub">Regional and system preferences.</p>' +
        '<div class="settings-card">' +
          row("Language", "Interface language.", '<span class="settings-static">English (en)</span>') +
          row("Time format", "How the clock is displayed.", '<span class="settings-static">' + new Date().toLocaleTimeString() + '</span>') +
          row("Date format", "How dates are displayed.", '<span class="settings-static">' + new Date().toLocaleDateString() + '</span>') +
          row("Platform", "Detected from your browser.", '<span class="settings-static"><i class="bi bi-' + (Winstem.Utils.platform === "win" ? "windows" : Winstem.Utils.platform === "mac" ? "apple" : Winstem.Utils.platform === "linux" ? "ubuntu" : "globe2") + '"></i> ' + Winstem.Utils.platform + '</span>') +
          row("Touch device", "Optimized pointer handling.", '<span class="settings-static">' + (Winstem.Utils.isTouchDevice() ? "Yes" : "No") + '</span>') +
        '</div>' +
        '<div class="settings-card"><div class="settings-card-title"><i class="bi bi-keyboard"></i> Keyboard shortcuts</div>' +
          '<div class="shortcut-list">' +
            shortcutRow("Universal search", modKey() + " + K") +
            shortcutRow("New folder", modKey() + " + Shift + N") +
            shortcutRow("Save", modKey() + " + S") +
            shortcutRow("Open / find", modKey() + " + O") +
            shortcutRow("Find in document", modKey() + " + F") +
            shortcutRow("Move to trash", "Delete") +
            shortcutRow("Rename", "F2") +
            shortcutRow("Refresh", "F5") +
            shortcutRow("Launcher", "Win / " + modKey() + " + Space") +
            shortcutRow("Window switcher", "Alt + Tab") +
          '</div></div>' +
      '</div>';
  }

  function modKey() { return Winstem.Utils.platform === "mac" ? "⌘" : "Ctrl"; }

  function shortcutRow(label, keys) {
    return '<div class="shortcut-row"><span>' + Winstem.Utils.escapeHtml(label) + '</span><kbd>' + Winstem.Utils.escapeHtml(keys) + '</kbd></div>';
  }

  /* ── About ── */
  function renderAbout(main) {
    main.innerHTML =
      '<div class="settings-pane about-pane">' +
        '<div class="about-logo">' +
          '<svg viewBox="0 0 64 64" width="72" height="72"><defs><linearGradient id="about-g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="#22d3ee"/><stop offset="55%" stop-color="#6366f1"/><stop offset="100%" stop-color="#a855f7"/>' +
          '</linearGradient></defs><rect x="6" y="6" width="52" height="52" rx="14" fill="url(#about-g)"/>' +
          '<path d="M20 46V18l24 28V18" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</div>' +
        '<div class="about-name">Winstem</div>' +
        '<div class="about-tag">Cloud Operating Environment</div>' +
        '<div class="about-version">Version ' + Winstem.Config.get("appVersion") + ' · Web Edition</div>' +
        '<div class="about-meta">' +
          '<span><i class="bi bi-cloud-check"></i> Supabase connected</span>' +
          '<span><i class="bi bi-globe2"></i> GitHub Pages ready</span>' +
          '<span><i class="bi bi-phone"></i> PWA installable</span>' +
        '</div>' +
        '<div class="about-legal">© ' + new Date().getFullYear() + ' Winstem. Built with web technologies. MIT License.</div>' +
      '</div>';
  }

  Winstem.Apps.register({
    id: "settings",
    name: "Settings",
    icon: "bi-gear",
    description: "Winstem settings and personalization",
    category: "System",
    tags: ["settings", "preferences", "config", "personalization"],
    singleInstance: true,
    width: 900,
    height: 620,
    create: create,
    focus: focus
  });
})();
