// @vitest-environment node
//
// HOLE TRACES — the security rules (S6 Part 2b).
//
// Hand-traced hole features land in users/{uid}/holeTraces/{slug}-{hole}.
// The trace IS the golfer's own work: the owner writes and reads it; an
// admin reads it (the export script merges accepted traces into the shipped
// course files); nobody else sees it.
//
// What the rules enforce: ownership, the ≤ 12-feature cap, and the payload
// shape at document level. What they CANNOT enforce: the ≤ 200-vertices-per-
// ring cap — the rules language has no list comprehension (`.all()` is
// rejected by the engine with "Function not found: all", which is exactly
// what these tests proved before the check moved). That cap lives in the
// mapper model (tests/unit/hole-mapper.test.js, the source of truth) and is
// re-validated by the owner-run export script.
//
// Points are stored as {lon, lat} MAPS on geometry.ring: Firestore forbids
// arrays nested in arrays, so raw GeoJSON cannot even be written — the SDK
// refuses it client-side, before the rules run.

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv;

const ME = 'tracer0000000000000000000';
const OTHER = 'otheruser00000000000000000';
const ADMIN = 'adminuser00000000000000000';

const DOC = 'users/' + ME + '/holeTraces/keperra-10';

function tracePayload(features, authorUid = ME) {
    return {
        features: { type: 'FeatureCollection', features },
        authorUid,
        source: { provider: 'hand-trace', imagery: '/courses/imagery/keperra-10.jpg' },
        updatedAt: new Date().toISOString(),
    };
}

function ring(vertices) {
    return {
        type: 'Feature',
        properties: { golf: 'green' },
        geometry: { type: 'Polygon', ring: vertices },
    };
}

const CLOSED_RING = [
    { lon: 152.95, lat: -27.41 },
    { lon: 152.951, lat: -27.41 },
    { lon: 152.951, lat: -27.409 },
    { lon: 152.95, lat: -27.41 },
];

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
    // An admin account the isAdmin() helper can trust.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc('users/' + ADMIN).set({ isAdmin: true, email: 'admin@test.local' });
        await ctx.firestore().doc('users/' + ME).set({ email: 'tracer@test.local' });
    });
});

afterAll(async () => {
    await testEnv.cleanup();
});

describe('holeTraces: owner writes their own trace', () => {
    it('a closed single-feature trace succeeds', async () => {
        const db = testEnv.authenticatedContext(ME).firestore();
        await assertSucceeds(db.doc(DOC).set(tracePayload([ring(CLOSED_RING)])));
    });
    it('twelve features succeed (the cap, inclusive)', async () => {
        const db = testEnv.authenticatedContext(ME).firestore();
        const features = Array.from({ length: 12 }, (_, i) => ring(CLOSED_RING.map((p) => ({ lon: p.lon + i * 0.0001, lat: p.lat }))));
        await assertSucceeds(db.doc(DOC).set(tracePayload(features)));
    });
    it('thirteen features are refused', async () => {
        const db = testEnv.authenticatedContext(ME).firestore();
        const features = Array.from({ length: 13 }, (_, i) => ring(CLOSED_RING.map((p) => ({ lon: p.lon + i * 0.0001, lat: p.lat }))));
        await assertFails(db.doc(DOC).set(tracePayload(features)));
    });
    it('an empty feature list is refused', async () => {
        const db = testEnv.authenticatedContext(ME).firestore();
        await assertFails(db.doc(DOC).set(tracePayload([])));
    });
    it('features missing the authorUid field are refused', async () => {
        const db = testEnv.authenticatedContext(ME).firestore();
        const payload = tracePayload([ring(CLOSED_RING)]);
        delete payload.authorUid;
        await assertFails(db.doc(DOC).set(payload));
    });
});

describe('holeTraces: identity and access', () => {
    it('a trace claiming another author is refused', async () => {
        const db = testEnv.authenticatedContext(ME).firestore();
        await assertFails(db.doc(DOC).set(tracePayload([ring(CLOSED_RING)], OTHER)));
    });
    it('another user cannot read or write my traces', async () => {
        const db = testEnv.authenticatedContext(OTHER).firestore();
        await assertFails(db.doc(DOC).get());
        await assertFails(db.doc(DOC).set(tracePayload([ring(CLOSED_RING)])));
        await assertFails(db.doc(DOC).delete());
    });
    it('an unauthenticated client is refused', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(db.doc(DOC).get());
        await assertFails(db.doc(DOC).set(tracePayload([ring(CLOSED_RING)])));
    });
    it('an admin can read but not write my traces', async () => {
        const db = testEnv.authenticatedContext(ADMIN).firestore();
        await assertSucceeds(db.doc(DOC).get());
        await assertFails(db.doc(DOC).set(tracePayload([ring(CLOSED_RING)])));
    });
});
