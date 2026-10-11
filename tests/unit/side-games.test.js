import { describe, it, expect } from 'vitest';
import { strokesOnHole, computeSkins, computeMatchPlay, computeNassau } from '../../src/side-games.js';

const SI9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const player = (uid, name, dh, scores) => ({ uid, name, dailyHandicap: dh, scores });

describe('strokesOnHole', () => {
    it('allocates like stableford: floor(DH/18) + 1 where SI <= DH%18', () => {
        expect(strokesOnHole(9, 5)).toBe(1);   // SI 5 <= 9
        expect(strokesOnHole(9, 12)).toBe(0);  // SI 12 > 9
        expect(strokesOnHole(20, 2)).toBe(2);  // 1 everywhere + 1 on SI<=2
        expect(strokesOnHole(0, 1)).toBe(0);
    });

    it('plus handicaps give strokes back on the easiest holes', () => {
        expect(strokesOnHole(-2, 18)).toBe(-1); // easiest hole
        expect(strokesOnHole(-2, 17)).toBe(-1);
        expect(strokesOnHole(-2, 16)).toBe(0);
    });
});

describe('computeSkins (net, carryover)', () => {
    it('awards a skin to the outright lowest net and carries ties', () => {
        const a = player('a', 'Alice', 0, { 1: 4, 2: 4, 3: 5 });
        const b = player('b', 'Bob', 0, { 1: 4, 2: 5, 3: 5 });
        const r = computeSkins([a, b], 9, SI9);
        // H1 tied → carry; H2 Alice wins 2 skins; H3 tied → carried 1
        expect(r.perPlayer.a).toBe(2);
        expect(r.perPlayer.b).toBe(0);
        expect(r.carried).toBe(1);
        expect(r.log[0].winnerUid).toBeNull();
        expect(r.log[1]).toMatchObject({ hole: 2, winnerUid: 'a', value: 2 });
    });

    it('handicap strokes turn a gross tie into a net skin', () => {
        const a = player('a', 'Alice', 9, { 1: 5 }); // SI 1 → 1 stroke → net 4
        const b = player('b', 'Bob', 0, { 1: 5 });
        const r = computeSkins([a, b], 9, SI9);
        expect(r.perPlayer.a).toBe(1);
    });

    it('stops at the first hole any player has not scored', () => {
        const a = player('a', 'Alice', 0, { 1: 4, 3: 4 });
        const b = player('b', 'Bob', 0, { 1: 5, 3: 5 });
        const r = computeSkins([a, b], 9, SI9);
        expect(r.log.length).toBe(1); // hole 2 unscored halts settlement
    });
});

describe('computeMatchPlay (net, 2 players)', () => {
    it('tracks up/thru and all-square', () => {
        const a = player('a', 'Alice', 0, { 1: 4, 2: 4 });
        const b = player('b', 'Bob', 0, { 1: 5, 2: 4 });
        const r = computeMatchPlay(a, b, 9, SI9);
        expect(r.statusText).toBe('Alice 1 UP thru 2');
    });

    it('closes out the match when up exceeds holes remaining (3&2 style)', () => {
        // Alice wins holes 1-7 → 7 up with 2 to play after hole 7… closed earlier:
        const scores = {}; const worse = {};
        for (let h = 1; h <= 7; h++) { scores[h] = 4; worse[h] = 5; }
        const a = player('a', 'Alice', 0, scores);
        const b = player('b', 'Bob', 0, worse);
        const r = computeMatchPlay(a, b, 9, SI9);
        expect(r.closed).toBe(true);
        // closed as soon as up(5) > remaining(4) — i.e. after hole 5: "5&4"
        expect(r.statusText).toBe('Alice wins 5&4');
    });

    it('halved match at the end', () => {
        const a = player('a', 'Alice', 0, { 1: 4, 2: 5 });
        const b = player('b', 'Bob', 0, { 1: 5, 2: 4 });
        const r = computeMatchPlay(a, b, 2, [1, 2]);
        expect(r.statusText).toBe('Match halved');
    });
});

describe('computeNassau (net, 2 players)', () => {
    it('9-hole rounds get the front bet only', () => {
        const a = player('a', 'Alice', 0, { 1: 4 });
        const b = player('b', 'Bob', 0, { 1: 5 });
        const r = computeNassau(a, b, 9, SI9);
        expect(r.front.statusText).toBe('Alice 1 UP thru 1');
        expect(r.back).toBeNull();
        expect(r.overall).toBeNull();
    });

    it('18-hole rounds settle front, back and overall independently', () => {
        const sA = {}, sB = {};
        for (let h = 1; h <= 18; h++) { sA[h] = h <= 9 ? 4 : 6; sB[h] = 5; }
        const a = player('a', 'Alice', 0, sA);
        const b = player('b', 'Bob', 0, sB);
        const si18 = [...SI9, ...SI9.map(x => x + 9)];
        const r = computeNassau(a, b, 18, si18);
        expect(r.front.statusText).toContain('Alice wins');
        expect(r.back.statusText).toContain('Bob wins');
        expect(r.overall.leaderUid).toBeNull(); // 9 wins each → overall halved
    });
});
