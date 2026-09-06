/* Beanie Day service worker — network-first shell so updates always land */
const CACHE_VERSION = "beanie-day-v7-polish";
const PRECACHE = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./css/styles.css",
  "./css/polish.css",
  "./js/app.js",
  "./js/app.bundle.js",
  "./js/patches/manifest.json",
  "./js/patches/09-sw-bust.json",
  "./js/patches/08-card-template.json",
  "./js/patches/07-card-badges.json",
  "./js/patches/06-search-venue.json",
  "./js/patches/05-filter-blocklist.json",
  "./js/patches/04-empty-state.json",
  "./js/patches/03-hero-stats.json",
  "./js/patches/02-loadData-cache.json",
  "./js/patches/01-loadData-network.json",
  "./js/patches/00-guards-aliases.json",
  "./js/beanie-guards.js",
  "./data/week.json",
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
      // Cache one-by-one so a single failure doesn't kill install
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res);
          } catch (_) {
            /* ignore individual failures */
          }
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

  // Always network-first for app shell + data so deploys aren't stuck on stale cache
  const path = url.pathname;
  const isShell =
    path.endsWith("/") ||
    path.endsWith("/index.html") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith("week.json") ||
    path.endsWith("schema-flags.json") ||
    path.endsWith("manifest.json") ||
    path.includes("/patches/") ||
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
