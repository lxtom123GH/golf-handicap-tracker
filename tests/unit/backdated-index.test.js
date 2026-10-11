// ==========================================================================
// backdated-index.test.js
// A backdated card is converted with the index in effect on the day played.
// ==========================================================================
//
// The Log a past round form read today's index, so a card from last month got
// today's Daily Handicap, and its Stableford total converted to the wrong AGS.
// indexOnDate picks the last index-history entry published before
// the day began. The WHS maths it feeds (Daily Handicap, Stableford -> AGS) is
// unchanged; only which index goes in changes.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../src/firebase-config.js', () => ({
    db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {}
}));

const writes = vi.hoisted(() => ({ last: null, history: [] }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    query: vi.fn((c) => c), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    doc: vi.fn((dbOrCollRef, col, id) => (typeof col === 'string'
        ? { _path: `${col}/${id}`, id }
        : { _path: `${dbOrCollRef?._path}/minted`, id: 'minted' })),
    getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ indexHistory: writes.history }) })),
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })),
    addDoc: vi.fn(async () => ({ id: 'new-doc' })),
    setDoc: vi.fn(async (ref, data) => {
        if (String(ref?._path).startsWith('whs_rounds')) writes.last = data;
    }),
    updateDoc: vi.fn(async () => { }), deleteDoc: vi.fn(async () => { }),
    writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(async () => { }) }))
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));
vi.mock('../../src/auth-v2.js', () => ({ setupAuthUI: vi.fn() }));

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

/** The real WHS tab (calculator + player bar) and the real log-round modal. */
function mountShippedMarkup() {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tab = doc.getElementById('tab-whs');
    document.body.innerHTML = '';
    document.body.appendChild(document.importNode(tab, true));
    const toast = doc.getElementById('round-save-toast');
    if (toast) document.body.appendChild(document.importNode(toast, true));
}

async function boot() {
    vi.resetModules();
    mountShippedMarkup();
    const { UI } = await import('../../src/ui.js');
    const { AppState } = await import('../../src/state.js');
    const { bindWHSForm } = await import('../../src/app-v4.js');
    UI.handicapIndexEl = { value: '18.0' };
    AppState.currentUser = { uid: 'u1' };
    AppState.viewingPlayerId = 'u1';
    AppState.handicapIndex = 18.0;
    const sel = document.getElementById('player-select');
    sel.innerHTML = '<option value="u1">Alex</option>';
    bindWHSForm();
    return { UI, AppState };
}

const $ = (id) => document.getElementById(id);
const submit = async () => {
    $('add-round-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 20));
};
const pick = (value) => {
    $('course-select').value = value;
    $('course-select').dispatchEvent(new Event('change'));
};
const mode = (value) => {
    const r = document.querySelector(`input[name="entry-mode"][value="${value}"]`);
    r.checked = true;
    r.dispatchEvent(new Event('change'));
};

const HISTORY = [
    { date: '2026-08-01T10:00:00', index: '12.0' },
    { date: '2026-09-20T10:00:00', index: '18.0' },
    { date: 'not a date', index: '3.0' },
    { date: '2026-08-15T10:00:00', index: 'NaN' }
];

describe('indexOnDate', () => {
    let indexOnDate;
    beforeEach(async () => { ({ indexOnDate } = await import('../../src/whs.js')); });

    it('is the last index published before the day began', () => {
        expect(indexOnDate(HISTORY, '2026-09-01', '2026-10-07')).toBe(12);
        // The 18.0 was published at 10:00 on the 20th: not yet in effect that morning.
        expect(indexOnDate(HISTORY, '2026-09-20', '2026-10-07')).toBe(12);
        expect(indexOnDate(HISTORY, '2026-09-21', '2026-10-07')).toBe(18);
    });
    it('is null before the first index (no index was in effect)', () => {
        expect(indexOnDate(HISTORY, '2026-07-01', '2026-10-07')).toBeNull();
        expect(indexOnDate([], '2026-07-01', '2026-10-07')).toBeNull();
    });
    it('is null while the history has not loaded, for a past date', () => {
        expect(indexOnDate(null, '2026-09-01', '2026-10-07')).toBeNull();
    });
    it('is undefined (use the current index) with no date, or today with nothing ever published', () => {
        expect(indexOnDate(HISTORY, '', '2026-10-07')).toBeUndefined();
        expect(indexOnDate([], '2026-10-07', '2026-10-07')).toBeUndefined();
    });
    it('today waits for the history like any other date (codex P2: a later index could slip in)', () => {
        expect(indexOnDate(null, '2026-10-07', '2026-10-07')).toBeNull();
    });
    it('today is the index in effect when the day began, not one published later today', () => {
        // Nothing published today: the day-start index is the latest one.
        expect(indexOnDate(HISTORY, '2026-10-07', '2026-10-07')).toBe(18);
        // 20.0 published at 10:00 today, after the card was played.
        const sameDay = [...HISTORY, { date: '2026-10-07T10:00:00', index: '20.0' }];
        expect(indexOnDate(sameDay, '2026-10-07', '2026-10-07')).toBe(18);
        // A first index published today: none was in effect when the day began.
        expect(indexOnDate([{ date: '2026-10-07T10:00:00', index: '20.0' }], '2026-10-07', '2026-10-07')).toBeNull();
    });
});

describe('Log a past round converts with the index on the date played', () => {
    let alertSpy;
    beforeEach(() => { writes.last = null; writes.history = HISTORY; alertSpy = vi.fn(); window.alert = alertSpy; });
    afterEach(() => { vi.restoreAllMocks(); });

    const stableford36 = async (date) => {
        await boot();
        $('date').value = date;
        $('date').dispatchEvent(new Event('change'));
        pick('Keperra - Old (1-18)|Yellow (Men)');
        mode('total-stableford');
        $('total-stableford-pts').value = '36';
        $('total-stableford-pts').dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 30)); // history loads, then recalcs
    };

    it("a card from 1 Sep uses that day's 12.0, not today's 18.0", async () => {
        await stableford36('2026-09-01');
        // DH = round((12 × 124/113 + (70.5 − 72)) × 0.93) = round(10.85) = 11
        // AGS = 72 + 11 − (36 − 36) = 83   (today's 18.0 would give DH 17 → 89)
        expect($('score').value).toBe('83');
        expect($('log-round-index-note').textContent).toContain('12.0');
        await submit();
        expect(writes.last?.adjustedGross).toBe(83);
    }, 60_000);

    it('the date typed last (no change event) still decides the index at Save', async () => {
        await boot();
        pick('Keperra - Old (1-18)|Yellow (Men)');
        mode('total-stableford');
        $('total-stableford-pts').value = '36';
        $('total-stableford-pts').dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 30));
        expect($('score').value).toBe('89'); // today: 18.0 → DH 17
        $('date').value = '2026-09-01';       // no event fired
        await submit();
        expect(writes.last?.adjustedGross).toBe(83);
    }, 60_000);

    it('a card from today uses the current index', async () => {
        const { localToday } = await import('../../src/dates.js');
        await stableford36(localToday());
        expect($('score').value).toBe('89');
    }, 60_000);

    it('an offline history lookup is not cached as "no index": it retries on reconnect', async () => {
        const fs = await import('firebase/firestore');
        // Offline with nothing cached: the private history doc and the
        // profile (its legacy fallback) are both unreadable.
        fs.getDoc.mockImplementationOnce(async () => { throw new Error('unavailable'); })
            .mockImplementationOnce(async () => { throw new Error('unavailable'); });
        await stableford36('2026-09-01');
        expect($('score').value).toBe('');
        expect($('log-round-index-note').textContent).toMatch(/Couldn't look up/);
        expect($('log-round-index-note').textContent).not.toMatch(/No Handicap Index on record/);
        window.dispatchEvent(new Event('online'));
        await new Promise(r => setTimeout(r, 30));
        expect($('score').value).toBe('83');
        expect($('log-round-index-note').textContent).toContain('12.0');
    }, 60_000);

    it('a reconnect while the lookup is still pending is not lost if that read then fails', async () => {
        const fs = await import('firebase/firestore');
        let failPending;
        fs.getDoc.mockImplementationOnce(() => new Promise((_, rej) => { failPending = rej; }));
        await stableford36('2026-09-01');
        expect($('log-round-index-note').textContent).toMatch(/Looking up/);
        window.dispatchEvent(new Event('online'));   // back online, read still pending
        failPending(new Error('unavailable'));        // ...and then it fails
        await new Promise(r => setTimeout(r, 30));
        expect($('score').value).toBe('83');
    }, 60_000);

    it('a card from before the first index has no conversion (Manual AGS only)', async () => {
        await stableford36('2026-07-01');
        expect($('score').value).toBe('');
        expect($('log-round-index-note').textContent).toMatch(/No Handicap Index on record here for that date/);
    }, 60_000);

    it('no calculated history at all (a declared starting index): the card converts with the current index, and says so', async () => {
        writes.history = [];
        await stableford36('2026-09-01');
        // Same as a card dated today: 18.0 → DH 17 → AGS 89
        expect($('score').value).toBe('89');
        expect($('log-round-index-note').textContent).toMatch(/No dated index on record.*18\.0/);
        await submit();
        expect(writes.last?.adjustedGross).toBe(89);
    }, 60_000);

    // Codex P2: the form read an empty history, then the golfer's rounds
    // produced a calculated index. That index may be newer than the card, so
    // the empty-history fallback must stop applying.
    it('once the app calculates an index, an empty history no longer falls back to the current index', async () => {
        writes.history = [];
        await stableford36('2026-09-01');
        expect($('score').value).toBe('89'); // declared 18.0, no history yet
        const fs = await import('firebase/firestore');
        let cb = null;
        fs.onSnapshot.mockImplementation((_q, onNext) => { cb = onNext; return () => { }; });
        // The profile's history write for the new index hasn't landed yet:
        // every read still sees an empty history.
        fs.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => ({ indexHistory: [] }) }));
        const whs = await import('../../src/whs.js');
        whs.listenToWHSRounds();
        const r18 = (ags) => ({ uid: 'u1', rating: 72, slope: 113, adjustedGross: ags, holesPlayed: 18, notCounting: false, date: new Date() });
        await cb({ forEach: (fn) => [r18(90), r18(91), r18(92)].forEach((r, i) => fn({ id: `r${i}`, data: () => r })) });
        await new Promise(r => setTimeout(r, 30));
        expect(whs.calculatedIndexFor('u1')).toBe('16.0');
        $('total-stableford-pts').dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 30));
        expect($('score').value).toBe('');
        expect($('log-round-index-note').textContent).toMatch(/No Handicap Index on record here for that date/);
        fs.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => ({ indexHistory: writes.history }) }));
    }, 60_000);

    // Codex P2: the index on show doesn't change (declared 16.0, calculated
    // 16.0), so only the publication itself can tell the form its cached
    // empty history is stale.
    it('a publication with the same index on show still re-reads the history', async () => {
        writes.history = [];
        const fs = await import('firebase/firestore');
        const { AppState } = await boot();
        AppState.handicapIndex = '16.0';
        $('date').value = '2026-09-01';
        $('date').dispatchEvent(new Event('change'));
        pick('Keperra - Old (1-18)|Yellow (Men)');
        mode('total-stableford');
        $('total-stableford-pts').value = '36';
        $('total-stableford-pts').dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 30));
        expect($('score').value).toBe('87'); // fallback: declared 16.0 → DH 15
        // The publish write lands the dated history.
        fs.updateDoc.mockImplementation(async () => { writes.history = HISTORY; });
        let cb = null;
        fs.onSnapshot.mockImplementation((_q, onNext) => { cb = onNext; return () => { }; });
        try {
            const whs = await import('../../src/whs.js');
            whs.listenToWHSRounds();
            const r18 = (ags) => ({ uid: 'u1', rating: 72, slope: 113, adjustedGross: ags, holesPlayed: 18, notCounting: false, date: new Date() });
            await cb({ forEach: (fn) => [r18(90), r18(91), r18(92)].forEach((r, i) => fn({ id: `r${i}`, data: () => r })) });
            await new Promise(r => setTimeout(r, 40));
            expect(AppState.handicapIndex).toBe('16.0'); // unchanged on show
            expect($('score').value).toBe('83');         // 12.0 on 1 Sep, from the re-read
        } finally {
            fs.updateDoc.mockImplementation(async () => { });
        }
    }, 60_000);

    it('a changed index re-reads the history, so a newly published dated index is used', async () => {
        writes.history = [];
        const { AppState } = await boot();
        $('date').value = '2026-09-01';
        $('date').dispatchEvent(new Event('change'));
        pick('Keperra - Old (1-18)|Yellow (Men)');
        mode('total-stableford');
        $('total-stableford-pts').value = '36';
        $('total-stableford-pts').dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 30));
        expect($('score').value).toBe('89');
        // The history now has dated entries, and the index in use moved.
        writes.history = HISTORY;
        AppState.handicapIndex = 18.5;
        $('total-stableford-pts').dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 30));
        expect($('score').value).toBe('83'); // 12.0 on 1 Sep
    }, 60_000);

    it('no calculated history and no index at all: still Manual AGS only', async () => {
        writes.history = [];
        const { AppState } = await boot();
        AppState.handicapIndex = null;
        $('date').value = '2026-09-01';
        $('date').dispatchEvent(new Event('change'));
        pick('Keperra - Old (1-18)|Yellow (Men)');
        mode('total-stableford');
        $('total-stableford-pts').value = '36';
        $('total-stableford-pts').dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 30));
        expect($('score').value).toBe('');
        expect($('log-round-index-note').textContent).toMatch(/No Handicap Index on record here for that date/);
    }, 60_000);

    it('saving before the dated index is known explains why instead of "calculation is missing"', async () => {
        const fs = await import('firebase/firestore');
        fs.getDoc.mockImplementationOnce(() => new Promise(() => { })); // still looking up
        await stableford36('2026-09-01');
        await submit();
        expect(writes.last).toBeNull();
        expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Looking up your index/));
    }, 60_000);
});
