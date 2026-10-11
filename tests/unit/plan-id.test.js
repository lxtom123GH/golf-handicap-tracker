import { describe, it, expect, vi } from 'vitest';

// ---- Mock the transitive import chain of score-input.js (pattern from
// tests/unit/wizard-highlight.test.js) so the pure plan helpers can be
// tested in jsdom without Firebase or the app shell.

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), doc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
    getDoc: vi.fn(), getDocs: vi.fn(),
}));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
vi.mock('../../src/state.js', () => ({ AppState: {}, mutateList: vi.fn() }));
vi.mock('../../src/oncourse.js', () => ({ loadHole: vi.fn(), getLastGpsFix: vi.fn() }));
vi.mock('../../src/course-data.js', () => ({ COURSE_DATA: {} }));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: vi.fn(), loadCourseOverlay: vi.fn(), mountHoleOverlay: vi.fn(), curveCarryM: vi.fn(),
}));
vi.mock('../../src/gps-capture.js', () => ({ createCapture: vi.fn(), GPS_POLICY: {} }));
vi.mock('../../src/shot-shape.js', () => ({ classifyCurve: vi.fn(), missPatternFrom: vi.fn() }));
vi.mock('../../src/geo.js', () => ({ toFrame: vi.fn(), fromFrame: vi.fn() }));
vi.mock('../../src/modules/card-render.js', () => ({ renderBagButtons: vi.fn() }));

import { planIdFor, PLAN_MAX_POINTS } from '../../src/modules/score-input.js';

describe('S3: hole plan identity and caps', () => {
    it('planId composes as <courseSlug>-<physicalHole>', () => {
        expect(planIdFor('ashgrove', 1)).toBe('ashgrove-1');
        expect(planIdFor('keperra', 10)).toBe('keperra-10');
        expect(planIdFor('keperra', 27)).toBe('keperra-27');
    });
    it('planIds are unique per hole and per course', () => {
        const ids = new Set([
            planIdFor('ashgrove', 1), planIdFor('ashgrove', 2),
            planIdFor('keperra', 1), planIdFor('keperra', 2),
        ]);
        expect(ids.size).toBe(4);
    });
    it('the plan line cap is 48 points (the same number the rules enforce)', () => {
        expect(PLAN_MAX_POINTS).toBe(48);
    });
});
