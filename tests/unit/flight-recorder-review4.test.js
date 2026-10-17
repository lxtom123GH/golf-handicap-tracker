// Codex review 4 of PR #37: ownership is stamped on every persisted batch, so a
// session whose isolation failed can never be exported or uploaded later as
// another account's.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), writeBatch: vi.fn(), deleteDoc: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
import { noteAccount } from '../../src/diagnostics/hooks.js';
import { createRecorder } from '../../src/diagnostics/recorder.js';
import { createCloudUploader } from '../../src/diagnostics/cloud-upload.js';
import { createStorage } from '../vitest.setup.js';

const noTimer = { setTimeout: () => 1, clearTimeout: () => {} };
function sharedBackend() {
    const rows = new Map();
    return { rows, name: 'idb', async put(b, j) { rows.set(b.key, j); return {}; }, async keys() { return [...rows.keys()].sort(); }, async get(k) { const v = rows.get(k); return v ? { key: k, ...JSON.parse(v) } : null; }, async list() { return (await this.keys()).map(k => ({ key: k, ...JSON.parse(rows.get(k)) })); }, async clear() { rows.clear(); } };
}

describe('P1 a failed-isolation session cannot surface under a later account', () => {
    it('A confirmed; B (tag read throws) records + flushes; A again: B\'s batch is excluded from export and upload', async () => {
        const be = sharedBackend();
        const tags = createStorage();
        // Page 1: A signs in, confirmed, records.
        const recA = createRecorder({ backends: [be], storage: createStorage(), ...noTimer, sessionId: 'aaaaaaaaaaaa' });
        expect(await noteAccount('uidA', recA, tags)).toBe(true);
        recA.record('hole', { hole: 1 }); await recA.flush();
        // Page 2: B signs in but the ownership tag cannot be read: not confirmed.
        const recB = createRecorder({ backends: [be], storage: createStorage(), ...noTimer, sessionId: 'bbbbbbbbbbbb' });
        const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
        expect(await noteAccount('uidB', recB, broken)).toBe(false);
        recB.record('hole', { hole: 2 }); await recB.flush();
        expect(be.rows.size).toBe(2); // B's events were persisted (unowned)
        // Page 3: A signs in again; tag matches.
        const recA2 = createRecorder({ backends: [be], storage: createStorage(), ...noTimer, sessionId: 'cccccccccccc' });
        expect(await noteAccount('uidA', recA2, tags)).toBe(true);
        const snap = await recA2.snapshot();
        const holes = snap.batches.flatMap(b => b.events).filter(e => e.k === 'hole').map(e => e.hole);
        expect(holes).toEqual([1]);
        // And the uploader skips it.
        const writes = [];
        const up = createCloudUploader({ isolation: () => 'confirmed', rec: recA2, storage: createStorage(), online: () => true, getConfig: async () => ({ enabled: true, uid: 'uidA' }), writeChunk: async (u, id) => { writes.push(id); } });
        await up.start('uidA');
        await up.tick(); await up.tick(); await up.tick();
        expect(writes).toEqual(['aaaaaaaaaaaa_0']);
    });
});
