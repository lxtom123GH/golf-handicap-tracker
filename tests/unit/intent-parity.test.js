// ==========================================================================
// intent-parity.test.js — S8: the server copy must agree with the client
// ==========================================================================
// `functions/lib/intent.js` is a CommonJS port of `src/shot-shape.js` +
// `src/intent-analysis.js`, because the functions deploy bundle only uploads
// `functions/` and cannot import the ESM client files. A copy drifts unless
// something watches it, so this runs BOTH implementations over the same
// fixtures and fails if they ever disagree.

import { describe, it, expect } from 'vitest';
import { SHAPE_THRESHOLDS, classifyCurve } from '../../src/shot-shape.js';
import { summariseClub, sentenceFor, MIN_SHOTS_FOR_PATTERN } from '../../src/intent-analysis.js';
import server from '../../functions/lib/intent.js';

/** A straight-ish plan and a pulled, drawing execution, in frame metres. */
const plan = (len = 200) => [{ x: 0, y: 0 }, { x: 0, y: len / 2 }, { x: 0, y: len }];
const pulledDraw = (len = 200) => [
    { x: 0, y: 0 }, { x: -9, y: len * 0.3 }, { x: -14, y: len * 0.6 }, { x: -8, y: len },
];
const pushFade = (len = 190) => [
    { x: 0, y: 0 }, { x: 8, y: len * 0.3 }, { x: 15, y: len * 0.65 }, { x: 21, y: len },
];

function shot(club, intended, actual, extra = {}) {
    return { club, lineIntended: intended, lineActual: actual, ...extra };
}

const FIXTURES = [
    ...Array.from({ length: 6 }, () => shot('Driver', plan(), pulledDraw())),
    ...Array.from({ length: 5 }, () => shot('7 Iron', plan(140), pushFade(150))),
    shot('Driver', plan(), pulledDraw(), { planned: true }),          // never played
    shot('3 Wood', plan(), null),                                     // no actual
    shot('Putter', [{ x: 0, y: 0 }, { x: 0, y: 3 }], [{ x: 0, y: 0 }, { x: 0.2, y: 3 }]), // too short
    shot('', plan(), pulledDraw()),                                   // no club
];

describe('S8 parity: functions/lib/intent.js matches src/', () => {
    it('exports the same thresholds object', () => {
        expect(server.SHAPE_THRESHOLDS).toEqual(SHAPE_THRESHOLDS);
        expect(server.MIN_SHOTS_FOR_PATTERN).toBe(MIN_SHOTS_FOR_PATTERN);
    });

    it('classifyCurve agrees on every fixture curve, including deflection and endpoint-only', () => {
        const curves = [plan(), pulledDraw(), pushFade(), [{ x: 0, y: 0 }, { x: 0, y: 3 }], null, [{ x: 1, y: 1 }]];
        for (const c of curves) {
            expect(server.classifyCurve(c)).toEqual(classifyCurve(c));
            expect(server.classifyCurve(c, { intended: plan() })).toEqual(classifyCurve(c, { intended: plan() }));
            expect(server.classifyCurve(c, { endpointOnly: true })).toEqual(classifyCurve(c, { endpointOnly: true }));
            expect(server.classifyCurve(c, { deflectAt: 2 })).toEqual(classifyCurve(c, { deflectAt: 2 }));
        }
    });

    it('summariseClub agrees per club (ignoring the server-only gap field)', () => {
        for (const club of ['Driver', '7 Iron', '3 Wood', 'Putter']) {
            const group = FIXTURES.filter(s => s.club === club);
            const mine = summariseClub(group);
            const theirs = server.summariseClub(group);
            const { startAngleGapDeg, ...theirsCommon } = theirs;
            expect(theirsCommon).toEqual(mine);
            // The extra field is the point of the port, so assert it exists
            // and is a number or null, never undefined.
            expect(startAngleGapDeg === null || typeof startAngleGapDeg === 'number').toBe(true);
        }
    });

    it('sentenceFor agrees, including the not-enough-shots case', () => {
        const few = [shot('Driver', plan(), pulledDraw())];
        expect(server.sentenceFor(server.summariseClub(few))).toBe(sentenceFor(summariseClub(few)));
        const many = FIXTURES.filter(s => s.club === 'Driver');
        expect(server.sentenceFor(server.summariseClub(many))).toBe(sentenceFor(summariseClub(many)));
        expect(server.sentenceFor(null)).toBe(sentenceFor(null));
    });
});

describe('S8: summariseShots picks the clubs worth practising', () => {
    it('ranks by the biggest gap and names what to practise', () => {
        const { clubs, basis } = server.summariseShots(FIXTURES);
        expect(clubs.map(c => c.club).sort()).toEqual(['7 Iron', 'Driver']);
        expect(basis.length).toBeGreaterThanOrEqual(1);
        expect(basis.length).toBeLessThanOrEqual(2);
        for (const b of basis) {
            expect(['start line', 'shape', 'distance']).toContain(b.gapType);
            expect(typeof b.gapValue).toBe('number');
        }
    });

    it('a club inside tolerance is not nominated', () => {
        const onPlan = Array.from({ length: 6 }, () => shot('5 Iron', plan(160), plan(160)));
        const { clubs, basis } = server.summariseShots(onPlan);
        expect(clubs).toHaveLength(1);
        expect(basis).toHaveLength(0);
    });

    it('pools shots that name no club, rather than saying nothing (owner data, 2026-09-20)', () => {
        // Every shot the owner had drawn both lines on carried no club: he was
        // testing the drawing flow and never tapped the club row.
        const noClub = Array.from({ length: 6 }, () => shot(undefined, plan(), pulledDraw()));
        const { clubs, basis } = server.summariseShots(noClub);
        expect(clubs).toHaveLength(1);
        expect(clubs[0].club).toBe(server.ALL_CLUBS);
        expect(basis).toHaveLength(1);
        expect(basis[0].club).toBe(server.ALL_CLUBS);
        expect(server.intentPromptSection(noClub)).toContain(server.ALL_CLUBS);
    });

    it('prefers real clubs and does NOT pool when a club already qualifies', () => {
        const mixed = [
            ...Array.from({ length: 6 }, () => shot('Driver', plan(), pulledDraw())),
            ...Array.from({ length: 6 }, () => shot(undefined, plan(140), pushFade(150))),
        ];
        const { clubs } = server.summariseShots(mixed);
        expect(clubs.map(c => c.club)).toEqual(['Driver']);
        expect(clubs.map(c => c.club)).not.toContain(server.ALL_CLUBS);
    });

    it('does not pool when the unlabelled shots are too few to be a pattern', () => {
        const few = Array.from({ length: 4 }, () => shot(undefined, plan(), pulledDraw()));
        expect(server.summariseShots(few).clubs).toHaveLength(0);
        expect(server.intentPromptSection(few)).toBe('');
    });

    it('a club below the minimum shot count is ignored entirely', () => {
        const few = Array.from({ length: 4 }, () => shot('Driver', plan(), pulledDraw()));
        expect(server.summariseShots(few).clubs).toHaveLength(0);
        expect(server.summariseShots(few).basis).toHaveLength(0);
    });
});

describe('S8: the prompt section is additive and omitted when there is nothing to say', () => {
    it('is an empty string with no qualifying shots, so the prompt is byte-identical to pre-S8', () => {
        expect(server.intentPromptSection([])).toBe('');
        expect(server.intentPromptSection(null)).toBe('');
        const onPlan = Array.from({ length: 6 }, () => shot('5 Iron', plan(160), plan(160)));
        expect(server.intentPromptSection(onPlan)).toBe('');
    });

    it('names the section, the club, the sentence and the gap — and carries no coordinates', () => {
        const section = server.intentPromptSection(FIXTURES);
        expect(section).toContain('Intent vs execution');
        expect(section).toMatch(/Driver|7 Iron/);
        expect(section).toMatch(/Gap: (start line|shape|distance)/);
        // Privacy and tokens: summaries only, never the raw curves.
        expect(section).not.toMatch(/\{\s*"?x"?\s*:/);
        expect(section).not.toContain('lineIntended');
    });
});
