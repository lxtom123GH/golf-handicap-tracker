import { describe, it, expect, vi } from 'vitest';

// ---- Mock the transitive import chain of score-input.js (pattern from
// tests/oncourse.test.js) so the pure highlightGroups logic can be tested in
// jsdom without Firebase or the app shell.

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), doc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
}));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
vi.mock('../../src/state.js', () => ({ AppState: {}, mutateList: vi.fn() }));
vi.mock('../../src/oncourse.js', () => ({ loadHole: vi.fn(), getLastGpsFix: vi.fn() }));
vi.mock('../../src/course-data.js', () => ({ COURSE_DATA: {} }));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: vi.fn(), loadCourseOverlay: vi.fn(), mountHoleOverlay: vi.fn(), curveCarryM: vi.fn(),
}));
vi.mock('../../src/modules/card-render.js', () => ({ renderBagButtons: vi.fn() }));

import { highlightGroups } from '../../src/modules/score-input.js';

function buildWizard() {
    document.body.innerHTML = `
    <div id="oncourse-wizard">
      <div>
        <button class="btn-grid-compact" data-group="startLine" data-val="Right"></button>
        <button class="btn-grid-compact" data-group="shape" data-val="Draw"></button>
        <button class="btn-grid-compact" data-group="shape" data-val="Fade"></button>
        <button class="btn-grid-compact" data-group="missPattern" data-val="Long Right"></button>
      </div>
    </div>`;
    return document.getElementById('oncourse-wizard');
}

describe('highlightGroups (S1 Part B)', () => {
    it('marks exactly one button per populated group, none for empty groups', () => {
        const wizard = buildWizard();
        highlightGroups(wizard, { shape: 'Fade', missPattern: 'Long Right' });
        expect(wizard.querySelectorAll('[data-group="shape"].active-choice')).toHaveLength(1);
        expect(wizard.querySelector('[data-group="shape"].active-choice').getAttribute('data-val')).toBe('Fade');
        expect(wizard.querySelectorAll('[data-group="missPattern"].active-choice')).toHaveLength(1);
        expect(wizard.querySelector('[data-group="missPattern"].active-choice').getAttribute('data-val')).toBe('Long Right');
        expect(wizard.querySelectorAll('[data-group="startLine"].active-choice')).toHaveLength(0);
    });

    it('re-highlighting moves the mark — never two active in one group', () => {
        const wizard = buildWizard();
        highlightGroups(wizard, { shape: 'Fade' });
        highlightGroups(wizard, { shape: 'Draw', startLine: 'Right' });
        expect(wizard.querySelectorAll('.btn-grid-compact.active-choice')).toHaveLength(2);
        expect(wizard.querySelector('[data-group="shape"].active-choice').getAttribute('data-val')).toBe('Draw');
        expect(wizard.querySelector('[data-group="startLine"].active-choice').getAttribute('data-val')).toBe('Right');
    });

    it('tolerates a missing wizard and unknown values (old shots render unchanged)', () => {
        expect(() => highlightGroups(null, { shape: 'Fade' })).not.toThrow();
        const wizard = buildWizard();
        highlightGroups(wizard, { shape: 'Not-A-Button' });
        expect(wizard.querySelectorAll('.active-choice')).toHaveLength(0);
    });
});
