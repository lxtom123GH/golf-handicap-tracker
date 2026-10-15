// ==========================================================================
// log-round-nines.test.js
// "Log a past round" must save a nine-hole card, and opening/closing it must
// not fire the Daily Handicap calculator's "fill in valid numbers" pop-up.
// ==========================================================================
//
// The form's markup comes from the shipped index.html, so the browser limits
// under test are the real ones: `min="50"` on Course Rating and Par refused
// every nine (Keperra's nines are rated 33-37, par 35-36) with a tooltip, and
// the round never saved. The rating check is now the nine-aware
// isPlausibleRating the On Course save uses; a card whose ratings fail it is
// still saved, but as non-counting with a reason - never as counting.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../src/firebase-config.js', () => ({
    db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {}
}));

const writes = vi.hoisted(() => ({ last: null }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    query: vi.fn((c) => c), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    doc: vi.fn((dbOrCollRef, col, id) => (typeof col === 'string'
        ? { _path: `${col}/${id}`, id }
        : { _path: `${dbOrCollRef?._path}/minted`, id: 'minted' })),
    // An index of 18.0 since January, so a backdated card has one to use.
    getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ indexHistory: [{ date: '2026-01-01T09:00:00', index: '18.0' }] }) })),
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
    document.getElementById('entry-handicap-category').value = 'men';
    bindWHSForm();
    return { UI, AppState };
}

const $ = (id) => document.getElementById(id);
const submit = async () => {
    // A person doesn't tap Save in the same tick: let the index history load.
    await new Promise(r => setTimeout(r, 10));
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

describe('Log a past round: nine-hole cards', () => {
    let alertSpy;
    beforeEach(() => {
        writes.last = null;
        alertSpy = vi.fn();
        window.alert = alertSpy;
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('a rated Keperra nine passes the browser limits and saves as a counting nine', async () => {
        await boot();
        pick('Keperra – Old Course (9 holes)|Blue (Men)');
        expect($('course-rating').value).toBe('35');
        expect($('course-par').value).toBe('36');
        mode('total-stableford');
        $('total-stableford-pts').value = '18';
        $('total-stableford-pts').dispatchEvent(new Event('input'));
        $('date').value = '2026-09-01';

        // The browser refuses Save when any field is outside its limits.
        const bad = [...$('add-round-form').elements].filter(el => el.willValidate && !el.checkValidity());
        expect(bad.map(el => el.id)).toEqual([]);

        await submit();
        expect(writes.last, 'the round should have been written').toBeTruthy();
        expect(writes.last.holesPlayed).toBe(9);
        expect(writes.last.rating).toBe(35);
        expect(writes.last.notCounting).toBe(false);
        expect(writes.last.notCountingReason).toBeUndefined();
        expect(alertSpy).not.toHaveBeenCalled();
    }, 60_000);

    it('a manual nine-hole AGS in the 40s is within the box limits', async () => {
        await boot();
        pick('Sandgate GC (9 holes)|Men\'s');
        mode('manual-ags');
        $('score').value = '44';
        $('stat-putts').value = '8';
        expect($('score').checkValidity()).toBe(true);
        expect($('stat-putts').checkValidity()).toBe(true);
    }, 60_000);

    it('ratings that fail the nine-aware check save as NOT counting, with a reason', async () => {
        await boot();
        pick('Custom');
        $('course-name').value = 'Somewhere 9';
        // An 18-hole rating typed against a nine's par: the exact bug that
        // used to corrupt nine-hole differentials.
        $('course-rating').value = '70';
        $('slope-rating').value = '120';
        $('course-par').value = '36';
        mode('manual-ags');
        $('score').value = '45';
        $('date').value = '2026-09-01';
        await submit();
        expect(writes.last).toBeTruthy();
        expect(writes.last.notCounting).toBe(true);
        expect(writes.last.notCountingReason).toMatch(/rating/i);
    }, 60_000);

    it('a manual round kept out for its ratings cannot be put back with Include', async () => {
        // The saved doc has no par, so the guard can only see the stored
        // reason: the record row and the toggle must both refuse Include.
        const { AppState } = await boot();
        pick('Custom');
        $('course-name').value = 'Somewhere 9';
        $('course-rating').value = '70';
        $('slope-rating').value = '120';
        $('course-par').value = '36';
        mode('manual-ags');
        $('score').value = '45';
        $('date').value = '2026-09-01';
        await submit();
        expect(writes.last).toBeTruthy();
        expect(writes.last.par).toBeUndefined();
        const { appExcludedReason } = await import('../../src/round-validity.js');
        expect(appExcludedReason(writes.last)).toMatch(/rating/i);

        const fsMod = await import('firebase/firestore');
        fsMod.updateDoc.mockClear();
        AppState.currentRounds = [{ ...writes.last, id: 'manual-1' }];
        await window.toggleCountingRules('manual-1');
        expect(fsMod.updateDoc).not.toHaveBeenCalled();
        expect(AppState.currentRounds[0].notCounting).toBe(true);
        expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/can't count/i));
    }, 60_000);

    it('opening and closing the form does not pop up "Please fill in valid numbers"', async () => {
        const { UI } = await boot();
        const sel = $('player-select');
        UI.playerSelect = sel;
        sel.dispatchEvent(new Event('change'));
        expect(alertSpy).not.toHaveBeenCalled();
    }, 60_000);
    it('an 18-hole score typed as 8 (for 85) is refused, not saved as counting', async () => {
        await boot();
        pick('Keperra - Old (1-18)|Yellow (Men)');
        mode('manual-ags');
        $('score').value = '8';
        $('date').value = '2026-09-01';
        await submit();
        expect(writes.last).toBeNull();
        expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/under 50/));
    }, 60_000);

    it('a real 49 on Bulimba (CR 49, par 54) is not refused', async () => {
        await boot();
        pick('Bulimba Course|White (Men)');
        mode('manual-ags');
        $('score').value = '49';
        $('date').value = '2026-09-01';
        await submit();
        expect(alertSpy).not.toHaveBeenCalled();
        expect(writes.last?.adjustedGross).toBe(49);
    }, 60_000);

    it('a nine\'s advanced stats are capped at nine-hole totals (no 18 greens on a nine)', async () => {
        await boot();
        pick('Keperra – Old Course (9 holes)|Blue (Men)');
        expect(Number($('stat-gir').max)).toBe(9);
        expect(Number($('stat-fwy').max)).toBeLessThanOrEqual(7);
        mode('manual-ags');
        $('score').value = '44';
        $('date').value = '2026-09-01';
        $('stat-gir').value = '18';
        await submit();
        expect(writes.last, 'an impossible nine-hole GIR must not save').toBeNull();
        expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/9 holes/));
    }, 60_000);

    it('a nine with in-range stats saves them; an 18-hole tee keeps 18 / 14', async () => {
        await boot();
        pick('Keperra – Old Course (9 holes)|Blue (Men)');
        mode('manual-ags');
        $('score').value = '44';
        $('date').value = '2026-09-01';
        $('stat-gir').value = '4';
        $('stat-fwy').value = '3';
        await submit();
        expect(writes.last?.stats).toMatchObject({ gir: 4, fwy: 3 });
        pick('Keperra - Old (1-18)|Yellow (Men)');
        expect(Number($('stat-gir').max)).toBe(18);
        expect(Number($('stat-fwy').max)).toBeGreaterThan(9);
        expect(Number($('stat-fwy').max)).toBeLessThanOrEqual(14);
    }, 60_000);

    it('a Custom nine with no hole pars: up to one fairway a hole is allowed', async () => {
        await boot();
        pick('Custom');
        $('course-name').value = 'Somewhere 9';
        $('course-rating').value = '35';
        $('slope-rating').value = '120';
        $('course-par').value = '36';
        $('course-par').dispatchEvent(new Event('input'));
        expect(Number($('stat-fwy').max)).toBe(9);
        mode('manual-ags');
        $('score').value = '45';
        $('date').value = '2026-09-01';
        $('stat-fwy').value = '8';
        await submit();
        expect(alertSpy).not.toHaveBeenCalled();
        expect(writes.last?.stats).toMatchObject({ fwy: 8 });
        writes.last = null;
        $('stat-fwy').value = '10';
        await submit();
        expect(writes.last).toBeNull();
    }, 60_000);

    it('a nine scored 44 is above the nine-hole floor and saves', async () => {
        await boot();
        pick('Keperra – Old Course (9 holes)|Blue (Men)');
        mode('manual-ags');
        $('score').value = '44';
        $('date').value = '2026-09-01';
        await submit();
        expect(writes.last?.adjustedGross).toBe(44);
        expect(writes.last?.holesPlayed).toBe(9);
    }, 60_000);
});
