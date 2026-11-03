// Service Worker mínimo para PWA (cache básico de assets estáticos)
const CACHE = 'ar-beauty-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/js/app.js',
  '/js/prices.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Network-first para o catálogo (Gist), cache-first para assets
  const url = new URL(e.request.url);
  if (url.hostname.includes('gist.githubusercontent.com') || url.pathname.includes('catalogo')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
