import { describe, it, expect } from 'vitest';
import { roundHandicap } from '../../src/handicap-decimal.js';

// OWNER RULING, Alex 24 Oct 2026, PR #17 issuecomment-6382473588.
// Only published numerical inputs/outputs; no invented scorecards or adapters.
const source = 'https://static.golf.com.au/clubs/1000/uploads/resources/whs%20reference%20guide%20for%20australian%20administrators%20%281-1-2026%29.pdf';
// GA January 2026 guide, printed p9 §3B (also p10 §3E except 0.3499).
// Published PLUS values use negative numbers in the app.
const differentialExamples = [
    [0.35, 0.4], [0.3501, 0.4], [0.3499, 0.3], [0.55, 0.6], [0.5501, 0.6],
    [5.35, 5.4], [5.3501, 5.4], [5.55, 5.6], [5.5501, 5.6],
    [-0.35, -0.3], [-0.3501, -0.4], [-0.55, -0.5], [-0.5501, -0.6],
    [-5.35, -5.3], [-5.3501, -5.4], [-5.55, -5.5], [-5.5501, -5.6],
];
// Printed pp11–12 §3H, Notes: positive on p11, PLUS on p12.
const dailyExamples = [
    [0.5, 1], [0.501, 1], [10.5, 11], [10.501, 11], [20.5, 21], [20.501, 21],
    [-0.5, 0], [-0.501, -1], [-1.5, -1], [-1.501, -2], [-2.5, -2], [-2.501, -3],
];
describe(`Published GA examples: ${source}`, () => {
    it.each(differentialExamples)('p9 §3B: %s → %s', (value, expected) => {
        expect(roundHandicap(value)).toBe(expected);
    });
    it.each(dailyExamples)('pp11–12 §3H: %s → %s', (value, expected) => {
        expect(roundHandicap(value, 0)).toBe(expected);
    });
});
