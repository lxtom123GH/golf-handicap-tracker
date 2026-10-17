// session-journal.test.js — test-mode play journal (local-only diagnostics).
// Real jsdom localStorage; module reloads model an app reload / offline relaunch.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEY = 'golf.journal.v1';

async function fresh() {
    vi.resetModules();
    return import('../../src/session-journal.js');
}

function setState(property, oldValue, newValue) {
    window.dispatchEvent(new CustomEvent('stateChange', { detail: { property, oldValue, newValue } }));
}

describe('session journal — ring buffer and persistence', () => {
    beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
    afterEach(() => { vi.useRealTimers(); });

    it('appends entries and keeps only the newest JOURNAL_MAX_ENTRIES', async () => {
        const j = await fresh();
        for (let i = 0; i < j.JOURNAL_MAX_ENTRIES + 25; i++) j.record('tick', { i });
        j.flushJournal();
        const stored = JSON.parse(localStorage.getItem(KEY));
        expect(stored).toHaveLength(j.JOURNAL_MAX_ENTRIES);
        expect(stored[0].i).toBe(25);
        expect(stored.at(-1).i).toBe(j.JOURNAL_MAX_ENTRIES + 24);
        expect(stored.at(-1).k).toBe('tick');
        expect(typeof stored.at(-1).t).toBe('string');
    });

    it('stays under the byte budget by dropping the oldest entries', async () => {
        const j = await fresh();
        const big = 'x'.repeat(190); // under MAX_STR, so not clipped
        for (let i = 0; i < 499; i++) j.record('big', { a: big + 'a', b: big + 'b', i });
        j.flushJournal();
        const raw = localStorage.getItem(KEY);
        expect(raw.length).toBeLessThanOrEqual(j.JOURNAL_MAX_BYTES);
        expect(JSON.parse(raw).at(-1).i).toBe(498);
    });

    it('survives a reload: a re-imported module reads the previous entries', async () => {
        let j = await fresh();
        j.record('offline');
        j.record('save', { what: 'shot', status: 'attempt' });
        j.flushJournal();
        j = await fresh();                 // app relaunched (e.g. offline)
        j.record('online');
        j.flushJournal();
        const kinds = JSON.parse(localStorage.getItem(KEY)).map(e => e.k);
        expect(kinds).toEqual(['offline', 'save', 'online']);
    });

    it('records nothing when "Record play diagnostics" is off', async () => {
        const j = await fresh();
        j.setJournalEnabled(false);
        j.record('tick');
        j.flushJournal();
        expect(j.journalSnapshot().entries).toHaveLength(0);
        j.setJournalEnabled(true);
    });

    it('QuotaExceededError: degraded flag, in-memory fallback, no throw', async () => {
        const j = await fresh();
        j.record('before');
        const quota = new DOMException('full', 'QuotaExceededError');
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k) => {
            if (k === KEY) throw quota;
        });
        expect(() => { j.record('during'); j.flushJournal(); }).not.toThrow();
        expect(j.journal.degraded).toMatchObject({ reason: 'storage full' });
        j.record('after');
        j.flushJournal();
        expect(j.journalSnapshot().entries.map(e => e.k)).toEqual(['before', 'during', 'after']);
        // It yields its own space to the round and stops writing.
        expect(localStorage.getItem(KEY)).toBeNull();
        spy.mockRestore();
    });

    it('a journal that fails internally never propagates to the caller', async () => {
        const j = await fresh();
        const spy = vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('boom'); });
        expect(() => {
            j.record('x');
            j.flushJournal();
            j.recordGpsFix({ latitude: 1, longitude: 2, accuracy: 5 });
            j.recordGpsError({ code: 1, message: 'denied' });
            j.recordGpsCapture({ state: 'refused', fix: null });
            j.clearJournal();
        }).not.toThrow();
        spy.mockRestore();
        const p = Promise.resolve('ok');
        expect(j.trackWrite('shot', p)).toBe(p);
    });
});

describe('session journal — hooks', () => {
    beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

    it('GPS refusal via the real oncourse watch error callback', async () => {
        vi.resetModules();
        const j = await import('../../src/session-journal.js');
        let onError = null;
        const geo = {
            watchPosition: vi.fn((ok, err) => { onError = err; return 7; }),
            clearWatch: vi.fn(),
        };
        Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
        vi.doMock('../../src/hole-overlay.js', async (orig) => ({ ...(await orig()), courseSlugFor: () => 'keperra' }));
        const oc = await import('../../src/oncourse.js');
        expect(oc.startGpsForRound('Keperra')).toBe(true);
        expect(typeof onError).toBe('function');
        onError({ code: 1, message: 'User denied Geolocation' });
        const e = j.journalSnapshot().entries.find(x => x.k === 'gps-error');
        expect(e).toMatchObject({ code: 1, codeName: 'PERMISSION_DENIED', quiet: true });
        vi.doUnmock('../../src/hole-overlay.js');
    }, 30000); // importing the real oncourse.js graph is slow under a parallel run

    it('capture decisions record Precise Location off and refusals', async () => {
        const j = await fresh();
        j.recordGpsCapture({ state: 'preciseOff', fix: { lat: -27.1, lon: 153.1, accuracyM: 1500 }, elapsedMs: 900, fixCount: { usable: 1 } });
        j.recordGpsCapture({ state: 'refused', fix: null, elapsedMs: 4000, reason: 'no usable fix inside the window' });
        const [a, b] = j.journalSnapshot().entries;
        expect(a).toMatchObject({ k: 'gps-capture', state: 'preciseOff', accM: 1500, reason: 'Precise Location is off' });
        expect(a.lat).toBeUndefined(); // not a kept fix
        expect(b).toMatchObject({ state: 'refused', reason: 'no usable fix inside the window' });
    });

    it('stores positions only during an active round, rounded to 5 dp', async () => {
        const j = await fresh();
        j.installJournal();
        j.recordGpsFix({ latitude: -27.123456789, longitude: 153.987654321, accuracy: 4.4 });
        setState('activeRoundId', null, 'round_1');
        setState('currentHole', 1, 3);
        j.recordGpsFix({ latitude: -27.123456789, longitude: 153.987654321, accuracy: 40 }); // new accuracy class
        const fixes = j.journalSnapshot().entries.filter(e => e.k === 'gps-fix');
        expect(fixes[0]).toEqual(expect.objectContaining({ accM: 4 }));
        expect(fixes[0].lat).toBeUndefined();
        expect(fixes[1]).toMatchObject({ accM: 40, hole: 3, lat: -27.12346, lon: 153.98765 });
        const kinds = j.journalSnapshot().entries.map(e => e.k);
        expect(kinds).toEqual(expect.arrayContaining(['session', 'round-start', 'hole']));
        setState('activeRoundId', 'round_1', null);
        expect(j.journalSnapshot().entries.at(-1).k).toBe('round-end');
    });

    it('window online/offline/error/unhandledrejection are recorded without stacks', async () => {
        const j = await fresh();
        j.installJournal();
        window.dispatchEvent(new Event('offline'));
        window.dispatchEvent(new Event('online'));
        window.dispatchEvent(new ErrorEvent('error', { message: 'x is undefined', filename: 'https://app/assets/score-input-abc.js?v=1', lineno: 42 }));
        const rej = new Event('unhandledrejection');
        rej.reason = Object.assign(new Error('write failed for bob@example.com'), { code: 'permission-denied' });
        window.dispatchEvent(rej);
        const es = j.journalSnapshot().entries;
        expect(es.map(e => e.k)).toEqual(expect.arrayContaining(['offline', 'online', 'error', 'rejection']));
        expect(es.find(e => e.k === 'error')).toMatchObject({ msg: 'x is undefined', at: 'score-input-abc.js:42' });
        const r = es.find(e => e.k === 'rejection');
        expect(r).toMatchObject({ code: 'permission-denied', msg: 'write failed for [email]' });
        expect(JSON.stringify(es)).not.toMatch(/stack/);
    });

    it('trackWrite returns the same promise and logs attempt then ack / failure', async () => {
        const j = await fresh();
        const ok = Promise.resolve();
        const bad = Promise.reject(Object.assign(new Error('nope'), { code: 'unavailable' }));
        expect(j.trackWrite('shot', ok)).toBe(ok);
        expect(j.trackWrite('round', bad)).toBe(bad);
        await bad.catch(() => {});
        await new Promise(r => setTimeout(r, 0));
        const saves = j.journalSnapshot().entries.filter(e => e.k === 'save').map(e => `${e.what}:${e.status}`);
        expect(saves).toEqual(['shot:attempt', 'round:attempt', 'shot:ack', 'round:failed']);
        expect(j.journalSnapshot().entries.find(e => e.status === 'failed').code).toBe('unavailable');
        // A write that never settles (offline) leaves just the attempt.
        const pending = new Promise(() => {});
        expect(j.trackWrite('shot', pending)).toBe(pending);
    });
});

describe('session journal — export', () => {
    beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

    it('redacts emails, tokens and secret keys; strips coordinates by default', async () => {
        // A legacy/tampered stored entry that bypassed record-time cleaning.
        // (Entries failing the schema, e.g. t: 'x', are now discarded on load:
        // session-journal-blocking.test.js.)
        localStorage.setItem(KEY, JSON.stringify([{ t: '2026-10-17T00:00:00.000Z', k: 'legacy', uid: 'u9', userEmail: 'z@z.io', msg: 'from x@y.com', nested: { idToken: 'abc', lat: -27.1 } }]));
        const j = await fresh();
        j.installJournal();
        setState('activeRoundId', null, 'round_2');
        j.recordGpsFix({ latitude: -27.4, longitude: 153.0, accuracy: 3 });
        j.record('note', { msg: 'hi alex@example.com key AIzaSyA1234567890abcdefghijklmnopqrstuv', uid: 'u1', email: 'a@b.co', token: 't', okField: 'fine' });
        const ui = await import('../../src/session-journal-ui.js');
        const out = ui.buildJournalExport();
        const text = JSON.stringify(out);
        expect(out.includesPositions).toBe(false);
        expect(out.disclosure).toMatch(/No names, emails or account ids/);
        expect(text).not.toMatch(/alex@example.com|a@b.co|AIzaSy|z@z.io|x@y.com/);
        expect(text).not.toMatch(/"uid"|"email"|"token"|"userEmail"|"idToken"/i);
        expect(out.entries[0]).toMatchObject({ k: 'legacy', msg: 'from [email]' });
        expect(text).not.toMatch(/"lat"|"lon"/);
        expect(text).toContain('[email]');
        expect(text).toContain('[redacted]');
        expect(out.entries.find(e => e.k === 'note').okField).toBe('fine');
        const withPos = ui.buildJournalExport({ includePositions: true });
        expect(withPos.entries.find(e => e.k === 'gps-fix')).toMatchObject({ lat: -27.4, lon: 153 });
    });

    it('Settings card mounts after the App version card with classes only and shows degraded state', async () => {
        document.body.innerHTML = '<div><div class="card" id="app-update-card"></div></div>';
        const j = await fresh();
        const ui = await import('../../src/session-journal-ui.js');
        ui.startJournal();
        const card = document.querySelector('#app-update-card + .journal-card');
        expect(card).not.toBeNull();
        expect(card.querySelectorAll('[id]')).toHaveLength(0);
        expect(card.querySelector('.journal-enabled').checked).toBe(true);
        expect(card.querySelector('.journal-positions').checked).toBe(false);
        expect(card.querySelector('.journal-degraded').classList.contains('hidden')).toBe(true);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k) => {
            if (k === KEY) throw new DOMException('full', 'QuotaExceededError');
        });
        j.record('x');
        j.flushJournal();
        const warn = card.querySelector('.journal-degraded');
        expect(warn.classList.contains('hidden')).toBe(false);
        expect(warn.textContent).toBe('Recording problem: storage full');
        vi.restoreAllMocks();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        card.querySelector('.journal-clear').click();
        expect(j.journalSnapshot().entries).toHaveLength(0);
        expect(card.querySelector('.journal-status').textContent).toBe('Journal cleared.');
    });

    it('Export button downloads golf-journal-<date>.json', async () => {
        document.body.innerHTML = '<div><div class="card" id="app-update-card"></div></div>';
        await fresh();
        const ui = await import('../../src/session-journal-ui.js');
        ui.startJournal();
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
        let downloaded = null;
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloaded = this.download; });
        document.querySelector('.journal-export').click();
        expect(downloaded).toMatch(/^golf-journal-\d{4}-\d{2}-\d{2}\.json$/);
        expect(document.querySelector('.journal-status').textContent).toBe('Exported.');
    });
});
