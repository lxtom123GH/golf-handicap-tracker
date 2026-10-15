// ==========================================================================
// unscorable-tee.test.js
// F-9 — refuse to score rather than invent a stroke index
// ==========================================================================
//
// Four Virginia Golf Club tees ship with `strokeIndex: []`. Every scoring site
// fell through a `||` fallback that substituted the hole's PLAYING ORDER for
// its difficulty ranking, so handicap strokes went to holes 1,2,3… instead of
// to the hardest holes. Over nine that is near-certain to be wrong: SI = hole
// number makes holes 1-9 the nine hardest, so a 14-marker gets 9 strokes on the
// front nine instead of the ~7 a real card allocates. The corrupted Stableford
// total became the AGS, and the AGS became the handicap index — and because
// these tees are ratingUnknown the player types CR/SR by hand and the round is
// marked COUNTING, so it went straight in.
//
// Worse, four surfaces used four different fallbacks for the same round, so
// the player saw "Pts: 0" in the header, a blank locker-room card, a non-zero
// leaderboard and a different non-zero number in their record.
//
// The same gate covers F-4's other half: no established Handicap Index means
// no Daily Handicap, and a round cannot be scored to Stableford without one.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let lastSetDoc = null;

vi.mock('../../src/firebase-config.js', () => ({
    db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {}
}));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    query: vi.fn((c) => c), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    doc: vi.fn((_db, col, id) => ({ _path: `${col}/${id}`, id })),
    getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })),
    addDoc: vi.fn(async () => ({ id: 'r' })),
    setDoc: vi.fn(async (ref, data) => { lastSetDoc = { ref, data }; }),
    updateDoc: vi.fn(async () => { }), deleteDoc: vi.fn(async () => { }),
    writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(async () => { }) }))
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

const PARS = [4, 4, 3, 4, 5, 4, 3, 5, 4];
const REAL_SI = [5, 1, 9, 3, 7, 2, 8, 6, 4];
const PARS_18 = [...PARS, 4, 4, 4, 4, 5, 4, 4, 5, 4];
const SI_18 = [9, 1, 17, 5, 13, 3, 15, 11, 7, 10, 2, 18, 6, 14, 4, 16, 12, 8];

// Virginia's shape: rating unknown, stroke index simply not published.
vi.mock('../../src/course-data.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        COURSE_DATA: {
            'Virginia GC - Heritage Nine (19-27)': {
                'Blue (Men)': { rating: 34, slope: 121, par: 36, pars: PARS, strokeIndex: [], ratingUnknown: true }
            },
            'Keperra - Old Course (9 holes)': {
                'White (Men)': { rating: 34, slope: 121, par: 36, pars: PARS, strokeIndex: REAL_SI }
            },
            // An 18 whose nines differ: out 36, in 38.
            'Test Eighteen': {
                'White (Men)': { rating: 72, slope: 125, par: 74, pars: PARS_18, strokeIndex: SI_18 }
            }
        },
        KEPERRA_GPS: {},
        isRatableTee: () => false,
        isPlausibleRating: () => true
    };
});

const roundDom = () => {
    document.body.innerHTML = `
        <div id="oncourse-wizard"></div>
        <div id="oc-hole-display"></div>
        <div id="oc-par-display"></div>
        <select id="oc-par-select"></select>
        <div id="oc-group-scores"></div>
        <p id="oc-scoring-notice" class="hidden"></p>
        <button id="btn-oc-prev-hole"></button>
        <button id="btn-oc-next-hole"></button>
        <button id="btn-oc-finish"></button>
        <button id="btn-oc-save-whs"></button>
        <select id="oc-finish-holes"><option value="9" selected>9</option></select>
        <div id="oncourse-hub"></div>
        <div id="oncourse-setup"></div>
        <div id="oc-finish-modal"></div>
        <div id="oc-exit-bar"></div>
        <div id="oc-sub-nav"></div>
        <div id="hole-jumper-container"></div>
        <div id="tab-oncourse"></div>
        <div id="locker-milestones"></div>
        <div id="oc-locker-room" class="hidden">
            <div id="locker-room-msg"></div>
            <div id="locker-room-err"></div>
            <p id="locker-room-note" class="hidden"></p>
        </div>
    `;
};

/**
 * A finished nine, ready to save. `tee` picks the course; `dailyHandicap` of
 * null is the F-4 "no established index" case.
 */
async function playNine({ course, dailyHandicap = 7 }) {
    const { AppState } = await import('../../src/state.js');
    AppState.currentUser = { uid: 'u1' };
    AppState.currentCoursePars = PARS;
    AppState.currentRoundHoles = 9;
    AppState.currentRoundCourseName = course;
    AppState.currentRoundTee = course.startsWith('Virginia') ? 'Blue (Men)' : 'White (Men)';
    AppState.currentRoundRatings = { rating: 34, slope: 121, par: 36, counting: true };
    AppState.currentTrackingMode = 'simple';
    AppState.currentHoleShots = [];
    AppState.currentLiveCompId = null;
    AppState.currentRoundDate = '2026-09-11';
    AppState.currentHole = 1;
    AppState.activeRoundId = `round_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    // Bogey every hole.
    const scores = {};
    PARS.forEach((p, i) => { scores[i + 1] = p + 1; });
    AppState.liveRoundGroups = [{ uid: 'u1', name: 'Alex', dailyHandicap, scores, compStats: {}, simpleStats: {} }];
    return AppState;
}

const settle = () => new Promise(r => setTimeout(r, 20));

// jsdom implements no scrollIntoView, and the hole jumper calls it.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => { };

beforeEach(() => { vi.resetModules(); localStorage.clear(); lastSetDoc = null; roundDom(); });
afterEach(() => { vi.restoreAllMocks(); });

// --------------------------------------------------------------------------

describe('F-9 getStrokeIndex is honest about what the tee publishes', () => {
    it('returns null for an empty stroke index (it is truthy, so `if (si)` passed)', async () => {
        const { getStrokeIndex } = await import('../../src/course-data.js');
        expect(Boolean([])).toBe(true);
        expect(getStrokeIndex({ strokeIndex: [] }, 9)).toBeNull();
    });

    it('returns null when the field is missing entirely', async () => {
        const { getStrokeIndex } = await import('../../src/course-data.js');
        expect(getStrokeIndex({}, 18)).toBeNull();
        expect(getStrokeIndex(null, 18)).toBeNull();
    });

    it('returns null when it is shorter than the holes being played', async () => {
        const { getStrokeIndex } = await import('../../src/course-data.js');
        expect(getStrokeIndex({ strokeIndex: REAL_SI }, 18)).toBeNull();
    });

    it('returns the real index when the tee publishes one', async () => {
        const { getStrokeIndex } = await import('../../src/course-data.js');
        expect(getStrokeIndex({ strokeIndex: REAL_SI }, 9)).toEqual(REAL_SI);
    });
});

describe('F-9 the saved round is not scored against a fabricated stroke index', () => {
    it('records the gross and refuses the Stableford on a no-SI tee', async () => {
        await playNine({ course: 'Virginia GC - Heritage Nine (19-27)' });
        const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
        bindHoleNav();
        loadHole();

        document.getElementById('btn-oc-save-whs').click();
        await settle();

        expect(lastSetDoc, 'the round should still be recorded').toBeTruthy();
        const p = lastSetDoc.data;
        expect(p.totalGross).toBe(45);      // bogey on all nine
        expect(p.totalStableford).toBeNull();
        expect(p.adjustedGross).toBe(45);   // the gross, not a number invented from SI = hole
    });

    it('marks such a round as not counting, with the reason', async () => {
        await playNine({ course: 'Virginia GC - Heritage Nine (19-27)' });
        const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
        bindHoleNav();
        loadHole();

        document.getElementById('btn-oc-save-whs').click();
        await settle();

        expect(lastSetDoc.data.notCounting).toBe(true);
        expect(String(lastSetDoc.data.notCountingReason)).toMatch(/stroke index/i);
    });

    it('still scores a tee that DOES publish a stroke index', async () => {
        await playNine({ course: 'Keperra - Old Course (9 holes)' });
        const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
        bindHoleNav();
        loadHole();

        document.getElementById('btn-oc-save-whs').click();
        await settle();

        // DH 7 over nine: strokes on SI 1-7, bogey everywhere → 7 holes at 2
        // points and 2 at 1 = 16 points; AGS = 36 + 7 - (16 - 18) = 45.
        expect(lastSetDoc.data.totalStableford).toBe(16);
        expect(lastSetDoc.data.adjustedGross).toBe(45);
        expect(lastSetDoc.data.notCounting).toBe(false);
    });

    // Simplify C20 (review P1): the Finish screen now defaults a planned 18
    // walked in at the turn to 9. A nine saved off an 18-hole tee would pair a
    // nine-hole AGS with the 18-hole CR/SR (no nine-hole rating exists), so the
    // differential is far too low. Kept, but out of the index, with the reason.
    it('a nine saved off an 18-hole tee is kept but not counted', async () => {
        const AppState = await playNine({ course: 'Keperra - Old Course (9 holes)' });
        AppState.currentRoundRatings = { rating: 70, slope: 125, par: 72, counting: true };
        const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
        bindHoleNav();
        loadHole();

        document.getElementById('btn-oc-save-whs').click();
        await settle();

        expect(lastSetDoc.data.holesPlayed).toBe(9);
        expect(lastSetDoc.data.notCounting).toBe(true);
        expect(String(lastSetDoc.data.notCountingReason)).toMatch(/no nine-hole Course Rating/);
        expect(document.getElementById('oc-locker-room').textContent).toMatch(/not counted/);
    });

    // Simplify C20 (codex P2): a card scored only on holes 10-18 now defaults
    // to 9. Its AGS must use the BACK nine's par (38 here), the holes the
    // Stableford points came from, not the front nine's (36).
    it('a back-nine-only card is converted against the back nine\'s par', async () => {
        const AppState = await playNine({ course: 'Test Eighteen' });
        AppState.currentRoundTee = 'White (Men)';
        AppState.currentCoursePars = PARS_18;
        AppState.currentRoundRatings = { rating: 72, slope: 125, par: 74, counting: true };
        // Bogey on each back-nine hole, nothing on the front.
        const scores = {};
        PARS_18.slice(9).forEach((p, i) => { scores[i + 10] = p + 1; });
        AppState.liveRoundGroups[0].scores = scores;
        const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
        const { convertStablefordToAGS } = await import('../../src/whs.js');
        bindHoleNav();
        loadHole();

        document.getElementById('btn-oc-save-whs').click();
        await settle();

        const d = lastSetDoc.data;
        expect(d.holesPlayed).toBe(9);
        expect(d.totalGross).toBe(38 + 9);
        expect(d.adjustedGross).toBe(convertStablefordToAGS(d.totalStableford, 7, 38, 9));
        expect(d.adjustedGross).not.toBe(convertStablefordToAGS(d.totalStableford, 7, 36, 9));
    });

    // Opus review P2 (WHS): an 18-hole score needs 14+ holes, and each hole
    // of an 18 not played counts as net par (2 Stableford points).
    const playEighteen = async (holesScored) => {
        const AppState = await playNine({ course: 'Test Eighteen' });
        AppState.currentRoundTee = 'White (Men)';
        AppState.currentCoursePars = PARS_18;
        AppState.currentRoundHoles = 18;
        AppState.currentRoundRatings = { rating: 72, slope: 125, par: 74, counting: true };
        const scores = {};
        PARS_18.slice(0, holesScored).forEach((p, i) => { scores[i + 1] = p + 1; });
        AppState.liveRoundGroups[0].scores = scores;
        const sel = document.getElementById('oc-finish-holes');
        sel.innerHTML = '<option value="9">9</option><option value="18">18</option>';
        sel.value = '18';
        const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
        bindHoleNav();
        loadHole();
        document.getElementById('btn-oc-save-whs').click();
        await settle();
        return lastSetDoc.data;
    };

    it('an 18 walked in after 15 holes counts, with the 3 missing holes at net par', async () => {
        const { convertStablefordToAGS } = await import('../../src/whs.js');
        const d = await playEighteen(15);
        expect(d.holesPlayed).toBe(18);
        expect(d.notCounting).toBe(false);
        // Bogeys with DH 7 on SI 1-18: the points from 15 holes, plus 2 a hole for 16-18.
        expect(d.adjustedGross).toBe(convertStablefordToAGS(d.totalStableford + 6, 7, 74, 18));
        expect(d.adjustedGross).toBe(convertStablefordToAGS(d.totalStableford, 7, 74, 18) - 6);
    });

    it('a full 18 is unchanged (no net-par points added)', async () => {
        const { convertStablefordToAGS } = await import('../../src/whs.js');
        const d = await playEighteen(18);
        expect(d.notCounting).toBe(false);
        expect(d.adjustedGross).toBe(convertStablefordToAGS(d.totalStableford, 7, 74, 18));
    });

    it('18 chosen with only 12 holes scored is saved but not counted', async () => {
        const d = await playEighteen(12);
        expect(d.holesPlayed).toBe(18);
        expect(d.notCounting).toBe(true);
        expect(String(d.notCountingReason)).toMatch(/at least 14 holes/);
        expect(document.getElementById('oc-locker-room').textContent).toMatch(/not counted/);
    });

    // Codex P2: the Finish choice is confirmed against your own card. You
    // stopped at the turn (9), a partner played 16 holes: the partner is saved
    // as the 18 they played, counting, with holes 17-18 at net par.
    it('a partner who played on past your nine is saved as an 18, not a nine', async () => {
        const fs = await import('firebase/firestore');
        const { convertStablefordToAGS } = await import('../../src/whs.js');
        const AppState = await playNine({ course: 'Test Eighteen' });
        AppState.currentRoundTee = 'White (Men)';
        AppState.currentCoursePars = PARS_18;
        AppState.currentRoundHoles = 18;
        AppState.currentRoundRatings = { rating: 72, slope: 125, par: 74, counting: true };
        const mine = {}; PARS_18.slice(0, 9).forEach((p, i) => { mine[i + 1] = p + 1; });
        const theirs = {}; PARS_18.slice(0, 16).forEach((p, i) => { theirs[i + 1] = p + 1; });
        AppState.liveRoundGroups = [
            { uid: 'u1', name: 'Alex', dailyHandicap: 7, scores: mine, compStats: {}, simpleStats: {} },
            { uid: 'pal', name: 'Pal', dailyHandicap: 10, scores: theirs, compStats: {}, simpleStats: {} }
        ];
        const sel = document.getElementById('oc-finish-holes');
        sel.innerHTML = '<option value="9">9</option><option value="18">18</option>';
        sel.value = '9';
        window.currentUserIsAdmin = true; // the rules let an admin write a partner's round
        try {
            fs.setDoc.mockClear();
            const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
            bindHoleNav();
            loadHole();
            document.getElementById('btn-oc-save-whs').click();
            await settle();
            const saved = fs.setDoc.mock.calls
                .filter(([ref]) => String(ref?._path).startsWith('whs_rounds'))
                .map(([, data]) => data);
            const me = saved.find(d => d.uid === 'u1');
            const pal = saved.find(d => d.uid === 'pal');
            expect(me.holesPlayed).toBe(9);
            expect(me.notCounting).toBe(true);
            expect(pal.holesPlayed).toBe(18);
            expect(pal.notCounting).toBe(false);
            expect(pal.course).toMatch(/\(18H\)$/);
            expect(pal.adjustedGross).toBe(convertStablefordToAGS(pal.totalStableford + 4, 10, 74, 18));
        } finally {
            delete window.currentUserIsAdmin;
        }
    });

    it('refuses to score when the player has no established Handicap Index (F-4)', async () => {
        await playNine({ course: 'Keperra - Old Course (9 holes)', dailyHandicap: null });
        const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
        bindHoleNav();
        loadHole();

        document.getElementById('btn-oc-save-whs').click();
        await settle();

        expect(lastSetDoc.data.totalStableford).toBeNull();
        expect(lastSetDoc.data.adjustedGross).toBe(45);
        expect(lastSetDoc.data.notCounting).toBe(true);
        expect(String(lastSetDoc.data.notCountingReason)).toMatch(/No Daily Handicap is available/i);
    });
});

describe('F-9 the player is told, where they can see it', () => {
    it('says so on the hole screen instead of showing Pts: 0 all round', async () => {
        await playNine({ course: 'Virginia GC - Heritage Nine (19-27)' });
        const { loadHole } = await import('../../src/oncourse.js');

        loadHole();

        const notice = document.getElementById('oc-scoring-notice');
        expect(notice.classList.contains('hidden')).toBe(false);
        expect(notice.textContent).toMatch(/stroke index/i);
        expect(document.getElementById('oc-group-scores').textContent).not.toMatch(/Pts:/);
    });

    it('stays quiet on a tee that can be scored', async () => {
        await playNine({ course: 'Keperra - Old Course (9 holes)' });
        const { loadHole } = await import('../../src/oncourse.js');

        loadHole();

        expect(document.getElementById('oc-scoring-notice').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('oc-group-scores').textContent).toMatch(/Pts:/);
        expect(document.querySelector('.oc-card-grossonly')).toBeNull();
    });

    // Simplify C24: in Play mode the notice folds away with the group sheet,
    // so your own card (the one on the map rail) says "Gross only" itself.
    it('puts a "Gross only" label on your card only, with the reason behind it', async () => {
        const AppState = await playNine({ course: 'Virginia GC - Heritage Nine (19-27)' });
        AppState.liveRoundGroups = [
            { uid: 'guest_1', name: 'Sam', dailyHandicap: 18, scores: {}, compStats: {}, simpleStats: {} },
            ...AppState.liveRoundGroups,
        ];
        const { loadHole } = await import('../../src/oncourse.js');

        loadHole();

        const labels = document.querySelectorAll('.oc-card-grossonly');
        expect(labels).toHaveLength(1);
        expect(labels[0].closest('.compact-score-card').classList.contains('is-primary')).toBe(true);
        expect(labels[0].textContent).toBe('Gross only');
        expect(labels[0].getAttribute('title')).toMatch(/stroke index/i);
    });

    it('a player with no Daily Handicap (F-4) gets the label too', async () => {
        await playNine({ course: 'Keperra - Old Course (9 holes)', dailyHandicap: null });
        const { loadHole } = await import('../../src/oncourse.js');

        loadHole();

        expect(document.querySelector('.compact-score-card.is-primary .oc-card-grossonly')?.textContent).toBe('Gross only');
    });

    it('carries the reason onto the locker room after saving', async () => {
        await playNine({ course: 'Virginia GC - Heritage Nine (19-27)' });
        const { bindHoleNav, loadHole } = await import('../../src/oncourse.js');
        bindHoleNav();
        loadHole();

        document.getElementById('btn-oc-save-whs').click();
        await settle();

        const note = document.getElementById('locker-room-note');
        expect(note.classList.contains('hidden')).toBe(false);
        expect(note.textContent).toMatch(/stroke index/i);
    });
});

describe('F-9 the live leaderboard does not disagree with the record', () => {
    it('shows a dash rather than points invented from the hole number', async () => {
        await playNine({ course: 'Virginia GC - Heritage Nine (19-27)' });
        document.body.insertAdjacentHTML('beforeend', '<table><tbody id="oc-leaderboard-tbody"></tbody></table>');
        const { updateLiveLeaderboard } = await import('../../src/modules/card-render.js');

        updateLiveLeaderboard();

        const body = document.getElementById('oc-leaderboard-tbody');
        expect(body.textContent).toContain('—');
        expect(body.textContent).not.toMatch(/\b1[0-9]\b/);
    });
});

describe('owner 2026-10-06: GIR is worked out from strokes and putts on the card', () => {
    const card = () => document.querySelector('#oc-group-scores .compact-score-card');
    it('par 4: 4 strokes with 2 putts is a GIR; a 3rd putt-less stroke takes it away', async () => {
        const AppState = await playNine({ course: 'Keperra - Old Course (9 holes)' });
        AppState.liveRoundGroups[0].scores = {};
        const { loadHole } = await import('../../src/oncourse.js');
        loadHole();
        for (let i = 0; i < 4; i++) card().querySelector('.btn-grid-plus').click();
        card().querySelector('.putt-plus').click();
        card().querySelector('.putt-plus').click();
        const st = () => AppState.liveRoundGroups[0].simpleStats[1];
        expect(st().gir).toBe(true);
        expect(card().querySelector('.oc-card-gir').textContent).toBe('GIR ✓');
        card().querySelector('.btn-grid-plus').click(); // 5 strokes, 2 putts: on in 3
        expect(st().gir).toBe(false);
        expect(card().querySelector('.oc-card-gir').textContent).toBe('no GIR');
    });
    it('no putts recorded: the GIR the player tapped stands', async () => {
        const AppState = await playNine({ course: 'Keperra - Old Course (9 holes)' });
        AppState.liveRoundGroups[0].scores = {};
        const { loadHole } = await import('../../src/oncourse.js');
        loadHole();
        card().querySelector('.mini-gir').click();
        card().querySelector('.btn-grid-plus').click();
        expect(AppState.liveRoundGroups[0].simpleStats[1].gir).toBe(true);
    });
});

describe('Codex P2 (pass 4): a GIR that no longer stands is dropped', () => {
    const card = () => document.querySelector('#oc-group-scores .compact-score-card');
    it('clearing the hole (score back to 0) drops the worked-out GIR', async () => {
        const AppState = await playNine({ course: 'Keperra - Old Course (9 holes)' });
        AppState.liveRoundGroups[0].scores = {};
        const { loadHole } = await import('../../src/oncourse.js');
        loadHole();
        for (let i = 0; i < 4; i++) card().querySelector('.btn-grid-plus').click();
        card().querySelector('.putt-plus').click();
        card().querySelector('.putt-plus').click();
        const st = () => AppState.liveRoundGroups[0].simpleStats[1] || {};
        expect(st().gir).toBe(true);
        for (let i = 0; i < 4; i++) card().querySelector('.btn-grid-minus').click();
        expect(AppState.liveRoundGroups[0].scores[1] || 0).toBe(0);
        expect(st().gir).toBeUndefined();
    });
    it('a GIR the player tapped before scoring survives the putts going in', async () => {
        const AppState = await playNine({ course: 'Keperra - Old Course (9 holes)' });
        AppState.liveRoundGroups[0].scores = {};
        const { loadHole } = await import('../../src/oncourse.js');
        loadHole();
        card().querySelector('.mini-gir').click();
        card().querySelector('.putt-plus').click();
        expect(AppState.liveRoundGroups[0].simpleStats[1].gir).toBe(true);
    });
    it('putts reaching the score drop it too', async () => {
        const AppState = await playNine({ course: 'Keperra - Old Course (9 holes)' });
        AppState.liveRoundGroups[0].scores = {};
        const { loadHole } = await import('../../src/oncourse.js');
        loadHole();
        for (let i = 0; i < 4; i++) card().querySelector('.btn-grid-plus').click();
        card().querySelector('.putt-plus').click();
        card().querySelector('.putt-plus').click();
        expect(AppState.liveRoundGroups[0].simpleStats[1].gir).toBe(true);
        card().querySelector('.putt-plus').click();
        card().querySelector('.putt-plus').click(); // 4 strokes, 4 putts
        expect(AppState.liveRoundGroups[0].simpleStats[1].gir).toBeUndefined();
    });
});

describe('Codex P2 (pass 5): a restored hole shows the GIR that counts, not a stale tap', () => {
    it('stored GIR true, but 5 strokes with 2 putts on a par 4: the GIR button reads as a miss', async () => {
        const AppState = await playNine({ course: 'Keperra - Old Course (9 holes)' });
        AppState.liveRoundGroups[0].scores = { 1: 5 };
        AppState.liveRoundGroups[0].simpleStats = { 1: { putts: 2, gir: true } }; // as restored
        const { loadHole } = await import('../../src/oncourse.js');
        loadHole();
        const btn = document.querySelector('#oc-group-scores .compact-score-card .mini-gir');
        expect(btn.classList.contains('active-miss')).toBe(true);
        expect(btn.classList.contains('active-gir')).toBe(false);
    });
});
