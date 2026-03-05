const CACHE_NAME = 'golf-cache-v6.20.2-CLEANUP';

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing golf-cache-v6.20.2-CLEANUP and skipping wait...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating and cleaning old caches...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[Service Worker] Claiming clients...');
            return self.clients.claim();
        })
    );
});

// DEFAULT TO NETWORK-ONLY TO BYPASS ANY LINGERING CACHE ISSUES
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
