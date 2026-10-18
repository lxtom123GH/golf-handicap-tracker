// Codex review 1 of PR #37: one regression test per finding (red first).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    writeBatch: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI: { ocTeeSelect: null, ocAddedPlayersList: null, ocHoleEditorModal: null } }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

import { sanitizeEvent, errorFields } from '../../src/diagnostics/sanitize.js';
import { createRecorder, idbBackend, LOCAL_KEY, _resetRecorderForTests } from '../../src/diagnostics/recorder.js';
import { noteAccount } from '../../src/diagnostics/hooks.js';
import { createCloudUploader, DAY_KEY } from '../../src/diagnostics/cloud-upload.js';
import { writeRoundBackup } from '../../src/persistence.js';
import { createStorage } from '../vitest.setup.js';

const T = 1_760_000_000_000;
const noTimer = { setTimeout: () => 1, clearTimeout: () => {} };

describe('P1 sanitizer: value allowlists, not permissive patterns', () => {
    it('short private values in string fields do not survive', () => {
        const out = sanitizeEvent({ t: T, k: 'error', tee: 'John Smith', name: 'Alex', code: 'abc.def', course: 'johns-house', tab: 'my-secret', src: 'alex.js', round: 'round_abc' });
        expect(out).toEqual({ t: T, k: 'error' });
    });
    it('known values still pass', () => {
        const out = sanitizeEvent({ t: T, k: 'error', name: 'TypeError', code: 'permission-denied', course: 'ashgrove', tab: 'tab-oncourse', src: 'index-ByBMoM4s.js', round: 'round_1760000000000' });
        expect(out).toEqual({ t: T, k: 'error', name: 'TypeError', code: 'permission-denied', course: 'ashgrove', tab: 'tab-oncourse', src: 'index-ByBMoM4s.js', round: 'round_1760000000000' });
        expect(sanitizeEvent({ t: T, k: 'gps_err', code: '1' }).code).toBe('1');
        expect(sanitizeEvent({ t: T, k: 'write', code: 'firestore/unavailable' }).code).toBe('firestore/unavailable');
    });
    it('an arbitrary rejection object cannot smuggle a name or code', () => {
        const f = errorFields({ name: 'Alex', code: 'secret' });
        expect(sanitizeEvent({ t: T, k: 'rejection', ...f })).toEqual({ t: T, k: 'rejection', name: 'Other' });
    });
});

describe('P1 backups keep priority over the recorder\'s localStorage copy', () => {
    beforeEach(() => { localStorage.clear(); _resetRecorderForTests(); });
    it('writeRoundBackup releases the recorder copy and retries on quota', () => {
        localStorage.setItem(LOCAL_KEY, 'x'.repeat(1000));
        const proto = Object.getPrototypeOf(localStorage);
        const real = proto.setItem;
        let calls = 0;
        const spy = vi.spyOn(proto, 'setItem').mockImplementation(function (k, v) {
            if (String(k).startsWith('round_backup_')) {
                calls++;
                if (localStorage.getItem(LOCAL_KEY) !== null) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
            }
            return real.call(this, k, v);
        });
        let key;
        try { key = writeRoundBackup({ roundId: 'round_1', synced: false }); } finally { spy.mockRestore(); }
        expect(calls).toBe(2);
        expect(key).toMatch(/^round_backup_/);
        expect(localStorage.getItem(key)).toContain('round_1');
        expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    });
});

describe('P1 account isolation must be confirmed', () => {
    it('noteAccount returns false when the tag cannot be read, or the clear fails', async () => {
        const broken = { getItem() { throw new Error('x'); }, setItem() {} };
        expect(await noteAccount('uidA', { clearAll: async () => true }, broken)).toBe(false);
        const st = createStorage();
        expect(await noteAccount('uidA', { clearAll: async () => true }, st)).toBe(true);
        expect(await noteAccount('uidB', { clearAll: async () => false }, st)).toBe(false);
        expect(await noteAccount('uidB', { clearAll: async () => true }, st)).toBe(true);
    });
    it('clearAll reports failure when a backend cannot be cleared', async () => {
        const ok = { name: 'idb', async put() { return {}; }, async keys() { return []; }, async get() { return null; }, async list() { return []; }, async clear() {} };
        const bad = { ...ok, name: 'local', async clear() { throw new Error('no'); } };
        expect(await createRecorder({ backends: [ok], storage: createStorage(), ...noTimer }).clearAll()).toBe(true);
        expect(await createRecorder({ backends: [ok, bad], storage: createStorage(), ...noTimer }).clearAll()).toBe(false);
    });
});

describe('P2 the daily upload cap fails closed', () => {
    function up(storage) {
        const rows = new Map();
        const be = { name: 'idb', async put(b, j) { rows.set(b.key, j); return {}; }, async keys() { return [...rows.keys()]; }, async get(k) { const v = rows.get(k); return v ? { key: k, ...JSON.parse(v) } : null; }, async list() { return []; }, async clear() {} };
        const rec = createRecorder({ backends: [be], storage: createStorage(), ...noTimer, sessionId: 'abcdefabcdef', owner: '0123456789abcdef' });
        const writes = [];
        const u = createCloudUploader({ isolation: () => 'confirmed', rec, storage, online: () => true, getConfig: async () => ({ enabled: true, uid: 'U' }), writeChunk: async (a, id) => { writes.push(id); } });
        return { rec, u, writes };
    }
    it('a counter that cannot be written stops uploads', async () => {
        const st = createStorage();
        const proto = Object.getPrototypeOf(st);
        const real = proto.setItem;
        const spy = vi.spyOn(proto, 'setItem').mockImplementation(function (k, v) { if (k === DAY_KEY) throw new Error('full'); return real.call(this, k, v); });
        try {
            const { rec, u, writes } = up(st);
            await u.start('U');
            rec.record('hole', { hole: 1 }); await rec.flush();
            await u.tick();
            expect(writes).toHaveLength(0);
            expect(u.status().reason).toBe('day-cap');
        } finally { spy.mockRestore(); }
    });
    it('a counter that cannot be read stops uploads', async () => {
        const st = { getItem(k) { if (k === DAY_KEY) throw new Error('x'); return null; }, setItem() {}, removeItem() {} };
        const { rec, u, writes } = up(st);
        await u.start('U');
        rec.record('hole', { hole: 1 }); await rec.flush();
        await u.tick();
        expect(writes).toHaveLength(0);
    });
});

describe('P2 IndexedDB prune failure leaves no unhandled rejection', () => {
    it('getAllKeys failing after a committed put resolves cleanly', async () => {
        const unhandled = [];
        const onUnhandled = r => unhandled.push(r);
        process.on('unhandledRejection', onUnhandled);
        try {
            let n = 0;
            const mkTx = () => {
                const idx = ++n;
                const tx = { objectStore: () => ({
                    put() { setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); return {}; },
                    getAllKeys() { const req = {}; setTimeout(() => { req.error = new Error('keys'); req.onerror && req.onerror(); tx.error = new Error('tx'); tx.onerror && tx.onerror(); }, 0); return req; },
                    delete() {},
                }) };
                void idx;
                return tx;
            };
            const db = { transaction: () => mkTx() };
            const fakeIdb = { open() { const req = { result: db }; setTimeout(() => req.onsuccess(), 0); return req; } };
            const res = await idbBackend(fakeIdb).put({ key: 'k', events: [] }, '{}');
            expect(res).toEqual({ evicted: 0 });
            await new Promise(r => setTimeout(r, 20));
            expect(unhandled).toEqual([]);
        } finally { process.off('unhandledRejection', onUnhandled); }
    });
});

describe('P2 export keeps failed events after earlier commits', () => {
    it('partial success then total failure: the failed tail is exported once', async () => {
        let fail = false;
        const rows = new Map();
        const be = { name: 'idb', async put(b, j) { if (fail) throw new Error('down'); rows.set(b.key, j); return {}; }, async keys() { return [...rows.keys()]; }, async get(k) { return { key: k, ...JSON.parse(rows.get(k)) }; }, async list() { return [...rows.keys()].map(k => ({ key: k, ...JSON.parse(rows.get(k)) })); }, async clear() {} };
        const r = createRecorder({ backends: [be], storage: createStorage(), ...noTimer, owner: '0123456789abcdef' });
        r.record('hole', { hole: 1 }); await r.flush();
        fail = true;
        r.record('hole', { hole: 2 }); await r.flush();
        const snap = await r.snapshot();
        const byStatus = Object.fromEntries(snap.batches.map(b => [b.status, b.events.map(e => e.hole)]));
        expect(byStatus).toEqual({ committed: [1], failed: [2] });
    });
});
