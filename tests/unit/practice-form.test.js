/**
 * Simplify 2026-10-07 E37: drill counts start at 0 (or the template default),
 * and saving shows a toast instead of a pop-up — without re-subscribing the
 * practice listener. Real practice.js over the shipped Practice markup.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const h = vi.hoisted(() => ({
    setDoc: vi.fn(() => new Promise(() => {})), // offline: never settles
    onSnapshot: vi.fn(() => () => {}),
    showToast: vi.fn(),
}));
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), onSnapshot: h.onSnapshot, addDoc: vi.fn(),
    serverTimestamp: vi.fn(), getDocs: vi.fn(async () => ({ forEach() {}, docs: [] })), doc: vi.fn(() => ({ id: 'new' })),
    deleteDoc: vi.fn(() => Promise.resolve()), updateDoc: vi.fn(), getDoc: vi.fn(async () => ({ exists: () => false })),
    setDoc: h.setDoc, arrayUnion: vi.fn(), arrayRemove: vi.fn(), limit: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/modules/score-input.js', () => ({ showToast: h.showToast }));

const repo = resolve(import.meta.dirname, '../..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');

let practice, AppState;

beforeEach(async () => {
    vi.resetModules();
    h.setDoc.mockClear(); h.onSnapshot.mockClear(); h.showToast.mockClear();
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').getElementById('tab-practice').outerHTML;
    ({ AppState } = await import('../../src/state.js'));
    AppState.currentUser = { uid: 'me', displayName: 'Me' };
    practice = await import('../../src/practice.js');
    practice.initPractice();
});

const pick = (id) => {
    const sel = document.getElementById('drill-select');
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
};

describe('Practice drill log', () => {
    it('every count starts at 0, including templates with no default', () => {
        for (const id of ['bunker_game', 'ladder_putt', 'gauntlet_putt']) {
            pick(id);
            const inputs = [...document.querySelectorAll('#form-log-practice .drill-outcome-field')];
            expect(inputs.length, id).toBeGreaterThan(0);
            for (const el of inputs) expect(el.value, `${id} ${el.id}`).toBe('0');
        }
    });

    it('saving shows a toast, no alert, one write, and no listener re-subscribe', () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        pick('bunker_game');
        document.querySelector('#form-log-practice .drill-outcome-field').value = '3';
        const subscribes = h.onSnapshot.mock.calls.length;
        document.getElementById('form-log-practice').dispatchEvent(new Event('submit', { cancelable: true }));
        expect(h.setDoc).toHaveBeenCalledTimes(1);
        expect(h.showToast).toHaveBeenCalledTimes(1);
        expect(h.showToast.mock.calls[0][0]).toMatch(/saved/i);
        expect(alertSpy).not.toHaveBeenCalled();
        expect(h.onSnapshot.mock.calls.length).toBe(subscribes);
        alertSpy.mockRestore();
    });

    it('a bad day still saves: only a 0-point count entered (review P3)', () => {
        pick('up_down');
        document.getElementById('drill-input-missed').value = '3';
        document.getElementById('form-log-practice').dispatchEvent(new Event('submit', { cancelable: true }));
        expect(h.setDoc).toHaveBeenCalledTimes(1);
        expect(h.setDoc.mock.calls[0][1].score).toBe(0);
    });

    it('an untouched all-zero form does not save (review P2)', () => {
        pick('bunker_game');
        document.getElementById('form-log-practice').dispatchEvent(new Event('submit', { cancelable: true }));
        expect(h.setDoc).not.toHaveBeenCalled();
        expect(h.showToast.mock.calls.at(-1)[0]).toMatch(/at least one count/);
    });
});
