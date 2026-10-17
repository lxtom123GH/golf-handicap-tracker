// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('public/sw.js', 'utf8');
const assets = ['/assets/index-test.js', '/assets/index-test.css', '/assets/optional-test.js'];
function worker({ unavailable = null, manifest = assets, manifestType = 'basic',
    fallback = null, writeFailure = null } = {}) {
    const entries = new Map();
    const fetch = vi.fn(async input => {
        const path = typeof input === 'string' ? input : input.url;
        if (path === unavailable) throw new Error('offline asset');
        return { ok: true, type: path === '/offline-shell.json' ? manifestType : 'basic',
            headers: new Headers({ 'Content-Type': path === fallback || path === '/' ? 'text/html'
                : path.endsWith('.css') ? 'text/css' : 'text/javascript; charset=utf-8' }),
            json: async () => manifest, clone() { return this; }, path };
    });
    const cache = {
        put: async (input, response) => {
            const path = typeof input === 'string' ? input : input.url;
            if (path === writeFailure) throw new Error('Cache write failed');
            entries.set(path, response);
        },
        add: async path => entries.set(path, await fetch(path)),
        // Cache.addAll is atomic: no entry changes if any fetch fails.
        addAll: async paths => {
            const results = await Promise.all(paths.map(fetch));
            if (paths.includes(writeFailure)) throw new Error('Cache write failed');
            paths.forEach((p, i) => entries.set(typeof p === 'string' ? p : p.url, results[i]));
        },
        match: async path => entries.get(path),
    };
    const caches = { open: async () => cache, match: cache.match };
    const events = {};
    const self = { addEventListener: (name, fn) => { events[name] = fn; },
        location: { origin: 'https://golf.example' }, skipWaiting: vi.fn() };
    new Function('self', 'caches', 'fetch', 'URL', source)(self, caches, fetch, URL);
    const install = () => { let pending; events.install({ waitUntil: p => { pending = p; } }); return pending; };
    const request = path => {
        let pending;
        events.fetch({ request: { url: `https://golf.example${path}`, method: 'GET', mode: 'cors' },
            respondWith: p => { pending = p; } });
        return pending;
    };
    return { install, request, entries, caches, self, fetch };
}

describe('first installation prepares the actual offline boot', () => {
    it('caches the shell and every generated JS/CSS asset before activating', async () => {
        const w = worker();
        await w.install();
        for (const path of ['/', ...assets]) expect(await w.caches.match(path), path).toBeTruthy();
        expect(w.self.skipWaiting).toHaveBeenCalledOnce();
    });

    it('does not activate or replace the old shell when a required asset fails', async () => {
        const w = worker({ unavailable: assets[0] });
        const oldShell = { path: 'previous working shell' };
        w.entries.set('/', oldShell);
        await expect(w.install()).rejects.toThrow();
        expect(w.self.skipWaiting).not.toHaveBeenCalled();
        expect(await w.caches.match('/')).toBe(oldShell);
    });

    it.each(assets)('preserves the old shell when %s returns the Hosting HTML fallback', async fallback => {
        const w = worker({ fallback });
        const oldShell = { path: 'previous working shell' };
        w.entries.set('/', oldShell);
        await expect(w.install()).rejects.toThrow();
        expect(w.self.skipWaiting).not.toHaveBeenCalled();
        expect(await w.caches.match('/')).toBe(oldShell);
        expect(await w.caches.match(fallback)).toBeUndefined();
    });

    it('preserves the old shell when storing a required asset fails', async () => {
        const w = worker({ writeFailure: assets[0] });
        const oldShell = { path: 'previous working shell' };
        w.entries.set('/', oldShell);
        await expect(w.install()).rejects.toThrow();
        expect(w.self.skipWaiting).not.toHaveBeenCalled();
        expect(await w.caches.match('/')).toBe(oldShell);
    });

    it.each([[], ['https://external.example/script.js'], ['/api/private.json'], ['/assets/x.js?token=no']].map(manifest => ({ manifest })))(
        'rejects a missing or non-build manifest: %j', async ({ manifest }) => {
            const w = worker({ manifest });
            await expect(w.install()).rejects.toThrow();
            expect(w.self.skipWaiting).not.toHaveBeenCalled();
        });

    it('does not install from a cross-origin redirected manifest', async () => {
        const w = worker({ manifestType: 'cors' });
        await expect(w.install()).rejects.toThrow();
        expect(w.self.skipWaiting).not.toHaveBeenCalled();
    });

    it.each(['/assets/index-test.js', '/assets/index-test.css'])(
        'serves public build asset %s despite the module request Origin variant', async path => {
            const w = worker();
            const cached = { path, cached: true };
            w.caches.match = vi.fn(async (_req, options) => options?.ignoreVary ? cached : undefined);
            expect(await w.request(path)).toBe(cached);
            expect(w.fetch).not.toHaveBeenCalled();
        });

    it('does not relax Vary matching for other resources or intercept an API', async () => {
        const w = worker();
        w.caches.match = vi.fn(async () => undefined);
        await w.request('/icons/example.png');
        expect(w.caches.match.mock.calls.every(([, options]) => !options?.ignoreVary)).toBe(true);
        w.fetch.mockClear();
        expect(w.request('/api/private.json')).toBeUndefined();
        expect(w.fetch).not.toHaveBeenCalled();
    });
});
