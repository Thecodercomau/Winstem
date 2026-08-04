/* ═══════════════════════════════════════════════════════════
   WINSTEM — Local Configuration (example)
   ────────────────────────────────────────────────────────────
   Copy this file to `js/config.local.js` and fill in your
   Supabase project values. `config.local.js` is gitignored so
   your keys never get committed.

   ✅ Safe to expose (public, publishable):
     - Supabase Project URL
     - Supabase anon / publishable key

   ❌ NEVER put here (would compromise your project):
     - service_role key
     - database password
     - any secret
   ═══════════════════════════════════════════════════════════ */
window.WINSTEM_CONFIG = {
  /* Dashboard → Settings → API → Project URL */
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",

  /* Dashboard → Settings → API → anon public key */
  supabaseAnonKey: "YOUR-PUBLIC-ANON-KEY"
};
