import { describe, it, expect } from 'vitest';
import { benchmarksFor, computeCategoryInsights, computeClubTendencies, computeMilestones } from '../../src/insights.js';

const round = (over = {}) => ({
    totalGross: 90, totalStableford: 30, holesPlayed: 18, notCounting: false,
    stats: { putts: 34, gir: 5, fwy: 8 }, ...over
});

describe('benchmarksFor', () => {
    it('bands by handicap and falls back to the worst band', () => {
        expect(benchmarksFor(4).putts).toBe(30);
        expect(benchmarksFor(15).putts).toBe(34);
        expect(benchmarksFor(null).putts).toBe(38);
    });
});

describe('computeCategoryInsights', () => {
    it('needs at least 3 stat-carrying counting rounds', () => {
        expect(computeCategoryInsights([round(), round()], 15)).toBeNull();
        expect(computeCategoryInsights([round(), round({ notCounting: true }), round()], 15)).toBeNull();
    });

    it('averages per-18 and picks the weakest category as focus', () => {
        // 15-marker bench: 34 putts, 27% GIR, 45% FIR.
        // Putting on-bench; GIR 5/18=28% on-bench; FIR 8/18=44% ≈ bench.
        // Make putting terrible → focus = putting.
        const rounds = [round({ stats: { putts: 40, gir: 5, fwy: 8 } }),
                        round({ stats: { putts: 40, gir: 5, fwy: 8 } }),
                        round({ stats: { putts: 40, gir: 5, fwy: 8 } })];
        const r = computeCategoryInsights(rounds, 15);
        expect(r.roundsUsed).toBe(3);
        expect(r.focus.key).toBe('putting');
        expect(r.categories[0].deltaStrokes).toBeCloseTo(6, 1); // 40 vs 34
    });

    it('scales 9-hole rounds to per-18 figures', () => {
        const nine = round({ holesPlayed: 9, stats: { putts: 17, gir: 3, fwy: 4 } });
        const r = computeCategoryInsights([nine, nine, nine], 15);
        expect(r.categories[0].yours).toBe(34); // 17 × 2
    });
});

describe('computeClubTendencies', () => {
    it('groups by club, needs 5+ shots, and names the top miss', () => {
        const shots = [];
        for (let i = 0; i < 6; i++) shots.push({ club: 'Driver', startLine: i < 4 ? 'Right' : 'Straight' });
        for (let i = 0; i < 3; i++) shots.push({ club: '7i', startLine: 'Straight' }); // below threshold
        const r = computeClubTendencies(shots);
        expect(r.length).toBe(1);
        expect(r[0]).toMatchObject({ club: 'Driver', count: 6, topMiss: 'Right' });
        expect(r[0].straightPct).toBe(33);
        expect(r[0].onTargetPct).toBeNull(); // no missPattern taps yet
    });

    it('BL-MG-01: dispersion from missPattern once 5+ shots carry it', () => {
        const shots = [];
        for (let i = 0; i < 6; i++) shots.push({ club: '7i', missPattern: i < 3 ? 'Short Right' : (i < 5 ? 'On Target' : 'Long') });
        const r = computeClubTendencies(shots);
        expect(r[0].onTargetPct).toBe(33); // 2 of 6
        expect(r[0].topResultMiss).toEqual({ pattern: 'Short Right', pct: 50 });
    });

    it('missPattern below its own threshold falls back to start line only', () => {
        const shots = [];
        for (let i = 0; i < 6; i++) shots.push({ club: 'Driver', startLine: 'Left', missPattern: i < 2 ? 'Short' : undefined });
        const r = computeClubTendencies(shots);
        expect(r[0].onTargetPct).toBeNull();
        expect(r[0].topResultMiss).toBeNull();
        expect(r[0].topMiss).toBe('Left');
    });
});

describe('computeMilestones', () => {
    it('flags the first round and round-count badges', () => {
        expect(computeMilestones(round(), [])).toContain('🎉 First 18-hole round on your record!');
        const nine = Array.from({ length: 9 }, () => round());
        expect(computeMilestones(round(), nine).join()).toContain('10th 18-hole round');
    });

    it('detects personal bests within the same holes class only', () => {
        const prior = [round({ totalGross: 95 }), round({ totalGross: 92, stats: { putts: 30, gir: 6, fwy: 9 } })];
        const m = computeMilestones(round({ totalGross: 88 }), prior);
        expect(m.join()).toContain('New personal best gross: 88');
        // A 9-hole 45 must NOT beat 18-hole records:
        const nine = computeMilestones(round({ holesPlayed: 9, totalGross: 45 }), prior);
        expect(nine.join()).not.toContain('personal best gross');
        expect(nine.join()).toContain('First 9-hole round');
    });

    it('putts/GIR/FIR records', () => {
        const prior = [round({ stats: { putts: 30, gir: 6, fwy: 9 } })];
        const m = computeMilestones(round({ stats: { putts: 28, gir: 7, fwy: 10 } }), prior);
        expect(m.join()).toContain('Fewest putts ever: 28');
        expect(m.join()).toContain('Most greens in regulation: 7');
        expect(m.join()).toContain('Most fairways hit: 10');
    });
});

import { clubGroup, computeRoutineImpact, computeDrillImpact } from '../../src/insights.js';

describe('clubGroup', () => {
    it('classifies the default bag and common custom names', () => {
        expect(clubGroup('Driver')).toBe('driver');
        expect(clubGroup('3 Wood')).toBe('woods');
        expect(clubGroup('Mid Irons')).toBe('irons');
        expect(clubGroup('7i')).toBe('irons');
        expect(clubGroup('56')).toBe('wedges');
        expect(clubGroup('PW')).toBe('wedges');
        expect(clubGroup('Putter')).toBe('putter');
        expect(clubGroup(undefined)).toBe('other');
    });
});

describe('computeRoutineImpact', () => {
    const shot = (pre, miss) => ({ routines: { pre }, missPattern: miss });
    it('needs 10+ pass and 5+ fail samples', () => {
        const shots = Array.from({ length: 9 }, () => shot('Pass', 'On Target'))
            .concat(Array.from({ length: 5 }, () => shot('Fail', 'Short')));
        expect(computeRoutineImpact(shots)).toBeNull();
    });
    it('reports on-target rates and the delta', () => {
        const shots = [
            ...Array.from({ length: 10 }, (_, i) => shot('Pass', i < 5 ? 'On Target' : 'Short Right')),
            ...Array.from({ length: 5 }, (_, i) => shot('Fail', i < 1 ? 'On Target' : 'Long Left'))
        ];
        const r = computeRoutineImpact(shots);
        expect(r.passOnPct).toBe(50);
        expect(r.failOnPct).toBe(20);
        expect(r.deltaPct).toBe(30);
    });
    it('ignores shots without a missPattern or routine tap', () => {
        const shots = [shot('Pass', null), { missPattern: 'Short' }, shot('Pass', 'On Target')];
        expect(computeRoutineImpact(shots)).toBeNull();
    });
});

describe('computeDrillImpact', () => {
    const day = 86400000;
    const t0 = 1750000000000; // fixed epoch for the completion moment
    const round18 = (offsetDays, putts) => ({
        date: new Date(t0 + offsetDays * day),
        stats: { putts, gir: 6, fwy: 8 }, holesPlayed: 18,
        totalStableford: 30, notCounting: false
    });

    it('needs 2+ usable rounds on each side', () => {
        expect(computeDrillImpact([round18(-3, 34), round18(2, 30)], t0)).toBeNull();
    });

    it('averages per-18 stats before vs after the completion date', () => {
        const rounds = [
            round18(-10, 36), round18(-5, 34),
            round18(3, 31), round18(8, 29)
        ];
        const r = computeDrillImpact(rounds, t0);
        expect(r.before.putts).toBe(35);
        expect(r.after.putts).toBe(30);
        expect(r.before.rounds).toBe(2);
        expect(r.after.rounds).toBe(2);
    });

    it('scales 9-hole rounds and caps each side at n rounds', () => {
        const nine = (offsetDays, putts) => ({
            date: new Date(t0 + offsetDays * day),
            stats: { putts, gir: 3, fwy: 4 }, holesPlayed: 9,
            totalStableford: 15, notCounting: false
        });
        const rounds = [nine(-4, 17), nine(-2, 17), nine(1, 15), nine(6, 15)];
        const r = computeDrillImpact(rounds, t0);
        expect(r.before.putts).toBe(34); // 17 × 2
        expect(r.after.putts).toBe(30);
    });
});

import { computeTiger5, computeStrategyComparison } from '../../src/insights.js';

describe('computeTiger5 (BL-DEC-01)', () => {
    const hs = (par, gross, putts = 2) => ({ h: 1, par, gross, putts });

    it('null without per-hole detail (legacy rounds)', () => {
        expect(computeTiger5({ totalGross: 90 })).toBeNull();
        expect(computeTiger5({ holes: 18 })).toBeNull(); // CSV-import numeric field
    });

    it('counts doubles, par-5 bogeys and three-putts', () => {
        const round = { holeScores: [
            hs(4, 6),        // double
            hs(5, 6),        // par-5 bogey
            hs(4, 4, 3),     // three-putt
            hs(5, 7, 3),     // par-5 double AND three-putt (counts in all buckets)
            hs(3, 3), hs(4, 4), hs(4, 5), hs(5, 5), hs(4, 4)
        ] };
        const t = computeTiger5(round);
        expect(t.doubles).toBe(2);
        expect(t.par5Bogeys).toBe(2);
        expect(t.threePutts).toBe(2);
        expect(t.total).toBe(6);
        expect(t.per18).toBe(12); // 9 holes → doubled
    });

    it('clean round reports zero with empty parts', () => {
        const round = { holeScores: [hs(4, 4), hs(5, 5), hs(3, 3)] };
        const t = computeTiger5(round);
        expect(t.total).toBe(0);
        expect(t.parts).toEqual([]);
    });
});

describe('computeStrategyComparison (BL-DEC-01)', () => {
    const round = (dateStr, stb, putts, holeScores = null) => ({
        date: new Date(dateStr + 'T12:00:00'),
        totalStableford: stb, stats: { putts, gir: 5, fwy: 7 },
        holesPlayed: 18, notCounting: false,
        ...(holeScores ? { holeScores } : {})
    });

    it('buckets rounds by period dates, ongoing period open-ended', () => {
        const rounds = [
            round('2026-07-10', 30, 34),
            round('2026-08-05', 34, 32),
            round('2026-09-01', 36, 30)
        ];
        const periods = [
            { name: 'Old way', start: '2026-07-01', end: '2026-07-31' },
            { name: 'DECADE', start: '2026-08-01', end: null }
        ];
        const [oldWay, decade] = computeStrategyComparison(rounds, periods);
        expect(oldWay.rounds).toBe(1);
        expect(oldWay.stableford).toBe(30);
        expect(decade.rounds).toBe(2);
        expect(decade.stableford).toBe(35);
        expect(decade.putts).toBe(31);
    });

    it('includes Tiger-5 per-18 only for rounds carrying holeScores', () => {
        const withDetail = round('2026-08-10', 32, 33, [
            { h: 1, par: 4, gross: 6, putts: 2 }, { h: 2, par: 5, gross: 5, putts: 2 },
            { h: 3, par: 4, gross: 4, putts: 3 }, { h: 4, par: 3, gross: 3, putts: 2 },
            { h: 5, par: 4, gross: 4, putts: 2 }, { h: 6, par: 4, gross: 4, putts: 2 },
            { h: 7, par: 4, gross: 4, putts: 2 }, { h: 8, par: 4, gross: 4, putts: 2 },
            { h: 9, par: 4, gross: 4, putts: 2 }
        ]);
        const legacy = round('2026-08-12', 30, 34);
        const [p] = computeStrategyComparison([withDetail, legacy], [{ name: 'DECADE', start: '2026-08-01', end: null }]);
        expect(p.rounds).toBe(2);
        expect(p.tiger5Rounds).toBe(1);
        expect(p.tiger5).toBe(4); // 1 double + 1 three-putt over 9 holes → ×2
    });
});

import { overallMissBias } from '../../src/insights.js';

describe('overallMissBias (BL-DEC-02)', () => {
    const iron = (miss) => ({ club: '7i', missPattern: miss });
    it('needs 10+ result-tapped approach shots', () => {
        expect(overallMissBias(Array.from({ length: 9 }, () => iron('Short Right')))).toBeNull();
    });
    it('names the dominant approach miss, ignoring driver/putter', () => {
        const shots = [
            ...Array.from({ length: 6 }, () => iron('Short Right')),
            ...Array.from({ length: 4 }, () => iron('On Target')),
            ...Array.from({ length: 5 }, () => ({ club: 'Driver', missPattern: 'Left' })), // excluded
            { club: '56', missPattern: 'Long' }
        ];
        const r = overallMissBias(shots);
        expect(r.pattern).toBe('Short Right');
        expect(r.n).toBe(11);
        expect(r.pct).toBe(55);
    });
});

import { holeStatsSanity } from '../../src/insights.js';

describe('holeStatsSanity (owner feedback 2026-07-05)', () => {
    it('silent when there is no score or no contradiction', () => {
        expect(holeStatsSanity({ par: 4, gross: 0, putts: 10 })).toBeNull();
        expect(holeStatsSanity({ par: 4, gross: 5, putts: 2, gir: false })).toBeNull();
        expect(holeStatsSanity({ par: 4, gross: 4, putts: 2, gir: true })).toBeNull(); // on in 2, 2 putts
    });
    it('flags more putts than strokes', () => {
        expect(holeStatsSanity({ par: 4, gross: 4, putts: 10 })).toMatch(/10 putts/);
        expect(holeStatsSanity({ par: 4, gross: 3, putts: 3 })).toMatch(/putts/);
    });
    it('flags GIR arithmetic: par 4 + GIR + 1 putt caps the score at 3', () => {
        expect(holeStatsSanity({ par: 4, gross: 6, putts: 1, gir: true })).toMatch(/caps the score at 3/);
        expect(holeStatsSanity({ par: 4, gross: 3, putts: 1, gir: true })).toBeNull();
        expect(holeStatsSanity({ par: 5, gross: 5, putts: 2, gir: true })).toBeNull();
    });
});

describe("'Unseen' honesty option stays out of dispersion", () => {
    it('computeClubTendencies ignores Unseen results', () => {
        const shots = [
            ...Array.from({ length: 5 }, () => ({ club: '7i', missPattern: 'Short Right' })),
            ...Array.from({ length: 5 }, () => ({ club: '7i', missPattern: 'Unseen' }))
        ];
        const r = computeClubTendencies(shots);
        expect(r[0].count).toBe(10);
        expect(r[0].onTargetPct).toBe(0);            // 5 counted results, none on target
        expect(r[0].topResultMiss.pct).toBe(100);    // Unseen excluded from the denominator
    });
    it('overallMissBias and routine impact ignore Unseen', () => {
        const unseen = Array.from({ length: 20 }, () => ({ club: '7i', missPattern: 'Unseen', routines: { pre: 'Pass' } }));
        expect(overallMissBias(unseen)).toBeNull();
        expect(computeRoutineImpact(unseen)).toBeNull();
    });
});

// --------------------------------------------------------------------------
// computePuttDiagnostics (BL-OC2): stroke problem vs read problem
// --------------------------------------------------------------------------
import { computePuttDiagnostics } from '../../src/insights.js';

describe('computePuttDiagnostics', () => {
    const putt = (line, read) => ({ club: 'Putter', puttLine: line, puttRead: read });

    it('stays silent under 6 tagged putts and ignores non-putter shots', () => {
        expect(computePuttDiagnostics(null)).toBeNull();
        expect(computePuttDiagnostics([putt('On Line', 'Good Read')])).toBeNull();
        const irons = Array.from({ length: 10 }, () => ({ club: '7i', puttLine: 'On Line' }));
        expect(computePuttDiagnostics(irons)).toBeNull();
    });

    it('splits stroke vs read and names the weaker skill at a 15-point gap', () => {
        // 8 putts: starts it on line 7/8 (88%) but misreads 5/8 (38% good) -> read problem
        const shots = [
            ...Array.from({ length: 7 }, (_, i) => putt('On Line', i < 3 ? 'Good Read' : 'Misread')),
            putt('Off Line', 'Misread')
        ];
        const r = computePuttDiagnostics(shots);
        expect(r.taps).toBe(8);
        expect(r.onLinePct).toBe(88);
        expect(r.goodReadPct).toBe(38);
        expect(r.verdict).toBe('read');
    });

    it('flags the stroke when reads are fine but the start line is not', () => {
        const shots = Array.from({ length: 10 }, (_, i) =>
            putt(i < 3 ? 'On Line' : 'Off Line', 'Good Read'));
        const r = computePuttDiagnostics(shots);
        expect(r.onLinePct).toBe(30);
        expect(r.goodReadPct).toBe(100);
        expect(r.verdict).toBe('stroke');
    });

    it('gives no verdict inside the 15-point band or with one axis missing', () => {
        const balanced = Array.from({ length: 8 }, (_, i) =>
            putt(i < 4 ? 'On Line' : 'Off Line', i % 2 ? 'Good Read' : 'Misread'));
        expect(computePuttDiagnostics(balanced).verdict).toBeNull();
        const lineOnly = Array.from({ length: 8 }, () => ({ club: 'Putter', puttLine: 'On Line' }));
        const r = computePuttDiagnostics(lineOnly);
        expect(r.goodReadPct).toBeNull();
        expect(r.verdict).toBeNull();
    });
});
