// ==========================================
// sw-shell-cache.test.js
// F-16 — what the service worker is willing to keep as the app shell
// ==========================================
//
// public/sw.js runs in a ServiceWorkerGlobalScope, so the test builds one:
// a real CacheStorage stand-in, a controllable fetch, and a fetch-event whose
// respondWith captures the promise the worker hands back. The worker file
// itself is executed verbatim — no re-implementation of its logic.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SW_SRC = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

/** Minimal CacheStorage: enough for put/match/keys/open/add/delete. */
function makeCaches() {
    const stores = new Map();
    const cacheFor = (name) => {
        if (!stores.has(name)) {
            const entries = new Map();
            stores.set(name, {
                entries,
                put: async (req, res) => { entries.set(typeof req === 'string' ? req : req.url, res); },
                match: async (req) => entries.get(typeof req === 'string' ? req : req.url),
                add: async () => { }
            });
        }
        return stores.get(name);
    };
    return {
        stores,
        open: async (name) => cacheFor(name),
        match: async (req) => {
            for (const c of stores.values()) {
                const hit = await c.match(req);
                if (hit) return hit;
            }
            return undefined;
        },
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name)
    };
}

const response = (body, { ok = true, status = 200, type = 'basic' } = {}) => ({
    ok, status, type, body, clone() { return { ...this, clone: this.clone }; }
});

/**
 * Load public/sw.js into a fake worker scope. `store` is shared across loads so
 * one session's cache is the next session's cache, as it is on a real device.
 */
function loadWorker(fetchImpl, store = makeCaches()) {
    const listeners = {};
    const scope = {
        addEventListener: (t, fn) => { listeners[t] = fn; },
        location: { origin: 'https://golf.example' },
        skipWaiting: () => Promise.resolve(),
        clients: { claim: () => Promise.resolve() },
        caches: store,
        fetch: fetchImpl,
        listeners
    };
    // eslint-disable-next-line no-new-func
    new Function('self', 'caches', 'fetch', 'URL', SW_SRC)(scope, store, fetchImpl, URL);
    return scope;
}

/** Let the worker's un-awaited cache.put() chains settle. */
const flush = () => new Promise(r => setTimeout(r, 0));

/** Dispatch a navigation fetch and resolve what the worker chose to answer with. */
async function navigate(scope, url = 'https://golf.example/') {
    let answered;
    scope.listeners.fetch({
        request: { url, method: 'GET', mode: 'navigate' },
        respondWith: (p) => { answered = p; }
    });
    return answered;
}

describe('F-16 the app shell cache only accepts the real app shell', () => {
    let goodShell;

    beforeEach(() => {
        goodShell = response('<!doctype html><title>Golf</title>');
    });

    it('caches a good shell', async () => {
        const scope = loadWorker(vi.fn(async () => goodShell));
        await navigate(scope);
        await flush();

        const cached = await scope.caches.match('/');
        expect(cached).toBeTruthy();
        expect(cached.body).toContain('Golf');
    });

    it('does NOT overwrite the shell with a captive-portal 200', async () => {
        const store = makeCaches();
        await navigate(loadWorker(vi.fn(async () => goodShell), store));
        await flush();

        // Clubhouse Wi-Fi intercepts: 200 OK, but an opaque cross-origin redirect.
        const portal = response('<h1>Sign in to continue</h1>', { type: 'opaqueredirect' });
        await navigate(loadWorker(vi.fn(async () => portal), store));
        await flush();

        const cached = await store.match('/');
        expect(cached.body).toContain('Golf');
    });

    it('does NOT overwrite the shell with a 502 from hosting', async () => {
        const store = makeCaches();
        await navigate(loadWorker(vi.fn(async () => goodShell), store));
        await flush();

        await navigate(loadWorker(vi.fn(async () => response('Bad Gateway', { ok: false, status: 502 })), store));
        await flush();

        const cached = await store.match('/');
        expect(cached.body).toContain('Golf');
    });

    it('still serves the good shell offline after a portal interception', async () => {
        const store = makeCaches();
        await navigate(loadWorker(vi.fn(async () => goodShell), store));
        await flush();

        await navigate(loadWorker(vi.fn(async () => response('portal', { type: 'opaqueredirect' })), store));
        await flush();

        // Now out of coverage entirely.
        const served = await navigate(
            loadWorker(vi.fn(async () => { throw new TypeError('Failed to fetch'); }), store));

        expect(served.body).toContain('Golf');
    });
});
