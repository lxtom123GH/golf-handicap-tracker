import { describe, it, expect } from 'vitest';
import {
    lastSetupKey, normaliseSetup, readSetups, recordSetup, validateSetup,
    describeSetup, overlayPoints, nearestCourse, pickCourseOption, pickSetupForSlug,
} from '../../src/last-setup.js';
import { COURSE_DATA, holesForCourse } from '../../src/course-data.js';

// Owner 2026-10-05: "make it easier and faster to start a new round".
// These are the pure parts behind the Play again card, the remembered
// setup-screen defaults and the GPS course pick.

function memStorage(seed = {}) {
    const m = new Map(Object.entries(seed));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        _m: m,
    };
}

const WEST = 'Keperra – West Course (9 holes)';
const OLD18 = 'Keperra - Old (1-18)';
const base = {
    course: OLD18, tee: 'Blue (Men)', holes: 18, mode: 'detailed',
    players: [{ uid: 'guest_abc', name: 'Sam', isGuest: true }], selfIncluded: true,
};

describe('lastSetupKey', () => {
    it('is per user, in the golf.* key style', () => {
        expect(lastSetupKey('u1')).toBe('golf.lastSetup.u1');
    });
});

describe('normaliseSetup', () => {
    it('keeps a good setup', () => {
        const s = normaliseSetup(base);
        expect(s).toMatchObject({ course: OLD18, tee: 'Blue (Men)', holes: 18, mode: 'detailed', selfIncluded: true });
        expect(s.players).toEqual([{ uid: 'guest_abc', name: 'Sam', isGuest: true }]);
    });

    it('rejects junk, Custom Course and an empty group', () => {
        expect(normaliseSetup(null)).toBeNull();
        expect(normaliseSetup('x')).toBeNull();
        expect(normaliseSetup({ ...base, course: '' })).toBeNull();
        expect(normaliseSetup({ ...base, tee: '' })).toBeNull();
        expect(normaliseSetup({ ...base, course: 'Custom Course' })).toBeNull();
        expect(normaliseSetup({ ...base, holes: 12 })).toBeNull();
        expect(normaliseSetup({ ...base, players: [], selfIncluded: false })).toBeNull();
    });

    it('defaults an unknown mode to Simple and drops bad or duplicate players', () => {
        const s = normaliseSetup({
            ...base, mode: 'weird',
            players: [{ uid: 'a', name: 'A' }, { uid: 'a', name: 'A again' }, { name: 'no uid' }, 7],
        });
        expect(s.mode).toBe('simple');
        expect(s.players).toEqual([{ uid: 'a', name: 'A', isGuest: false }]);
    });

    it('never carries a daily handicap (it is per day, re-derived each round)', () => {
        const s = normaliseSetup({ ...base, dailyHandicap: 12, players: [{ uid: 'g', name: 'G', dailyHandicapOverride: 9 }] });
        expect(JSON.stringify(s)).not.toMatch(/[Hh]andicap/);
    });
});

describe('readSetups / recordSetup', () => {
    it('round-trips, newest first, one entry per course', () => {
        const st = memStorage();
        recordSetup(st, 'u1', base, 1000);
        recordSetup(st, 'u1', { ...base, course: WEST, tee: 'White (Men)', holes: 9, mode: 'simple' }, 2000);
        recordSetup(st, 'u1', { ...base, mode: 'simple' }, 3000);
        const list = readSetups(st, 'u1');
        expect(list.map(s => s.course)).toEqual([OLD18, WEST]);
        expect(list[0].mode).toBe('simple');
        expect(list[0].savedAt).toBe(3000);
    });

    it('is per user', () => {
        const st = memStorage();
        recordSetup(st, 'u1', base, 1);
        expect(readSetups(st, 'u2')).toEqual([]);
    });

    it('keeps at most 6 courses', () => {
        const st = memStorage();
        for (let i = 0; i < 9; i++) recordSetup(st, 'u1', { ...base, course: `C${i}` }, i);
        const list = readSetups(st, 'u1');
        expect(list).toHaveLength(6);
        expect(list[0].course).toBe('C8');
    });

    it('survives corrupt storage and a storage that throws', () => {
        expect(readSetups(memStorage({ 'golf.lastSetup.u1': '{nope' }), 'u1')).toEqual([]);
        const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
        expect(readSetups(boom, 'u1')).toEqual([]);
        expect(() => recordSetup(boom, 'u1', base, 1)).not.toThrow();
        expect(readSetups(null, 'u1')).toEqual([]);
        expect(readSetups(memStorage(), '')).toEqual([]);
    });

    it('does not record an invalid setup', () => {
        const st = memStorage();
        recordSetup(st, 'u1', { ...base, course: 'Custom Course' }, 1);
        expect(st._m.size).toBe(0);
    });
});

describe('validateSetup', () => {
    const ctx = (over = {}) => ({
        courseData: COURSE_DATA,
        holesForCourse,
        courseOptions: [OLD18, WEST, 'Ashgrove GC'],
        playerOptions: new Map([['me', { name: 'Me' }], ['guest_abc', { name: 'Sam', hc: 18 }]]),
        ...over,
    });

    it('passes a setup whose course, tee and players still exist', () => {
        const v = validateSetup(base, ctx());
        expect(v).toMatchObject({ course: OLD18, tee: 'Blue (Men)', holes: 18 });
        expect(v.players).toEqual([{ uid: 'guest_abc', name: 'Sam', isGuest: true, hc: 18 }]);
    });

    it('falls back (null) when the course or tee is gone', () => {
        expect(validateSetup({ ...base, course: 'Gone GC' }, ctx())).toBeNull();
        expect(validateSetup(base, ctx({ courseOptions: [WEST] }))).toBeNull();
        expect(validateSetup({ ...base, tee: 'Purple (Men)' }, ctx())).toBeNull();
    });

    it('falls back when the tee has no usable rating (Par/CR/SR must be typed)', () => {
        expect(validateSetup(base, ctx({ isRatableTee: () => false }))).toBeNull();
        expect(validateSetup(base, ctx({ isRatableTee: () => true }))).not.toBeNull();
    });

    it('takes the round length from the course record', () => {
        const v = validateSetup({ ...base, course: WEST, tee: 'White (Men)', holes: 18 }, ctx());
        expect(v.holes).toBe(9);
    });

    it('drops a player who is no longer pickable (deleted guest)', () => {
        const v = validateSetup(base, ctx({ playerOptions: new Map([['me', { name: 'Me' }]]) }));
        expect(v.players).toEqual([]);
        expect(v.selfIncluded).toBe(true);
    });

    it('is null when nobody would be left to play', () => {
        const s = { ...base, selfIncluded: false };
        expect(validateSetup(s, ctx({ playerOptions: new Map() }))).toBeNull();
    });
});

describe('describeSetup', () => {
    it('reads in plain English', () => {
        const d = describeSetup({ ...base, players: [{ uid: 'g', name: 'Sam', isGuest: true }, { uid: 'f', name: 'Jo', isGuest: false }] }, 'Keperra – Old + North (Par 72)');
        expect(d.title).toBe('Keperra – Old + North (Par 72)');
        expect(d.details).toBe('Blue (Men) tees · 18 holes · Detailed');
        expect(d.players).toBe('You, Sam (guest), Jo');
    });

    it('says "Just you" for a solo round and omits you when you sat out', () => {
        expect(describeSetup({ ...base, players: [] }).players).toBe('Just you');
        expect(describeSetup({ ...base, selfIncluded: false }).players).toBe('Sam (guest)');
        expect(describeSetup({ ...base, mode: 'simple', holes: 9 }).details).toMatch(/9 holes · Simple$/);
    });
});

describe('GPS course pick', () => {
    const overlay = {
        holes: {
            1: { tee: { lat: -27.0, lon: 153.0 }, green: { centre: { lat: -27.003, lon: 153.0 } }, line: [{ lat: -27.001, lon: 153.0 }] },
            10: { tee: { lat: -27.01, lon: 153.0 }, green: { centre: { lat: -27.012, lon: 153.0 } } },
        },
    };

    it('collects tee, green and line points from an overlay', () => {
        const pts = overlayPoints(overlay);
        expect(pts).toContainEqual([-27.0, 153.0]);
        expect(pts).toContainEqual([-27.003, 153.0]);
        expect(pts).toContainEqual([-27.001, 153.0]);
        expect(overlayPoints(null)).toEqual([]);
    });

    it('picks the nearest course within 1.5 km, else none', () => {
        const anchors = [
            { slug: 'a', points: [[-27.0, 153.0]] },
            { slug: 'b', points: [[-27.0, 153.005]] },
        ];
        // ~ 400 m east of A, ~ 100 m west of B
        expect(nearestCourse({ lat: -27.0, lon: 153.004 }, anchors).slug).toBe('b');
        // ~ 5 km away from both
        expect(nearestCourse({ lat: -27.05, lon: 153.0 }, anchors)).toBeNull();
        expect(nearestCourse({ lat: NaN, lon: 153 }, anchors)).toBeNull();
        expect(nearestCourse(null, anchors)).toBeNull();
    });

    it('ignores a fix too vague to tell courses apart', () => {
        const anchors = [{ slug: 'a', points: [[-27.0, 153.0]] }];
        expect(nearestCourse({ lat: -27.0, lon: 153.0, accuracyM: 3000 }, anchors)).toBeNull();
        expect(nearestCourse({ lat: -27.0, lon: 153.0, accuracyM: 30 }, anchors).slug).toBe('a');
    });

    it('picks the nine whose first tee is nearest, at the round length shown', () => {
        const cands = [
            { value: 'Old 9', holes: 9, firstTee: [-27.0, 153.0] },
            { value: 'North 9', holes: 9, firstTee: [-27.01, 153.0] },
            { value: 'Old 18', holes: 18, firstTee: [-27.0, 153.0] },
        ];
        expect(pickCourseOption(cands, { lat: -27.0095, lon: 153.0 }, 9)).toBe('North 9');
        expect(pickCourseOption(cands, { lat: -27.0095, lon: 153.0 }, 18)).toBe('Old 18');
        // Nothing at that length: any length will do (Ashgrove is 18 only).
        expect(pickCourseOption([{ value: 'Ash', holes: 18, firstTee: null }], { lat: 0, lon: 0 }, 9)).toBe('Ash');
        expect(pickCourseOption([], { lat: 0, lon: 0 }, 9)).toBeNull();
    });

    it('finds the most recent remembered setup at that course', () => {
        const slugFor = (n) => (n.toLowerCase().includes('keperra') ? 'keperra' : n.toLowerCase().includes('ashgrove') ? 'ashgrove' : null);
        const list = [{ ...base, course: 'Ashgrove GC' }, { ...base, course: WEST }, base];
        expect(pickSetupForSlug(list, 'keperra', slugFor).course).toBe(WEST);
        expect(pickSetupForSlug(list, 'virginia', slugFor)).toBeNull();
    });
});
