// @vitest-environment node
//
// GUEST GOLFERS — the security rules.
//
// The product problem: you play with your dad and your brothers, they have no
// club membership and no account, and you want their cards to build a handicap.
// The obvious implementation — let a marker write a round whose uid is not
// theirs — hands every authenticated user the ability to write into anyone's
// handicap record. In a handicap system the record IS the product, so that
// cannot be the answer.
//
// A guest is a separate identity that YOU own. "Write a round for someone else"
// becomes "write a round for a player who belongs to me", which is checkable.
//
// Most of this file is the attacks, not the happy path. The one that matters
// most is `guests/<victim-uid>`: without the "guest_" prefix requirement anyone
// could create a guest document named after a real golfer, declare themselves
// its owner, and write rounds into that golfer's index. Firebase Auth uids are
// 28-character alphanumerics and never contain an underscore, so the prefix is
// what makes a guest id incapable of naming a real account.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv;

const HOST = 'hostuser000000000000000000';   // 26+ chars, no underscore: a real uid shape
const OTHER = 'otheruser00000000000000000';
const VICTIM = 'victimuser0000000000000000';
const GUEST = 'guest_brother_1';

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'demo-golf-tracker',
        firestore: {
            rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            port: Number(process.env.EMU_FIRESTORE_PORT || 8080)
        },
    });
});

beforeEach(async () => { await testEnv.clearFirestore(); });
afterAll(async () => { await testEnv.cleanup(); });

const db = (uid) => testEnv.authenticatedContext(uid).firestore();

/** Seed a guest owned by HOST, bypassing rules. */
async function seedGuest(guestId = GUEST, ownerUid = HOST) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection('guests').doc(guestId)
            .set({ ownerUid, displayName: 'Brother' });
    });
}

const round = (uid, extra = {}) => ({
    uid,
    course: 'Keperra',
    adjustedGross: 84,
    rating: 70.5,
    slope: 124,
    holesPlayed: 18,
    date: new Date(),
    ...extra,
});

describe('Guest golfers — creating the guest record', () => {
    it('lets a host create a guest they own', async () => {
        await assertSucceeds(
            db(HOST).collection('guests').doc(GUEST)
                .set({ ownerUid: HOST, displayName: 'Brother' })
        );
    });

    it('refuses a guest that names somebody else as owner', async () => {
        await assertFails(
            db(HOST).collection('guests').doc(GUEST)
                .set({ ownerUid: OTHER, displayName: 'Brother' })
        );
    });

    it('REFUSES a guest id that could name a real account', async () => {
        // The attack: create guests/<victim uid>, declare yourself the owner,
        // then write rounds under the victim's uid. The prefix closes it.
        await assertFails(
            db(HOST).collection('guests').doc(VICTIM)
                .set({ ownerUid: HOST, displayName: 'Not really a guest' })
        );
    });

    it('refuses a guest with no name, or an absurd one', async () => {
        await assertFails(
            db(HOST).collection('guests').doc(GUEST).set({ ownerUid: HOST, displayName: '' })
        );
        await assertFails(
            db(HOST).collection('guests').doc(GUEST)
                .set({ ownerUid: HOST, displayName: 'x'.repeat(61) })
        );
    });

    it('refuses an unauthenticated caller', async () => {
        const anon = testEnv.unauthenticatedContext().firestore();
        await assertFails(
            anon.collection('guests').doc(GUEST).set({ ownerUid: HOST, displayName: 'B' })
        );
    });

    it('lets the owner read and rename their guest, and nobody else read it', async () => {
        await seedGuest();
        await assertSucceeds(db(HOST).collection('guests').doc(GUEST).get());
        await assertSucceeds(
            db(HOST).collection('guests').doc(GUEST)
                .update({ displayName: 'Younger brother' })
        );
        await assertFails(db(OTHER).collection('guests').doc(GUEST).get());
    });

    it('refuses handing a guest to somebody else', async () => {
        await seedGuest();
        await assertFails(
            db(HOST).collection('guests').doc(GUEST).update({ ownerUid: OTHER })
        );
    });

    it('lets the owner delete their guest', async () => {
        await seedGuest();
        await assertSucceeds(db(HOST).collection('guests').doc(GUEST).delete());
    });
});

describe('Guest golfers — logging their rounds', () => {
    it('lets the host log a round for a guest they own', async () => {
        await seedGuest();
        await assertSucceeds(
            db(HOST).collection('whs_rounds').add(round(GUEST, { guestOwnerUid: HOST }))
        );
    });

    it('refuses a guest round from somebody who does not own the guest', async () => {
        await seedGuest();                       // owned by HOST
        await assertFails(
            db(OTHER).collection('whs_rounds').add(round(GUEST, { guestOwnerUid: OTHER }))
        );
    });

    it('refuses a guest round that claims an owner it does not have', async () => {
        await seedGuest();
        await assertFails(
            db(OTHER).collection('whs_rounds').add(round(GUEST, { guestOwnerUid: HOST }))
        );
    });

    it('refuses a round for a guest that does not exist', async () => {
        await assertFails(
            db(HOST).collection('whs_rounds').add(round('guest_invented', { guestOwnerUid: HOST }))
        );
    });

    it('STILL refuses writing into a real golfer\'s record', async () => {
        // The original defect this whole design exists to avoid. Claiming the
        // guest-owner field must not buy you a write against a real uid.
        await assertFails(
            db(HOST).collection('whs_rounds').add(round(VICTIM, { guestOwnerUid: HOST }))
        );
        await assertFails(
            db(HOST).collection('whs_rounds').add(round(VICTIM))
        );
    });

    it('still applies the plausibility guard to a guest round', async () => {
        await seedGuest();
        await assertFails(
            db(HOST).collection('whs_rounds')
                .add(round(GUEST, { guestOwnerUid: HOST, adjustedGross: 900 }))
        );
        await assertFails(
            db(HOST).collection('whs_rounds')
                .add(round(GUEST, { guestOwnerUid: HOST, adjustedGross: 'eighty' }))
        );
    });

    it('lets the host read back and correct their guest\'s rounds', async () => {
        await seedGuest();
        let id;
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const ref = await ctx.firestore().collection('whs_rounds')
                .add(round(GUEST, { guestOwnerUid: HOST }));
            id = ref.id;
        });
        await assertSucceeds(db(HOST).collection('whs_rounds').doc(id).get());
        await assertSucceeds(
            db(HOST).collection('whs_rounds').doc(id).update({ adjustedGross: 85 })
        );
        await assertSucceeds(db(HOST).collection('whs_rounds').doc(id).delete());
    });

    it('does not let anyone else read the guest\'s rounds', async () => {
        await seedGuest();
        let id;
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const ref = await ctx.firestore().collection('whs_rounds')
                .add(round(GUEST, { guestOwnerUid: HOST }));
            id = ref.id;
        });
        await assertFails(db(OTHER).collection('whs_rounds').doc(id).get());
    });

    it('the host\'s OWN round still works exactly as before', async () => {
        // The regression guard: adding a route must not disturb the one that
        // every existing save depends on.
        await assertSucceeds(db(HOST).collection('whs_rounds').add(round(HOST)));
        await assertFails(db(HOST).collection('whs_rounds').add(round(OTHER)));
    });
});
