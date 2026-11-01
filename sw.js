// Service worker: makes the game installable and playable offline.
// Strategy: network first (always the latest version when online), falling back to the cache offline.
// The whole app is precached on install, so it works offline right after the first visit.
// VERSION is replaced with the commit SHA by the GitHub Pages workflow, so every deploy installs a fresh worker.
const VERSION = 'dev';
const CACHE = 'pixel-brigade-' + VERSION;
const ASSETS = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/main.js', './js/version.js', './js/data.js', './js/battle.js', './js/store.js', './js/i18n.js', './js/sprites.js', './js/audio.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pixel-brigade-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;   // always straight from the network (update check)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // revalidate with the server (cheap 304s) so a new release is picked up right away, not after the HTTP cache expires
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match('./index.html'));
      if (hit) return hit;
      throw err;
    }
  })());
});
