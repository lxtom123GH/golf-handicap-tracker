// ==========================================
// sw-course-refresh.test.js
// Course files (/courses/*) are stale-while-revalidate: instant from cache,
// refreshed in the background. Owner 2026-10-04: the new course aerial never
// reached installed phones because course files were cache-first forever.
// Same harness style as sw-shell-cache.test.js: public/sw.js runs verbatim.
// ==========================================
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SW_SRC = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

function makeCaches() {
    const stores = new Map();
    const cacheFor = (name) => {
        if (!stores.has(name)) {
            const entries = new Map();
            stores.set(name, {
                entries,
                put: async (req, res) => { entries.set(typeof req === 'string' ? req : req.url, res); },
                match: async (req) => entries.get(typeof req === 'string' ? req : req.url),
                add: async () => { },
            });
        }
        return stores.get(name);
    };
    return {
        stores,
        open: async (name) => cacheFor(name),
        match: async (req) => { for (const c of stores.values()) { const h = await c.match(req); if (h) return h; } },
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
    };
}
const response = (body, { ok = true, status = 200, type = 'basic' } = {}) => ({
    ok, status, type, body, clone() { return { ...this, clone: this.clone }; },
});
function loadWorker(fetchImpl, store = makeCaches()) {
    const listeners = {};
    const scope = {
        addEventListener: (t, fn) => { listeners[t] = fn; },
        location: { origin: 'https://golf.example' },
        skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() },
        caches: store, fetch: fetchImpl, listeners,
    };
    // eslint-disable-next-line no-new-func
    new Function('self', 'caches', 'fetch', 'URL', SW_SRC)(scope, store, fetchImpl, URL);
    return scope;
}
const URL_JSON = 'https://golf.example/courses/keperra.json';
async function get(scope, url = URL_JSON) {
    let answered; const waits = [];
    scope.listeners.fetch({
        request: { url, method: 'GET', mode: 'cors' },
        respondWith: (p) => { answered = p; },
        waitUntil: (p) => { waits.push(p); },
    });
    const res = await answered;
    await Promise.all(waits);
    await new Promise(r => setTimeout(r, 0));
    return res;
}

describe('course files are stale-while-revalidate', () => {
    it('serves the cached copy first, then the refreshed copy on the next load', async () => {
        const store = makeCaches();
        await get(loadWorker(vi.fn(async () => response('v1')), store));
        // A deploy ships v2. The first load after it still answers instantly from cache...
        const first = await get(loadWorker(vi.fn(async () => response('v2')), store));
        expect(first.body).toBe('v1');
        // ...and the background refresh means the next load has v2.
        const offline = await get(loadWorker(vi.fn(async () => { throw new TypeError('offline'); }), store));
        expect(offline.body).toBe('v2');
    });

    it('works with no signal once cached', async () => {
        const store = makeCaches();
        await get(loadWorker(vi.fn(async () => response('v1')), store));
        const res = await get(loadWorker(vi.fn(async () => { throw new TypeError('offline'); }), store));
        expect(res.body).toBe('v1');
    });

    it('never replaces a good course file with a 502 or a captive portal', async () => {
        const store = makeCaches();
        await get(loadWorker(vi.fn(async () => response('v1')), store));
        await get(loadWorker(vi.fn(async () => response('Bad Gateway', { ok: false, status: 502 })), store));
        await get(loadWorker(vi.fn(async () => response('portal', { type: 'opaqueredirect' })), store));
        const res = await get(loadWorker(vi.fn(async () => { throw new TypeError('offline'); }), store));
        expect(res.body).toBe('v1');
    });

    it('applies to course imagery too', async () => {
        const store = makeCaches();
        const img = 'https://golf.example/courses/imagery/keperra-context.jpg';
        await get(loadWorker(vi.fn(async () => response('jpg1')), store), img);
        await get(loadWorker(vi.fn(async () => response('jpg2')), store), img);
        const res = await get(loadWorker(vi.fn(async () => { throw new TypeError('offline'); }), store), img);
        expect(res.body).toBe('jpg2');
    });
});
