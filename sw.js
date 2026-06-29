/* Service worker: офлайн-кеш + миттєві оновлення.
   Стратегія «спершу мережа»: коли є інтернет — завжди вантажиться найновіша
   версія з сайту, а кеш слугує лише запасним варіантом для офлайну. Тому при
   оновленні сайту застосунок на телефоні теж оновлюється сам. */
const VERSION = 'genius-cache-v7';
const ASSETS = [
  '.', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/store.js', 'js/oxford.js', 'js/sync.js', 'js/ui.js', 'js/data.js', 'js/data.prose.js', 'js/data.twisters.js',
  'js/vendor/firebase-app-compat.js', 'js/vendor/firebase-auth-compat.js', 'js/vendor/firebase-firestore-compat.js',
  'js/modules/dashboard.js', 'js/modules/schulte.js', 'js/modules/reading.js',
  'js/modules/typing.js', 'js/modules/twisters.js', 'js/modules/arithmetic.js',
  'js/modules/memory.js', 'js/modules/meditation.js', 'js/modules/goals.js',
  'js/modules/settings.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const cache = await caches.open(VERSION);
    await cache.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // сторонні (напр. шрифти) — лишаємо браузеру
  e.respondWith((async function () {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const idx = (await cache.match('index.html')) || (await cache.match('.'));
        if (idx) return idx;
      }
      throw err;
    }
  })());
});
