// SERVICE WORKER KILL SWITCH
// Purpose: Force immediate takeover, nuke all caches, and default to network-only fetching.

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Kill Switch: Installing and skipping wait...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Kill Switch: Activating and nuking all caches...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    console.log('[Service Worker] Deleting cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            console.log('[Service Worker] Kill Switch: All caches cleared. Claiming clients...');
            return self.clients.claim();
        })
    );
});

// DEFAULT TO NETWORK-ONLY TO BYPASS ANY LINGERING CACHE ISSUES
self.addEventListener('fetch', (event) => {
    // We do NOT cache anything. Simply pass through to the network.
    event.respondWith(fetch(event.request));
});
