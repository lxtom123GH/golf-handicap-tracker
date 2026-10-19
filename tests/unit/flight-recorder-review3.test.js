// Codex review 3 of PR #37: export must not hand over another account's stored journal.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), writeBatch: vi.fn(), deleteDoc: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
import { noteAccount, accountIsolation } from '../../src/diagnostics/hooks.js';
import { exportDiagnostics } from '../../src/diagnostics/panel.js';
import { createRecorder } from '../../src/diagnostics/recorder.js';
import { createStorage } from '../vitest.setup.js';

const noTimer = { setTimeout: () => 1, clearTimeout: () => {} };

function recWithOldBatch() {
    const rows = new Map([['000000000000001|aaaaaaaaaaaa|0|10|1', JSON.stringify({ sid: 'aaaaaaaaaaaa', seq: 0, build: 'v7.0.0+unknown', t: 1, events: [{ t: 1, k: 'hole', hole: 17 }] })]]);
    const be = { name: 'idb', async put(b, j) { rows.set(b.key, j); return {}; }, async keys() { return [...rows.keys()]; }, async get(k) { return { key: k, ...JSON.parse(rows.get(k)) }; }, async list() { return [...rows.keys()].map(k => ({ key: k, ...JSON.parse(rows.get(k)) })); }, async clear() { throw new Error('refused'); } };
    return createRecorder({ backends: [be], storage: createStorage(), ...noTimer, sessionId: 'bbbbbbbbbbbb' });
}

async function exportedJson(rec) {
    let blobText = null;
    const RealBlob = globalThis.Blob;
    globalThis.Blob = class extends RealBlob { constructor(parts, o) { super(parts, o); blobText = parts.join(''); } };
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
    try { const res = await exportDiagnostics(rec, {}, document); return { res, out: JSON.parse(blobText) }; }
    finally { globalThis.Blob = RealBlob; }
}

describe('P1 export is gated on confirmed account isolation', () => {
    it('isolation failed: the export carries this session only, never stored batches', async () => {
        const rec = recWithOldBatch();
        expect(await noteAccount('uidB', rec, createStorage())).toBe(false); // clear refused
        expect(accountIsolation()).toBe('failed');
        rec.record('hole', { hole: 2 });
        const { res, out } = await exportedJson(rec);
        const holes = out.batches.flatMap(b => b.events).filter(e => e.k === 'hole').map(e => e.hole);
        expect(holes).toEqual([2]);
        expect(out.scope).toBe('this-session-only');
        expect(res.msg).toMatch(/only this session/i);
    });
    it('isolation confirmed: stored batches are included', async () => {
        const rows = new Map();
        const be = { name: 'idb', async put(b, j) { rows.set(b.key, j); return {}; }, async keys() { return [...rows.keys()]; }, async get(k) { return { key: k, ...JSON.parse(rows.get(k)) }; }, async list() { return [...rows.keys()].map(k => ({ key: k, ...JSON.parse(rows.get(k)) })); }, async clear() { rows.clear(); } };
        const rec = createRecorder({ backends: [be], storage: createStorage(), ...noTimer });
        expect(await noteAccount('uidC', rec, createStorage())).toBe(true);
        expect(accountIsolation()).toBe('confirmed');
        rec.record('hole', { hole: 4 }); await rec.flush();
        const { out } = await exportedJson(rec);
        expect(out.scope).toBe('all-stored');
        expect(out.batches.find(b => b.status === 'committed').events[0].hole).toBe(4);
    });
});
