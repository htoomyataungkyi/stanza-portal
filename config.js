/* ------------------------------------------------------------------
   Stanza Client Portal — connection settings

   Both values below are PUBLIC. The publishable key is meant to ship
   inside the web page; it carries no permissions of its own. What a
   person can see is decided by the security rules in the database,
   against whoever is signed in.

   Never put the `service_role` key or the database password in this
   file — those bypass every rule.


   Why the database address is our own domain
   ------------------------------------------
   The browser used to call supabase.co directly. That second address is
   blocked on Myanmar networks, so the page would load and then nothing
   would sign in. Everything now goes through /api on this same site,
   which vercel.json passes along to Supabase. One address for the whole
   portal: if the site opens at all, it works.
   ------------------------------------------------------------------ */

window.STANZA_CONFIG = {
  // Whatever address the portal was opened at, plus /api. Works on the
  // live domain and on any preview or local copy without editing.
  supabaseUrl: window.location.origin + "/api",
  supabaseKey: "sb_publishable_DMYdwpJzW4f-JwwM4rpmRg_T6-3F2rU",

  // Shown on the login screen and in the footer.
  supportPhone: "+959255255210",
  supportPhoneLabel: "09 255 255 210",
  companyName: "Stanza Interior Design & Decoration",
};
