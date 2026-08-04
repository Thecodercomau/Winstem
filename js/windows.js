/* ═══════════════════════════════════════════════════════════
   WINSTEM — Window Manager
   Every application runs inside a managed window. Provides
   open/close/minimize/maximize/restore/move/resize/focus/
   z-index, window snapping and taskbar integration.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const state = {
    windows: [],
    zCounter: 10,
    nextId: 1,
    focusedId: null,
    drag: null,      /* active drag state */
    resize: null,    /* active resize state */
    snapGuide: null,
    touchMoved: false
  };

  const MIN_W = 320, MIN_H = 220;

  function $id(id) { return document.getElementById(id); }

  /* ═══════════════ DOM construction ═══════════════ */
  function buildWindow(win) {
    const layer = $id("windows-layer");
    const el = Winstem.Utils.el(
      '<div class="win-window" id="win-' + win.id + '" role="dialog" aria-modal="false" aria-label="' +
        Winstem.Utils.escapeAttr(win.title || "Window") + '">' +
        '<div class="win-titlebar">' +
          '<div class="win-title">' +
            (win.icon ? '<span class="win-title-icon"><i class="bi ' + Winstem.Utils.escapeAttr(win.icon) + '"></i></span>' : "") +
            '<span class="win-title-text">' + Winstem.Utils.escapeHtml(win.title || "") + '</span>' +
          '</div>' +
          '<div class="win-controls">' +
            '<button class="win-ctrl win-min" data-act="min" aria-label="Minimize"><i class="bi bi-dash-lg"></i></button>' +
            '<button class="win-ctrl win-max" data-act="max" aria-label="Maximize"><i class="bi bi-square"></i></button>' +
            '<button class="win-ctrl win-close" data-act="close" aria-label="Close"><i class="bi bi-x-lg"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="win-content"></div>' +
        '<div class="win-resize-handle nw" data-dir="nw"></div>' +
        '<div class="win-resize-handle n" data-dir="n"></div>' +
        '<div class="win-resize-handle ne" data-dir="ne"></div>' +
        '<div class="win-resize-handle e" data-dir="e"></div>' +
        '<div class="win-resize-handle se" data-dir="se"></div>' +
        '<div class="win-resize-handle s" data-dir="s"></div>' +
        '<div class="win-resize-handle sw" data-dir="sw"></div>' +
        '<div class="win-resize-handle w" data-dir="w"></div>' +
      '</div>'
    );
    layer.appendChild(el);

    /* remember previous geometry for restore */
    win._prev = null;

    /* titlebar drag */
    const tb = el.querySelector(".win-titlebar");
    tb.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".win-ctrl")) return;
      if (win.maximized || win.fullscreen) {
        /* restore-on-drag is Windows behavior; keep simple: no drag while maximized */
        return;
      }
      state.drag = {
        id: win.id, startX: e.clientX, startY: e.clientY,
        origX: win.x, origY: win.y
      };
      tb.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    tb.addEventListener("pointermove", function (e) {
      if (state.drag && state.drag.id === win.id) {
        handleDragMove(e);
      }
    });
    tb.addEventListener("pointerup", function (e) {
      if (state.drag && state.drag.id === win.id) {
        finishDrag(e);
      }
    });

    /* controls */
    el.querySelectorAll(".win-ctrl").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const act = btn.getAttribute("data-act");
        if (act === "min") Winstem.WindowManager.minimize(win.id);
        else if (act === "max") Winstem.WindowManager.toggleMaximize(win.id);
        else if (act === "close") Winstem.WindowManager.close(win.id);
      });
    });

    /* double-click titlebar → maximize toggle */
    tb.addEventListener("dblclick", function (e) {
      if (e.target.closest(".win-ctrl")) return;
      Winstem.WindowManager.toggleMaximize(win.id);
    });

    /* resize handles */
    el.querySelectorAll(".win-resize-handle").forEach(function (h) {
      h.addEventListener("pointerdown", function (e) {
        if (win.maximized || win.fullscreen) return;
        state.resize = { id: win.id, dir: h.getAttribute("data-dir"), startX: e.clientX, startY: e.clientY, orig: { x: win.x, y: win.y, w: win.w, h: win.h } };
        h.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      });
      h.addEventListener("pointermove", function (e) {
        if (state.resize && state.resize.id === win.id) handleResizeMove(e);
      });
      h.addEventListener("pointerup", function () { state.resize = null; });
    });

    /* click → focus */
    el.addEventListener("pointerdown", function () { Winstem.WindowManager.focus(win.id); });

    return el;
  }

  function applyGeometry(win) {
    const el = $id("win-" + win.id);
    if (!el) return;
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
    if (win.maximized) {
      el.style.left = "0px"; el.style.top = "0px";
      el.style.width = "100%"; el.style.height = "100%";
      el.style.borderRadius = "0";
    } else if (win.fullscreen) {
      /* fullscreen handled via CSS class */
    } else {
      el.style.left = win.x + "px";
      el.style.top = win.y + "px";
      el.style.width = win.w + "px";
      el.style.height = win.h + "px";
      el.style.borderRadius = "";
    }
    el.classList.toggle("maximized", !!win.maximized);
    el.classList.toggle("minimized", !!win.minimized);
    el.classList.toggle("fullscreen", !!win.fullscreen);
    if (win._snap) {
      el.classList.add("snap-" + win._snap);
    } else {
      el.classList.remove("snap-left", "snap-right", "snap-top", "snap-bottom");
    }
  }

  function refreshTaskbar() {
    if (Winstem.Taskbar) Winstem.Taskbar.renderWindows(state.windows);
  }

  function isInsideDesktop(x, y) {
    const tb = $id("taskbar");
    const tbH = tb ? tb.offsetHeight : 0;
    return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight - tbH;
  }

  function handleDragMove(e) {
    if (!state.drag) return;
    const win = Winstem.WindowManager.get(state.drag.id);
    if (!win) return;
    const dx = e.clientX - state.drag.startX;
    const dy = e.clientY - state.drag.startY;
    const nx = state.drag.origX + dx;
    const ny = state.drag.origY + dy;
    win.x = Math.max(-win.w + 80, Math.min(nx, window.innerWidth - 80));
    win.y = Math.max(0, Math.min(ny, window.innerHeight - 60));

    /* snap detection */
    const threshold = 28;
    let snap = null;
    if (e.clientX < threshold) snap = "left";
    else if (e.clientX > window.innerWidth - threshold) snap = "right";
    else if (e.clientY < threshold) snap = "top";
    showSnapGuide(snap);
    win._pendingSnap = snap;

    applyGeometry(win);
  }

  function finishDrag(e) {
    const drag = state.drag;
    state.drag = null;
    hideSnapGuide();
    if (!drag) return;
    const win = Winstem.WindowManager.get(drag.id);
    if (!win) return;
    if (win._pendingSnap) {
      Winstem.WindowManager.snap(win.id, win._pendingSnap);
      win._pendingSnap = null;
    }
  }

  function handleResizeMove(e) {
    if (!state.resize) return;
    const win = Winstem.WindowManager.get(state.resize.id);
    if (!win) return;
    const r = state.resize;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    let { x, y, w, h } = r.orig;
    if (r.dir.indexOf("e") !== -1) w = Math.max(MIN_W, r.orig.w + dx);
    if (r.dir.indexOf("s") !== -1) h = Math.max(MIN_H, r.orig.h + dy);
    if (r.dir.indexOf("w") !== -1) { const nw = Math.max(MIN_W, r.orig.w - dx); x = r.orig.x + (r.orig.w - nw); w = nw; }
    if (r.dir.indexOf("n") !== -1) { const nh = Math.max(MIN_H, r.orig.h - dy); y = Math.max(0, r.orig.y + (r.orig.h - nh)); h = nh; }
    win.x = x; win.y = y; win.w = w; win.h = h;
    applyGeometry(win);
  }

  function showSnapGuide(snap) {
    if (state.snapGuide === snap) return;
    state.snapGuide = snap;
    ["left", "right", "top"].forEach(function (s) {
      const el = $id("snap-guide-" + s);
      if (el) el.classList.toggle("hidden", snap !== s);
    });
  }

  function hideSnapGuide() {
    state.snapGuide = null;
    ["left", "right", "top"].forEach(function (s) {
      const el = $id("snap-guide-" + s);
      if (el) el.classList.add("hidden");
    });
  }

  function open(win) {
    if (win.id && state.windows.find(function (w) { return w.id === win.id; })) {
      /* existing single-instance window → focus */
      Winstem.WindowManager.focus(win.id);
      return win;
    }
    /* Single instance check */
    if (win.singleInstance && state.windows.find(function (w) { return w.appId === win.appId; })) {
      const existing = state.windows.find(function (w) { return w.appId === win.appId; });
      Winstem.WindowManager.focus(existing.id);
      return existing;
    }

    const id = "w" + (state.nextId++);
    const w = Object.assign({
      id: id,
      appId: win.appId || null,
      title: win.title || "Window",
      icon: win.icon || "bi-window",
      x: 80 + (state.windows.length % 7) * 34,
      y: 40 + (state.windows.length % 5) * 30,
      w: win.w || Math.min(860, window.innerWidth - 120),
      h: win.h || Math.min(600, window.innerHeight - 140),
      minimized: false,
      maximized: false,
      fullscreen: false,
      _snap: null,
      _prev: null,
      data: win.data || {},
      singleInstance: !!win.singleInstance,
      onClose: win.onClose || null
    }, win);

    state.windows.push(w);
    buildWindow(w);
    applyGeometry(w);
    Winstem.WindowManager.focus(w.id);
    refreshTaskbar();

    /* Let the app render its content */
    if (win.onCreate) {
      try { win.onCreate(w, $id("win-" + w.id).querySelector(".win-content")); }
      catch (e) { console.error("window create:", e); }
    }
    return w;
  }

  Winstem.WindowManager = {
    open: open,
    get: function (id) { return state.windows.find(function (w) { return w.id === id; }); },
    all: function () { return state.windows.slice(); },
    getFocused: function () { return state.windows.find(function (w) { return w.id === state.focusedId; }); },
    focusedId: function () { return state.focusedId; },

    focus: function (id) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      if (win.minimized) { win.minimized = false; applyGeometry(win); }
      state.zCounter++;
      win.z = state.zCounter;
      state.focusedId = id;
      state.windows.forEach(function (w) {
        const el = $id("win-" + w.id);
        if (el) {
          el.style.zIndex = String(w.z || 1);
          el.classList.toggle("focused", w.id === id);
        }
      });
      refreshTaskbar();
    },

    close: function (id) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      if (win.onClose) {
        try { win.onClose(win); } catch (e) { console.error(e); }
      }
      const el = $id("win-" + id);
      if (el) {
        el.classList.add("closing");
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 180);
      }
      state.windows = state.windows.filter(function (w) { return w.id !== id; });
      if (state.focusedId === id) {
        state.focusedId = state.windows.length ? state.windows[state.windows.length - 1].id : null;
        if (state.focusedId) Winstem.WindowManager.focus(state.focusedId);
      }
      refreshTaskbar();
    },

    minimize: function (id) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      win.minimized = true;
      applyGeometry(win);
      refreshTaskbar();
    },

    restore: function (id) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      win.minimized = false;
      if (win._prev) {
        win.x = win._prev.x; win.y = win._prev.y; win.w = win._prev.w; win.h = win._prev.h;
        win.maximized = false; win._prev = null;
      }
      applyGeometry(win);
      Winstem.WindowManager.focus(id);
      refreshTaskbar();
    },

    toggleMinimize: function (id) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      if (win.minimized) Winstem.WindowManager.restore(id);
      else Winstem.WindowManager.minimize(id);
    },

    toggleMaximize: function (id) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      if (win.maximized) {
        Winstem.WindowManager.restore(id);
      } else {
        win._prev = { x: win.x, y: win.y, w: win.w, h: win.h };
        win.maximized = true;
        win._snap = null;
        applyGeometry(win);
        Winstem.WindowManager.focus(id);
        refreshTaskbar();
      }
    },

    snap: function (id, dir) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      if (win.maximized) {
        win._prev = null;
        win.maximized = false;
      }
      win._snap = dir;
      const tb = $id("taskbar");
      const tbH = tb ? tb.offsetHeight : 0;
      const top = 0, bottom = window.innerHeight - tbH;
      if (dir === "left") { win.x = 0; win.y = top; win.w = Math.floor(window.innerWidth / 2); win.h = bottom; }
      else if (dir === "right") { win.x = Math.ceil(window.innerWidth / 2); win.y = top; win.w = Math.floor(window.innerWidth / 2); win.h = bottom; }
      else if (dir === "top") { win.x = 0; win.y = top; win.w = window.innerWidth; win.h = Math.floor(bottom / 2); }
      applyGeometry(win);
      Winstem.WindowManager.focus(id);
      refreshTaskbar();
    },

    toggleFullscreen: function (id) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      win.fullscreen = !win.fullscreen;
      if (win.fullscreen && !win.maximized) {
        win._prev = { x: win.x, y: win.y, w: win.w, h: win.h };
      }
      applyGeometry(win);
      refreshTaskbar();
    },

    /* keyboard shortcut helper */
    act: function (id, action) {
      if (action === "close") this.close(id);
      else if (action === "min") this.minimize(id);
      else if (action === "max") this.toggleMaximize(id);
      else if (action === "restore") this.restore(id);
      else if (action === "full") this.toggleFullscreen(id);
    },

    setTitle: function (id, title) {
      const win = state.windows.find(function (w) { return w.id === id; });
      if (!win) return;
      win.title = title;
      const el = $id("win-" + id);
      if (el) {
        const t = el.querySelector(".win-title-text");
        if (t) t.textContent = title;
        el.setAttribute("aria-label", title);
      }
      refreshTaskbar();
    },

    /** Focus the next/previous window (Alt+Tab behaviour). */
    cycle: function (dir) {
      if (!state.windows.length) return;
      const idx = state.windows.findIndex(function (w) { return w.id === state.focusedId; });
      const next = (idx + (dir || 1) + state.windows.length) % state.windows.length;
      const win = state.windows[next];
      if (win) { win.minimized = false; Winstem.WindowManager.focus(win.id); }
    },

    minimizeAll: function () {
      state.windows.forEach(function (w) { if (!w.minimized) w.minimized = true; applyGeometry(w); });
      refreshTaskbar();
    },

    closeAll: function () {
      state.windows.slice().forEach(function (w) { Winstem.WindowManager.close(w.id); });
    },

    /* ── window resize handling ─────────────────────────── */
    onViewportResize: function () {
      state.windows.forEach(function (w) {
        if (w.maximized || w.fullscreen) return;
        if (w._snap) Winstem.WindowManager.snap(w.id, w._snap);
        w.x = Math.min(w.x, Math.max(0, window.innerWidth - 80));
        w.y = Math.min(w.y, Math.max(0, window.innerHeight - 60));
        w.w = Math.min(w.w, window.innerWidth);
        w.h = Math.min(w.h, window.innerHeight - 40);
        applyGeometry(w);
      });
    }
  };

  /* ── global pointerup safety ───────────────────────────── */
  document.addEventListener("pointerup", function () {
    if (state.drag) { finishDrag(null); }
    state.drag = null;
    state.resize = null;
    hideSnapGuide();
  });

  /* expose state for taskbar/launcher */
  Winstem.WindowManager._state = state;
})();
