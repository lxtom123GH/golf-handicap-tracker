// ==========================================
// firestore-offline.test.js
// The platform fact the offline fixes rest on — proved, not assumed
// ==========================================
//
// Runs the REAL Firebase SDK against the REAL Firestore emulator, configured
// exactly as src/firebase-config.js configures it, and goes offline with the
// SDK's own disableNetwork(). It asserts one thing:
//
//   While offline, setDoc / addDoc / writeBatch.commit() promises NEVER settle
//   — they do not resolve and they do not reject — while getDocs resolves from
//   the local cache.
//
// That is why `await setDoc(...)` hangs a flow forever offline (F-11, F-12,
// F-18) and why the catch blocks that were supposed to surface the failure
// never ran. tests/unit/offline-writes.test.js stubs exactly this behaviour;
// this file is what licenses that stub.
//
// Needs an emulator: `npm run test:offline` (self-managing via
// `firebase emulators:exec`). It is deliberately OUTSIDE `npm run test:unit`.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    connectFirestoreEmulator, disableNetwork, enableNetwork,
    doc, setDoc, addDoc, collection, getDocs, query, where, writeBatch
} from 'firebase/firestore';

const PENDING = Symbol('pending');

/** Resolve to PENDING if `p` has not settled within `ms`. */
function settledWithin(p, ms) {
    return Promise.race([
        p.then(() => 'resolved', e => `rejected:${e.code || e.message}`),
        new Promise(r => setTimeout(() => r(PENDING), ms))
    ]);
}

let app;
let db;

beforeAll(async () => {
    app = initializeApp({ projectId: 'demo-golf-tracker', apiKey: 'emulator' }, 'offline-proof');
    // Identical to src/firebase-config.js:73-75.
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
    connectFirestoreEmulator(db, '127.0.0.1', Number(process.env.EMU_FIRESTORE_PORT || 8080));
});

afterAll(async () => {
    await enableNetwork(db).catch(() => { });
    await deleteApp(app).catch(() => { });
});

describe('Firestore write promises while offline', () => {
    it('settles a write while ONLINE', async () => {
        const outcome = await settledWithin(setDoc(doc(db, 'shots', 'online-1'), { a: 1 }), 8000);

        // Resolved, or rejected by the rules — either way the SDK ANSWERED.
        expect(outcome).not.toBe(PENDING);
    }, 20000);

    it('never settles setDoc, addDoc or a batch commit while OFFLINE', async () => {
        await disableNetwork(db);

        const [setOutcome, addOutcome, batchOutcome] = await Promise.all([
            settledWithin(setDoc(doc(db, 'shots', 'offline-1'), { a: 2 }), 3000),
            settledWithin(addDoc(collection(db, 'shots'), { a: 3 }), 3000),
            (() => {
                const b = writeBatch(db);
                b.delete(doc(db, 'whs_rounds', 'round_x_u1'));
                return settledWithin(b.commit(), 3000);
            })()
        ]);

        expect(setOutcome).toBe(PENDING);
        expect(addOutcome).toBe(PENDING);
        expect(batchOutcome).toBe(PENDING);

        await enableNetwork(db);
    }, 30000);

    it('still resolves getDocs from the local cache while OFFLINE', async () => {
        await disableNetwork(db);

        // The queued offline write above is visible to a cached read — which is
        // why F-18's getDocs settles and only the batch.commit() after it hangs.
        const snaps = await getDocs(query(collection(db, 'shots'), where('a', '==', 2)));

        expect(snaps.metadata.fromCache).toBe(true);
        expect(snaps.size).toBeGreaterThan(0);

        await enableNetwork(db);
    }, 30000);
});
