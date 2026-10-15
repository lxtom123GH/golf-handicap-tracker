// ==========================================================================
// include-guard.test.js
// "Include" must not put a round back that the APP excluded for a reason.
// ==========================================================================
//
// On Course saves an unscorable card (e.g. a tee with no stroke index) with
// its RAW gross as adjustedGross - no per-hole cap - plus notCountingReason.
// The row's Exclude/Include toggle flipped notCounting with no check, so one
// tap put an uncapped gross into the index. Same for a round whose ratings
// fail the nine-aware plausibility check.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const fs = vi.hoisted(() => ({ updates: [] }));

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_db, col, id) => ({ _path: `${col}/${id}` })),
    updateDoc: vi.fn(async (ref, data) => { fs.updates.push({ ref, data }); }),
    getDoc: vi.fn(), setDoc: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { appExcludedReason } from '../../src/round-validity.js';

const { scoringUnavailableReason } = await import('../../src/whs.js');
const STROKE_INDEX_REASON = scoringUnavailableReason(null, 10);
const NO_INDEX_REASON = scoringUnavailableReason([1, 2, 3], null);

const base = { id: 'r1', uid: 'u1', course: 'Keperra - Old', rating: 70.5, slope: 124, adjustedGross: 88, holesPlayed: 18 };

describe('appExcludedReason', () => {
    it('is null for a round the golfer excluded by hand', () => {
        expect(appExcludedReason({ ...base, notCounting: true })).toBeNull();
    });
    it('gives the On Course stroke-index reason a short label', () => {
        expect(appExcludedReason({ ...base, notCounting: true, notCountingReason: STROKE_INDEX_REASON }))
            .toMatch(/^this tee has no stroke index/);
    });
    it('gives the unavailable-Daily-Handicap reason a timeless short label', () => {
        const why = appExcludedReason({ ...base, notCounting: true, notCountingReason: NO_INDEX_REASON });
        expect(why).toMatch(/^played without a confirmed Daily Handicap/);
        expect(why).not.toMatch(/Set your index/);
    });
    it('keeps any other stored reason, without a trailing full stop', () => {
        expect(appExcludedReason({ ...base, notCountingReason: "Course rating / slope don't look right for a 9-hole round." }))
            .toBe("Course rating / slope don't look right for a 9-hole round");
    });
    it('flags an On Course round (par stored) whose ratings fail the nine-aware check', () => {
        expect(appExcludedReason({ ...base, holesPlayed: 9, par: 36, rating: 70, slope: 120 })).toMatch(/rating/);
    });
    it('does not lock a legacy nine with no par and no holesPlayed', () => {
        expect(appExcludedReason({ ...base, holesPlayed: null, rating: 35, slope: 126, notCounting: true })).toBeNull();
    });
    it('accepts a real nine rating', () => {
        expect(appExcludedReason({ ...base, holesPlayed: 9, rating: 35, slope: 126, par: 36 })).toBeNull();
    });
    it('treats a blank stored reason as none (old docs write null)', () => {
        expect(appExcludedReason({ ...base, notCountingReason: null })).toBeNull();
    });
});

async function renderWith(rounds) {
    document.body.innerHTML = `
        <span id="record-player-name"></span><div id="whs-welcome"></div><div id="empty-state"></div>
        <table><tbody id="history-tbody"></tbody></table>`;
    vi.resetModules();
    const { AppState } = await import('../../src/state.js');
    AppState.currentUser = { uid: 'u1', displayName: 'Alex' };
    AppState.viewingPlayerId = 'u1';
    AppState.currentRounds = rounds;
    const ui = await import('../../src/ui.js');
    ui.renderRoundsHistory(rounds, []);
    return AppState;
}

describe('the scoring record row', () => {
    beforeEach(() => { fs.updates = []; window.currentUserIsAdmin = false; });

    it('offers no Include for an app-excluded round, and says why', async () => {
        await renderWith([{ ...base, notCounting: true, notCountingReason: STROKE_INDEX_REASON }]);
        expect(document.querySelector('.toggle-count-btn')).toBeNull();
        expect(document.querySelector('.round-excluded-why').textContent).toContain('no stroke index');
    });

    it('still offers Include for a legacy nine the golfer excluded (no par stored)', async () => {
        await renderWith([{ ...base, holesPlayed: null, rating: 35, slope: 126, notCounting: true }]);
        expect(document.querySelector('.toggle-count-btn').textContent.trim()).toBe('Include');
    });

    it('still offers Include for a round the golfer excluded', async () => {
        await renderWith([{ ...base, notCounting: true }]);
        expect(document.querySelector('.toggle-count-btn').textContent.trim()).toBe('Include');
    });

    it('toggleCountingRules refuses to include an app-excluded round', async () => {
        const AppState = await renderWith([{ ...base, notCounting: true, notCountingReason: STROKE_INDEX_REASON }]);
        await import('../../src/whs.js');
        window.alert = vi.fn();
        await window.toggleCountingRules('r1');
        expect(fs.updates).toEqual([]);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).not.toMatch(/\.\.$/);
        expect(AppState.currentRounds[0].notCounting).toBe(true);
    });

    it('toggleCountingRules still includes a golfer-excluded round', async () => {
        await renderWith([{ ...base, notCounting: true }]);
        await import('../../src/whs.js');
        window.confirm = vi.fn(() => true);
        await window.toggleCountingRules('r1');
        expect(fs.updates).toHaveLength(1);
        expect(fs.updates[0].data).toEqual({ notCounting: false });
    });
});
