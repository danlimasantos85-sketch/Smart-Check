// ─────────────────────────────────────────────────────────────
// SmartCheck — Service Worker com atualização automática
//
// COMO ATUALIZAR: basta mudar o número em CACHE_VERSION abaixo.
// O app detecta a mudança e se atualiza automaticamente em todos
// os dispositivos na próxima vez que for aberto.
// ─────────────────────────────────────────────────────────────

const CACHE_VERSION = 'smartcheck-v10';

// Arquivos que ficam salvos para funcionar offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/shell.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/smartcheck-dashboard.html',
  '/smartcheck-plano-acao.html',
  '/smartcheck-agendamentos.html',
  '/smartcheck-offline.html',
  '/smartcheck-multitenancy.html',
];

// ── INSTALL: baixa e salva os arquivos estáticos ──
self.addEventListener('install', event => {
  // Ativa imediatamente sem esperar tabs antigas fecharem
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Não foi possível cachear:', url, err)
          )
        )
      );
    })
  );
});

// ── ACTIVATE: remove caches antigos ──
self.addEventListener('activate', event => {
  // Toma controle de todas as tabs abertas imediatamente
  self.clients.claim();

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    )
  );
});

// ── FETCH: estratégia Network First para HTML, Cache First para assets ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições que não são GET
  if (request.method !== 'GET') return;

  // Ignora chamadas de API — sempre vai para a rede
  if (url.pathname.startsWith('/api/')) return;

  // Ignora serviços externos (fontes, CDN, etc)
  if (url.origin !== self.location.origin) return;

  // Para arquivos HTML → Network First (sempre tenta pegar versão nova)
  if (request.headers.get('accept')?.includes('text/html') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Para outros assets → Cache First (rápido, usa cache se existir)
  event.respondWith(cacheFirst(request));
});

// ── Network First: tenta rede, cai no cache se offline ──
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback para o shell se tudo falhar
    return caches.match('/shell.html') || caches.match('/index.html');
  }
}

// ── Cache First: usa cache, atualiza em background ──
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Atualiza em background sem bloquear
    fetch(request).then(response => {
      if (response.ok) {
        caches.open(CACHE_VERSION).then(cache => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }
  // Não tem no cache — busca na rede
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Recurso não disponível offline', { status: 503 });
  }
}

// ── Mensagens recebidas do app ──
self.addEventListener('message', event => {
  // Comando para forçar atualização imediata
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Comando para checar versão
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'VERSION',
      version: CACHE_VERSION
    });
  }
});
