// @vitest-environment jsdom
// ==========================================
// lie-chips.test.js — glass chips PR 3: five lie chips incl. Green
// ==========================================
// Reads index.html as text (like contracts.test.js) so the shipped markup is
// what is checked, then drives the real highlightGroups over it.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
vi.mock('../../src/modules/card-render.js', () => ({ renderBagButtons: vi.fn(), shortClubLabel: vi.fn() }));

import { highlightGroups } from '../../src/modules/score-input.js';

const HTML = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

function lieSection() {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    return doc.getElementById('section-lie');
}

describe('glass chips PR 3: lie chips', () => {
    it('ships exactly five lies, in mockup order, ending with Green', () => {
        const vals = [...lieSection().querySelectorAll('[data-group="lie"]')].map(b => b.getAttribute('data-val'));
        expect(vals).toEqual(['Fairway', 'Rough', 'Bunker', 'Trees', 'Green']);
    });

    it('lays them out in one five-column row (class, not an inline 4-column grid)', () => {
        const grid = lieSection().querySelector('.lie-grid');
        expect(grid).not.toBeNull();
        expect(grid.getAttribute('style')).toBeNull();
        const css = fs.readFileSync(path.resolve(__dirname, '../../src/style.css'), 'utf8');
        expect(css).toMatch(/\.lie-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,/);
    });

    it('a saved Green lie highlights the Green chip when the shot is reopened', () => {
        document.body.innerHTML = `<div id="oncourse-wizard">${lieSection().outerHTML}</div>`;
        const wizard = document.getElementById('oncourse-wizard');
        highlightGroups(wizard, { lie: 'Green' });
        const on = wizard.querySelectorAll('[data-group="lie"].active-choice');
        expect(on).toHaveLength(1);
        expect(on[0].getAttribute('data-val')).toBe('Green');
    });
});
