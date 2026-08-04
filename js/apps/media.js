/* ═══════════════════════════════════════════════════════════
   WINSTEM — Media Apps
   Image Viewer (zoom / rotate / fullscreen), Audio Player
   (queue / seek / volume), Video Player and PDF Viewer.
   All previews stream through short-lived signed URLs.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* shared: resolve a previewable object URL for a file */
  function objectUrl(file) {
    if (file._blobUrl) return Promise.resolve(file._blobUrl);
    return Winstem.Storage.getSignedUrl(file.storage_path, 3600).then(function (url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error("Failed to load media");
        return r.blob();
      }).then(function (blob) {
        file._blobUrl = URL.createObjectURL(blob);
        return file._blobUrl;
      }).catch(function () {
        /* direct streaming via signed URL is fine for media */
        return url;
      });
    });
  }

  /* ═══════════════ IMAGE VIEWER ═══════════════ */
  Winstem.Apps.register({
    id: "image",
    name: "Image Viewer",
    icon: "bi-image",
    description: "View images with zoom, rotate and fullscreen",
    category: "Media",
    tags: ["image", "photo", "picture", "viewer"],
    width: 760,
    height: 600,
    create: function (win, content, params) {
      const file = params.file;
      if (!file) { content.innerHTML = '<div class="win-empty"><i class="bi bi-image"></i><p>Open an image from Files.</p></div>'; return; }
      content.innerHTML =
        '<div class="media-app img-app">' +
          '<div class="img-stage" id="img-stage">' +
            '<div class="img-loading"><div class="spinner-border text-white"></div></div>' +
            '<img id="img-el" class="img-el hidden" alt="' + Winstem.Utils.escapeAttr(file.name) + '">' +
          '</div>' +
          '<div class="img-toolbar">' +
            '<button class="btn btn-sm btn-outline-secondary" data-img="zoomout" title="Zoom out"><i class="bi bi-zoom-out"></i></button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-img="zoomin" title="Zoom in"><i class="bi bi-zoom-in"></i></button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-img="rotate" title="Rotate"><i class="bi bi-arrow-clockwise"></i></button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-img="reset" title="Reset"><i class="bi bi-arrow-counterclockwise"></i></button>' +
            '<span class="img-zoom-label" id="img-zoom-label">100%</span>' +
            '<div class="img-tb-spacer"></div>' +
            '<button class="btn btn-sm btn-outline-secondary" data-img="fullscreen" title="Fullscreen"><i class="bi bi-arrows-fullscreen"></i></button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-img="download" title="Download"><i class="bi bi-download"></i></button>' +
          '</div>' +
        '</div>';
      const img = content.querySelector("#img-el");
      const stage = content.querySelector("#img-stage");
      let zoom = 1, rot = 0;

      const apply = function () {
        img.style.transform = "scale(" + zoom + ") rotate(" + rot + "deg)";
        content.querySelector("#img-zoom-label").textContent = Math.round(zoom * 100) + "%";
      };

      objectUrl(file).then(function (url) {
        img.src = url;
        img.onload = function () {
          content.querySelector(".img-loading").classList.add("hidden");
          img.classList.remove("hidden");
          apply();
        };
      }).catch(function () {
        content.querySelector(".img-loading").classList.add("hidden");
        content.querySelector("#img-stage").innerHTML = '<div class="win-empty"><i class="bi bi-image"></i><p>This image cannot be displayed in your browser.</p></div>';
      });

      content.querySelectorAll("[data-img]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const act = btn.getAttribute("data-img");
          if (act === "zoomin") zoom = Math.min(6, zoom + 0.25);
          else if (act === "zoomout") zoom = Math.max(0.1, zoom - 0.25);
          else if (act === "rotate") rot = (rot + 90) % 360;
          else if (act === "reset") { zoom = 1; rot = 0; }
          else if (act === "fullscreen") {
            if (document.fullscreenElement) document.exitFullscreen();
            else stage.requestFullscreen().catch(function () { Winstem.WindowManager.toggleFullscreen(win.id); });
          } else if (act === "download") {
            Winstem.Storage.getSignedUrl(file.storage_path, 900).then(function (u) { Winstem.Utils.downloadUrl(u, file.name); });
          }
          apply();
        });
      });
      stage.addEventListener("wheel", function (e) {
        e.preventDefault();
        zoom = Math.max(0.1, Math.min(6, zoom + (e.deltaY < 0 ? 0.1 : -0.1)));
        apply();
      }, { passive: false });
    }
  });

  /* ═══════════════ AUDIO PLAYER ═══════════════ */
  Winstem.Apps.register({
    id: "audio",
    name: "Audio Player",
    icon: "bi-music-note-beamed",
    description: "Play audio files with a queue",
    category: "Media",
    tags: ["audio", "music", "player", "sound"],
    width: 520,
    height: 420,
    create: function (win, content, params) {
      const files = [params.file].concat(params.queue || []);
      let idx = 0;

      content.innerHTML =
        '<div class="media-app audio-app">' +
          '<div class="audio-art"><i class="bi bi-music-note-beamed"></i></div>' +
          '<div class="audio-title" id="audio-title">—</div>' +
          '<div class="audio-sub" id="audio-sub">—</div>' +
          '<audio id="audio-el" class="hidden" controls preload="metadata"></audio>' +
          '<div class="audio-controls">' +
            '<button class="btn btn-outline-secondary btn-sm" id="audio-prev" aria-label="Previous"><i class="bi bi-skip-start"></i></button>' +
            '<button class="btn btn-primary audio-play-btn" id="audio-play" aria-label="Play"><i class="bi bi-play-fill"></i></button>' +
            '<button class="btn btn-outline-secondary btn-sm" id="audio-next" aria-label="Next"><i class="bi bi-skip-end"></i></button>' +
          '</div>' +
          '<input type="range" class="form-range audio-volume" id="audio-volume" min="0" max="100" value="80" aria-label="Volume">' +
          '<div class="audio-queue" id="audio-queue"></div>' +
        '</div>';

      const audio = content.querySelector("#audio-el");
      const playBtn = content.querySelector("#audio-play");
      const volume = content.querySelector("#audio-volume");

      function loadTrack(i) {
        const f = files[i];
        if (!f) return;
        idx = i;
        Winstem.WindowManager.setTitle(win.id, f.name);
        content.querySelector("#audio-title").textContent = f.name;
        content.querySelector("#audio-sub").textContent = Winstem.Utils.formatBytes(f.size_bytes) + " · " + (f.extension || "").toUpperCase();
        renderQueue();
        objectUrl(f).then(function (url) {
          audio.src = url;
          audio.play().catch(function () { /* autoplay blocked — user presses play */ });
        });
      }

      function renderQueue() {
        const q = content.querySelector("#audio-queue");
        q.innerHTML = "";
        files.forEach(function (f, i) {
          const el = Winstem.Utils.el(
            '<button class="audio-q-item' + (i === idx ? " active" : "") + '">' +
              '<i class="bi bi-music-note"></i><span>' + Winstem.Utils.escapeHtml(f.name) + '</span>' +
            '</button>'
          );
          el.addEventListener("click", function () { loadTrack(i); });
          q.appendChild(el);
        });
      }

      playBtn.addEventListener("click", function () {
        if (audio.paused) audio.play(); else audio.pause();
      });
      audio.addEventListener("play", function () { playBtn.innerHTML = '<i class="bi bi-pause-fill"></i>'; });
      audio.addEventListener("pause", function () { playBtn.innerHTML = '<i class="bi bi-play-fill"></i>'; });
      audio.addEventListener("ended", function () {
        if (idx < files.length - 1) loadTrack(idx + 1);
        else playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
      });
      content.querySelector("#audio-next").addEventListener("click", function () {
        if (idx < files.length - 1) loadTrack(idx + 1);
      });
      content.querySelector("#audio-prev").addEventListener("click", function () {
        if (idx > 0) loadTrack(idx - 1);
      });
      volume.addEventListener("input", function () { audio.volume = volume.value / 100; });

      if (files.length) loadTrack(0);
      else content.innerHTML = '<div class="win-empty"><i class="bi bi-music-note-beamed"></i><p>Open an audio file from Files.</p></div>';
    }
  });

  /* ═══════════════ VIDEO PLAYER ═══════════════ */
  Winstem.Apps.register({
    id: "video",
    name: "Video Player",
    icon: "bi-film",
    description: "Play videos with native browser support",
    category: "Media",
    tags: ["video", "player", "movie"],
    width: 800,
    height: 520,
    create: function (win, content, params) {
      const file = params.file;
      if (!file) { content.innerHTML = '<div class="win-empty"><i class="bi bi-film"></i><p>Open a video from Files.</p></div>'; return; }
      content.innerHTML =
        '<div class="media-app video-app">' +
          '<div class="video-loading"><div class="spinner-border text-white"></div><p>Loading video…</p></div>' +
          '<video id="video-el" class="video-el hidden" controls playsinline></video>' +
          '<div class="video-foot">' +
            '<span>' + Winstem.Utils.escapeHtml(file.name) + '</span>' +
            '<button class="btn btn-sm btn-outline-secondary" id="video-download"><i class="bi bi-download"></i> Download</button>' +
          '</div>' +
        '</div>';
      const video = content.querySelector("#video-el");
      objectUrl(file).then(function (url) {
        video.src = url;
        video.onloadedmetadata = function () {
          content.querySelector(".video-loading").classList.add("hidden");
          video.classList.remove("hidden");
        };
        video.onerror = function () {
          content.querySelector(".video-loading").classList.add("hidden");
          content.querySelector(".video-app").innerHTML = '<div class="win-empty"><i class="bi bi-film"></i><p>Your browser cannot play this video format.</p></div>';
        };
      });
      content.querySelector("#video-download").addEventListener("click", function () {
        Winstem.Storage.getSignedUrl(file.storage_path, 900).then(function (u) { Winstem.Utils.downloadUrl(u, file.name); });
      });
    }
  });

  /* ═══════════════ PDF VIEWER ═══════════════ */
  Winstem.Apps.register({
    id: "pdf",
    name: "PDF Viewer",
    icon: "bi-file-earmark-pdf",
    description: "View PDF documents in the browser",
    category: "Productivity",
    tags: ["pdf", "document", "viewer"],
    width: 820,
    height: 640,
    create: function (win, content, params) {
      const file = params.file;
      if (!file) { content.innerHTML = '<div class="win-empty"><i class="bi bi-file-earmark-pdf"></i><p>Open a PDF from Files.</p></div>'; return; }
      content.innerHTML =
        '<div class="media-app pdf-app">' +
          '<div class="pdf-toolbar">' +
            '<span><i class="bi bi-file-earmark-pdf"></i> ' + Winstem.Utils.escapeHtml(file.name) + '</span>' +
            '<div class="img-tb-spacer"></div>' +
            '<button class="btn btn-sm btn-outline-secondary" id="pdf-download"><i class="bi bi-download"></i> Download</button>' +
          '</div>' +
          '<div class="pdf-frame-wrap">' +
            '<div class="pdf-loading"><div class="spinner-border text-primary"></div><p>Loading PDF…</p></div>' +
            '<iframe class="pdf-frame hidden" id="pdf-frame" title="PDF document"></iframe>' +
          '</div>' +
        '</div>';
      Winstem.Storage.getSignedUrl(file.storage_path, 3600).then(function (url) {
        const frame = content.querySelector("#pdf-frame");
        frame.src = url;
        frame.onload = function () {
          content.querySelector(".pdf-loading").classList.add("hidden");
          frame.classList.remove("hidden");
        };
      }).catch(function (err) {
        content.querySelector(".pdf-app").innerHTML = '<div class="win-empty"><i class="bi bi-file-earmark-pdf"></i><p>Could not load this PDF.</p></div>';
        Winstem.Notifications.error("PDF error", err.message);
      });
      content.querySelector("#pdf-download").addEventListener("click", function () {
        Winstem.Storage.getSignedUrl(file.storage_path, 900).then(function (u) { Winstem.Utils.downloadUrl(u, file.name); });
      });
    }
  });
})();
