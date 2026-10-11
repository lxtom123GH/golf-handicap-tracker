// @vitest-environment node
//
// HOLE PLANS — the security rules (S3 Part A).
//
// A coach (or the player) draws the intended line for a hole once; the
// player's shot records which plan it was scored against. Access: the
// owner and their assigned coach read AND write; an admin reads; anyone
// else is blind. authorUid is enforced to equal the CALLER, so a coach
// cannot write a plan that pretends someone else drew it, and the 48-point
// line cap / 200-char note cap are checked at the door.
//
// The checkpoint question from the spec: a coach of A cannot write plans
// for B, and authorUid is enforced server-side.

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv;

const PLAYER = 'player00000000000000000000';
const COACH = 'coach000000000000000000000';
const STRANGER = 'stranger000000000000000000';
const ADMIN = 'adminuser00000000000000000';
// A coach of a DIFFERENT student — isCoachOf(PLAYER) is false for them.
const OTHER_COACH = 'othercoach000000000000000';

const PLAN = 'users/' + PLAYER + '/holePlans/ashgrove-1';

const LINE = [{ x: 0, y: 0 }, { x: 0, y: 120 }, { x: 0, y: 240 }];

function planPayload(authorUid, line = LINE, note = 'smooth draw') {
    return {
        courseSlug: 'ashgrove',
        physicalHole: 1,
        authorUid,
        authorRole: 'coach',
        line,
        frame: { origin: { lat: -27.4454585, lon: 152.9601132 }, bearing: 42 },
        note,
        updatedAt: new Date().toISOString(),
    };
}

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'golf-handicap-tracker-b677c',
        firestore: {
            rules: readFileSync(resolve('firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            // P030: the wrapper exports the per-run port; 8080 is the
            // fallback for a manually-started emulator.
            port: Number(process.env.EMU_FIRESTORE_PORT || 8080),
        },
    });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        // The player's coach list names COACH — isCoachOf(PLAYER) is true for COACH.
        await db.doc('users/' + PLAYER).set({ email: 'player@test.local', coachUid: COACH });
        await db.doc('users/' + ADMIN).set({ isAdmin: true, email: 'admin@test.local' });
        // OTHER_COACH is the coach of a different student — not of PLAYER.
        await db.doc('users/' + OTHER_COACH).set({ email: 'other-coach@test.local', coachUid: OTHER_COACH });
    });
});

afterAll(async () => {
    await testEnv.cleanup();
});

describe('holePlans: the owner writes their own plan', () => {
    it('the player writes a plan for their own hole', async () => {
        const db = testEnv.authenticatedContext(PLAYER).firestore();
        await assertSucceeds(db.doc(PLAN).set(planPayload(PLAYER, LINE, 'self plan')));
    });
    it('a 48-point line is accepted (the cap, inclusive)', async () => {
        const db = testEnv.authenticatedContext(PLAYER).firestore();
        const line = Array.from({ length: 48 }, (_, i) => ({ x: i, y: i * 5 }));
        await assertSucceeds(db.doc(PLAN).set(planPayload(PLAYER, line)));
    });
    it('a 49-point line is rejected', async () => {
        const db = testEnv.authenticatedContext(PLAYER).firestore();
        const line = Array.from({ length: 49 }, (_, i) => ({ x: i, y: i * 5 }));
        await assertFails(db.doc(PLAN).set(planPayload(PLAYER, line)));
    });
    it('a note over 200 chars is rejected', async () => {
        const db = testEnv.authenticatedContext(PLAYER).firestore();
        await assertFails(db.doc(PLAN).set(planPayload(PLAYER, LINE, 'x'.repeat(201))));
    });
    it('a plan claiming another author is rejected', async () => {
        const db = testEnv.authenticatedContext(PLAYER).firestore();
        await assertFails(db.doc(PLAN).set(planPayload(COACH)));
    });
    it('a single-point line is rejected (a line needs two points)', async () => {
        const db = testEnv.authenticatedContext(PLAYER).firestore();
        await assertFails(db.doc(PLAN).set(planPayload(PLAYER, [LINE[0]])));
    });
});

describe('holePlans: the assigned coach', () => {
    it('the coach of the player writes the player\'s plan', async () => {
        const db = testEnv.authenticatedContext(COACH).firestore();
        await assertSucceeds(db.doc(PLAN).set(planPayload(COACH)));
    });
    it('a coach of A cannot write plans for B', async () => {
        const db = testEnv.authenticatedContext(COACH).firestore();
        // COACH is the coach of PLAYER only; STRANGER has no coach.
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().doc('users/' + STRANGER).set({ email: 'stranger@test.local' });
        });
        await assertFails(db.doc('users/' + STRANGER + '/holePlans/ashgrove-1').set(planPayload(COACH)));
    });
    it('the coach reads the player\'s plan', async () => {
        const db = testEnv.authenticatedContext(COACH).firestore();
        await assertSucceeds(db.doc(PLAN).get());
    });
});

describe('holePlans: everyone else', () => {
    beforeAll(async () => {
        // Seed one plan (rules disabled) for the read tests.
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().doc(PLAN).set(planPayload(COACH));
        });
    });
    it('a stranger cannot read the player\'s plan', async () => {
        const db = testEnv.authenticatedContext(STRANGER).firestore();
        await assertFails(db.doc(PLAN).get());
    });
    it('a stranger cannot write the player\'s plan', async () => {
        const db = testEnv.authenticatedContext(STRANGER).firestore();
        await assertFails(db.doc(PLAN).set(planPayload(STRANGER)));
    });
    it('an unauthenticated client is refused', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(db.doc(PLAN).get());
        await assertFails(db.doc(PLAN).set(planPayload(STRANGER)));
    });
    it('an admin reads but cannot write the player\'s plan', async () => {
        const db = testEnv.authenticatedContext(ADMIN).firestore();
        await assertSucceeds(db.doc(PLAN).get());
        await assertFails(db.doc(PLAN).set(planPayload(ADMIN)));
    });
});

// S3 Part B: the create/update-vs-delete split — a delete has no
// request.resource.data, so the payload checks would make every delete
// fail if they stayed on `allow write`. Delete is its own rule: the owner
// or the coach of the owner, nobody else.
describe('Firebase Security Rules - hole plans delete split (S3 Part B)', () => {
    it('the owner deletes their own plan', async () => {
        const db = testEnv.authenticatedContext(PLAYER).firestore();
        await assertSucceeds(db.doc(PLAN).delete());
    });
    it('an assigned coach deletes the player\'s plan', async () => {
        const db = testEnv.authenticatedContext(COACH).firestore();
        await assertSucceeds(db.doc(PLAN).delete());
    });
    it('a stranger cannot delete the player\'s plan', async () => {
        const db = testEnv.authenticatedContext(STRANGER).firestore();
        await assertFails(db.doc(PLAN).delete());
    });
    it('an admin cannot delete the player\'s plan (read-only by design)', async () => {
        const db = testEnv.authenticatedContext(ADMIN).firestore();
        await assertFails(db.doc(PLAN).delete());
    });
    it('a coach of a DIFFERENT player cannot delete the plan', async () => {
        const db = testEnv.authenticatedContext(OTHER_COACH).firestore();
        await assertFails(db.doc(PLAN).delete());
    });
});
