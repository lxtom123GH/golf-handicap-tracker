// ==========================================================================
// index-not-established.test.js
// F-4 — "no index yet" is not the same thing as "scratch"
// ==========================================================================
//
// calculateIndex returned the NUMBER 0 until a player had three counting
// rounds, and the success path returns a string. Downstream that 0 is
// indistinguishable from a genuine scratch handicap: it was published to
// profiles/{uid}, shown as 0.0 on the dashboard, and turned into a Daily
// Handicap of 0 at Start Round — so a real 26-marker received no strokes at
// all and scored 3 Stableford points instead of 23. The round that then saved
// was under-adjusted, so their first real index came out too low as well.
//
// The other half: a new golfer arriving with an existing GA handicap needs
// somewhere to declare it. That was the #handicap-index input; it is text now
// (a stray thumb could rewrite the index at any time), and "Set starting
// index" is the way in until the app has calculated one.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let lastSetDoc = null;
let lastUpdateDoc = null;

vi.mock('../../src/firebase-config.js', () => ({
    db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {}
}));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_db, col, id) => ({ _path: `${col}/${id}`, id })),
    getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
    setDoc: vi.fn(async (ref, data, opts) => { lastSetDoc = { ref, data, opts }; }),
    updateDoc: vi.fn(async (ref, data) => { lastUpdateDoc = { ref, data }; }),
    increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
    collection: vi.fn((_db, name) => ({ _path: name })), query: vi.fn(), where: vi.fn(),
    orderBy: vi.fn(), onSnapshot: vi.fn(), addDoc: vi.fn(async () => ({ id: 'r' })),
    serverTimestamp: vi.fn(() => 'SERVER_TS'), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const validRound = (id, gross) => ({ id, slope: 113, rating: 72, adjustedGross: gross, notCounting: false });

afterEach(() => { vi.restoreAllMocks(); });

// --------------------------------------------------------------------------

describe('F-4 calculateIndex signals "not established" distinctly', () => {
    it('is null, not 0, with no rounds at all', async () => {
        const { calculateIndex } = await import('../../src/whs.js');
        expect(calculateIndex([]).index).toBeNull();
    });

    it('is null with one and with two counting rounds', async () => {
        const { calculateIndex } = await import('../../src/whs.js');
        expect(calculateIndex([validRound('a', 90)]).index).toBeNull();
        expect(calculateIndex([validRound('a', 90), validRound('b', 91)]).index).toBeNull();
    });

    it('becomes a real index at the third counting round', async () => {
        const { calculateIndex } = await import('../../src/whs.js');
        const res = calculateIndex([validRound('a', 90), validRound('b', 91), validRound('c', 92)]);
        expect(typeof res.index).toBe('string');
        expect(Number.isFinite(parseFloat(res.index))).toBe(true);
    });

    it('a genuine scratch index is still 0.0, and is not confusable with null', async () => {
        const { calculateIndex } = await import('../../src/whs.js');
        // Three rounds of AGS 72 on a CR 72 / SR 113 course: differential 0.
        const res = calculateIndex([validRound('a', 74), validRound('b', 74), validRound('c', 74)]);
        expect(res.index).toBe('0.0');
        expect(res.index).not.toBeNull();
    });
});

describe('F-4 no index means no Daily Handicap, rather than scratch', () => {
    it('refuses to compute a Daily Handicap from a missing index', async () => {
        const { calculateDailyHandicap } = await import('../../src/whs.js');
        expect(calculateDailyHandicap(null, 129, 72, 72)).toBeNull();
        expect(calculateDailyHandicap(undefined, 129, 72, 72)).toBeNull();
        expect(calculateDailyHandicap(NaN, 129, 72, 72)).toBeNull();
    });

    it('refuses when the tee has no slope to work from', async () => {
        const { calculateDailyHandicap } = await import('../../src/whs.js');
        expect(calculateDailyHandicap(26.0, 0, 72, 72)).toBeNull();
    });

    it('still gives a real 26-marker their strokes', async () => {
        const { calculateDailyHandicap } = await import('../../src/whs.js');
        expect(calculateDailyHandicap(26.0, 129, 72, 72)).toBe(28);
    });
});

describe('F-4 the dashboard shows a dash, not 0.0', () => {
    async function dashboard() {
        document.body.innerHTML = `
            <span id="handicap-index">—</span>
            <span id="index-subtext"></span>
            <div id="whs-welcome"></div><div id="empty-state"></div>
            <table><tbody id="history-tbody"></tbody></table>
            <span id="record-player-name"></span>
        `;
        vi.resetModules();
        const ui = await import('../../src/ui.js');
        return ui;
    }

    it('renders an unestablished index as a dash', async () => {
        await dashboard();

        window.dispatchEvent(new CustomEvent('stateChange', {
            detail: { property: 'handicapIndex', newValue: null }
        }));

        expect(document.getElementById('handicap-index').textContent).toBe('—');
    });

    it('says why', async () => {
        await dashboard();

        window.dispatchEvent(new CustomEvent('stateChange', {
            detail: { property: 'handicapIndex', newValue: null }
        }));

        expect(document.getElementById('index-subtext').textContent.toLowerCase())
            .toContain('not established');
    });

    it('renders a real index normally, including a plus handicap', async () => {
        await dashboard();

        window.dispatchEvent(new CustomEvent('stateChange', {
            detail: { property: 'handicapIndex', newValue: '18.4' }
        }));
        expect(document.getElementById('handicap-index').textContent).toBe('18.4');

        window.dispatchEvent(new CustomEvent('stateChange', {
            detail: { property: 'handicapIndex', newValue: '-1.2' }
        }));
        expect(document.getElementById('handicap-index').textContent).toBe('-1.2');
    });
});

describe('the Handicap Index is text, not an editable box', () => {
    it('the shipped header has no input for the index', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const el = doc.getElementById('handicap-index');
        expect(el.tagName).toBe('SPAN');
        expect(doc.querySelector('.index-display input')).toBeNull();
        // The dead "Email / Export Report" button is gone too.
        expect(doc.getElementById('btn-export-whs')).toBeNull();
        expect(doc.getElementById('btn-set-start-index').classList.contains('hidden')).toBe(true);
    });
});

describe('F-4 "Set starting index" persists a declared index', () => {
    async function bindButton({ viewing = 'u1' } = {}) {
        document.body.innerHTML = `
            <span id="handicap-index">—</span>
            <span id="index-subtext"></span>
            <button id="btn-set-start-index" class="hidden">Set starting index</button>
            <table><tbody id="history-tbody"></tbody></table>
        `;
        vi.resetModules();
        lastSetDoc = null;
        lastUpdateDoc = null;
        const { AppState } = await import('../../src/state.js');
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = viewing;
        const whs = await import('../../src/whs.js');
        whs.bindStartingIndexButton();
        return { btn: document.getElementById('btn-set-start-index'), whs, AppState };
    }
    const declare = async (btn, typed) => {
        window.prompt = vi.fn(() => typed);
        window.alert = vi.fn();
        btn.click();
        await new Promise(r => setTimeout(r, 10));
    };

    it('writes a declared starting index to the player\'s profile', async () => {
        const { btn, AppState } = await bindButton();
        await declare(btn, '26.4');

        expect(lastSetDoc, 'the typed index should reach profiles/{uid}').toBeTruthy();
        expect(lastSetDoc.ref._path).toBe('profiles/u1');
        expect(lastSetDoc.data).toEqual({ handicapIndex: '26.4', handicapIndexSource: 'declared' });
        expect(lastSetDoc.opts).toEqual({ merge: true });
        expect(AppState.handicapIndex).toBe('26.4');
    });

    it('accepts a plus handicap', async () => {
        const { btn } = await bindButton();
        await declare(btn, '-1.5');
        expect(lastSetDoc.data.handicapIndex).toBe('-1.5');
    });

    it('reads "+1.2" (how Golf Australia prints a plus handicap) as a plus index, not 1.2', async () => {
        const { btn, AppState } = await bindButton();
        await declare(btn, '+1.2');
        expect(lastSetDoc.data.handicapIndex).toBe('-1.2');
        expect(AppState.handicapIndex).toBe('-1.2');
    });

    it('parseDeclaredIndex: signs, a decimal comma, and junk', async () => {
        const { parseDeclaredIndex } = await import('../../src/whs.js');
        expect(parseDeclaredIndex('18.4')).toBe(18.4);
        expect(parseDeclaredIndex(' +0.8 ')).toBe(-0.8);
        expect(parseDeclaredIndex('-2')).toBe(-2);
        expect(parseDeclaredIndex('18,4')).toBe(18.4);
        expect(parseDeclaredIndex('18.4abc')).toBeNaN();
        expect(parseDeclaredIndex('abc')).toBeNaN();
        expect(parseDeclaredIndex('1.2.3')).toBeNaN();
    });

    it('refuses a value outside the WHS range and writes nothing', async () => {
        const { btn } = await bindButton();
        await declare(btn, '99');
        expect(lastSetDoc).toBeNull();
        expect(window.alert).toHaveBeenCalled();
    });

    it('writes nothing when the prompt is cancelled', async () => {
        const { btn } = await bindButton();
        await declare(btn, null);
        expect(lastSetDoc).toBeNull();
    });

    it('does not write another player\'s profile when a coach is viewing', async () => {
        const { btn } = await bindButton({ viewing: 'u2' });
        await declare(btn, '12.0');
        expect(lastSetDoc).toBeNull();
    });

    it('offline: the declared index is in use at once, before the write settles', async () => {
        const fs = await import('firebase/firestore');
        // Offline, Firestore queues the write and the promise never settles.
        fs.setDoc.mockImplementationOnce(() => new Promise(() => { }));
        const { btn, AppState } = await bindButton();
        await declare(btn, '22.6');
        expect(AppState.handicapIndex).toBe('22.6');
        expect(document.getElementById('handicap-index').textContent).toBe('22.6');
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('a rejected write puts the previous index back and says so', async () => {
        const fs = await import('firebase/firestore');
        fs.setDoc.mockImplementationOnce(async () => { throw new Error('permission-denied'); });
        const { btn, AppState } = await bindButton();
        AppState.handicapIndex = null;
        await declare(btn, '22.6');
        expect(AppState.handicapIndex).toBeNull();
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/Couldn't save/));
    });

    it('a coach viewing a declared starting index is not told it is theirs', async () => {
        const { whs } = await bindButton({ viewing: 'u2' });
        whs.syncStartingIndexButton(null, '18.4');
        const sub = document.getElementById('index-subtext').textContent;
        expect(sub).toMatch(/starting index/i);
        expect(sub).not.toMatch(/^Your/);
    });

    it('shows only on your own dashboard, and only until the app has an index', async () => {
        const { btn, whs, AppState } = await bindButton();
        whs.syncStartingIndexButton(null);
        expect(btn.classList.contains('hidden')).toBe(false);
        whs.syncStartingIndexButton('14.2');
        expect(btn.classList.contains('hidden')).toBe(true);
        AppState.viewingPlayerId = 'u2';
        whs.syncStartingIndexButton(null);
        expect(btn.classList.contains('hidden')).toBe(true);
    });
});

describe('a declared starting index survives the next rounds snapshot', () => {
    async function listen(profile, rounds) {
        document.body.innerHTML = `
            <span id="handicap-index">—</span>
            <span id="index-subtext"></span>
            <button id="btn-set-start-index" class="hidden">Set starting index</button>
            <div id="whs-welcome"></div><div id="empty-state"></div><div id="loading-state"></div>
            <table><tbody id="history-tbody"></tbody></table>
            <span id="record-player-name"></span>
            <div id="index-explainer"></div>
        `;
        vi.resetModules();
        const fsMod = await import('firebase/firestore');
        let cb = null;
        fsMod.onSnapshot.mockImplementation((_q, onNext) => { cb = onNext; return () => { }; });
        fsMod.getDoc.mockImplementation(async () => ({ exists: () => !!profile, data: () => profile || {} }));
        const { AppState } = await import('../../src/state.js');
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = 'u1';
        await import('../../src/ui.js');
        const whs = await import('../../src/whs.js');
        whs.listenToWHSRounds();
        await cb({ forEach: (fn) => rounds.forEach((r, i) => fn({ id: `r${i}`, data: () => r })) });
        await new Promise(r => setTimeout(r, 10));
        return AppState;
    }
    const r18 = (ags) => ({ uid: 'u1', rating: 72, slope: 113, adjustedGross: ags, holesPlayed: 18, notCounting: false, date: new Date() });

    it('no calculated index: the header shows the declared 18.4 and the button stays', async () => {
        const AppState = await listen({ handicapIndex: '18.4', handicapIndexSource: 'declared' }, []);
        expect(AppState.handicapIndex).toBe('18.4');
        expect(document.getElementById('handicap-index').textContent).toBe('18.4');
        expect(document.getElementById('index-subtext').textContent).toMatch(/starting index/);
        expect(document.getElementById('btn-set-start-index').classList.contains('hidden')).toBe(false);
    });

    it('once the rounds establish an index, that wins and the button goes', async () => {
        // Differentials 18, 19, 20 → 18 − 2.0 = 16.0
        const AppState = await listen({ handicapIndex: '18.4', handicapIndexSource: 'declared' }, [r18(90), r18(91), r18(92)]);
        expect(AppState.handicapIndex).toBe('16.0');
        expect(document.getElementById('btn-set-start-index').classList.contains('hidden')).toBe(true);
    });

    it('a starting index declared while the calculated one was gone is replaced when it comes back', async () => {
        // 16.0 was published, a round was marked not counting (index gone,
        // button back), 20.0 was declared, then the round counted again. The
        // history still ends on 16.0, so the old code wrote nothing and On
        // Course kept using 20.0 from the profile.
        lastUpdateDoc = null;
        const profile = { handicapIndex: '20.0', handicapIndexSource: 'declared',
            indexHistory: [{ date: new Date().toISOString(), index: '16.0' }] };
        const AppState = await listen(profile, [r18(90), r18(91), r18(92)]);
        expect(AppState.handicapIndex).toBe('16.0');
        expect(lastUpdateDoc, 'the profile should get the calculated index back').toBeTruthy();
        expect(lastUpdateDoc.ref._path).toBe('profiles/u1');
        expect(lastUpdateDoc.data).toEqual({ handicapIndex: '16.0' });
    });

    it('established, then below three counting rounds: the last published index stays, no starting-index button', async () => {
        // Codex P2: calculateIndex is null with two counting rounds even for an
        // established player; the button must not invite a declaration over
        // the published 16.0 that On Course uses.
        lastUpdateDoc = null;
        lastSetDoc = null;
        const profile = { handicapIndex: '16.0', indexHistory: [{ date: new Date().toISOString(), index: '16.0' }] };
        const AppState = await listen(profile, [r18(90), r18(91)]);
        expect(AppState.handicapIndex).toBe('16.0');
        expect(document.getElementById('btn-set-start-index').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('index-subtext').textContent).toBe('Your last published index');
        // A click that reaches the handler anyway writes nothing.
        window.prompt = vi.fn(() => '25.0');
        const { bindStartingIndexButton } = await import('../../src/whs.js');
        bindStartingIndexButton();
        document.getElementById('btn-set-start-index').click();
        await new Promise(r => setTimeout(r, 10));
        expect(window.prompt).not.toHaveBeenCalled();
        expect(lastSetDoc).toBeNull();
        expect(lastUpdateDoc).toBeNull();
    });

    it('profile unreadable (offline, not cached): Set starting index stays closed', async () => {
        // Codex P2: an unknown "established" must fail closed, or an offline
        // declaration could replace a published index On Course uses.
        lastSetDoc = null;
        document.body.innerHTML = `
            <span id="handicap-index">—</span>
            <span id="index-subtext"></span>
            <button id="btn-set-start-index" class="hidden">Set starting index</button>
            <div id="whs-welcome"></div><div id="empty-state"></div><div id="loading-state"></div>
            <table><tbody id="history-tbody"></tbody></table>
            <span id="record-player-name"></span>
            <div id="index-explainer"></div>
        `;
        vi.resetModules();
        const fsMod = await import('firebase/firestore');
        let cb = null;
        fsMod.onSnapshot.mockImplementation((_q, onNext) => { cb = onNext; return () => { }; });
        fsMod.getDoc.mockImplementation(async () => { throw new Error('unavailable'); });
        const { AppState } = await import('../../src/state.js');
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = 'u1';
        await import('../../src/ui.js');
        const whs = await import('../../src/whs.js');
        whs.listenToWHSRounds();
        await cb({ forEach: (fn) => [r18(90), r18(91)].forEach((r, i) => fn({ id: `r${i}`, data: () => r })) });
        await new Promise(r => setTimeout(r, 10));
        expect(document.getElementById('btn-set-start-index').classList.contains('hidden')).toBe(true);
        window.prompt = vi.fn(() => '25.0');
        whs.bindStartingIndexButton();
        document.getElementById('btn-set-start-index').click();
        await new Promise(r => setTimeout(r, 10));
        expect(window.prompt).not.toHaveBeenCalled();
        expect(lastSetDoc).toBeNull();
        fsMod.getDoc.mockImplementation(async () => ({ exists: () => false, data: () => ({}) }));
    });

    it('no profile write when it already holds the calculated index', async () => {
        lastUpdateDoc = null;
        const profile = { handicapIndex: '16.0', indexHistory: [{ date: new Date().toISOString(), index: '16.0' }] };
        await listen(profile, [r18(90), r18(91), r18(92)]);
        expect(lastUpdateDoc).toBeNull();
    });

    it('a snapshot whose profile read finishes after a player switch is dropped', async () => {
        document.body.innerHTML = `
            <span id="handicap-index">—</span>
            <span id="index-subtext"></span>
            <button id="btn-set-start-index" class="hidden">Set starting index</button>
            <div id="whs-welcome"></div><div id="empty-state"></div><div id="loading-state"></div>
            <table><tbody id="history-tbody"></tbody></table>
            <span id="record-player-name"></span>
            <div id="index-explainer"></div>
        `;
        vi.resetModules();
        lastUpdateDoc = null;
        lastSetDoc = null;
        const fsMod = await import('firebase/firestore');
        let cb = null;
        fsMod.onSnapshot.mockImplementation((_q, onNext) => { cb = onNext; return () => { }; });
        let release;
        const gate = new Promise(r => { release = r; });
        fsMod.getDoc.mockImplementation(async () => { await gate; return { exists: () => false, data: () => ({}) }; });
        const { AppState } = await import('../../src/state.js');
        // A coach (u1) looking at a student (u2) whose rounds give 16.0.
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = 'u2';
        AppState.handicapIndex = '9.9';
        await import('../../src/ui.js');
        const whs = await import('../../src/whs.js');
        whs.listenToWHSRounds();
        const rounds = [r18(90), r18(91), r18(92)].map(r => ({ ...r, uid: 'u2' }));
        const pending = cb({ forEach: (fn) => rounds.forEach((r, i) => fn({ id: `r${i}`, data: () => r })) });
        // The coach switches back to their own dashboard before the read lands.
        AppState.viewingPlayerId = 'u1';
        release();
        await pending;
        await new Promise(r => setTimeout(r, 10));
        expect(AppState.handicapIndex, "the student's 16.0 must not land on the coach's header").toBe('9.9');
        expect(lastUpdateDoc).toBeNull();
        expect(lastSetDoc).toBeNull();
    });

    it('no profile index and no rounds: still a dash', async () => {
        const AppState = await listen(null, []);
        expect(AppState.handicapIndex).toBeNull();
        expect(document.getElementById('handicap-index').textContent).toBe('—');
    });
});
