import { describe, it, expect } from 'vitest';
import { COURSE_DATA, isRatableTee, isPlausibleRating } from '../../src/course-data.js';

// BL-4.01 / F1+F11: isRatableTee gates whether a tee's stored rating/slope/par
// can be trusted for handicap math, or whether the round needs manual CR/SR/par
// entry. Getting this wrong is what silently corrupted whs_rounds.
describe('isRatableTee', () => {
    it('accepts a fully-rated tee (Keperra Old Yellow)', () => {
        expect(isRatableTee(COURSE_DATA['Keperra - Old (1-18)']['Yellow (Men)'])).toBe(true);
    });

    it('rejects the by-design par-0 Custom tee (manual-entry trigger)', () => {
        expect(isRatableTee(COURSE_DATA['Custom Course']['Custom Tee'])).toBe(false);
    });

    it('accepts operator-corrected tees incl. the short par-3 Bulimba (Phase 3)', () => {
        expect(isRatableTee(COURSE_DATA['Ashgrove GC']['White (Men)'])).toBe(true);
        expect(isRatableTee(COURSE_DATA['Ashgrove GC']['Blue (Men)'])).toBe(true);
        expect(isRatableTee(COURSE_DATA['McLeod GC']['Blue (Men)'])).toBe(true);
        // rating 49 / slope 65 — below the old floors but a legitimate par-3 course
        expect(isRatableTee(COURSE_DATA['Bulimba Course']['White (Men)'])).toBe(true);
    });

    it('rejects null/undefined and missing-field tees', () => {
        expect(isRatableTee(null)).toBe(false);
        expect(isRatableTee(undefined)).toBe(false);
        expect(isRatableTee({})).toBe(false);
    });

    it('accepts official 9-hole ratings and rejects 18-scale ratings on a nine (BL-UX-07)', () => {
        // Official GA 9-hole ratings (owner-supplied slope charts, 2026-07-04)
        expect(isRatableTee(COURSE_DATA['Keperra – Old Course (9 holes)']['Blue (Men)'])).toBe(true);
        expect(isRatableTee(COURSE_DATA['Keperra – North Course (9 holes)']['Blue (Men)'])).toBe(true);
        expect(isRatableTee(COURSE_DATA['Keperra – West Course (9 holes)']['White (Men)'])).toBe(true);
        expect(isRatableTee(COURSE_DATA['Keperra – West Course (9 holes)']['Blue (Men)'])).toBe(true); // derived 35/131
        // The exact old data bug: an 18-hole-scale rating against a 9-hole par
        expect(isPlausibleRating(71, 125, 36)).toBe(false);
        expect(isPlausibleRating(35, 126, 36)).toBe(true);
    });

    it('enforces each boundary independently', () => {
        const ok = { rating: 70, slope: 113, par: 72, pars: [4], strokeIndex: [1] };
        expect(isRatableTee(ok)).toBe(true);
        expect(isRatableTee({ ...ok, par: 0 })).toBe(false);          // no par
        expect(isRatableTee({ ...ok, slope: 54 })).toBe(false);        // slope below WHS min
        expect(isRatableTee({ ...ok, slope: 156 })).toBe(false);       // slope above WHS max
        expect(isRatableTee({ ...ok, rating: 44 })).toBe(false);       // rating below floor (45)
        expect(isRatableTee({ ...ok, rating: 91 })).toBe(false);       // implausible rating
        expect(isRatableTee({ ...ok, pars: [] })).toBe(false);         // no hole pars
        expect(isRatableTee({ ...ok, strokeIndex: [] })).toBe(false);  // no stroke index
    });
});

// P-246 (2026-09-06): the family-beta courses. Every record carries a `source`
// string naming the page it was read from; a tee whose rating could not be
// found on an official or club page is flagged ratingUnknown and must be
// unratable so the app asks for CR/SR/par by hand instead of trusting a guess.
describe('P-246 family-beta course records', () => {
    const sumOf = arr => arr.reduce((a, b) => a + b, 0);

    it('Ashgrove Blue still matches the club page (67/124, par 68, 4946m) and is ratable', () => {
        const tee = COURSE_DATA['Ashgrove GC']['Blue (Men)'];
        expect([tee.rating, tee.slope, tee.par]).toEqual([67, 124, 68]);
        expect(sumOf(tee.pars)).toBe(68);
        expect(sumOf(tee.lengths)).toBe(4946);
        expect(tee.source).toMatch(/ashgrovegolf\.com\.au/);
        expect(isRatableTee(tee)).toBe(true);
    });

    it('Redcliffe Blue carries the club figures (72/123, par 71, 6099m) with a reconciled card', () => {
        const tee = COURSE_DATA['Redcliffe GC']['Blue (Men)'];
        expect([tee.rating, tee.slope, tee.par]).toEqual([72, 123, 71]);
        expect(sumOf(tee.pars)).toBe(71);
        expect(sumOf(tee.lengths)).toBe(6099);
        expect([...tee.strokeIndex].sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
        expect(tee.source).toMatch(/redcliffegolf\.com/);
        expect(isRatableTee(tee)).toBe(true);
    });

    it('Virginia tees are flagged ratingUnknown and are NOT ratable (manual CR/SR entry)', () => {
        const champ = COURSE_DATA['Virginia GC - Championship (1-18)'];
        for (const name of ['Blue (Men)', 'White (Men)', 'Red (Women)']) {
            const tee = champ[name];
            expect(tee.ratingUnknown).toBe(true);
            expect(tee.rating).toBeNull();
            expect(tee.slope).toBeNull();
            expect(isRatableTee(tee)).toBe(false);
            expect(tee.source).toMatch(/virginiagolf\.com\.au/);
        }
        expect(sumOf(champ['Blue (Men)'].pars)).toBe(71);
        expect(sumOf(champ['Blue (Men)'].lengths)).toBe(6117);
        expect(sumOf(champ['White (Men)'].lengths)).toBe(5926);
        expect(sumOf(champ['Red (Women)'].pars)).toBe(73);
        const heritage = COURSE_DATA['Virginia GC - Heritage Nine (19-27)']['Blue (Men)'];
        expect(heritage.ratingUnknown).toBe(true);
        expect(isRatableTee(heritage)).toBe(false);
        expect(sumOf(heritage.pars)).toBe(35);
    });

    it('every tee that is not ratingUnknown stays ratable (no record broke the shape)', () => {
        for (const [course, tees] of Object.entries(COURSE_DATA)) {
            if (course === 'Custom Course') continue;
            for (const [name, tee] of Object.entries(tees)) {
                if (tee.ratingUnknown) continue;
                expect(isRatableTee(tee), `${course} / ${name}`).toBe(true);
            }
        }
    });
});
