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
});
