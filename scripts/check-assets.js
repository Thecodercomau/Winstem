/* Cross-checks every local asset reference in the project against disk.
   Also scans for leftover TODO placeholders and service-role secrets.
   Usage: node scripts/check-assets.js */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

/* Files whose content may contain asset references */
const htmlFiles = ["index.html", "404.html", "manifest.json", "service-worker.js"];
const cssFiles = fs.readdirSync(path.join(root, "css")).filter((f) => f.endsWith(".css")).map((f) => "css/" + f);
const jsFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "vendor") walk(full); }
    else if (e.name.endsWith(".js")) jsFiles.push(full);
  }
})(path.join(root, "js"));

function resolveRef(p) {
  p = p.split(/[?#]/)[0].trim();
  if (!p) return null;
  if (/^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/.test(p)) return null;
  if (/\{[^}]+\}/.test(p)) return null; // template placeholder
  return p.replace(/^\.\//, "");
}

const WHITELIST = new Set(["js/config.local.js", "$2"]); // optional gitignored config + regex token false positive
const missing = [];
const seen = new Set();
let checked = 0;

function scan(text, baseDir) {
  function check(r) {
    if (!r || seen.has(r)) return;
    seen.add(r); checked++;
    const full = path.isAbsolute(r) ? r : path.join(baseDir, r);
    if (!WHITELIST.has(r) && !fs.existsSync(full)) missing.push(r + " (from " + path.relative(root, baseDir) + ")");
  }
  /* HTML src/href attributes */
  const attrRe = /(?:src|href)\s*=\s*["']([^"'#]+)["']/g;
  let m;
  while ((m = attrRe.exec(text))) check(resolveRef(m[1]));
  /* CSS url(...) */
  const urlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  while ((m = urlRe.exec(text))) check(resolveRef(m[1]));
}

for (const rel of htmlFiles) scan(fs.readFileSync(path.join(root, rel), "utf8"), root);
for (const rel of cssFiles) scan(fs.readFileSync(path.join(root, rel), "utf8"), path.dirname(path.join(root, rel)));
for (const f of jsFiles) scan(fs.readFileSync(f, "utf8"), path.dirname(f));

console.log("Referenced local assets checked:", checked);
if (missing.length) {
  console.log("MISSING ASSETS:");
  missing.forEach((x) => console.log("  " + x));
} else {
  console.log("All referenced assets exist on disk ✓");
}

console.log("\nTODO placeholders (non-vendor):");
let todocount = 0;
for (const f of jsFiles) {
  const rel = path.relative(root, f);
  const txt = fs.readFileSync(f, "utf8");
  txt.split(/\r?\n/).forEach((ln, i) => {
    if (/(\/\/\s*TODO|\/\*\s*TODO|implement later|FIXME|XXX:)/i.test(ln)) {
      console.log(`  ${rel}:${i + 1}: ${ln.trim().slice(0, 90)}`);
      todocount++;
    }
  });
}
console.log(todocount === 0 ? "  none ✓" : `  (${todocount} found)`);

console.log("\nSecret scan (service_role key values):");
let leaks = 0;
const files = [...jsFiles, ...htmlFiles.map((f) => path.join(root, f))];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const txt = fs.readFileSync(f, "utf8");
  const km = txt.match(/sb_secret_[A-Za-z0-9_-]{10,}|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.\S+/g);
  if (km) { console.log(`  LEAK in ${path.relative(root, f)}`); leaks++; }
}
console.log(leaks === 0 ? "  no secret values ✓" : `  (${leaks} leaks!)`);
