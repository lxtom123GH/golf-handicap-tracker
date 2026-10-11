// ==========================================
// sw.js — offline-first app shell (BL-OFF-01)
// ==========================================
//
// Strategy (chosen for a golf course with patchy signal):
// - Navigations: network-first so deploys land immediately, falling back to
//   the cached shell when offline. The shell then boots from localStorage
//   (in-flight round, BL-UX-11 hydration) and Firestore's persistent
//   IndexedDB cache (rounds data + queued writes) — both already in place.
// - /assets/*: cache-first. Vite content-hashes these filenames, so a cached
//   entry can never be stale; new deploys reference new hashes via the
//   (network-first) HTML.
// - Icons/manifest: cache-first with backfill.
// - Everything else (Firestore, Open-Meteo, emulators, Vite dev modules):
//   untouched passthrough — caching an API response here would be a lie.

const CACHE_NAME = 'golf-app-v7.1.0-shell';
const PRECACHE = ['/', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // addAll is atomic — one 404 fails install — so add individually
            // and tolerate misses (favicon may not exist in dev).
            .then(cache => Promise.allSettled(PRECACHE.map(u => cache.add(u))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(names.map(n => n !== CACHE_NAME ? caches.delete(n) : null))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // Firestore/APIs pass through

    // App shell: network-first, cache the fresh copy, fall back when offline.
    //
    // F-16: the cache write is GUARDED, the way the asset branch below always
    // was. Unguarded, a golf-club captive portal answering 200 with its own
    // "sign in to continue" page, or a transient 502 from hosting, overwrote
    // the only thing that can serve this app offline — and the player found
    // out on the first tee. `res.type === 'basic'` is what rejects a portal
    // interception: a same-origin navigation that ends up somewhere else comes
    // back 'opaqueredirect' or 'cors', never 'basic'.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(res => {
                    if (res.ok && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put('/', copy));
                    }
                    return res;
                })
                .catch(() => caches.match('/'))
        );
        return;
    }

    // Course files (public/courses/*.json + imagery): stale-while-revalidate.
    // Serve the cached copy at once (no signal on the course is fine), and
    // refresh it in the background whenever we're online. Owner 2026-10-04:
    // the context aerial never appeared because course files were plain
    // cache-first and CACHE_NAME had never been bumped since they were added,
    // so every installed phone kept its first keperra.json forever.
    if (url.pathname.startsWith('/courses/')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => cache.match(req).then(hit => {
                const fresh = fetch(req).then(res => {
                    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
                    return res;
                }).catch(() => hit);
                if (hit) { event.waitUntil(fresh); return hit; }
                return fresh;
            }))
        );
        return;
    }

    // Hashed build assets + static icons: cache-first with backfill.
    const isImmutable = url.pathname.startsWith('/assets/')
        || url.pathname.startsWith('/icons/')
        || url.pathname === '/manifest.json'
        || url.pathname === '/favicon.ico';
    if (isImmutable) {
        event.respondWith(
            caches.match(req).then(hit => hit || fetch(req).then(res => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copy));
                }
                return res;
            }))
        );
    }
    // Anything else (Vite dev modules etc.): default network handling.
});
