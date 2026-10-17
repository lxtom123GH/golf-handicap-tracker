// Owner decision (Alex, 2026-10-17): Ashgrove Blue stroke index follows the
// club website - the first value of the Blue "Index" column on each hole page
// (https://www.ashgrovegolf.com.au/course/hole-1 .. hole-18). Saved rounds are
// not recalculated.
import { describe, it, expect } from 'vitest';
import { COURSE_DATA } from '../../src/course-data.js';

const OFFICIAL_BLUE_SI = [1, 13, 8, 18, 12, 10, 17, 2, 15, 5, 6, 3, 7, 11, 9, 4, 14, 16];

describe('Ashgrove Blue stroke index', () => {
    const blue = COURSE_DATA['Ashgrove GC']['Blue (Men)'];

    it('matches the club website first-index values', () => {
        expect(blue.strokeIndex).toEqual(OFFICIAL_BLUE_SI);
    });

    it('is a permutation of 1..18', () => {
        expect([...blue.strokeIndex].sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    });

    it('leaves the White tee SI untouched', () => {
        expect(COURSE_DATA['Ashgrove GC']['White (Men)'].strokeIndex)
            .toEqual([1, 9, 12, 18, 11, 13, 17, 5, 15, 4, 7, 3, 6, 8, 10, 2, 14, 16]);
    });
});
