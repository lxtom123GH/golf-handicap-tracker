// @vitest-environment node
//
// FLIGHT RECORDER — security rules for the optional diagnostics upload.
//
// users/{uid}/diagnosticChunks/{sid}_{seq}: written only by the signed-in
// owner of the path, only while diagnosticsConfig/upload names exactly that
// uid with enabled == true. Strict field set, types and sizes. Identical
// resend allowed (idempotent retry); any other update, and every delete,
// refused. diagnosticsConfig is readable only by the account it names and
// writable by nobody through the client SDK.

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Timestamp } from 'firebase/firestore';

let testEnv;

const ALEX = 'alexdiag00000000000000000000';
const OTHER = 'otherdiag0000000000000000000';
const ADMIN = 'admindiag0000000000000000000';
const SID = 'abcdef012345';
const ID = `${SID}_0`;
const PATH = (uid = ALEX, id = ID) => `users/${uid}/diagnosticChunks/${id}`;
const DAY = 24 * 3600 * 1000;

function chunk(over = {}) {
    return {
        v: 1, sid: SID, seq: 0, build: 'v7.0.0+' + 'a'.repeat(40), n: 1,
        events: '[{"t":1,"k":"gps","acc":3}]',
        expireAt: Timestamp.fromMillis(Date.now() + 30 * DAY),
        ...over,
    };
}

async function setConfig(cfg) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        if (cfg === null) await ctx.firestore().doc('diagnosticsConfig/upload').delete();
        else await ctx.firestore().doc('diagnosticsConfig/upload').set(cfg);
    });
}

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'golf-handicap-tracker-b677c',
        firestore: {
            rules: readFileSync(resolve('firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            port: Number(process.env.EMU_FIRESTORE_PORT || 8080),
        },
    });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc('users/' + ADMIN).set({ isAdmin: true, email: 'admin@test.local' });
        await ctx.firestore().doc('users/' + ALEX).set({ email: 'alex@test.local' });
    });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(PATH()).delete();
    });
    await setConfig({ enabled: true, uid: ALEX });
});

describe('diagnosticChunks: the named account, while enabled', () => {
    it('Alex can create a valid chunk and read it back', async () => {
        const db = testEnv.authenticatedContext(ALEX).firestore();
        await assertSucceeds(db.doc(PATH()).set(chunk()));
        await assertSucceeds(db.doc(PATH()).get());
    });

    it('an identical resend is allowed (idempotent retry); a changed one is refused', async () => {
        const db = testEnv.authenticatedContext(ALEX).firestore();
        const c = chunk();
        await assertSucceeds(db.doc(PATH()).set(c));
        await assertSucceeds(db.doc(PATH()).set(c));
        await assertFails(db.doc(PATH()).set({ ...c, n: 2 }));
        await assertFails(db.doc(PATH()).update({ events: '[]' }));
    });

    it('nobody can delete a chunk, not even its owner', async () => {
        const db = testEnv.authenticatedContext(ALEX).firestore();
        await assertSucceeds(db.doc(PATH()).set(chunk()));
        await assertFails(db.doc(PATH()).delete());
    });
});

describe('diagnosticChunks: kill switch and single-account eligibility', () => {
    it('config missing (the default): refused', async () => {
        await setConfig(null);
        await assertFails(testEnv.authenticatedContext(ALEX).firestore().doc(PATH()).set(chunk()));
    });
    it('config enabled: false: refused', async () => {
        await setConfig({ enabled: false, uid: ALEX });
        await assertFails(testEnv.authenticatedContext(ALEX).firestore().doc(PATH()).set(chunk()));
    });
    it('config enabled as a string "true": refused', async () => {
        await setConfig({ enabled: 'true', uid: ALEX });
        await assertFails(testEnv.authenticatedContext(ALEX).firestore().doc(PATH()).set(chunk()));
    });
    it('a config naming someone else: Alex is refused, and so is that account on Alex\'s path', async () => {
        await setConfig({ enabled: true, uid: OTHER });
        await assertFails(testEnv.authenticatedContext(ALEX).firestore().doc(PATH()).set(chunk()));
        await assertFails(testEnv.authenticatedContext(OTHER).firestore().doc(PATH(ALEX)).set(chunk()));
    });
    it('an admin is NOT eligible (no admin-role path)', async () => {
        const db = testEnv.authenticatedContext(ADMIN).firestore();
        await assertFails(db.doc(PATH(ADMIN)).set(chunk()));
        await assertFails(db.doc(PATH(ALEX)).set(chunk()));
    });
});

describe('diagnosticChunks: wrong account, unauthenticated, cross-user', () => {
    it('another signed-in user cannot write their own path (not named) or Alex\'s', async () => {
        const db = testEnv.authenticatedContext(OTHER).firestore();
        await assertFails(db.doc(PATH(OTHER)).set(chunk()));
        await assertFails(db.doc(PATH(ALEX)).set(chunk()));
    });
    it('another signed-in user or an admin cannot read Alex\'s chunks', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc(PATH()).set(chunk()); });
        await assertFails(testEnv.authenticatedContext(OTHER).firestore().doc(PATH()).get());
        await assertFails(testEnv.authenticatedContext(ADMIN).firestore().doc(PATH()).get());
        await assertFails(testEnv.authenticatedContext(OTHER).firestore().collection(`users/${ALEX}/diagnosticChunks`).get());
    });
    it('unauthenticated clients can neither read nor write', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(db.doc(PATH()).set(chunk()));
        await assertFails(db.doc(PATH()).get());
    });
});

describe('diagnosticChunks: strict fields, types and sizes', () => {
    const db = () => testEnv.authenticatedContext(ALEX).firestore();
    it('events at the 50,000-char cap pass; one more is refused', async () => {
        await assertSucceeds(db().doc(PATH()).set(chunk({ events: 'x'.repeat(50000) })));
        await testEnv.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc(PATH()).delete(); });
        await assertFails(db().doc(PATH()).set(chunk({ events: 'x'.repeat(50001) })));
    });
    it('extra fields (identity, email, positions) are refused', async () => {
        for (const extra of [{ uid: ALEX }, { email: 'a@b.co' }, { lat: -27.4 }, { notes: 'x' }]) {
            await assertFails(db().doc(PATH()).set(chunk(extra)));
        }
    });
    it('missing fields are refused', async () => {
        for (const key of ['v', 'sid', 'seq', 'build', 'n', 'events', 'expireAt']) {
            const c = chunk(); delete c[key];
            await assertFails(db().doc(PATH()).set(c));
        }
    });
    it('wrong types and out-of-range values are refused', async () => {
        const bad = [
            { v: 2 }, { sid: 'NOT-HEX-AAAA' }, { seq: '0' }, { seq: 300 }, { seq: -1 },
            { n: 101 }, { n: 1.5 }, { build: 'b'.repeat(65) }, { events: ['a'] },
            { expireAt: Date.now() + DAY }, { expireAt: Timestamp.fromMillis(Date.now() - 1000) },
            { expireAt: Timestamp.fromMillis(Date.now() + 32 * DAY) },
        ];
        for (const over of bad) await assertFails(db().doc(PATH()).set(chunk(over)));
    });
    it('the doc id must equal `${sid}_${seq}`', async () => {
        await assertFails(db().doc(PATH(ALEX, `${SID}_1`)).set(chunk({ seq: 0 })));
        await assertFails(db().doc(PATH(ALEX, 'anything')).set(chunk()));
        await assertSucceeds(db().doc(PATH(ALEX, `${SID}_7`)).set(chunk({ seq: 7 })));
    });
});

describe('diagnosticsConfig: owner-managed outside the app', () => {
    it('the named account can read it; others and unauthenticated cannot', async () => {
        await assertSucceeds(testEnv.authenticatedContext(ALEX).firestore().doc('diagnosticsConfig/upload').get());
        await assertFails(testEnv.authenticatedContext(OTHER).firestore().doc('diagnosticsConfig/upload').get());
        await assertFails(testEnv.unauthenticatedContext().firestore().doc('diagnosticsConfig/upload').get());
    });
    it('a missing config cannot be read by anyone (so the client treats it as off)', async () => {
        await setConfig(null);
        await assertFails(testEnv.authenticatedContext(ALEX).firestore().doc('diagnosticsConfig/upload').get());
    });
    it('nobody can write it from a client, not Alex, not an admin', async () => {
        for (const uid of [ALEX, ADMIN, OTHER]) {
            const db = testEnv.authenticatedContext(uid).firestore();
            await assertFails(db.doc('diagnosticsConfig/upload').set({ enabled: true, uid }));
            await assertFails(db.doc('diagnosticsConfig/upload').delete());
        }
    });
});
