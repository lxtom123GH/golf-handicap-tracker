import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv;

beforeAll(async () => {
    // Requires the Firebase emulator to be running!
    testEnv = await initializeTestEnvironment({
        projectId: 'demo-golf-tracker',
        firestore: {
            rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            port: 8080
        },
    });
});

beforeEach(async () => {
    await testEnv.clearFirestore();
});

afterAll(async () => {
    await testEnv.cleanup();
});

describe('Firebase Security Rules - WHS Rounds', () => {
    it('Should deny unauthenticated users from reading rounds', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        const q = unauthedDb.collection('whs_rounds');
        await assertFails(q.get());
    });

    it('Should allow approved users to read their rounds and deny creating for others', async () => {
        // Setup approved user
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('alice').set({ isApproved: true, isAdmin: false });
        });

        const aliceDb = testEnv.authenticatedContext('alice').firestore();

        // Read succeeds
        await assertSucceeds(aliceDb.collection('whs_rounds').get());

        // Write to self succeeds
        await assertSucceeds(aliceDb.collection('whs_rounds').add({
            uid: 'alice',
            course: 'Pebble Beach',
            adjustedGross: 80,
            rating: 72,
            slope: 113
        }));

        // Write to other user fails
        await assertFails(aliceDb.collection('whs_rounds').add({
            uid: 'bob',
            course: 'Augusta',
            adjustedGross: 80,
            rating: 72,
            slope: 113
        }));
    });

    it('Should deny bad round data creation', async () => {
        // Setup approved user
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('bob').set({ isApproved: true, isAdmin: false });
        });

        const bobDb = testEnv.authenticatedContext('bob').firestore();

        // Write with bad data (adjusted gross too high) fails
        await assertFails(bobDb.collection('whs_rounds').add({
            uid: 'bob',
            course: 'Pebble Beach',
            adjustedGross: 500, // Invalid, max 200
            rating: 72,
            slope: 113
        }));
    });
    it('Should allow admin to create rounds for other users', async () => {
        // Setup admin user
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('admin_user').set({ isApproved: true, isAdmin: true });
        });

        const adminDb = testEnv.authenticatedContext('admin_user').firestore();

        // Write to other user succeeds
        await assertSucceeds(adminDb.collection('whs_rounds').add({
            uid: 'someOtherUser',
            course: 'Augusta',
            adjustedGross: 80,
            rating: 72,
            slope: 113
        }));
    });
});

describe('Firebase Security Rules - AI quota counters (BL-DD-01)', () => {
    // quotas/{uid}/daily/{day}: server (Admin SDK) writes only; a user may read
    // their own counter but never write it, and never read anyone else's.
    const dayDoc = (db, uid, day) => db.collection('quotas').doc(uid).collection('daily').doc(day);

    it('lets a user read their OWN daily quota counter', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await dayDoc(context.firestore(), 'alice', '2026-07-02').set({ count: 3 });
        });
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        await assertSucceeds(dayDoc(aliceDb, 'alice', '2026-07-02').get());
    });

    it("denies reading another user's quota counter", async () => {
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        await assertFails(dayDoc(aliceDb, 'bob', '2026-07-02').get());
    });

    it('denies a client writing (inflating/resetting) any quota counter', async () => {
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        await assertFails(dayDoc(aliceDb, 'alice', '2026-07-02').set({ count: 0 }));
    });

    it('denies an unauthenticated client from touching quota counters', async () => {
        const anonDb = testEnv.unauthenticatedContext().firestore();
        await assertFails(dayDoc(anonDb, 'alice', '2026-07-02').get());
        await assertFails(dayDoc(anonDb, 'alice', '2026-07-02').set({ count: 0 }));
    });
});
