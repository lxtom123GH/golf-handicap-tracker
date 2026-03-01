const CACHE_NAME = 'golf-tracker-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/auth.js',
    '/competitions.js',
    '/course-data.js',
    '/firebase-config.js',
    '/state.js',
    '/ui.js',
    '/whs.js',
    '/oncourse.js',
    '/practice.js',
    '/manifest.json'
];

// Install Event - Cache Core Assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching App Shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Fetch Event - Stale-While-Revalidate Strategy for local assets
self.addEventListener('fetch', (event) => {
    // Only intercept same-origin requests (ignore Firebase API calls)
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                }).catch(() => {
                    // Network failed, we just return the cached response below
                });

                // Return cached response immediately if available, while updating in background
                return cachedResponse || fetchPromise;
            })
        );
    }
});
