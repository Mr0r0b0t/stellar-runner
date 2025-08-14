// Simple cache for offline play
const VERSION = 'v1.0.0';
const CORE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('stellar-runner-' + VERSION).then(cache => cache.addAll(CORE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !k.includes(VERSION)).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Network first for HTML, cache first for others
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open('stellar-runner-' + VERSION).then(c => c.put('./', copy));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
  } else {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(r => {
        const copy = r.clone();
        caches.open('stellar-runner-' + VERSION).then(c => c.put(req, copy));
        return r;
      }))
    );
  }
});
