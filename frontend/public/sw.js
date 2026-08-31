/* Stride service worker.
 *
 * Two different caching rules, because the two kinds of request want opposite things:
 *
 *   /api/*  -> NETWORK ONLY. A task list or calendar served from cache is worse than no
 *              answer at all: you would tick something off against a stale view. These are
 *              never cached and never served stale.
 *   assets  -> CACHE FIRST. The built JS/CSS are content-hashed by Vite, so a cached file
 *              can never be the wrong version — a new build produces new filenames.
 *
 * The navigation fallback lets the app shell open instantly (and offline), after which the
 * app fetches live data itself and shows its own loading/error state.
 */
const VERSION = 'stride-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the API, and never let a cached response stand in for it.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Only handle same-origin traffic; let the browser deal with the backend host directly.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});
