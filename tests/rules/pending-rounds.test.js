// @vitest-environment node
//
// MARKER-ATTESTED CARDS — the security rules.
//
// One player marks the card for the fourball; each player signs their own. The
// design exists so that `whs_rounds` NEVER has to allow a write for somebody
// else: approving writes the round under the approver's own credentials, and a
// pending card is a proposal carrying no handicap weight until then.
//
// So the tests that matter are about who may turn a proposal into a record. The
// single most important one is that a MARKER CANNOT APPROVE THEIR OWN PROPOSAL —
// without that, "attestation" is just a two-step way of writing into someone
// else's handicap record, and the whole design is theatre.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv;

const MARKER = 'markeruser0000000000000000';
const PLAYER = 'playeruser0000000000000000';
const STRANGER = 'stranger00000000000000000';

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

const card = (extra = {}) => ({
    uid: PLAYER,
    playerUid: PLAYER,
    playerName: 'Dad',
    markerUid: MARKER,
    markerName: 'Alex',
    status: 'pending',
    course: 'Keperra',
    adjustedGross: 84,
    rating: 70.5,
    slope: 124,
    holesPlayed: 18,
    ...extra,
});

async function seedPending(id = 'p1', extra = {}) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection('pending_rounds').doc(id).set(card(extra));
    });
}

describe('Proposing a card', () => {
    it('lets a marker propose a card to another player', async () => {
        await assertSucceeds(db(MARKER).collection('pending_rounds').add(card()));
    });

    it('refuses a proposal that names somebody else as the marker', async () => {
        await assertFails(
            db(STRANGER).collection('pending_rounds').add(card())      // markerUid is MARKER
        );
    });

    it('refuses a card proposed to yourself', async () => {
        // Your own round is written directly; a self-proposal is a card you
        // would have to sign twice, and it would muddy the audit trail.
        await assertFails(
            db(MARKER).collection('pending_rounds').add(card({ playerUid: MARKER }))
        );
    });

    it('refuses a proposal that arrives already approved', async () => {
        await assertFails(
            db(MARKER).collection('pending_rounds').add(card({ status: 'approved' }))
        );
    });

    it('applies the same plausibility guard as a real round', async () => {
        await assertFails(
            db(MARKER).collection('pending_rounds').add(card({ adjustedGross: 900 }))
        );
        await assertFails(
            db(MARKER).collection('pending_rounds').add(card({ adjustedGross: 'eighty' }))
        );
    });
});

describe('Signing a card — who decides', () => {
    it('lets the player approve their own card', async () => {
        await seedPending();
        await assertSucceeds(
            db(PLAYER).collection('pending_rounds').doc('p1').update({ status: 'approved' })
        );
    });

    it('lets the player decline it', async () => {
        await seedPending();
        await assertSucceeds(
            db(PLAYER).collection('pending_rounds').doc('p1').update({ status: 'declined' })
        );
    });

    it('REFUSES the marker approving their own proposal', async () => {
        // The test this whole design exists for. If a marker can sign the card
        // they wrote, "attestation" is a two-step way of writing into someone
        // else's handicap record.
        await seedPending();
        await assertFails(
            db(MARKER).collection('pending_rounds').doc('p1').update({ status: 'approved' })
        );
    });

    it('refuses a stranger approving it', async () => {
        await seedPending();
        await assertFails(
            db(STRANGER).collection('pending_rounds').doc('p1').update({ status: 'approved' })
        );
    });

    it('refuses reassigning a card to a different player while signing it', async () => {
        await seedPending();
        await assertFails(
            db(PLAYER).collection('pending_rounds').doc('p1')
                .update({ status: 'approved', playerUid: STRANGER })
        );
    });

    it('refuses rewriting who marked it', async () => {
        await seedPending();
        await assertFails(
            db(PLAYER).collection('pending_rounds').doc('p1')
                .update({ status: 'approved', markerUid: PLAYER })
        );
    });

    it('refuses a status that is neither approved nor declined', async () => {
        await seedPending();
        await assertFails(
            db(PLAYER).collection('pending_rounds').doc('p1').update({ status: 'whatever' })
        );
    });
});

describe('Seeing a card', () => {
    it('is visible to the player and to the marker, and to nobody else', async () => {
        await seedPending();
        await assertSucceeds(db(PLAYER).collection('pending_rounds').doc('p1').get());
        // The marker needs to know whether it was accepted.
        await assertSucceeds(db(MARKER).collection('pending_rounds').doc('p1').get());
        await assertFails(db(STRANGER).collection('pending_rounds').doc('p1').get());
    });

    it('can be cleared away by either party once settled', async () => {
        await seedPending('p1');
        await seedPending('p2');
        await assertSucceeds(db(PLAYER).collection('pending_rounds').doc('p1').delete());
        await assertSucceeds(db(MARKER).collection('pending_rounds').doc('p2').delete());
    });

    it('cannot be deleted by a stranger', async () => {
        await seedPending();
        await assertFails(db(STRANGER).collection('pending_rounds').doc('p1').delete());
    });
});

describe('The handicap record itself is untouched by any of this', () => {
    it('a marker still cannot write the player\'s round directly', async () => {
        // The whole point: pending_rounds exists so whs_rounds never has to
        // allow this. If this ever starts passing, the design has been undone.
        await assertFails(
            db(MARKER).collection('whs_rounds').add({
                uid: PLAYER, course: 'Keperra', adjustedGross: 84,
                rating: 70.5, slope: 124, holesPlayed: 18, date: new Date(),
            })
        );
    });

    it('the player writing their OWN round still works', async () => {
        await assertSucceeds(
            db(PLAYER).collection('whs_rounds').add({
                uid: PLAYER, course: 'Keperra', adjustedGross: 84,
                rating: 70.5, slope: 124, holesPlayed: 18, date: new Date(),
            })
        );
    });
});
