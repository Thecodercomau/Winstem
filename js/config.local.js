/* ═══════════════════════════════════════════════════════════
   WINSTEM — Local Configuration
   ────────────────────────────────────────────────────────────
   Contains the PUBLIC Supabase project values. This file is
   gitignored (js/config.local.js) so nothing sensitive leaks.

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
  supabaseUrl: "https://xedbcrikayularchixqn.supabase.co",

  /* Dashboard → Settings → API → anon public key */
  supabaseAnonKey: "sb_publishable_pm8u5kIYQ6gscYBcSfo61g_gpQuUiZ-"
};
