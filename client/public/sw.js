/// <reference lib="webworker" />

const CACHE_NAME = 'perf-dashboard-v2';

const FONT_URLS = [
  '/fonts/figtree/figtree.css',
  '/fonts/figtree/Figtree-Variable.woff2',
  '/fonts/figtree/Figtree-Italic-Variable.woff2',
];

// Assets to precache for offline shell
const PRECACHE_URLS = ['/', '/index.html', ...FONT_URLS];

// Install: precache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API requests (always go to network)
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  if (url.origin === self.location.origin && FONT_URLS.includes(url.pathname)) {
    // These static files are identical across Origin headers, including font preloads.
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request)),
    );
    return;
  }

  // For navigation requests, try network first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }

  // For static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || fetchPromise;
    }),
  );
});
