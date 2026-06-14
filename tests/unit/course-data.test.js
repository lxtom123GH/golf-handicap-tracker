import { describe, it, expect } from 'vitest';
import { COURSE_DATA, isRatableTee } from '../../src/course-data.js';

// BL-4.01 / F1+F11: isRatableTee gates whether a tee's stored rating/slope/par
// can be trusted for handicap math, or whether the round needs manual CR/SR/par
// entry. Getting this wrong is what silently corrupted whs_rounds.
describe('isRatableTee', () => {
    it('accepts a fully-rated tee (Keperra Old Yellow)', () => {
        expect(isRatableTee(COURSE_DATA['Keperra - Old (1-18)']['Yellow (Men)'])).toBe(true);
    });

    it('rejects par-0 tees (McLeod, Bulimba, Custom)', () => {
        expect(isRatableTee(COURSE_DATA['McLeod GC']['Blue (Men)'])).toBe(false);
        expect(isRatableTee(COURSE_DATA['Bulimba Course']['White (Men)'])).toBe(false);
        expect(isRatableTee(COURSE_DATA['Custom Course']['Custom Tee'])).toBe(false);
    });

    it('accepts the corrected 18-hole Ashgrove tees (Phase 3 operator data)', () => {
        expect(isRatableTee(COURSE_DATA['Ashgrove GC']['White (Men)'])).toBe(true);
        expect(isRatableTee(COURSE_DATA['Ashgrove GC']['Blue (Men)'])).toBe(true);
    });

    it('rejects null/undefined and missing-field tees', () => {
        expect(isRatableTee(null)).toBe(false);
        expect(isRatableTee(undefined)).toBe(false);
        expect(isRatableTee({})).toBe(false);
    });

    it('enforces each boundary independently', () => {
        const ok = { rating: 70, slope: 113, par: 72, pars: [4], strokeIndex: [1] };
        expect(isRatableTee(ok)).toBe(true);
        expect(isRatableTee({ ...ok, par: 0 })).toBe(false);          // no par
        expect(isRatableTee({ ...ok, slope: 54 })).toBe(false);        // slope below WHS min
        expect(isRatableTee({ ...ok, slope: 156 })).toBe(false);       // slope above WHS max
        expect(isRatableTee({ ...ok, rating: 49 })).toBe(false);       // implausible rating
        expect(isRatableTee({ ...ok, rating: 91 })).toBe(false);       // implausible rating
        expect(isRatableTee({ ...ok, pars: [] })).toBe(false);         // no hole pars
        expect(isRatableTee({ ...ok, strokeIndex: [] })).toBe(false);  // no stroke index
    });
});
