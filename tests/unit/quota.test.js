import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// functions/quota.js is CommonJS and lives outside src/; require it directly so
// this stays a pure unit test (no emulator, no firebase-admin).
const require = createRequire(import.meta.url);
const { checkAndConsumeQuota, utcDay } = require('../../functions/quota.js');

// Minimal Firestore stand-in modelling only what checkAndConsumeQuota uses:
// collection().doc().collection().doc() path building + runTransaction with
// tx.get / tx.set({ merge: true }).
function fakeDb() {
    const store = new Map();
    const ref = (path) => ({
        path,
        collection: (c) => ({ doc: (d) => ref(`${path}/${c}/${d}`) }),
    });
    return {
        store,
        collection: (c) => ({ doc: (d) => ref(`${c}/${d}`) }),
        async runTransaction(fn) {
            return fn({
                async get(r) {
                    const data = store.get(r.path);
                    return { exists: data !== undefined, data: () => data };
                },
                set(r, value, opts) {
                    const prev = opts && opts.merge ? store.get(r.path) || {} : {};
                    store.set(r.path, { ...prev, ...value });
                },
            });
        },
    };
}

const FieldValue = { serverTimestamp: () => 'ts' };
const consume = (db, uid, over = {}) =>
    checkAndConsumeQuota(db, uid, FieldValue, { limit: 3, day: '2026-07-02', ...over });

describe('checkAndConsumeQuota', () => {
    it('allows calls up to the limit, then rejects with resource-exhausted', async () => {
        const db = fakeDb();
        await consume(db, 'alice'); // 1
        await consume(db, 'alice'); // 2
        await consume(db, 'alice'); // 3 (== limit)
        await expect(consume(db, 'alice')).rejects.toMatchObject({ code: 'resource-exhausted' });
    });

    it('writes to quotas/{uid}/daily/{day} and increments a shared counter', async () => {
        const db = fakeDb();
        await consume(db, 'alice');
        await consume(db, 'alice');
        expect(db.store.get('quotas/alice/daily/2026-07-02').count).toBe(2);
        expect(db.store.get('quotas/alice/daily/2026-07-02').updatedAt).toBe('ts');
    });

    it('isolates one user from another', async () => {
        const db = fakeDb();
        await consume(db, 'alice');
        await consume(db, 'alice');
        await consume(db, 'alice'); // alice maxed
        await expect(consume(db, 'alice')).rejects.toMatchObject({ code: 'resource-exhausted' });
        await expect(consume(db, 'bob')).resolves.toBeUndefined(); // bob has full allowance
    });

    it('resets on a new day (counter keyed by yyyy-mm-dd)', async () => {
        const db = fakeDb();
        await consume(db, 'alice', { day: '2026-07-02' });
        await consume(db, 'alice', { day: '2026-07-02' });
        await consume(db, 'alice', { day: '2026-07-02' });
        await expect(consume(db, 'alice', { day: '2026-07-02' })).rejects.toMatchObject({ code: 'resource-exhausted' });
        await expect(consume(db, 'alice', { day: '2026-07-03' })).resolves.toBeUndefined();
    });

    it('rejects a missing uid with invalid-argument (never silently uncapped)', async () => {
        const db = fakeDb();
        await expect(checkAndConsumeQuota(db, undefined, FieldValue, {})).rejects.toMatchObject({ code: 'invalid-argument' });
    });
});

describe('utcDay', () => {
    it('formats yyyy-mm-dd in UTC', () => {
        expect(utcDay(new Date('2026-07-02T23:59:00Z'))).toBe('2026-07-02');
    });
});
