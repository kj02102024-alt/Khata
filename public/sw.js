/**
 * public/sw.js  —  Service Worker
 *
 * Strategy:
 *   • App shell (HTML, CSS, JS, fonts) → Cache-first so the UI
 *     opens instantly even with no network, then the browser
 *     fetches updates in the background.
 *   • API calls (/api/*) → Network-only. We never cache ledger
 *     data in the service worker; that stays on the server and
 *     fresh is always better than stale for financial data.
 *
 * Cache versioning: bump CACHE_NAME whenever you deploy new
 * frontend files so stale shells are evicted automatically.
 */

const CACHE_NAME = 'khata-v1';

const SHELL_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/strings.js',
  '/app.js',
  '/manifest.json',
  // Google Fonts — Noto Sans Devanagari
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700;900&display=swap',
];

// ── Install: pre-cache the app shell ─────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES);
    })
  );
  // Activate immediately rather than waiting for old tabs to close
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for shell, network-only for API ───────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls
  if (url.pathname.startsWith('/api/')) {
    return; // let the browser handle it normally
  }

  // Cache-first for everything else (shell files, icons, fonts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache the response
      return fetch(event.request).then((response) => {
        // Only cache successful responses from our own origin or Google Fonts
        if (
          response.ok &&
          (url.origin === self.location.origin ||
            url.hostname === 'fonts.googleapis.com' ||
            url.hostname === 'fonts.gstatic.com')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
