/* ------------------------------------------------------------------
   Stanza Client Portal — connection settings

   Both values below are PUBLIC. The publishable key is meant to ship
   inside the web page; it carries no permissions of its own. What a
   person can see is decided by the security rules in the database,
   against whoever is signed in.

   Never put the `service_role` key or the database password in this
   file — those bypass every rule.
   ------------------------------------------------------------------ */

window.STANZA_CONFIG = {
  supabaseUrl: "https://cmzmgtpbunzrjbbktpih.supabase.co",
  supabaseKey: "sb_publishable_lWZWflFnIyv00X01syN51Q_-YOdMawx",

  // Shown on the login screen and in the footer.
  companyName: "Stanza Interior Design & Decoration",
};
