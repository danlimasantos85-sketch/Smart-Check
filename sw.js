// Smart Check Service Worker — auto-update (network-first)
// Versão muda a cada deploy para invalidar caches antigos
const VERSION = 'sc-' + (self.registration && self.registration.scope ? '' : '') + '20260504-1';
const CACHE = 'smartcheck-' + VERSION;

self.addEventListener('install', (event) => {
  // Não pré-cacheia nada: queremos sempre rede primeiro
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpa caches antigos
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Estratégia:
// - Navegações (HTML) e chamadas /api: SEMPRE rede (network-only com fallback offline)
// - Demais GETs (assets estáticos, fontes, ícones): stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca interceptar APIs nem websocket
  if (url.pathname.startsWith('/api/')) return;

  const isNavigate = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigate) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req) || await cache.match('/');
        if (cached) return cached;
        return new Response('Sem conexão', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Assets: stale-while-revalidate, mas só same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
