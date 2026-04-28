const CACHE_NAME = "__BUILD_ID__";
const CORE_ASSETS = ["/", "/index.html", "/manifest.webmanifest"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(req).catch(() => caches.match(req).then(r => r || caches.match("/index.html"))));
});
