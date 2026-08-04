/* Generates Winstem PNG icons without external dependencies.
   Renders: dark rounded-rect tile, diagonal gradient, white "W" stroke.
   Usage: node gen-icons.js */
"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

/* ---------- tiny PNG encoder ---------- */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // filter none
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- small math helpers ---------- */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}
function inRoundedRect(x, y, rx, ry, w, h, r) {
  if (x < rx || x > rx + w || y < ry || y > ry + h) return false;
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  return Math.hypot(x - cx, y - cy) <= r;
}
function lerp(a, b, t) { return a + (b - a) * t; }

/* ---------- palette stops (Winstem gradient) ---------- */
const S0 = [0x22, 0xd3, 0xee];
const S1 = [0x63, 0x66, 0xf1];
const S2 = [0xa8, 0x55, 0xf7];
function gradientColor(t) {
  let a, b, f;
  if (t <= 0.55) { a = S0; b = S1; f = t / 0.55; }
  else { a = S1; b = S2; f = (t - 0.55) / 0.45; }
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

/* ---------- icon renderer ---------- */
function renderIcon(size, variant) {
  const px = Buffer.alloc(size * size * 4);
  const S = 512;
  // Geometry
  const rect = variant === "maskable"
    ? { x: 28, y: 28, w: 456, h: 456, r: 100 }
    : { x: 48, y: 48, w: 416, h: 416, r: 112 };
  // "W" stroke (favicon path: M164 372 V140 l184 232 V140), width 48
  const segs = [
    [164, 372, 164, 140],
    [164, 140, 348, 372],
    [348, 372, 348, 140]
  ];
  const dot = [384, 120];
  const halfW = 24;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * S;
      const v = ((y + 0.5) / size) * S;
      const i = (y * size + x) * 4;

      let r, g, b, a = 255;
      if (variant === "maskable") {
        // dark base
        r = 0x0b; g = 0x0e; b = 0x14;
        if (inRoundedRect(u, v, rect.x, rect.y, rect.w, rect.h, rect.r)) {
          const gc = gradientColor((u + v) / (2 * S));
          r = gc[0]; g = gc[1]; b = gc[2];
        }
      } else {
        if (!inRoundedRect(u, v, rect.x, rect.y, rect.w, rect.h, rect.r)) {
          px[i + 3] = 0; continue; // transparent outside tile
        }
        const gc = gradientColor((u + v) / (2 * S));
        r = gc[0]; g = gc[1]; b = gc[2];
        // subtle inner darkening toward bottom-right
        const sh = (u / S + v / S) / 2;
        const dark = 1 - 0.18 * sh;
        r *= dark; g *= dark; b *= dark;
      }

      // white W stroke
      let d = Infinity;
      for (const s of segs) d = Math.min(d, segDist(u, v, s[0], s[1], s[2], s[3]));
      if (d <= halfW) { r = 255; g = 255; b = 255; }
      else {
        // accent dot (cyan)
        const dd = Math.hypot(u - dot[0], v - dot[1]);
        if (dd <= 14) { const f = 1 - Math.min(1, dd / 14) * 0.2; r = 0x7e * f; g = 0xf0 * f; b = 0xff * f; }
      }

      px[i] = Math.round(Math.max(0, Math.min(255, r)));
      px[i + 1] = Math.round(Math.max(0, Math.min(255, g)));
      px[i + 2] = Math.round(Math.max(0, Math.min(255, b)));
      px[i + 3] = a;
    }
  }
  return encodePNG(size, size, px);
}

const outDir = path.join(__dirname, "..", "assets", "icons", "system");
const jobs = [
  ["icon-192.png", 192, "regular"],
  ["icon-512.png", 512, "regular"],
  ["icon-maskable-512.png", 512, "maskable"]
];
for (const [name, size, variant] of jobs) {
  fs.writeFileSync(path.join(outDir, name), renderIcon(size, variant));
  console.log("wrote", name, `(${size}x${size}, ${variant})`);
}
