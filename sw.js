/* Stanza Client Portal — service worker
   Caches the app shell so the login screen and chrome still open offline.
   API / Supabase traffic is never cached. */
const CACHE = "stanza-shell-v1";
const SHELL = [
  "/",
  "/index.html",
  "/app.css",
  "/app.js",
  "/config.js",
  "/supabase.js",
  "/logo-mark.png",
  "/logo.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API / Supabase / auth / realtime
  if (
    url.pathname.startsWith("/api") ||
    url.hostname.includes("supabase") ||
    url.pathname.includes("functions/v1")
  ) {
    return;
  }

  // Same-origin shell: network-first, fall back to cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok && (url.pathname === "/" || SHELL.some((p) => url.pathname === p || url.pathname.endsWith(p)))) {
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/index.html"))
        )
    );
  }
});
