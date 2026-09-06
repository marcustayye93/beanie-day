/* Beanie Day service worker — network-first shell so updates always land */
const CACHE_VERSION = "beanie-day-v11-intro-boot";
const PRECACHE = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./css/styles.css",
  "./css/polish.css",
  "./css/intro-touch.css",
  "./js/app.js",
  "./js/app.part0.js",
  "./js/app.part1.js",
  "./js/app.part2.js",
  "./js/zone-pass.js",
  "./js/beanie-guards.js",
  "./data/week.json",
  "./data/zone-pass.state.json",
  "./data/schema-flags.json",
  "./icons/favicon.svg",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res);
          } catch (_) {}
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isShell =
    path.endsWith("/") ||
    path.endsWith("/index.html") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith("week.json") ||
    path.endsWith("zone-pass.state.json") ||
    path.endsWith("schema-flags.json") ||
    path.endsWith("manifest.json") ||
    req.mode === "navigate";

  if (isShell) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    const cached =
      (await caches.match(req, { ignoreSearch: true })) ||
      (req.mode === "navigate" ? await caches.match("./index.html") : null) ||
      (await caches.match("./offline.html"));
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) {
    fetch(req)
      .then(async (res) => {
        if (res && res.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, res);
        }
      })
      .catch(() => {});
    return cached;
  }
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}
