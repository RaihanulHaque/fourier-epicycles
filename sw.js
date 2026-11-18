// Offline support: always try the network first (bypassing the HTTP cache) so a new
// deploy shows up on the next load, and fall back to the cached copy when offline.
const CACHE = 'epicycles-v3';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg',
  'src/style.css', 'src/app.js', 'src/fourier.js', 'src/render.js',
  'src/shapes.js', 'src/trace.js', 'src/share.js', 'src/export.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(sameOrigin ? new Request(req, { cache: 'no-cache' }) : req);
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});
