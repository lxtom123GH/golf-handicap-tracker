// session-journal-blocking.test.js — the dot's BLOCKING review of PR #35 at 1b55bd9.
// 1. quota ordering: the journal yields its key BEFORE any round backup is pruned;
// 2. OFF is honoured at runtime even when the preference cannot be saved;
// 3. sanitizer: URLs/prose/codes constrained, hydrated entries re-validated,
//    byte budget measured in UTF-8 bytes.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    writeBatch: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI: { ocTeeSelect: null, ocAddedPlayersList: null, ocHoleEditorModal: null } }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));
vi.mock('../../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(() => 0), calculateHoleStableford: vi.fn(() => 0),
    convertStablefordToAGS: vi.fn(() => 0), scoringUnavailableReason: vi.fn(() => null)
}));
vi.mock('../../src/course-data.js', () => ({
    COURSE_DATA: {}, KEPERRA_GPS: {}, getStrokeIndex: vi.fn(() => null), isRatableTee: vi.fn(() => false), isPlausibleRating: vi.fn(() => false)
}));

import { AppState } from '../../src/state.js';
import { saveRoundState } from '../../src/persistence.js';
import * as J from '../../src/session-journal.js';

const KEY = 'golf.journal.v1';
const ROUND_KEY = 'golf_round_state';
const utf8 = s => new TextEncoder().encode(s).length;

function usedBytes() {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        n += k.length + (localStorage.getItem(k) || '').length;
    }
    return n;
}

describe('BLOCKING 1: quota ordering protects round backups', () => {
    let spy;
    beforeEach(() => { localStorage.clear(); J.clearJournal(); J.setJournalEnabled(true); });
    afterEach(() => { spy?.mockRestore(); spy = null; });

    it('a journal that filled the quota is released FIRST; backups stay and the round saves', () => {
        AppState.currentUser = { uid: 'u1' };
        AppState.liveRoundGroups = [{ uid: 'u1', name: 'A', scores: {}, compStats: {}, simpleStats: {} }];
        AppState.currentHole = 1;
        AppState.activeRoundId = 'round_q1';
        localStorage.setItem('round_backup_1000', 'backup-a');
        localStorage.setItem('round_backup_2000', 'backup-b');
        saveRoundState();

        // A quota-limited store: the journal write succeeds and takes the headroom.
        const proto = Object.getPrototypeOf(localStorage);
        const real = proto.setItem;
        let LIMIT = Infinity;
        spy = vi.spyOn(proto, 'setItem').mockImplementation(function (k, v) {
            const prev = localStorage.getItem(k);
            const next = usedBytes() - (prev === null ? 0 : k.length + prev.length) + k.length + String(v).length;
            if (next > LIMIT) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
            return real.call(this, k, v);
        });
        for (let i = 0; i < 120; i++) J.record('tick', { i, pad: 'p'.repeat(150) });
        LIMIT = usedBytes() + utf8(JSON.stringify(J.journalSnapshot().entries)) + KEY.length + 50;
        J.flushJournal();
        expect(localStorage.getItem(KEY)).not.toBeNull();      // the journal write SUCCEEDED
        expect(J.journal.degraded).toBeNull();

        // The round grows a little: that write now trips the quota.
        AppState.currentHole = 2;
        AppState.liveRoundGroups = [{ uid: 'u1', name: 'A', scores: { 1: 5 }, compStats: {}, simpleStats: { pad: 'x'.repeat(400) } }];
        saveRoundState();

        expect(JSON.parse(localStorage.getItem(ROUND_KEY)).currentHole).toBe(2);
        expect(localStorage.getItem('round_backup_1000')).toBe('backup-a');
        expect(localStorage.getItem('round_backup_2000')).toBe('backup-b');
        expect(localStorage.getItem(KEY)).toBeNull();           // the journal yielded
        // and stops writing to storage for the session
        J.record('after'); J.flushJournal();
        expect(localStorage.getItem(KEY)).toBeNull();
        AppState.activeRoundId = null;
    });
});

describe('BLOCKING 2: OFF is honoured even when the preference cannot be saved', () => {
    beforeEach(() => { localStorage.clear(); J.clearJournal(); });

    it('setItem throws on OFF: nothing more is recorded and the result is truthful', () => {
        J.setJournalEnabled(true);
        J.record('before');
        const proto = Object.getPrototypeOf(localStorage);
        const spy = vi.spyOn(proto, 'setItem').mockImplementation(() => { throw new Error('denied'); });
        let res, calls = 0;
        try { res = J.setJournalEnabled(false); calls = spy.mock.calls.length; } finally { spy.mockRestore(); }
        expect(calls).toBeGreaterThan(0); // the failing persist really ran
        expect(res).toEqual({ enabled: false, persisted: false });
        expect(J.isJournalEnabled()).toBe(false);
        J.record('during-off');
        J.recordGpsFix({ latitude: 1, longitude: 2, accuracy: 3 });
        expect(J.journalSnapshot().entries.map(e => e.k)).toEqual(['before']);
        expect(J.journalPrefStatus()).toEqual({ enabled: false, persisted: false });
        J.setJournalEnabled(true);
    });

    it('the Settings card says the choice was not saved', async () => {
        document.body.innerHTML = '<div id="app-update-card"></div>';
        const ui = await import('../../src/session-journal-ui.js');
        ui.mountJournalCard();
        const box = document.querySelector('.journal-enabled');
        const proto = Object.getPrototypeOf(localStorage);
        const spy = vi.spyOn(proto, 'setItem').mockImplementation(() => { throw new Error('denied'); });
        try {
            box.checked = false;
            box.dispatchEvent(new Event('change'));
        } finally { spy.mockRestore(); }
        expect(J.isJournalEnabled()).toBe(false);
        expect(box.checked).toBe(false);
        expect(document.querySelector('.journal-card').textContent).toMatch(/not saved/i);
        J.setJournalEnabled(true);
    });
});

describe('BLOCKING 3: sanitizer constraints', () => {
    beforeEach(() => { localStorage.clear(); J.clearJournal(); J.setJournalEnabled(true); });

    it('URLs lose query, fragment and userinfo; prose is length-capped', () => {
        const s = J.scrubString('fetch https://bob:pw@api.example.com/v1/x?token=abc&k=1#frag failed');
        expect(s).toContain('https://api.example.com/v1/x');
        expect(s).not.toMatch(/bob|pw@|token|abc|#frag|\?/);
        expect(J.scrubString('é'.repeat(5000)).length).toBeLessThanOrEqual(121);
        expect(J.scrubString('a'.repeat(5000)).length).toBeLessThanOrEqual(121);
    });

    it('codes are allowlisted: free text in a code field is dropped', () => {
        J.record('save', { what: 'shot', status: 'failed', code: 'permission-denied' });
        J.record('save', { what: 'shot', status: 'failed', code: 'bob@example.com said no' });
        J.record('gps-error', { code: 1 });
        const es = J.journalSnapshot().entries;
        expect(es[0].code).toBe('permission-denied');
        expect(es[1].code).toBeUndefined();
        expect(es[2].code).toBe(1);
    });

    it('hydrated entries are re-validated: nested/unsafe fields dropped, bad entries discarded', async () => {
        localStorage.setItem(KEY, JSON.stringify([
            { t: '2026-10-18T00:00:00.000Z', k: 'ok', hole: 3, nested: { email: 'a@b.co' }, list: [1, 2], email: 'x@y.co', msg: 'mail bob@example.com https://h.example/p?s=1' },
            { t: 5, k: 'bad-time' },
            { k: 'no-time' },
            'string-entry',
            { t: '2026-10-18T00:00:01.000Z', k: '<script>' },
        ]));
        vi.resetModules();
        const j2 = await import('../../src/session-journal.js');
        const es = j2.journalSnapshot().entries;
        expect(es).toHaveLength(1);
        expect(es[0]).toEqual({ t: '2026-10-18T00:00:00.000Z', k: 'ok', hole: 3, msg: 'mail [email] https://h.example/p' });
    });

    it('the byte budget is measured in encoded UTF-8 bytes', async () => {
        vi.resetModules(); // fresh module: an earlier test released journal storage
        const J = await import('../../src/session-journal.js');
        const wide = '😀'.repeat(50); // 50 chars of string length ×2, 200 UTF-8 bytes
        for (let i = 0; i < J.JOURNAL_MAX_ENTRIES; i++) J.record('u', { a: wide, b: wide, c: wide, i });
        J.flushJournal();
        const raw = localStorage.getItem(KEY);
        expect(utf8(raw)).toBeLessThanOrEqual(J.JOURNAL_MAX_BYTES);
        expect(JSON.parse(raw).at(-1).i).toBe(J.JOURNAL_MAX_ENTRIES - 1);
    });
});
