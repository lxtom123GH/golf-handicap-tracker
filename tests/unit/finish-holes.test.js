// Simplify C20 (2026-10-07): the finish screen pre-selects the holes actually
// scored and warns on a mismatch. "Confirm Holes Played" stays visible.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scoredHoles, defaultHolesPlayed, holesMismatchText, nineOnEighteenReason, tooFewForEighteenReason, unplayedNetParPoints } from '../../src/finish-holes.js';
import { AppState } from '../../src/state.js';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
import { UI } from '../../src/ui.js';
import { openFinishModal } from '../../src/oncourse.js';

const card = (uid, holes) => ({
    uid, scores: Object.fromEntries(holes.map(h => [h, 5])), simpleStats: {}, compStats: {},
});

describe('finish-holes helpers', () => {
    it('lists only holes with a score', () => {
        expect(scoredHoles({ 1: 4, 2: 0, 10: 6, x: 3 })).toEqual([1, 10]);
        expect(scoredHoles(undefined)).toEqual([]);
    });

    it('an 18 where nobody scored more than nine holes defaults to 9; ten or more keeps 18', () => {
        expect(defaultHolesPlayed([card('a', [1, 2, 3, 4, 5, 6, 7, 8, 9])], 18)).toBe(9);
        expect(defaultHolesPlayed([card('a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], 18)).toBe(18);
        expect(defaultHolesPlayed([card('a', [1, 2]), card('b', Array.from({ length: 12 }, (_, i) => i + 1))], 18)).toBe(18);
        expect(defaultHolesPlayed([card('a', [1, 2, 3])], 9)).toBe(9);
    });

    // Review P2: a back-nine-only card (shotgun / two-tee start) is a nine too.
    it('a back-nine-only card on an 18 defaults to 9', () => {
        expect(defaultHolesPlayed([card('a', [10, 11, 12, 13, 14, 15, 16, 17, 18])], 18)).toBe(9);
    });

    it('a nine off an 18-hole tee has a reason not to count; a nine-hole tee or an 18 does not', () => {
        expect(nineOnEighteenReason(9, 72)).toMatch(/no nine-hole Course Rating/);
        expect(nineOnEighteenReason('9', 68)).toMatch(/not counted/);
        expect(nineOnEighteenReason(9, 36)).toBeNull();
        expect(nineOnEighteenReason(18, 72)).toBeNull();
    });

    it('says nothing when the counts match, and names both numbers when not', () => {
        expect(holesMismatchText(9, '9')).toBe('');
        expect(holesMismatchText(9, 18)).toBe('You scored 9 holes but chose 18.');
        expect(holesMismatchText(1, 9)).toBe('You scored 1 hole but chose 9.');
    });
});

describe('WHS: 14 holes for an 18; unplayed holes are net par', () => {
    it('an 18 with fewer than 14 holes scored has a reason not to count', () => {
        expect(tooFewForEighteenReason(18, 13)).toMatch(/at least 14 holes/);
        expect(tooFewForEighteenReason(18, 9)).toMatch(/^Only 9 holes scored/);
        expect(tooFewForEighteenReason(18, 14)).toBeNull();
        expect(tooFewForEighteenReason(18, 18)).toBeNull();
        expect(tooFewForEighteenReason(9, 5)).toBeNull();
    });

    it('each hole of an 18 not played is worth 2 Stableford points (net par)', () => {
        expect(unplayedNetParPoints(18, 15)).toBe(6);
        expect(unplayedNetParPoints(18, 18)).toBe(0);
        expect(unplayedNetParPoints(9, 7)).toBe(0);
    });
});

describe('openFinishModal', () => {
    beforeEach(() => {
        document.body.innerHTML = `<div id="oc-finish-modal" class="hidden"></div>
            <select id="oc-finish-holes"><option value="9">9</option><option value="18">18</option></select>
            <p id="oc-finish-holes-warn" class="hidden"></p>`;
        UI.ocTeeSelect = { value: '' };
        AppState.currentUser = { uid: 'me' };
        AppState.currentRoundCourseName = 'Custom Course';
        AppState.currentRoundTee = null;
        AppState.currentCoursePars = [];
        AppState.currentHoleShots = [];
        AppState.currentHole = 9;
    });

    it('walked in after 9 of a planned 18: pre-selects 9, no warning', () => {
        AppState.currentRoundHoles = 18;
        AppState.liveRoundGroups = [card('me', [1, 2, 3, 4, 5, 6, 7, 8, 9])];
        openFinishModal();
        expect(document.getElementById('oc-finish-holes').value).toBe('9');
        expect(document.getElementById('oc-finish-holes-warn').classList.contains('hidden')).toBe(true);
    });

    it('a choice that does not match the holes scored shows the line, and changing it back clears it', () => {
        AppState.currentRoundHoles = 18;
        AppState.liveRoundGroups = [card('me', [1, 2, 3, 4, 5, 6, 7, 8, 9])];
        openFinishModal();
        const sel = document.getElementById('oc-finish-holes');
        const warn = document.getElementById('oc-finish-holes-warn');
        sel.value = '18';
        sel.dispatchEvent(new Event('change'));
        expect(warn.classList.contains('hidden')).toBe(false);
        expect(warn.textContent).toBe("You scored 9 holes but chose 18. Fewer than 14 holes won't count as an 18.");
        sel.value = '9';
        sel.dispatchEvent(new Event('change'));
        expect(warn.classList.contains('hidden')).toBe(true);
    });

    // Review P3: the default follows YOUR card (the one the save and the
    // warning use), not a partner who played more.
    it('a partner who scored 12 does not push your nine to 18', () => {
        AppState.currentRoundHoles = 18;
        AppState.liveRoundGroups = [card('me', [1, 2, 3, 4, 5, 6, 7, 8, 9]), card('pal', Array.from({ length: 12 }, (_, i) => i + 1))];
        openFinishModal();
        expect(document.getElementById('oc-finish-holes').value).toBe('9');
    });

    it('a nine chosen on an 18-hole tee says it will not count', () => {
        AppState.currentRoundHoles = 18;
        AppState.currentRoundRatings = { rating: 70, slope: 125, par: 72, counting: true };
        AppState.liveRoundGroups = [card('me', [1, 2, 3, 4, 5, 6, 7, 8, 9])];
        openFinishModal();
        const warn = document.getElementById('oc-finish-holes-warn');
        expect(warn.classList.contains('hidden')).toBe(false);
        expect(warn.textContent).toBe("Nine holes off an 18-hole tee won't count in your index.");
        AppState.currentRoundRatings = null;
    });

    it('a legacy resumed round with no saved ratings still gets the line (the tee\'s par)', () => {
        AppState.currentRoundHoles = 18;
        AppState.currentRoundRatings = null;
        AppState.currentRoundCourseName = 'Ashgrove GC';
        AppState.currentRoundTee = 'Blue (Men)';
        AppState.liveRoundGroups = [card('me', [1, 2, 3, 4, 5, 6, 7, 8, 9])];
        openFinishModal();
        expect(document.getElementById('oc-finish-holes-warn').textContent).toMatch(/won't count/);
        AppState.currentRoundCourseName = 'Custom Course';
        AppState.currentRoundTee = null;
    });

    it('12 holes scored, 18 kept: says it will not count as an 18', () => {
        AppState.currentRoundHoles = 18;
        AppState.liveRoundGroups = [card('me', Array.from({ length: 12 }, (_, i) => i + 1))];
        openFinishModal();
        expect(document.getElementById('oc-finish-holes').value).toBe('18');
        expect(document.getElementById('oc-finish-holes-warn').textContent).toMatch(/Fewer than 14 holes won't count as an 18/);
    });

    it('a full 18 stays 18', () => {
        AppState.currentRoundHoles = 18;
        AppState.liveRoundGroups = [card('me', Array.from({ length: 18 }, (_, i) => i + 1))];
        openFinishModal();
        expect(document.getElementById('oc-finish-holes').value).toBe('18');
        expect(document.getElementById('oc-finish-holes-warn').classList.contains('hidden')).toBe(true);
    });
});
