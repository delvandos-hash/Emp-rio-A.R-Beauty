const CACHE = 'ar-beauty-v4';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/logo.jpg',
  '/assets/icon-192.png',
  '/catalogo.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
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
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  const networkFirst =
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.json') ||
    url.pathname.includes('/.netlify/functions/');

  if (networkFirst) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          if (res.ok && !url.pathname.includes('/functions/')) {
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
