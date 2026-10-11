import { describe, it, expect } from 'vitest';
import { normaliseToIntent, summariseClub, sentenceFor, MIN_SHOTS_FOR_PATTERN } from '../../src/intent-analysis.js';

// Curves are already frame metres — no geo needed (spec note).

/** A swing (straight intent, bend actual) rendered in a hole frame rotated
 * `deg` off the axis, teed at `start`. BOTH curves rotate — the checkpoint
 * is the same physical swing seen in a different hole frame. */
function shot({ deg = 0, start = [0, 0], bend = 0, club = 'Dr', derived = null }) {
    const a = deg * Math.PI / 180;
    // Hole-frame convention: +deg = right of the hole axis (+y), so rotate
    // the swing toward +x (clockwise in the x-right/y-toward frame).
    const rot = ([x, y]) => [start[0] + x * Math.cos(a) + y * Math.sin(a), start[1] - x * Math.sin(a) + y * Math.cos(a)];
    const intended = [[0, 0], [0, 20], [0, 40], [0, 60]].map(rot);
    // Bulge returns toward the line so classifyCurve's chord-perpendicular
    // reads the bend (6 → Fade band, 12 → Slice, 3 → Straight).
    const actual = [[0, 0], [bend, 30], [bend * 0.3, 60]].map(rot);
    return { club, lineIntended: intended, lineActual: actual, ...(derived ? { derived } : {}) };
}

describe('normaliseToIntent', () => {
    it('rotates a 30° intended chord to vertical within 0.5° and starts at (0,0)', () => {
        const n = normaliseToIntent(shot({ deg: 30 }));
        const i = n.intended;
        expect(i[0][0]).toBeCloseTo(0, 5);
        expect(i[0][1]).toBeCloseTo(0, 5);
        const chord = Math.atan2(i[i.length - 1][0] - i[0][0], i[i.length - 1][1] - i[0][1]) * 180 / Math.PI;
        expect(Math.abs(chord)).toBeLessThan(0.5);
        // The chord length is preserved (rotation is rigid).
        expect(Math.hypot(i[i.length - 1][0], i[i.length - 1][1])).toBeCloseTo(60, 1);
    });

    it('a rotated copy of the same curve overlays itself (checkpoint maths)', () => {
        const base = normaliseToIntent(shot({ deg: 0, bend: 6 }));
        const rotated = normaliseToIntent(shot({ deg: 30, bend: 6 }));
        // Same swing shape, different hole frame → the actual curves agree.
        for (let k = 0; k < base.actual.length; k++) {
            expect(Math.hypot(base.actual[k][0] - rotated.actual[k][0],
                base.actual[k][1] - rotated.actual[k][1])).toBeLessThan(0.5);
        }
    });

    it('returns null for shots missing either curve and tolerates {x,y} objects', () => {
        expect(normaliseToIntent({ club: 'Dr', lineIntended: [[0, 0], [0, 10]] })).toBeNull();
        expect(normaliseToIntent({ club: 'Dr', lineActual: [[0, 0], [0, 10]] })).toBeNull();
        const obj = normaliseToIntent({
            club: 'Dr',
            lineIntended: [{ x: 0, y: 0 }, { x: 0, y: 20 }],
            lineActual: [{ x: 1, y: 0 }, { x: 1, y: 15 }],
        });
        expect(obj.intended.length).toBe(2);
        expect(obj.actual.length).toBe(2);
    });
});

describe('summariseClub', () => {
    it('counts planned and executed labels over a known set', () => {
        const shots = [
            shot({ deg: 10, bend: 6 }),    // planned Right / Straight; executed Right / Fade
            shot({ deg: 10, bend: 6, derived: { startLine: 'Right', shape: 'Slice', finishOffset: { longM: 12, rightM: 4 } } }),
            shot({ deg: -6, bend: -2 }),   // planned Left / Straight; executed Left / Straight
        ];
        const s = summariseClub(shots);
        expect(s.n).toBe(3);
        expect(s.planned.startLine).toEqual({ Left: 1, Straight: 0, Right: 2 });
        expect(s.planned.shape).toEqual({ Hook: 0, Draw: 0, Straight: 3, Fade: 0, Slice: 0 });
        expect(s.executed.startLine.Right).toBe(2);
        expect(s.executed.shape.Slice).toBe(1);
        expect(s.executed.shape.Fade).toBe(1);
        expect(s.executed.shape.Straight).toBe(1);
    });

    it('ellipse maths on a known set: mean and population sd of the finish offsets', () => {
        const mk = (longM, rightM) => shot({
            deg: 0, bend: 2, derived: { startLine: 'Straight', shape: 'Fade', finishOffset: { longM, rightM } },
        });
        const s = summariseClub([mk(10, 0), mk(20, 6), mk(30, -6)]);
        expect(s.finish.meanLongM).toBe(20);
        expect(s.finish.sdLongM).toBeCloseTo(Math.sqrt(200 / 3), 3);
        expect(s.finish.meanRightM).toBe(0);
        expect(s.finish.sdRightM).toBeCloseTo(Math.sqrt(72 / 3), 3);
    });

    it('skips shots without both curves, never crashes on empties', () => {
        const shots = [shot({ deg: 8 }), { club: 'Dr' }, { club: 'Dr', lineIntended: [[0, 0], [0, 5]] }, null];
        const s = summariseClub(shots);
        expect(s.n).toBe(1);
        expect(s.club).toBe('Dr');
    });
});

describe('sentenceFor / summariseClub.sentence', () => {
    it('below threshold → the Log 5 prompt with the club name', () => {
        const s = summariseClub([shot({ deg: 8 }), shot({ deg: 8 })]);
        expect(s.sentence).toBe('Log 5 Dr shots with both lines to see your pattern.');
        expect(sentenceFor({ club: '7i', n: MIN_SHOTS_FOR_PATTERN - 1 }))
            .toBe('Log 5 7i shots with both lines to see your pattern.');
    });

    it('planned == executed → "You do what you plan"', () => {
        // bend 3 keeps the executed start >4° (Right) but the shape Straight.
        const shots = Array.from({ length: 5 }, () => shot({ deg: 8, bend: 3 }));
        const s = summariseClub(shots);
        expect(s.sentence).toBe('You do what you plan: start right, hit it straight.');
    });

    it('planned != executed → the two-part verdict', () => {
        // Plan: start right and hit it straight. Execute: centre + slice (derived).
        const shots = Array.from({ length: 5 }, () => shot({
            deg: 8, bend: 12, derived: { startLine: 'Straight', shape: 'Slice', finishOffset: { longM: 0, rightM: 0 } },
        }));
        const s = summariseClub(shots);
        expect(s.sentence).toBe('You plan to start right and hit it straight. You start centre and slice it.');
    });
});

describe('S9: endpoint-only shots in summariseClub', () => {
    // An endpoint-only shot: no drawn actual, a stored derived with null
    // shape/startLine and a real finish offset (from the GPS chain).
    function endpointShot(longM, rightM) {
        const intended = [[0, 0], [0, 20], [0, 40], [0, 60]];
        return {
            club: 'Dr',
            lineIntended: intended,
            lineActual: null,
            actualEndpointOnly: true,
            derived: {
                startLine: null, shape: null, carryM: 58,
                finishOffset: { longM, rightM },
            },
        };
    }

    it('counts in the finish ellipse but not in executed shape/start-line', () => {
        const shots = [
            endpointShot(10, 4),
            endpointShot(14, -4),
            shot({ deg: 0, bend: 2, derived: { startLine: 'Straight', shape: 'Straight', finishOffset: { longM: 12, rightM: 0 } } }),
        ];
        const s = summariseClub(shots);
        expect(s.n).toBe(3);
        // Finish offsets include the endpoint-only shots.
        expect(s.finish.meanLongM).toBeCloseTo((10 + 14 + 12) / 3, 6);
        // Executed labels: only the fully-drawn shot contributes.
        expect(s.executed.startLine.Straight).toBe(1);
        expect(s.executed.startLine.Left).toBe(0);
        expect(s.executed.shape.Straight).toBe(1);
        expect(s.executed.shape.Slice).toBe(0);
        // Planned labels still count the endpoint-only shots' intent.
        expect(s.planned.startLine.Straight).toBe(3);
    });

    it('a legacy endpoint shot without derived and without the flag is skipped like before', () => {
        const s = summariseClub([endpointShot(10, 4), { club: 'Dr', lineIntended: [[0, 0], [0, 60]], lineActual: null }]);
        expect(s.n).toBe(1);
        expect(s.executed.startLine.Straight).toBe(0);
        expect(s.executed.shape.Hook).toBe(0);
    });
});
