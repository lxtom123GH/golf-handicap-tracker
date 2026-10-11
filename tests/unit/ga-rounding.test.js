import { describe, it, expect } from 'vitest';
import { calculateIndex } from '../../src/whs.js';
import { roundDifferential } from '../../src/differential.js';
import { formatHandicap, roundHandicap } from '../../src/handicap-decimal.js';

// Golf Australia, WHS reference guide, January 2026, §3B p9 / §3E p10.
// https://static.golf.com.au/clubs/1000/uploads/resources/whs%20reference%20guide%20for%20australian%20administrators%20%281-1-2026%29.pdf
// A published PLUS handicap is represented by a NEGATIVE number in this app.
const examples = [
    [0.35, 0.4], [0.3501, 0.4], [0.3499, 0.3], [0.55, 0.6], [0.5501, 0.6],
    [5.35, 5.4], [5.3501, 5.4], [5.55, 5.6], [5.5501, 5.6],
    [-0.35, -0.3], [-0.3501, -0.4], [-0.55, -0.5], [-0.5501, -0.6],
    [-5.35, -5.3], [-5.3501, -5.4], [-5.55, -5.5], [-5.5501, -5.6],
];

describe('GA published decimal rounding examples', () => {
    it.each(examples)('differential %s rounds to %s', (value, expected) => {
        // Slope 113 and rating zero make the differential exactly the input.
        expect(roundDifferential({ adjustedGross: value, rating: 0, slope: 113, holesPlayed: 18 })).toBe(expected);
    });

    it.each(examples)('retains %s through decimal score/rating subtraction', (value, expected) => {
        // Synthetic arithmetic fixture: the resulting differential is the GA
        // published value. Not a claim that GA published this scorecard.
        const adjustedGross = Number((72 + value).toFixed(4));
        expect(roundDifferential({ adjustedGross, rating: 72, slope: 113, holesPlayed: 18 })).toBe(expected);
    });

    it.each([[0.5, 1], [0.501, 1], [10.5, 11], [10.501, 11], [20.5, 21],
        [-0.5, 0], [-0.501, -1], [-1.5, -1], [-1.501, -2], [-2.5, -2], [-2.501, -3]])(
        'applies GA §3H pp11–12 whole-handicap rounding %s -> %s', (value, expected) => {
            expect(roundHandicap(value, 0)).toBe(expected);
        }
    );

    it('shows scratch without a negative-zero label', () => {
        expect(formatHandicap(-0.04)).toBe('0.0');
    });

    it.each([[0.35, '0.4'], [0.55, '0.6'], [5.35, '5.4'], [5.55, '5.6'],
        [-0.35, '-0.3'], [-0.55, '-0.5'], [-5.35, '-5.3'], [-5.55, '-5.5']])(
        'index average %s rounds to %s without binary drift', (average, expected) => {
            // Four of each adjacent tenth make the best-eight mean the midpoint.
            const lower = Math.floor(average * 10) / 10;
            const values = [...Array(4).fill(lower), ...Array(4).fill(Number((lower + 0.1).toFixed(1))), ...Array(12).fill(30)];
            const rounds = values.map((d, i) => ({ id: String(i), adjustedGross: 72 + d, rating: 72, slope: 113, holesPlayed: 18 }));
            expect(calculateIndex(rounds).index).toBe(expected);
        }
    );
});
