// Service worker voor GPS Track Analyzer.
// Cacheert de app zelf (direct bij installatie) en de OSM-kaarttegels (bij gebruik,
// maximaal 250 stuks). Daarna werkt de app zonder verbinding; alleen ongebruikte
// kaarttegels ontbreken dan.
const APP_CACHE = "analyzer-v1";
const TILE_CACHE = "tegels-v1";
const TILE_MAX = 250;
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Kaarttegels: cache first, daarna netwerk, nieuwe tegel opslaan.
  if (url.origin === "https://tile.openstreetmap.org") {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res && res.ok) {
          await cache.put(event.request, res.clone());
          await trimTiles(cache);
        }
        return res;
      })
    );
    return;
  }

  // Eigen bestanden: cache first, op de achtergrond verversen.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request, { ignoreSearch: true });
        const netwerk = fetch(event.request).then((res) => {
          if (res && res.ok) cache.put(event.request, res.clone());
          return res;
        }).catch(() => hit);
        return hit || netwerk;
      })
    );
  }
});

async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length > TILE_MAX) {
    for (const k of keys.slice(0, keys.length - TILE_MAX)) await cache.delete(k);
  }
}