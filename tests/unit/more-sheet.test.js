// Simplify C22 (2026-10-07): the ⋯ sheet folds when it opens something, and
// at round end. It sits outside the hub, so it used to stay open behind the
// summary, and over the setup screen after an Abandon.
import { beforeEach, expect, it, vi } from 'vitest';
import { AppState } from '../../src/state.js';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
import { UI } from '../../src/ui.js';
import { openFinishModal, endRoundCleanup } from '../../src/oncourse.js';

beforeEach(() => {
    document.body.innerHTML = `
        <button id="btn-oc-more" aria-expanded="true"></button>
        <div id="oc-more-sheet" class="oc-more-sheet"></div>
        <div id="oncourse-setup" class="hidden"></div><div id="oncourse-hub"></div>
        <div id="oc-finish-modal" class="hidden"></div>
        <select id="oc-finish-holes"><option value="9">9</option><option value="18">18</option></select>`;
    UI.ocTeeSelect = { value: '' };
    AppState.currentUser = { uid: 'me' };
    AppState.currentRoundCourseName = 'Custom Course';
    AppState.currentRoundHoles = 9;
    AppState.currentCoursePars = [];
    AppState.currentHoleShots = [];
    AppState.liveRoundGroups = [{ uid: 'me', scores: { 1: 5 }, simpleStats: {}, compStats: {} }];
});

const folded = () => document.getElementById('oc-more-sheet').classList.contains('hidden')
    && document.getElementById('btn-oc-more').getAttribute('aria-expanded') === 'false';

it('⋯ → Finish Round folds the sheet behind the summary', () => {
    openFinishModal();
    expect(document.getElementById('oc-finish-modal').classList.contains('hidden')).toBe(false);
    expect(folded()).toBe(true);
});

it('the end of the round folds the sheet (it sits outside the hub)', () => {
    endRoundCleanup();
    expect(document.getElementById('oncourse-setup').classList.contains('hidden')).toBe(false);
    expect(folded()).toBe(true);
});
