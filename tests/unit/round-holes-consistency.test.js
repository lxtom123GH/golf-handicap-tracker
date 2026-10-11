/**
 * PRODUCT SWEEP 2026-09-10, SECOND PASS — F-2, the other two halves.
 *
 * The stroke chart and the Daily Handicap now agree (stroke-allocation.test.js).
 * This file covers where the disagreement was BORN and where it was cashed in:
 *
 *   1. The course list. "9 Holes" is the app's default and the toggle hid one
 *      optgroup, leaving Ashgrove, McLeod and Bulimba — all 18-hole records —
 *      selectable. An 18-hole tee has no nine-hole Course Rating, so the round
 *      is unratable however the chart behaves; the combination must stop being
 *      offered.
 *   2. The AGS conversion. The save handed the TEE's total par (68) to
 *      convertStablefordToAGS together with a holesPlayed of 9, producing an
 *      Adjusted Gross Score on neither scale, which then became a Score
 *      Differential and a handicap index.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The modules under test are pure; their transitive imports are not.
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    writeBatch: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('chart.js/auto', () => ({ default: vi.fn() }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

import { holesForCourse, holesForPar, COURSE_DATA } from '../../src/course-data.js';
import { convertStablefordToAGS } from '../../src/whs.js';
import { AppState } from '../../src/state.js';
import { applyRoundTypeToCourseList } from '../../src/modules/event-binders.js';
import { parForHolesPlayed } from '../../src/oncourse.js';

describe('holesForCourse names the length of a course RECORD', () => {
    it('reads the nine-hole records as nines', () => {
        expect(holesForCourse('Keperra – Old Course (9 holes)')).toBe(9);
        expect(holesForCourse('Keperra – North Course (9 holes)')).toBe(9);
        expect(holesForCourse('Keperra – West Course (9 holes)')).toBe(9);
        expect(holesForCourse('Sandgate GC (9 holes)')).toBe(9);
    });

    it('reads the eighteen-hole records as eighteens — including the three the toggle missed', () => {
        expect(holesForCourse('Ashgrove GC')).toBe(18);
        expect(holesForCourse('McLeod GC')).toBe(18);
        expect(holesForCourse('Bulimba Course')).toBe(18);
        expect(holesForCourse('Keperra - Old (1-18)')).toBe(18);
    });

    it('answers null for Custom Course, whose par is typed at Start Round', () => {
        expect(holesForCourse('Custom Course')).toBeNull();
        expect(holesForCourse('No Such Club')).toBeNull();
    });

    it('agrees with holesForPar on every record that has a par', () => {
        // The two discriminators must not drift apart — that drift is F-2.
        for (const [name, tees] of Object.entries(COURSE_DATA)) {
            const byCourse = holesForCourse(name);
            if (byCourse === null) continue;
            for (const tee of Object.values(tees)) {
                if (Number(tee?.par) > 0) expect(holesForPar(tee.par)).toBe(byCourse);
            }
        }
    });
});

describe('the 9/18 toggle filters the course list', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <select id="oc-course-select">
                <option value="">-- Select Course --</option>
                <optgroup label="Keperra Country Golf Club">
                    <option value="Keperra – Old Course (9 holes)">Old</option>
                    <option value="Keperra – North Course (9 holes)">North</option>
                </optgroup>
                <optgroup label="Keperra – 18 Hole Combinations" id="oc-keperra-18h-group">
                    <option value="Keperra - Old (1-18)">Old + North</option>
                </optgroup>
                <option value="Ashgrove GC">Ashgrove GC</option>
                <option value="McLeod GC">McLeod GC</option>
                <option value="Bulimba Course">Bulimba Course</option>
                <option value="Custom Course">Custom Course…</option>
            </select>`;
    });

    const visible = () => Array.from(document.querySelectorAll('#oc-course-select option'))
        .filter(o => !o.hidden && o.value)
        .map(o => o.value);

    it('offers only nine-hole records — and Custom — under 9 Holes', () => {
        AppState.currentRoundHoles = 9;
        applyRoundTypeToCourseList();
        expect(visible()).toEqual([
            'Keperra – Old Course (9 holes)',
            'Keperra – North Course (9 holes)',
            'Custom Course'
        ]);
        // The three the old toggle left selectable, which is the whole defect:
        expect(visible()).not.toContain('Ashgrove GC');
        expect(visible()).not.toContain('McLeod GC');
        expect(visible()).not.toContain('Bulimba Course');
    });

    it('offers only eighteen-hole records — and Custom — under 18 Holes', () => {
        AppState.currentRoundHoles = 18;
        applyRoundTypeToCourseList();
        expect(visible()).toEqual([
            'Keperra - Old (1-18)',
            'Ashgrove GC',
            'McLeod GC',
            'Bulimba Course',
            'Custom Course'
        ]);
    });

    it('hides an optgroup once every option inside it is hidden', () => {
        AppState.currentRoundHoles = 9;
        applyRoundTypeToCourseList();
        expect(document.getElementById('oc-keperra-18h-group').hidden).toBe(true);
        AppState.currentRoundHoles = 18;
        applyRoundTypeToCourseList();
        expect(document.getElementById('oc-keperra-18h-group').hidden).toBe(false);
    });

    it('clears a selection the toggle has just made invalid', () => {
        const sel = document.getElementById('oc-course-select');
        AppState.currentRoundHoles = 18;
        applyRoundTypeToCourseList();
        sel.value = 'Ashgrove GC';
        AppState.currentRoundHoles = 9;
        applyRoundTypeToCourseList();
        expect(sel.value).toBe('');
    });

    it('leaves a still-valid selection alone', () => {
        const sel = document.getElementById('oc-course-select');
        AppState.currentRoundHoles = 9;
        applyRoundTypeToCourseList();
        sel.value = 'Keperra – Old Course (9 holes)';
        applyRoundTypeToCourseList();
        expect(sel.value).toBe('Keperra – Old Course (9 holes)');
    });
});

describe('parForHolesPlayed keeps the AGS on one scale', () => {
    beforeEach(() => {
        AppState.currentCoursePars = [];
    });

    it('sums the real pars of the holes played', () => {
        // Ashgrove Blue: par 68, out 34.
        AppState.currentCoursePars = [4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4];
        expect(parForHolesPlayed(68, 9)).toBe(34);
        expect(parForHolesPlayed(68, 18)).toBe(68);
    });

    it('a nine scored only on holes 10-18 takes the back nine\'s par (simplify C20)', () => {
        AppState.currentCoursePars = [4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 4, 4, 5, 4, 4, 3, 5, 4];
        expect(parForHolesPlayed(71, 9, [10, 11, 12, 13, 14, 15, 16, 17, 18])).toBe(37);
        expect(parForHolesPlayed(71, 9, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(34);
        // Exactly nine scored holes across the turn sum their own pars (codex P2, pass 2).
        expect(parForHolesPlayed(71, 9, [2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(34 - 4 + 4);
        expect(parForHolesPlayed(71, 9, [5, 6, 7, 8, 9, 10, 11, 12, 13])).toBe(4 + 4 + 3 + 4 + 4 + 4 + 4 + 4 + 5);
        // Back-nine-only with holes missing: still the back nine.
        expect(parForHolesPlayed(71, 9, [10, 12, 18])).toBe(37);
        // Fewer than nine across the turn, or unknown holes, keep the old front-nine reading.
        expect(parForHolesPlayed(71, 9, [8, 9, 10])).toBe(34);
        expect(parForHolesPlayed(71, 9, [10, 11, 19])).toBe(34);
        expect(parForHolesPlayed(71, 9)).toBe(34);
        expect(parForHolesPlayed(71, 18, [10, 11])).toBe(71);
    });

    it('halves an eighteen-hole par when a resumed round has lost the array', () => {
        expect(parForHolesPlayed(68, 9)).toBe(34);
        expect(parForHolesPlayed(72, 9)).toBe(36);
    });

    it("leaves a nine's own par alone", () => {
        expect(parForHolesPlayed(36, 9)).toBe(36);
        expect(parForHolesPlayed(34, 9)).toBe(34);
    });

    it('closes the loop: a player who plays exactly to handicap gets AGS = par + DH', () => {
        AppState.currentCoursePars = [4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4];
        const parPlayed = parForHolesPlayed(68, 9);
        // 9 holes, two points a hole = 18 played to handicap.
        expect(convertStablefordToAGS(18, 9, parPlayed, 9)).toBe(parPlayed + 9);
        // What shipped: the tee's 68 with a nine-hole baseline — 34 too high.
        expect(convertStablefordToAGS(18, 9, 68, 9)).toBe(68 + 9);
    });
});
