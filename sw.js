// Smart Check — Service Worker
// Estratégia:
//   - /api e POST/PUT/DELETE: sempre rede (não cacheia).
//   - Demais GETs (HTML, ícones, manifest): network-first com fallback ao cache.
// CACHE_VERSION é injetada pelo servidor a cada (re)deploy, então cache antigo é descartado automaticamente.
const CACHE_VERSION = '__BUILD_ID__';
const CORE_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só lida com mesma origem
  if (url.origin !== self.location.origin) return;

  // Nunca cachear API ou métodos não-GET — sempre rede ao vivo
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // Network-first com fallback ao cache (mantém atualizações sempre frescas quando online)
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // Última tentativa: shell raiz para navegação
      if (req.mode === 'navigate') {
        const fallback = await caches.match('/');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
