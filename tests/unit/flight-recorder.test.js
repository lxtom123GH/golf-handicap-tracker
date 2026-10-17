// Flight recorder core (src/diagnostics/recorder.js): caps, statuses,
// async storage failure, fallback, clear, export and trackWrite.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRecorder, localBackend, idbBackend, CAPS, LOCAL_KEY, CLEARED_KEY, ENABLED_KEY, trackWrite, fr, recorder, _resetRecorderForTests, releaseRecorderStorage } from '../../src/diagnostics/recorder.js';
import { createStorage } from '../vitest.setup.js';

function memBackend(name = 'idb') {
    const rows = new Map();
    return {
        name, rows,
        async put(b, json) { rows.set(b.key, json); return { evicted: 0 }; },
        async keys() { return [...rows.keys()].sort(); },
        async get(k) { const v = rows.get(k); return v ? { key: k, ...JSON.parse(v) } : null; },
        async list() { return Promise.all((await this.keys()).map(k => this.get(k))); },
        async clear() { rows.clear(); },
    };
}
function failingBackend(name = 'idb', err = Object.assign(new Error('abort'), { name: 'AbortError' })) {
    return { name, async put() { await Promise.resolve(); throw err; }, async keys() { throw err; }, async get() { throw err; }, async list() { throw err; }, async clear() { throw err; } };
}
function clock(start = 1_760_000_000_000) {
    let t = start;
    return { now: () => t, tick: ms => { t += ms; } };
}
const noTimer = { setTimeout: () => 1, clearTimeout: () => {} };

describe('record(): sanitize first, hard caps, counters', () => {
    it('queues sanitized events only and counts invalid ones as dropped', () => {
        const c = clock();
        const r = createRecorder({ backends: [memBackend()], storage: createStorage(), now: c.now, ...noTimer, build: 'v7.0.0+unknown', sessionId: 'abcdefabcdef' });
        expect(r.record('gps', { acc: 5, email: 'a@b.co', lat: -27 })).toBe(true);
        expect(r.record('free-text', { msg: 'x' })).toBe(false);
        const s = r.status();
        expect(s.queued).toBe(1);
        expect(s.dropped).toBe(1);
        expect(s.dropReasons).toEqual({ invalid: 1 });
    });

    it('enforces the per-minute cap and the queue cap with exact numbers', () => {
        const c = clock();
        const r = createRecorder({ backends: [memBackend()], storage: createStorage(), now: c.now, ...noTimer });
        for (let i = 0; i < CAPS.PER_MINUTE + 30; i++) r.record('score', { hole: 1 });
        expect(r.status().recorded).toBe(CAPS.PER_MINUTE);
        expect(r.status().dropReasons.rate).toBe(30);
        // Next minutes: the queue (no flush, timers stubbed) caps at QUEUE_EVENTS.
        for (let m = 0; m < 3; m++) { c.tick(60000); for (let i = 0; i < CAPS.PER_MINUTE; i++) r.record('score', { hole: 1 }); }
        expect(r.status().queued).toBe(CAPS.QUEUE_EVENTS);
        expect(r.status().dropReasons.queue).toBe(CAPS.PER_MINUTE * 4 - CAPS.QUEUE_EVENTS);
    });

    it('an event storm costs bounded time and never throws', () => {
        const r = createRecorder({ backends: [memBackend()], storage: createStorage(), ...noTimer });
        const huge = { hole: 1, junk: 'x'.repeat(1_000_000) };
        const t0 = performance.now();
        for (let i = 0; i < 20000; i++) r.record('gps', huge);
        expect(performance.now() - t0).toBeLessThan(2000);
        expect(r.status().recorded).toBe(CAPS.PER_MINUTE);
    });

    it('a throwing getter or a hostile fields object does not reach the caller', () => {
        const r = createRecorder({ backends: [memBackend()], storage: createStorage(), ...noTimer });
        const evil = new Proxy({}, { ownKeys() { throw new Error('boom'); } });
        expect(() => r.record('gps', evil)).not.toThrow();
        const g = {}; Object.defineProperty(g, 'hole', { enumerable: true, get() { throw new Error('x'); } });
        expect(() => r.record('gps', g)).not.toThrow();
    });
});

describe('queued -> committed -> failed are distinct', () => {
    it('committed only after the backend reports success', async () => {
        const be = memBackend();
        const r = createRecorder({ backends: [be], storage: createStorage(), ...noTimer });
        r.record('hole', { hole: 2 });
        expect(r.status()).toMatchObject({ queued: 1, committed: 0, failed: 0 });
        await r.flush();
        expect(r.status()).toMatchObject({ queued: 0, committed: 1, failed: 0, storage: 'idb' });
        expect(be.rows.size).toBe(1);
    });

    it('async IndexedDB failure falls back to localStorage, never throws', async () => {
        const st = createStorage();
        const r = createRecorder({ backends: [failingBackend(), localBackend(st)], storage: st, ...noTimer });
        r.record('hole', { hole: 3 });
        await expect(r.flush()).resolves.toBeUndefined();
        expect(r.status()).toMatchObject({ committed: 1, failed: 0, storage: 'local', lastFailCode: 'AbortError' });
        const stored = JSON.parse(st.getItem(LOCAL_KEY));
        expect(JSON.parse(stored[0].json).events[0]).toMatchObject({ k: 'hole', hole: 3 });
    });

    it('when every store fails the events are FAILED, kept in memory and exported as such', async () => {
        const st = createStorage();
        const r = createRecorder({ backends: [failingBackend(), failingBackend('local')], storage: st, ...noTimer });
        r.record('hole', { hole: 4 });
        await r.flush();
        expect(r.status()).toMatchObject({ committed: 0, failed: 1, storage: 'memory' });
        const snap = await r.snapshot();
        expect(snap.batches.find(b => b.status === 'failed').events[0]).toMatchObject({ k: 'hole', hole: 4 });
    });

    it('a real IndexedDB open error is caught (no indexedDB / open throws / onerror)', async () => {
        await expect(idbBackend(undefined).put({ key: 'k', events: [] }, '{}')).rejects.toThrow();
        const throwing = { open() { throw new Error('SecurityError'); } };
        await expect(idbBackend(throwing).put({ key: 'k', events: [] }, '{}')).rejects.toThrow('SecurityError');
        const erroring = { open() { const req = {}; setTimeout(() => { req.error = new Error('UnknownError'); req.onerror(); }, 0); return req; } };
        await expect(idbBackend(erroring).put({ key: 'k', events: [] }, '{}')).rejects.toThrow('UnknownError');
        const hanging = { open() { return {}; } };
        await expect(idbBackend(hanging, { timeoutMs: 20 }).put({ key: 'k', events: [] }, '{}')).rejects.toThrow('timeout');
    });

    it('repeated internal faults self-disable the recorder; the app is unaffected', () => {
        const r = createRecorder({ backends: [memBackend()], storage: createStorage(), setTimeout: () => { throw new Error('no timers'); }, clearTimeout: () => {} });
        for (let i = 0; i < 10; i++) expect(() => r.record('hole', { hole: 1 })).not.toThrow();
        expect(r.status().disabledReason).toBe('recorder-faults');
        expect(r.record('hole', { hole: 1 })).toBe(false);
    });
});

describe('flush scheduling', () => {
    it('an empty flush (e.g. pagehide with nothing queued) does not wedge later flushes', async () => {
        const be = memBackend();
        const r = createRecorder({ backends: [be], storage: createStorage() });
        await r.flush();
        r.record('hole', { hole: 1 });
        await r.flush();
        expect(r.status().committed).toBe(1);
    });
    it('the real timer flushes queued events after FLUSH_MS', async () => {
        vi.useFakeTimers();
        try {
            const r = createRecorder({ backends: [memBackend()], storage: createStorage() });
            await r.flush();
            r.record('hole', { hole: 1 });
            await vi.advanceTimersByTimeAsync(CAPS.FLUSH_MS + 10);
            expect(r.status()).toMatchObject({ committed: 1, queued: 0 });
        } finally { vi.useRealTimers(); }
    });
});

describe('reload: flushed vs unflushed tail', () => {
    it('a reload recovers committed batches only; the unflushed tail is honestly absent', async () => {
        const be = memBackend();
        const st = createStorage();
        const a = createRecorder({ backends: [be], storage: st, ...noTimer, sessionId: 'aaaaaaaaaaaa', owner: '0123456789abcdef' });
        a.record('hole', { hole: 1 });
        await a.flush();
        a.record('hole', { hole: 2 }); // still queued when the page dies
        expect(a.status()).toMatchObject({ committed: 1, queued: 1 });
        const b = createRecorder({ backends: [be], storage: st, ...noTimer, sessionId: 'bbbbbbbbbbbb', owner: '0123456789abcdef' }); // the reloaded page
        const snap = await b.snapshot();
        expect(snap.batches.map(x => [x.sid, x.status, x.events.map(e => e.hole)])).toEqual([['aaaaaaaaaaaa', 'committed', [1]]]);
        expect(snap.storedEvents).toBe(1);
    });
});

describe('localStorage fallback: small budget, own key only', () => {
    it('stays under LOCAL_BYTES by evicting its own oldest batches', async () => {
        const st = createStorage();
        const be = localBackend(st);
        const c = clock();
        const r = createRecorder({ backends: [be], storage: st, now: c.now, ...noTimer });
        for (let i = 0; i < 40; i++) {
            c.tick(60000); // stay inside the per-minute cap
            for (let j = 0; j < CAPS.BATCH_EVENTS; j++) r.record('gps', { hole: 1, acc: j, f: 100, c: 110, b: 120, age: 1000, spd: 1.5 });
            await r.flush();
        }
        expect(st.getItem(LOCAL_KEY).length).toBeLessThanOrEqual(CAPS.LOCAL_BYTES);
        expect(r.status().evicted).toBeGreaterThan(0);
        expect(r.status().committed).toBe(40 * CAPS.BATCH_EVENTS);
    });

    it('a quota error removes ONLY its own key and drops to memory; round keys untouched', async () => {
        const st = createStorage();
        st.setItem('golf_round_state', 'ROUND');
        st.setItem('round_backup_1', 'BACKUP');
        st.setItem(LOCAL_KEY, '[]');
        const proto = Object.getPrototypeOf(st);
        const real = proto.setItem;
        const spy = vi.spyOn(proto, 'setItem').mockImplementation(function (k, v) {
            if (k === LOCAL_KEY) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
            return real.call(this, k, v);
        });
        try {
            const r = createRecorder({ backends: [localBackend(st)], storage: st, ...noTimer });
            r.record('hole', { hole: 1 });
            await r.flush();
            expect(r.status()).toMatchObject({ storage: 'memory', failed: 1, lastFailCode: 'QuotaExceededError' });
        } finally { spy.mockRestore(); }
        expect(st.getItem(LOCAL_KEY)).toBeNull();
        expect(st.getItem('golf_round_state')).toBe('ROUND');
        expect(st.getItem('round_backup_1')).toBe('BACKUP');
    });

    it('oversized or corrupt stored data is discarded before parsing', async () => {
        const st = createStorage();
        st.setItem(LOCAL_KEY, '[' + 'x'.repeat(CAPS.LOCAL_BYTES * 3));
        const parse = vi.spyOn(JSON, 'parse');
        const be = localBackend(st);
        expect(await be.list()).toEqual([]);
        expect(parse).not.toHaveBeenCalled();
        parse.mockRestore();
        expect(st.getItem(LOCAL_KEY)).toBeNull();
        st.setItem(LOCAL_KEY, '{not json');
        expect(await be.list()).toEqual([]);
    });
});

describe('clear, toggle and export', () => {
    it('clear empties stores and a late queued event from before the clear is not resurrected', async () => {
        const st = createStorage();
        const be = memBackend();
        const c = clock();
        const r = createRecorder({ backends: [be], storage: st, now: c.now, ...noTimer });
        r.record('hole', { hole: 1 });
        await r.flush();
        // A second tab's recorder queued an event, then this tab clears.
        const other = createRecorder({ backends: [be], storage: st, now: c.now, ...noTimer });
        other.record('hole', { hole: 9 });
        c.tick(10);
        await r.clearAll();
        expect(be.rows.size).toBe(0);
        expect(Number(st.getItem(CLEARED_KEY))).toBe(c.now());
        await other.flush();
        expect(be.rows.size).toBe(0);
    });

    it('turning recording off stops new events and persists the choice', () => {
        const st = createStorage();
        const r = createRecorder({ backends: [memBackend()], storage: st, ...noTimer });
        r.setEnabled(false);
        expect(r.record('hole', { hole: 1 })).toBe(false);
        expect(st.getItem(ENABLED_KEY)).toBe('off');
        const r2 = createRecorder({ backends: [memBackend()], storage: st, ...noTimer });
        expect(r2.status().enabled).toBe(false);
    });

    it('export re-sanitizes stored data (tampered rows) and carries build provenance', async () => {
        const be = memBackend();
        const r = createRecorder({ backends: [be], storage: createStorage(), ...noTimer, build: 'v7.0.0+' + 'b'.repeat(40), owner: '0123456789abcdef' });
        be.rows.set('000000000000001|aaaaaaaaaaaa|0|10|2', JSON.stringify({ sid: 'aaaaaaaaaaaa', seq: 0, build: 'v6.9.0+' + 'a'.repeat(40), t: 1, acct: '0123456789abcdef', events: [
            { t: 1, k: 'gps', acc: 3, email: 'alex@example.com', lat: -27.4 }, { t: 2, k: 'note', msg: 'secret' },
        ] }));
        r.record('hole', { hole: 5 });
        const snap = await r.snapshot();
        const text = JSON.stringify(snap);
        expect(text).not.toContain('alex@example.com');
        expect(text).not.toContain('secret');
        expect(text).not.toContain('-27.4');
        expect(snap.exportBuild).toBe('v7.0.0+' + 'b'.repeat(40));
        expect(snap.batches.map(b => [b.build.slice(0, 6), b.status])).toEqual([['v6.9.0', 'committed'], ['v7.0.0', 'queued']]);
    });
});

describe('trackWrite and the singleton helpers', () => {
    beforeEach(() => { _resetRecorderForTests(); });

    it('returns the SAME promise; ack and rejection are recorded; never-settling stays attempt', async () => {
        const ok = Promise.resolve();
        const bad = Promise.reject(Object.assign(new Error('nope'), { code: 'permission-denied' }));
        bad.catch(() => {}); // the caller's own .catch
        const never = new Promise(() => {});
        expect(trackWrite('shot', ok)).toBe(ok);
        expect(trackWrite('round', bad)).toBe(bad);
        expect(trackWrite('round', never)).toBe(never);
        await new Promise(r => setTimeout(r, 0));
        const snap = await recorder().snapshot();
        const writes = snap.batches.flatMap(b => b.events).filter(e => e.k === 'write').map(e => `${e.kind}:${e.status}${e.code ? ':' + e.code : ''}`);
        expect(writes).toEqual(['shot:attempt', 'round:attempt', 'round:attempt', 'shot:ack', 'round:rejected:permission-denied']);
    });

    it('trackWrite with a broken recorder still returns the promise untouched', () => {
        const p = Promise.resolve(1);
        const spy = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock'); });
        try { expect(trackWrite('shot', p)).toBe(p); expect(fr('hole', { hole: 1 })).toBe(false); } finally { spy.mockRestore(); }
    });

    it('releaseRecorderStorage reports a removal only when its copy existed', () => {
        localStorage.removeItem(LOCAL_KEY);
        expect(releaseRecorderStorage()).toBe(false);
        localStorage.setItem(LOCAL_KEY, '[]');
        expect(releaseRecorderStorage()).toBe(true);
        expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    });
});
