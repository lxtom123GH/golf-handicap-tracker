// ==========================================================================
// rounds-history.test.js
// F-5 — the Exclude/Include and Delete buttons on the WHS Scoring Record
// ==========================================================================
//
// There were two exported functions named renderRoundsHistory. src/ui.js:338
// is the live one — the stateChange listener calls it — and src/whs.js held a
// second copy that nothing imported. The click delegation that wires the two
// row buttons, and the fill for the "WHS Scoring Record (<name>)" heading,
// lived only in the dead copy. So the buttons rendered, did nothing, and a
// user had no way to exclude or delete a bad round at all.
//
// These tests drive the LIVE renderer. Keeping one renderer is the point: the
// duplicate is how the wiring got orphaned, so the last test pins that whs.js
// no longer exports a second one.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(),
    increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const round = (id, over = {}) => ({
    id, course: 'Keperra - Old', rating: 70.5, slope: 124,
    adjustedGross: 88, date: new Date('2026-08-16T00:00:00'), notCounting: false, ...over
});

// UI caches its elements at module load, so the DOM has to exist first.
async function renderWith(rounds, { viewingSelf = true } = {}) {
    document.body.innerHTML = `
        <h2>WHS Scoring Record (<span id="record-player-name"></span>)</h2>
        <div id="whs-welcome"></div>
        <div id="empty-state"></div>
        <table><tbody id="history-tbody"></tbody></table>
    `;
    vi.resetModules();
    const { AppState } = await import('../../src/state.js');
    AppState.currentUser = { uid: 'u1', displayName: 'Alex', email: 'alex@example.com' };
    AppState.viewingPlayerId = viewingSelf ? 'u1' : 'u2';
    AppState.profileUsersMap = { u2: 'Sam' };
    AppState.currentRounds = rounds;
    const ui = await import('../../src/ui.js');
    ui.renderRoundsHistory(rounds, []);
    return ui;
}

beforeEach(() => {
    window.toggleCountingRules = vi.fn();
    window.deleteWhsRound = vi.fn();
    window.currentUserIsAdmin = false;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('F-5 the scoring-record row buttons are wired', () => {
    it('Exclude toggles the round out of the handicap calculation', async () => {
        await renderWith([round('r1')]);

        document.querySelector('.toggle-count-btn').click();

        expect(window.toggleCountingRules).toHaveBeenCalledWith('r1');
    });

    it('Include is the same button on an already-excluded round', async () => {
        await renderWith([round('r1', { notCounting: true })]);
        const btn = document.querySelector('.toggle-count-btn');

        expect(btn.textContent.trim()).toBe('Include');
        btn.click();

        expect(window.toggleCountingRules).toHaveBeenCalledWith('r1');
    });

    it('the red X deletes the round', async () => {
        await renderWith([round('r1')]);

        document.querySelector('.del-round-btn').click();

        expect(window.deleteWhsRound).toHaveBeenCalledWith('r1');
    });

    it('routes the click by row, not by position', async () => {
        await renderWith([round('r1'), round('r2'), round('r3')]);

        document.querySelectorAll('.toggle-count-btn')[2].click();

        expect(window.toggleCountingRules).toHaveBeenCalledWith('r3');
    });

    it('binds the delegation once, so a re-render cannot stack handlers', async () => {
        const ui = await renderWith([round('r1')]);

        ui.renderRoundsHistory([round('r1')], []);
        ui.renderRoundsHistory([round('r1')], []);
        document.querySelector('.toggle-count-btn').click();

        expect(window.toggleCountingRules).toHaveBeenCalledTimes(1);
    });

    it('offers a coach no row buttons at all: View Only', async () => {
        await renderWith([round('r1', { uid: 'u2' })], { viewingSelf: false });

        expect(document.querySelector('.del-round-btn')).toBeNull();
        expect(document.querySelector('.toggle-count-btn')).toBeNull();
        expect(document.querySelector('details.round-actions')).toBeNull();
    });

    it("still lets a coach play a round's audio diary", async () => {
        await renderWith([round('r1', { uid: 'u2', audioUrl: 'https://example.com/a.webm' })], { viewingSelf: false });

        expect(document.querySelector('.play-audio-btn')).not.toBeNull();
        expect(document.querySelector('.toggle-count-btn')).toBeNull();
    });

    it('a coach still sees why an app-excluded round cannot count', async () => {
        await renderWith([round('r1', { uid: 'u2', notCounting: true, notCountingReason: 'No stroke index here.' })], { viewingSelf: false });
        expect(document.querySelector('#history-tbody tr').classList.contains('round-not-counting')).toBe(true);

        expect(document.querySelector('.round-excluded-why')?.textContent).toContain('no stroke index');
        expect(document.querySelector('.toggle-count-btn')).toBeNull();
        expect(document.querySelector('.del-round-btn')).toBeNull();
    });

    it('an admin viewing a player keeps Exclude and Delete', async () => {
        window.currentUserIsAdmin = true;
        await renderWith([round('r1', { uid: 'u2' })], { viewingSelf: false });

        expect(document.querySelector('.toggle-count-btn')).not.toBeNull();
        expect(document.querySelector('.del-round-btn')).not.toBeNull();
    });
});

describe('F-5 the scoring-record heading names the player', () => {
    it('fills the heading with the signed-in player', async () => {
        await renderWith([round('r1')]);

        expect(document.getElementById('record-player-name').textContent).toBe('Alex');
    });

    it('names the viewed player when a coach is looking at a student', async () => {
        await renderWith([round('r1')], { viewingSelf: false });

        expect(document.getElementById('record-player-name').textContent).toBe('Sam');
    });

    it('survives a re-render from a data change (it used to revert to empty)', async () => {
        const ui = await renderWith([round('r1')]);

        ui.renderRoundsHistory([round('r1'), round('r2')], []);

        expect(document.getElementById('record-player-name').textContent).toBe('Alex');
    });
});

describe('F-5 there is exactly one renderer', () => {
    it('whs.js no longer exports a second renderRoundsHistory', async () => {
        vi.resetModules();
        const whs = await import('../../src/whs.js');
        expect(whs.renderRoundsHistory).toBeUndefined();
    });
});

describe('Scoring record: four aligned columns', () => {
    const shippedHead = () => {
        const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.getElementById('history-tbody').closest('table').querySelector('thead');
    };

    it('every header sits over the cell it names', async () => {
        await renderWith([round('r1', { adjustedGross: 88, rating: 70.5, slope: 124 })]);
        const heads = [...shippedHead().querySelectorAll('th')].map(th => th.textContent.trim());
        const cells = [...document.querySelectorAll('#history-tbody tr td')];

        expect(heads.slice(0, 4)).toEqual(['Date', 'Course', 'Score', 'Diff']);
        expect(cells).toHaveLength(heads.length);
        expect(cells[1].textContent).toContain('Keperra - Old');
        expect(cells[2].textContent.trim()).toBe('88');
        // (113 / 124) × (88 − 70.5) = 15.947… → 15.9
        expect(cells[3].textContent.trim()).toBe('15.9');
    });

    it('an excluded round says so in its Score cell', async () => {
        await renderWith([round('r1', { notCounting: true })]);
        expect(document.querySelector('#history-tbody tr').classList.contains('round-not-counting')).toBe(true);
        expect(document.querySelector('#history-tbody tr').style.opacity).toBe('');
        const score = document.querySelectorAll('#history-tbody tr td')[2];
        expect(score.querySelector('.round-excluded-tag')?.textContent).toBe('excluded');
    });

    it('the row buttons sit behind one ⋯ per row', async () => {
        await renderWith([round('r1'), round('r2')]);
        const menus = document.querySelectorAll('#history-tbody details.round-actions');
        expect(menus).toHaveLength(2);
        expect(menus[0].querySelector('.toggle-count-btn')).not.toBeNull();
        expect(menus[0].querySelector('.del-round-btn')).not.toBeNull();
    });

    it("opening one row's ⋯ closes any other open one", async () => {
        await renderWith([round('r1'), round('r2')]);
        const [a, b] = document.querySelectorAll('#history-tbody details.round-actions');
        a.open = true;
        await new Promise(r => setTimeout(r, 20));
        b.open = true;
        await new Promise(r => setTimeout(r, 20));
        expect(b.open).toBe(true);
        expect(a.open).toBe(false);
    });

    it('the phone rule that hid columns 3 and 5 no longer reaches the record', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
        // Any nth-child hide on .history-table must exclude the scoring record.
        const hides = css.match(/\.history-table[^{,]*td:nth-child\(\d\)/g) || [];
        expect(hides.length).toBeGreaterThan(0);
        for (const sel of hides) expect(sel).toContain(':not(.whs-record-table)');
    });
});
