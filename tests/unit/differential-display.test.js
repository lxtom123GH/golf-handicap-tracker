/**
 * PRODUCT SWEEP 2026-09-10, SECOND PASS — F-6.
 *
 * PR #134 made nine-hole rounds work: calculateIndex scales a nine's Score
 * Differential to eighteen holes (WHS 5.1b) before averaging. The four places
 * a differential is DISPLAYED were not updated and still printed the raw
 * nine-hole figure — so a player who plays nines saw a Scoring Record whose
 * Differential column read 15.9, several rows carrying the asterisk that means
 * "this is one of the differentials your index is built from", with the index
 * above reading 31.8 and nothing on screen to reconcile them.
 *
 * The invariant: the number shown IS the number used. It holds by construction
 * now — one function, roundDifferential(), called by calculateIndex and by
 * every display — and this file is what stops the two drifting apart again.
 */
import { describe, it, expect } from 'vitest';
import { roundDifferential, expectedNineDifferential } from '../../src/differential.js';
import { calculateIndex } from '../../src/whs.js';

const round = (over, extra = {}) => ({
    id: `r-${over}-${Math.random()}`,
    slope: 121, rating: 34, adjustedGross: 45, holesPlayed: over, ...extra
});

describe('roundDifferential puts every round on the 18-hole scale', () => {
    it('leaves an eighteen alone', () => {
        // (113/124) × (85 − 70.5) = 13.2
        expect(roundDifferential({ slope: 124, rating: 70.5, adjustedGross: 85, holesPlayed: 18 }, 15))
            .toBeCloseTo(13.2, 1);
    });

    it('scales a nine by the expected differential for the unplayed nine', () => {
        const nine = { slope: 121, rating: 34, adjustedGross: 45, holesPlayed: 9 };
        const raw = (113 / 121) * (45 - 34);            // 10.3 — what was shown
        const expected = expectedNineDifferential(15);   // 0.52 × 15 + 1.2 = 9.0
        expect(roundDifferential(nine, 15)).toBeCloseTo(Math.round((raw + expected) * 10) / 10, 5);
        // and it is emphatically NOT the raw figure the display used to print:
        expect(roundDifferential(nine, 15)).not.toBeCloseTo(raw, 1);
    });

    it('doubles a nine when the player has no index yet — not "scratch"', () => {
        const nine = { slope: 121, rating: 34, adjustedGross: 45, holesPlayed: 9 };
        const raw = (113 / 121) * (45 - 34);
        // Number(null) is 0 and 0 is a real index, so an unguarded coercion
        // would estimate 1.2 for the unplayed nine instead of doubling.
        expect(roundDifferential(nine, null)).toBeCloseTo(Math.round(raw * 2 * 10) / 10, 5);
        expect(roundDifferential(nine, undefined)).toBe(roundDifferential(nine, null));
        expect(roundDifferential(nine, '')).toBe(roundDifferential(nine, null));
        // A genuine scratch index estimates, it does not double.
        expect(roundDifferential(nine, 0)).not.toBe(roundDifferential(nine, null));
    });

    it('accepts the string an input field hands it', () => {
        const nine = { slope: 121, rating: 34, adjustedGross: 45, holesPlayed: 9 };
        expect(roundDifferential(nine, '15')).toBe(roundDifferential(nine, 15));
    });

    it('answers null for a round it cannot rate, rather than NaN on screen', () => {
        expect(roundDifferential(null, 10)).toBeNull();
        expect(roundDifferential({ slope: 0, rating: 34, adjustedGross: 45 }, 10)).toBeNull();
        expect(roundDifferential({ slope: 121, rating: 34 }, 10)).toBeNull();
        expect(roundDifferential({ slope: 121, adjustedGross: 45 }, 10)).toBeNull();
    });
});

describe('the number shown is the number used', () => {
    it('every differential calculateIndex counted is reproducible from the display helper', () => {
        const rounds = [round(9), round(18), round(9), round(18), round(9)];
        const priorHI = 15;
        const result = calculateIndex(rounds, priorHI, null);

        expect(result.usedIds.length).toBeGreaterThan(0);
        for (const id of result.usedIds) {
            const r = rounds.find(x => x.id === id);
            expect(roundDifferential(r, priorHI)).not.toBeNull();
        }

        // The asterisked rows and the index are built from one series: the
        // best `use` of these numbers, averaged, is what the index reports.
        const diffs = rounds.map(r => roundDifferential(r, priorHI)).sort((a, b) => a - b);
        const used = result.usedIds.map(id => roundDifferential(rounds.find(x => x.id === id), priorHI));
        expect(used.sort((a, b) => a - b)).toEqual(diffs.slice(0, used.length));
    });

    it('the halved figure the display used to print is NOT what the index counted', () => {
        const nine = round(9);
        const shownBefore = +((113 / nine.slope) * (nine.adjustedGross - nine.rating)).toFixed(1);
        expect(roundDifferential(nine, 15)).toBeGreaterThan(shownBefore * 1.5);
    });
});
