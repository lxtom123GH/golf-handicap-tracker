// Play mode v2 pure helpers (owner 2026-10-06): reach, club strip, stats
// the player no longer presses, routine chip, ball position, fit.
import { describe, it, expect } from 'vitest';
import {
    REACH_KEY, DEFAULT_REACH_M, normaliseReach, readReach, writeReach,
    estimateCarryM, clubLadder, stripWindow, derivedGir, girOf, fairwayFromLie,
    nextRoutine, routineLabel, ballStartXY, fitInsetsFor, sheetHandleLabel,
} from '../../src/play-mode.js';

describe('reach setting', () => {
    it('defaults to 230 m and clamps to 100–300 in 10 m steps', () => {
        expect(DEFAULT_REACH_M).toBe(230);
        expect(normaliseReach(undefined)).toBe(230);
        expect(normaliseReach('abc')).toBe(230);
        expect(normaliseReach(0)).toBe(230);
        expect(normaliseReach(184)).toBe(180);
        expect(normaliseReach(50)).toBe(100);
        expect(normaliseReach(400)).toBe(300);
    });
    it('round-trips through storage and survives one that throws', () => {
        const m = new Map();
        const st = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
        writeReach(st, 205);
        expect(m.get(REACH_KEY)).toBe('210');
        expect(readReach(st)).toBe(210);
        const boom = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
        expect(readReach(boom)).toBe(230);
        expect(() => writeReach(boom, 200)).not.toThrow();
    });
});

describe('club strip', () => {
    it('estimates a carry for the ways My Bag names clubs', () => {
        expect(estimateCarryM('Driver')).toBe(210);
        expect(estimateCarryM('3 Wood')).toBe(190);
        expect(estimateCarryM('3W')).toBe(190);
        expect(estimateCarryM('4 Hybrid')).toBe(170);
        expect(estimateCarryM('7 Iron')).toBe(146);
        expect(estimateCarryM('7i')).toBe(146);
        expect(estimateCarryM('Mid Irons')).toBe(145);
        expect(estimateCarryM('PW')).toBe(105);
        expect(estimateCarryM('56')).toBe(75);
        expect(estimateCarryM('Putter')).toBeNull();
        expect(estimateCarryM('Mystery club')).toBeNull();
    });
    it('orders the bag longest → shortest, putter last', () => {
        const bag = ['56', 'Putter', '7 Iron', 'Driver', '3 Wood', 'PW'].map(v => ({ label: v, val: v }));
        expect(clubLadder(bag).map(c => c.val)).toEqual(['Driver', '3 Wood', '7 Iron', 'PW', '56', 'Putter']);
        expect(clubLadder(bag)[0].carry).toBe(210);
    });
    it('keeps the chosen club in the middle of the three, except at the ends', () => {
        expect(stripWindow(10, 0)).toBe(0);
        expect(stripWindow(10, 4)).toBe(3);
        expect(stripWindow(10, 9)).toBe(7);
        expect(stripWindow(2, 1)).toBe(0);
    });
});

describe('GIR is worked out, never pressed', () => {
    it('on in regulation with two putts to spare', () => {
        expect(derivedGir({ par: 4, gross: 4, putts: 2 })).toBe(true);   // on in 2
        expect(derivedGir({ par: 4, gross: 5, putts: 2 })).toBe(false);  // on in 3
        // Codex P2 (pass 4): putts can't reach the score
        expect(derivedGir({ par: 4, gross: 4, putts: 4 })).toBeNull();
        expect(derivedGir({ par: 3, gross: 2, putts: 3 })).toBeNull();
        expect(derivedGir({ par: 3, gross: 2, putts: 1 })).toBe(true);
        expect(derivedGir({ par: 5, gross: 6, putts: 3 })).toBe(true);   // on in 3, three-putt
    });
    it('a chip-in from off the green (0 putts) is unknown, not a GIR', () => {
        expect(derivedGir({ par: 4, gross: 3, putts: 0 })).toBeNull();
    });
    it('no score yet is unknown', () => {
        expect(derivedGir({ par: 4, gross: 0, putts: 2 })).toBeNull();
    });
});

describe('fairway from the lie (Detailed rounds)', () => {
    it("shot 2's lie answers it on a par 4/5", () => {
        expect(fairwayFromLie({ shotNumber: 2, par: 4, lie: 'Fairway' })).toBe(true);
        expect(fairwayFromLie({ shotNumber: 2, par: 5, lie: 'Trees' })).toBe(false);
    });
    it('says nothing on a par 3, another shot, or no lie', () => {
        expect(fairwayFromLie({ shotNumber: 2, par: 3, lie: 'Rough' })).toBeUndefined();
        expect(fairwayFromLie({ shotNumber: 3, par: 4, lie: 'Rough' })).toBeUndefined();
        expect(fairwayFromLie({ shotNumber: 2, par: 4, lie: null })).toBeUndefined();
    });
});

describe('routine chip', () => {
    it('cycles blank → ✓ → ✗ → blank', () => {
        expect(nextRoutine(undefined)).toBe('ok');
        expect(nextRoutine('ok')).toBe('no');
        expect(nextRoutine('no')).toBeUndefined();
        expect(routineLabel('ok')).toBe('Routine ✓');
        expect(routineLabel('no')).toBe('Routine ✗');
        expect(routineLabel(undefined)).toBe('Routine');
    });
});

describe('where the ball is (shot view anchor)', () => {
    it('GPS first, then the last shot\'s finish, then its drawn line, then the tee', () => {
        expect(ballStartXY({ fixXY: [3, 150] })).toEqual([3, 150]);
        expect(ballStartXY({ lastShot: { finishXY: { x: 5, y: 210 } } })).toEqual([5, 210]);
        expect(ballStartXY({ lastShot: { lineActual: [{ x: 0, y: 0 }, { x: -8, y: 190 }] } })).toEqual([-8, 190]);
        expect(ballStartXY({})).toEqual([0, 0]);
        expect(ballStartXY({ fixXY: [NaN, 1] })).toEqual([0, 0]);
    });
});

describe('fit and handle', () => {
    it('fits between the top chips and the bottom chips', () => {
        expect(fitInsetsFor({ topChipsBottom: 48, bottomChipsTop: 778, viewportH: 844 })).toEqual({ top: 56, bottom: 74 });
        expect(fitInsetsFor({ topChipsBottom: 0, bottomChipsTop: 0, viewportH: 844 })).toEqual({ top: 56, bottom: 72 });
    });
    it('the group handle is a small round chip', () => {
        expect(sheetHandleLabel(1, false)).toBe('📊');
        expect(sheetHandleLabel(3, false)).toBe('👥 3');
        expect(sheetHandleLabel(3, true)).toBe('✕');
    });
});

describe('Codex P2 (pass 5): girOf - the GIR every total counts', () => {
    it('worked out from score + putts beats a stale stored tap', () => {
        expect(girOf({ par: 4, gross: 5, putts: 2, stored: true })).toBe(false);
        expect(girOf({ par: 4, gross: 4, putts: 2, stored: false })).toBe(true);
    });
    it('no putts / impossible putts: the stored tap stands (as a boolean)', () => {
        expect(girOf({ par: 4, gross: 4, putts: 0, stored: true })).toBe(true);
        expect(girOf({ par: 4, gross: 4, putts: undefined, stored: undefined })).toBe(false);
        expect(girOf({ par: 4, gross: 3, putts: 3, stored: true })).toBe(true);
        expect(girOf({ par: 4, gross: 0, putts: 2, stored: true })).toBe(false); // cleared / unplayed
    });
});
