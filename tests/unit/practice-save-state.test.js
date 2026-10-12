/** Practice-write acknowledgement state regressions. */
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

describe('Practice save confirmation copy', () => {
    const submit = () => {
        pick('bunker_game');
        document.querySelector('#form-log-practice .drill-outcome-field').value = '3';
        document.getElementById('form-log-practice').dispatchEvent(new Event('submit', { cancelable: true }));
    };
    it('pending write does not claim confirmed save or durable phone storage', () => {
        submit();
        expect(h.showToast.mock.calls.at(-1)[0]).toMatch(/requested|queued/i);
        expect(h.showToast.mock.calls.at(-1)[0]).not.toMatch(/saved|synced|saved on this phone/i);
        expect(h.showToast.mock.calls.at(-1)[0]).toMatch(/before.*again/i);
    });
    it('server acknowledgement confirms sync', async () => {
        h.setDoc.mockResolvedValueOnce(); submit(); await Promise.resolve(); await Promise.resolve();
        expect(h.showToast.mock.calls.at(-1)[0]).toMatch(/synced/i);
    });
    it('rejected acknowledgement is visible without arbitrary service detail', async () => {
        h.setDoc.mockRejectedValueOnce(new Error('synthetic SECRET_SERVICE_DETAIL'));
        submit(); await Promise.resolve(); await Promise.resolve();
        const text = h.showToast.mock.calls.at(-1)[0];
        expect(text).toMatch(/not confirmed|couldn.t confirm/i);
        expect(text).toMatch(/History/); expect(text).not.toContain('SECRET_SERVICE_DETAIL');
    });
    it('late acknowledgement never notifies a different signed-in account', async () => {
        let finish; h.setDoc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        submit(); h.showToast.mockClear(); AppState.currentUser = { uid: 'other' };
        finish(); await Promise.resolve(); await Promise.resolve();
        expect(h.showToast).not.toHaveBeenCalled();
    });
    it('offline requests do not promise durable phone storage', () => {
        const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        try {
            submit();
            expect(h.showToast.mock.calls.at(-1)[0]).toMatch(/sync not confirmed/);
            expect(h.showToast.mock.calls.at(-1)[0]).not.toMatch(/saved on this phone/);
        } finally { online.mockRestore(); }
    });
    it('late rejection does not surface in a different account', async () => {
        let fail; h.setDoc.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
        submit(); h.showToast.mockClear(); AppState.currentUser = null;
        fail(new Error('synthetic failure')); await Promise.resolve(); await Promise.resolve();
        expect(h.showToast).not.toHaveBeenCalled();
    });

});
