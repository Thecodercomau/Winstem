/* ═══════════════════════════════════════════════════════════
   WINSTEM — Keyboard Shortcuts
   Platform-aware global shortcuts (Ctrl/Cmd vs ⌘, Alt+Tab
   window cycling, launcher, universal search, etc.).
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function isTypingTarget(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  function focusedWindow() {
    return Winstem.WindowManager.getFocused();
  }

  Winstem.Shortcuts = {
    init: function () {
      document.addEventListener("keydown", function (e) {
        const mod = Winstem.Utils.isMod(e);

        /* Universal search — works everywhere */
        if (mod && (e.key === "k" || e.key === "K")) {
          e.preventDefault();
          if (Winstem.Search.isOpen()) Winstem.Search.close();
          else Winstem.Search.open();
          return;
        }

        /* Launcher — Win key or Ctrl+Space */
        if (e.key === "Meta" || e.key === "Super") {
          e.preventDefault();
          const launcher = document.getElementById("launcher");
          if (launcher && launcher.classList.contains("hidden")) Winstem.Launcher.open();
          else Winstem.Launcher.close();
          return;
        }
        if (mod && e.code === "Space") {
          e.preventDefault();
          if (Winstem.Search.isOpen()) Winstem.Search.close();
          Winstem.Launcher.open();
          return;
        }

        /* Alt+Tab window cycling */
        if (e.altKey && e.key === "Tab") {
          e.preventDefault();
          Winstem.WindowManager.cycle(e.shiftKey ? -1 : 1);
          return;
        }

        /* Alt+F4 — close focused window */
        if (e.altKey && e.key === "F4") {
          e.preventDefault();
          const win = focusedWindow();
          if (win) Winstem.WindowManager.close(win.id);
          return;
        }

        /* Escape closes launcher / search / flyouts */
        if (e.key === "Escape") {
          if (Winstem.Search.isOpen()) { Winstem.Search.close(); return; }
          const launcher = document.getElementById("launcher");
          if (launcher && !launcher.classList.contains("hidden")) { Winstem.Launcher.close(); return; }
        }

        /* Desktop-level shortcuts (only when not typing) */
        if (isTypingTarget(e)) return;

        if (mod && e.shiftKey && (e.key === "N" || e.key === "n")) {
          e.preventDefault();
          Winstem.Apps.launch("files", { newFolder: true });
          return;
        }
        if (mod && (e.key === "o" || e.key === "O")) {
          e.preventDefault();
          const filesWin = Winstem.WindowManager.all().find(function (w) { return w.appId === "files"; });
          if (filesWin) { Winstem.WindowManager.restore(filesWin.id); Winstem.Files.openFilePicker(); }
          else Winstem.Apps.launch("files", { upload: true });
          return;
        }

        /* F5 — refresh the focused Files window */
        if (e.key === "F5") {
          const win = focusedWindow();
          if (win && win.appId === "files") {
            e.preventDefault();
            Winstem.App.emit("files-changed", { folderId: win.data && win.data.folderId });
          }
        }

        /* Window management inside a focused window */
        const win = focusedWindow();
        if (win) {
          if (mod && (e.key === "m" || e.key === "M")) { e.preventDefault(); Winstem.WindowManager.minimize(win.id); }
          if (mod && (e.key === "w" || e.key === "W")) { e.preventDefault(); Winstem.WindowManager.close(win.id); }
          if (mod && (e.key === "1" || e.key === "2")) { e.preventDefault(); Winstem.WindowManager.snap(win.id, e.key === "1" ? "left" : "right"); }
          if (e.key === "F11") { e.preventDefault(); Winstem.WindowManager.toggleFullscreen(win.id); }
        }
      });
    }
  };
})();
