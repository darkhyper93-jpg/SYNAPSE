// SYNAPSE service worker (web/PWA only — the native app ships its files locally).
// Network-first so updates arrive immediately; the cache is the offline fallback.
const CACHE = 'synapse-v4';
const CORE = ['./', 'index.html', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// The page lists the files it loaded (see platform.js): keep them for offline starts.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'precache' || !Array.isArray(e.data.urls)) return;
  const urls = [...new Set(e.data.urls)].filter((u) => {
    try {
      return new URL(u).origin === location.origin;
    } catch {
      return false;
    }
  });
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.match(u, { ignoreSearch: true }).then((hit) => hit || c.add(u).catch(() => {}))))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const nav = req.mode === 'navigate';
  e.respondWith(
    // no-cache: revalidate with the server, so a deploy never mixes old and new modules
    fetch(req, nav ? undefined : { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      // offline: the cached copy; only a page navigation may fall back to the app shell
      .catch(() => caches.match(req, { ignoreSearch: nav }).then((hit) => hit || (nav ? caches.match('index.html') : Response.error()))),
  );
});
