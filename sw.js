/* Treino TTF — cache the app shell only. HTML always tries the network first
   so a new deploy is picked up. API/auth requests are never cached. */
const VERSION = "ttf-shell-v8";
const PRECACHE = [
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApi(url) {
  return (
    url.hostname.endsWith("supabase.co") ||
    url.pathname.startsWith("/functions/") ||
    url.pathname.includes("/auth/")
  );
}

function isShellAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  return (
    p.endsWith(".webmanifest") ||
    p.includes("/icons/") ||
    p.includes("/gifs/") ||
    p.endsWith(".png") ||
    p.endsWith(".webp")
  );
}

function isDocumentReq(req, url) {
  if (req.mode === "navigate" || req.destination === "document") return true;
  const p = url.pathname;
  return p === "/" || p.endsWith("/index.html") || /\/treino\/?$/.test(p);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isApi(url)) return;

  // Navigations and the HTML document: network first, cached fallback.
  if (isDocumentReq(req, url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put("./", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./").then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetched = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
  }
});
