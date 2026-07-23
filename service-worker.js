/**
 * service-worker.js — caches the app shell so it loads and fully functions
 * with zero connectivity (e.g. at a dive site). Data itself lives in
 * IndexedDB (see js/db.js), not here — this only caches the static files
 * needed to boot the app.
 *
 * NOTE: bump CACHE_VERSION whenever you deploy changes to any cached file,
 * otherwise returning visitors keep getting the old cached copy.
 */

const CACHE_VERSION = 'abyss-shell-v19';

// Keep this list in sync with every static asset the app needs to boot offline.
const APP_SHELL_FILES = [
    './',
    './index.html',
    './manifest.json',
    './js/db.js',
    './js/auth.js',
    './js/sync.js',
    './js/msal-browser.min.js',
    './js/chart.umd.min.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never cache/intercept calls to Microsoft's auth or Graph API — those
    // must always hit the network (and should fail cleanly, not from cache).
    if (url.hostname.includes('login.microsoftonline.com') || url.hostname.includes('graph.microsoft.com')) {
        return;
    }

    // App shell files: cache-first (instant load, works fully offline)
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    // Opportunistically cache any same-origin file we haven't seen yet
                    const clone = response.clone();
                    caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
                    return response;
                }).catch(() => cached);
            })
        );
        return;
    }

    // Third-party CDN assets (Tailwind, Leaflet, MSAL, Font Awesome, map tiles):
    // network-first, falling back to cache so the app still renders offline
    // once these have been fetched at least once.
    event.respondWith(
        fetch(event.request).then(response => {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
            return response;
        }).catch(() => caches.match(event.request))
    );
});
