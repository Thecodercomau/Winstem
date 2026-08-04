/* ═══════════════════════════════════════════════════════════
   WINSTEM — File Types
   Robust file-type detection, categorization and preview
   capability mapping. Unknown extensions are always accepted —
   this module only decides how a file is *presented*.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* Category → Bootstrap icon + accent color (CSS var friendly) */
  const CATEGORIES = {
    document:   { label: "Document",  icon: "bi-file-earmark-text",  color: "#4f8cff", preview: "editor" },
    image:      { label: "Image",     icon: "bi-file-earmark-image", color: "#a06ef0", preview: "image" },
    audio:      { label: "Audio",     icon: "bi-file-earmark-music", color: "#31c48d", preview: "audio" },
    video:      { label: "Video",     icon: "bi-file-earmark-play",  color: "#f59e0b", preview: "video" },
    archive:    { label: "Archive",   icon: "bi-file-earmark-zip",   color: "#f97316", preview: null },
    code:       { label: "Code",      icon: "bi-file-earmark-code",  color: "#38bdf8", preview: "editor" },
    spreadsheet:{ label: "Spreadsheet", icon: "bi-file-earmark-spreadsheet", color: "#34d399", preview: "editor" },
    pdf:        { label: "PDF",       icon: "bi-file-earmark-pdf",   color: "#f87171", preview: "pdf" },
    presentation:{ label: "Presentation", icon: "bi-file-earmark-slides", color: "#fb923c", preview: null },
    font:       { label: "Font",      icon: "bi-file-earmark-font",  color: "#e879f9", preview: null },
    generic:    { label: "File",      icon: "bi-file-earmark",       color: "#94a3b8", preview: null }
  };

  /* Extension → category + override icon */
  const EXT_MAP = {
    /* documents */
    txt: "document", md: "document", markdown: "document", rtf: "document", log: "document",
    doc: "document", docx: "document", odt: "document",
    csv: "spreadsheet", tsv: "spreadsheet", xls: "spreadsheet", xlsx: "spreadsheet", ods: "spreadsheet",
    ppt: "presentation", pptx: "presentation", odp: "presentation",
    html: "code", htm: "code", xml: "code", json: "code", yaml: "code", yml: "code",
    /* pdf */
    pdf: "pdf",
    /* images */
    jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image",
    svg: "image", bmp: "image", ico: "image", tiff: "image", tif: "image",
    avif: "image", heic: "image", heif: "image",
    /* audio */
    mp3: "audio", wav: "audio", ogg: "audio", opus: "audio", flac: "audio",
    m4a: "audio", aac: "audio", aiff: "audio", aif: "audio", webm: "audio", mid: "audio", midi: "audio",
    /* video */
    mp4: "video", m4v: "video", webm: "video", mov: "video", avi: "video", mkv: "video",
    ogv: "video", mpg: "video", mpeg: "video", wmv: "video",
    /* archives */
    zip: "archive", tar: "archive", gz: "archive", tgz: "archive", "7z": "archive",
    rar: "archive", bz2: "archive", xz: "archive",
    /* code */
    js: "code", mjs: "code", cjs: "code", ts: "code", tsx: "code", jsx: "code",
    css: "code", scss: "code", sass: "code", less: "code",
    c: "code", h: "code", cpp: "code", hpp: "code", cc: "code",
    java: "code", py: "code", rb: "code", rs: "code", go: "code",
    php: "code", sql: "code", sh: "code", bat: "code", ps1: "code",
    ini: "code", env: "code", toml: "code", cfg: "code", conf: "code",
    kt: "code", swift: "code", scala: "code", lua: "code", pl: "code",
    /* fonts */
    woff: "font", woff2: "font", ttf: "font", otf: "font", eot: "font"
  };

  /* Extensions that can be *edited* by the built-in text editor */
  const EDITABLE = new Set([
    "txt", "md", "markdown", "json", "html", "htm", "css", "js", "mjs", "cjs",
    "ts", "tsx", "jsx", "xml", "csv", "tsv", "log", "yaml", "yml", "toml",
    "ini", "cfg", "conf", "env", "sh", "bat", "ps1", "sql", "py", "rb",
    "c", "h", "cpp", "hpp", "java", "go", "rs", "php", "lua"
  ]);

  /* Extensions the browser can natively *display* */
  const PREVIEWABLE_IMAGE = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"]);
  const PREVIEWABLE_AUDIO = new Set(["mp3", "wav", "ogg", "opus", "m4a", "aac", "webm", "flac", "aiff", "aif"]);
  const PREVIEWABLE_VIDEO = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);

  const MIME_OVERRIDES = {
    md: "text/markdown",
    yml: "text/yaml",
    ts: "text/typescript",
    jsx: "text/jsx",
    tsx: "text/tsx",
    heic: "image/heic",
    avif: "image/avif"
  };

  function extOf(name) {
    const n = String(name || "");
    const i = n.lastIndexOf(".");
    if (i <= 0 || i === n.length - 1) return "";
    return n.slice(i + 1).toLowerCase();
  }

  function categoryOf(ext) {
    if (!ext) return "generic";
    return EXT_MAP[ext] || "generic";
  }

  function mimeOf(name, fallback) {
    const ext = extOf(name);
    if (MIME_OVERRIDES[ext]) return MIME_OVERRIDES[ext];
    if (fallback && /^[a-z0-9]+\/[a-z0-9.+-]+$/i.test(String(fallback))) return fallback;
    const cat = categoryOf(ext);
    if (cat === "image") return "image/" + (ext === "jpg" ? "jpeg" : ext);
    if (cat === "audio") return "audio/" + ext;
    if (cat === "video") return "video/" + ext;
    if (cat === "pdf") return "application/pdf";
    if (cat === "archive") {
      const a = { zip: "application/zip", tar: "application/x-tar", gz: "application/gzip",
        tgz: "application/gzip", "7z": "application/x-7z-compressed", rar: "application/vnd.rar",
        bz2: "application/x-bzip2", xz: "application/x-xz" };
      return a[ext] || "application/octet-stream";
    }
    return "application/octet-stream";
  }

  Winstem.FileTypes = {
    extOf: extOf,
    categoryOf: categoryOf,
    mimeOf: mimeOf,

    /** Category metadata (icon, color, label) with safe fallback to generic. */
    category: function (nameOrExt) {
      const ext = String(nameOrExt || "").indexOf(".") === -1 ? nameOrExt : extOf(nameOrExt);
      const cat = categoryOf(ext);
      return CATEGORIES[cat] || CATEGORIES.generic;
    },

    info: function (name) {
      const ext = extOf(name);
      const cat = categoryOf(ext);
      return {
        name: name,
        extension: ext,
        category: cat,
        categoryInfo: CATEGORIES[cat] || CATEGORIES.generic,
        isEditable: EDITABLE.has(ext),
        previewableImage: PREVIEWABLE_IMAGE.has(ext),
        previewableAudio: PREVIEWABLE_AUDIO.has(ext),
        previewableVideo: PREVIEWABLE_VIDEO.has(ext),
        previewApp: CATEGORIES[cat] ? CATEGORIES[cat].preview : null
      };
    },

    /** Default app id used to open a file. */
    openAppFor: function (name) {
      const info = this.info(name);
      if (info.previewableImage) return "image";
      if (info.previewableAudio) return "audio";
      if (info.previewableVideo) return "video";
      if (info.extension === "pdf") return "pdf";
      if (info.extension === "md" || info.extension === "markdown") return "markdown";
      if (info.extension === "json") return "json";
      if (info.isEditable) return "editor";
      return null; /* no previewer → generic dialog in Files app */
    },

    /** Safe display name for unknown binary detection based on MIME sniffing. */
    detectFromMime: function (mime) {
      if (!mime) return "generic";
      if (mime.indexOf("image/") === 0) return "image";
      if (mime.indexOf("audio/") === 0) return "audio";
      if (mime.indexOf("video/") === 0) return "video";
      if (mime.indexOf("text/") === 0) return "document";
      if (mime === "application/pdf") return "pdf";
      if (mime.indexOf("zip") !== -1 || mime.indexOf("tar") !== -1 || mime.indexOf("gzip") !== -1) return "archive";
      return "generic";
    }
  };
})();
