// Simplify C25 (2026-10-07): par 3s have no fairway, and the hole editor uses
// the live card's one fairway key (.fwy) while old .fir data still counts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState } from '../../src/state.js';
import { fairwayHit } from '../../src/play-mode.js';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
import { UI } from '../../src/ui.js';
import { openFinishModal, openHoleEditor, saveHoleEdits, bindReviewActions, loadHole } from '../../src/oncourse.js';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => { };

const PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4];

beforeEach(() => {
    document.body.innerHTML = `
        <div id="oc-finish-modal" class="hidden"></div>
        <select id="oc-finish-holes"><option value="9">9</option><option value="18">18</option></select>
        <span id="sum-fir"></span>
        <div id="oc-hole-editor-modal" class="hidden">
            <h3 id="hole-editor-title"></h3>
            <span id="editor-score-val"></span><span id="editor-putts-val"></span><span id="editor-pen-val"></span>
            <button id="editor-btn-fir"></button><button id="editor-btn-gir"></button>
        </div>
        <div id="oc-hole-display"></div><div id="oc-par-display"></div>
        <div id="oc-group-scores"></div>`;
    UI.ocTeeSelect = { value: '' };
    UI.sumTotalFir = document.getElementById('sum-fir');
    UI.ocHoleEditorModal = document.getElementById('oc-hole-editor-modal');
    AppState.currentUser = { uid: 'me' };
    AppState.currentRoundCourseName = 'Custom Course';
    AppState.currentRoundTee = null;
    AppState.currentRoundHoles = 9;
    AppState.currentCoursePars = [...PARS];
    AppState.currentHoleShots = [];
    AppState.currentHole = 1;
    bindReviewActions(); // the editor's FIR/GIR toggles, on this fresh DOM
});

const fairwayToggle = () => document.getElementById('editor-btn-fir');

describe('fairwayHit', () => {
    it('par 4/5 only; reads .fwy and the old .fir', () => {
        expect(fairwayHit({ fwy: true }, 4)).toBe(true);
        expect(fairwayHit({ fir: true }, 5)).toBe(true);
        expect(fairwayHit({ fwy: true }, 3)).toBe(false);
        expect(fairwayHit({ fwy: false }, 4)).toBe(false);
        expect(fairwayHit(undefined, 4)).toBe(false);
    });
});

describe('the summary', () => {
    it('does not count a fairway on a par 3, and still counts an old .fir', () => {
        AppState.liveRoundGroups = [{
            uid: 'me', scores: { 1: 5, 2: 3, 3: 6 }, compStats: {},
            simpleStats: { 1: { fir: true }, 2: { fwy: true }, 3: { fwy: true } },
        }];
        openFinishModal();
        expect(UI.sumTotalFir.textContent).toBe('2'); // holes 1 and 3; hole 2 is a par 3
    });
});

describe('the hole editor', () => {
    it('un-ticking a fairway the card set clears it (it used to write .fir and leave .fwy = true)', () => {
        AppState.liveRoundGroups = [{ uid: 'me', scores: { 1: 5 }, compStats: {}, simpleStats: { 1: { fwy: true, putts: 2 } } }];
        openHoleEditor(1);
        fairwayToggle().click(); // on → off
        saveHoleEdits();
        const s = AppState.liveRoundGroups[0].simpleStats[1];
        expect(s.fwy).toBe(false);
        expect('fir' in s).toBe(false);
        expect(fairwayHit(s, 4)).toBe(false);
    });

    it('ticking it writes .fwy (the key the card uses) and drops an old .fir', () => {
        AppState.liveRoundGroups = [{ uid: 'me', scores: { 1: 5 }, compStats: {}, simpleStats: { 1: { fir: false } } }];
        openHoleEditor(1);
        fairwayToggle().click(); // off → on
        saveHoleEdits();
        const s = AppState.liveRoundGroups[0].simpleStats[1];
        expect(s.fwy).toBe(true);
        expect('fir' in s).toBe(false);
    });

    it('a score/putts/GIR-only save keeps the lie-derived fairway and its auto mark', () => {
        AppState.liveRoundGroups = [{ uid: 'me', scores: { 1: 5 }, compStats: {}, simpleStats: { 1: { fwy: true, fwyAuto: true, putts: 2 } } }];
        openHoleEditor(1);
        document.getElementById('editor-btn-gir').click();
        saveHoleEdits();
        const s = AppState.liveRoundGroups[0].simpleStats[1];
        expect(s.fwy).toBe(true);
        expect(s.fwyAuto).toBe(true); // a later lie change to rough can still clear it
    });

    it('an unrelated save leaves an untouched fairway untouched (no miss written)', () => {
        AppState.liveRoundGroups = [{ uid: 'me', scores: { 1: 5 }, compStats: {}, simpleStats: { 1: { putts: 2 } } }];
        openHoleEditor(1);
        saveHoleEdits();
        expect('fwy' in AppState.liveRoundGroups[0].simpleStats[1]).toBe(false);
    });

    it('changing the fairway by hand drops the auto mark', () => {
        AppState.liveRoundGroups = [{ uid: 'me', scores: { 1: 5 }, compStats: {}, simpleStats: { 1: { fwy: true, fwyAuto: true } } }];
        openHoleEditor(1);
        fairwayToggle().click(); // on → off
        saveHoleEdits();
        const s = AppState.liveRoundGroups[0].simpleStats[1];
        expect(s.fwy).toBe(false);
        expect('fwyAuto' in s).toBe(false);
    });

    it('an unrelated save still moves an old .fir onto .fwy', () => {
        AppState.liveRoundGroups = [{ uid: 'me', scores: { 1: 5 }, compStats: {}, simpleStats: { 1: { fir: true } } }];
        openHoleEditor(1);
        saveHoleEdits();
        const s = AppState.liveRoundGroups[0].simpleStats[1];
        expect(s.fwy).toBe(true);
        expect('fir' in s).toBe(false);
    });

    it('hides the fairway toggle on a par 3', () => {
        AppState.liveRoundGroups = [{ uid: 'me', scores: { 2: 3 }, compStats: {}, simpleStats: {} }];
        openHoleEditor(2);
        expect(fairwayToggle().classList.contains('hidden')).toBe(true);
        openHoleEditor(1);
        expect(fairwayToggle().classList.contains('hidden')).toBe(false);
    });
});

describe('the normal round card', () => {
    it('shows no FW button on a par 3 (Play mode already hid it)', () => {
        AppState.liveRoundGroups = [{ uid: 'me', name: 'Me', scores: {}, compStats: {}, simpleStats: {} }];
        AppState.currentHole = 2;
        loadHole();
        expect(document.querySelector('.mini-fw').classList.contains('hidden')).toBe(true);
        AppState.currentHole = 3;
        loadHole();
        expect(document.querySelector('.mini-fw').classList.contains('hidden')).toBe(false);
    });
});
