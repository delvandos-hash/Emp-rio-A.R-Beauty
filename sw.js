// Empório A.R. Beauty — Service Worker
// ATUALIZE A VERSÃO ABAIXO SEMPRE QUE FIZER UM DEPLOY CRÍTICO DE JS/CSS
const CACHE_VERSION = 'emporio-ar-v3.1.0'; 
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/js/app.js',
  '/js/prices.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Força o SW novo a assumir imediatamente
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Assume o controle das abas abertas
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições de API, Netlify Functions, ou métodos não-GET
  if (event.request.method !== 'GET' || event.request.url.includes('/.netlify/functions/')) {
    return;
  }

  // Estratégia: Network First (Tenta internet, se falhar, vai pro cache)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a resposta for válida, atualiza o cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Em caso de falha (offline), busca do cache
        return caches.match(event.request);
      })
  );
});
