import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: null }, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    writeBatch: vi.fn(), deleteDoc: vi.fn(), increment: vi.fn(),
    arrayUnion: vi.fn(), arrayRemove: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('chart.js/auto', () => ({ default: vi.fn() }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

import { bindPracticeCaddyUI } from '../../src/ui.js';
import { AppState } from '../../src/state.js';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const invalidInput = 'The practice inputs were not accepted. Retype your goal using plain text (up to 120 characters), check the focus and session length, then try again.';

const uncertainOutcome = "We couldn't confirm whether your plan was created. Reload this page to check for an active plan before generating again.";

async function loadEmptyCaddy() {
    bindPracticeCaddyUI();
    await vi.waitFor(() => expect(document.getElementById('practice-state-empty').classList.contains('hidden')).toBe(false));
}

describe('Practice Caddy generation failure copy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = readFileSync('index.html', 'utf8');
        AppState.currentUser = { uid: 'alice' };
        doc.mockImplementation((db, ...path) => path.join('/'));
        getDoc.mockResolvedValue({ exists: () => false });
    });

    it.each([
        ['functions/invalid-argument', 'goal must not contain invisible or bidirectional control characters',
            invalidInput],
        ['functions/permission-denied', 'private service detail',
            'Your account is awaiting approval. Ask an admin to approve it before using AI features.'],
        ['functions/resource-exhausted', 'private service detail',
            "You've reached today's limit across AI features. Try again tomorrow."],
        ['functions/unauthenticated', 'private service detail',
            'Your session has ended. Sign in again to generate a practice plan.'],
        ['functions/internal', 'private backend trace marker', uncertainOutcome],
        ['functions/unavailable', 'private network endpoint', uncertainOutcome],
        ['functions/invalid-argument', 'private validation detail', invalidInput],
        ['functions/invalid-argument', 'goal must be text <img src=x onerror=alert(1)>', invalidInput],
        [undefined, 'private service detail', uncertainOutcome],
    ])('shows safe actionable copy for %s only after generation fails', async (code, rawMessage, expected) => {
        const fail = Object.assign(new Error(rawMessage), { code });
        httpsCallable.mockReturnValue(vi.fn().mockRejectedValue(fail));
        await loadEmptyCaddy();

        const message = document.getElementById('practice-generate-error');
        expect(message.classList.contains('hidden')).toBe(true);
        document.getElementById('btn-generate-practice').click();
        await vi.waitFor(() => expect(message.classList.contains('hidden')).toBe(false));

        expect(message.textContent).toBe(expected);
        expect(message.textContent).not.toContain('private');
        expect(message.textContent).not.toContain('trace marker');
        expect(message.querySelector('img')).toBeNull();
        expect(message.getAttribute('role')).toBe('alert');
        expect(document.getElementById('btn-generate-practice').disabled).toBe(false);
    });

    it.each([false, true])('reports a failed saved-plan check (library read: %s)', async libraryRead => {
        getDoc.mockRejectedValue(new Error('private lookup detail'));
        if (libraryRead) {
            getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({
                status: 'active', drillId: 'saved-drill', completedSteps: [],
            }) });
        }
        bindPracticeCaddyUI();
        const error = document.getElementById('practice-generate-error');
        await vi.waitFor(() => expect(document.getElementById('practice-state-empty').classList.contains('hidden')).toBe(false));

        expect(error.classList.contains('hidden')).toBe(false);
        expect(error.textContent).toBe("We couldn't check for a saved practice plan. Reload this page before generating again.");
        expect(error.textContent).not.toContain('private');
        expect(error.getAttribute('role')).toBe('alert');
        expect(getDoc).toHaveBeenCalledTimes(libraryRead ? 2 : 1);
        expect(httpsCallable).not.toHaveBeenCalled();
    });

    it('recovers a saved plan on reload after an uncertain generation outcome', async () => {
        const generate = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'functions/deadline-exceeded' }));
        httpsCallable.mockReturnValue(generate);
        await loadEmptyCaddy();
        document.getElementById('btn-generate-practice').click();
        await vi.waitFor(() => expect(document.getElementById('practice-generate-error').textContent).toBe(uncertainOutcome));

        // Reload with a fresh DOM: the server saved a plan despite the lost response.
        document.body.innerHTML = readFileSync('index.html', 'utf8');
        getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({
            status: 'active', drillId: 'saved-drill', completedSteps: [0],
            drill: { category: 'Putting', steps: ['Saved step A', 'Saved step B', 'Saved step C'] },
        }) });
        bindPracticeCaddyUI();
        await vi.waitFor(() => expect(document.getElementById('practice-state-active').classList.contains('hidden')).toBe(false));

        expect(document.getElementById('practice-steps-list').textContent).toContain('Saved step A');
        expect(document.querySelector('.practice-step input').checked).toBe(true);
        expect(document.getElementById('practice-generate-error').classList.contains('hidden')).toBe(true);
        expect(generate).toHaveBeenCalledOnce();
    });

    it('keeps failure copy hidden while generation is pending', async () => {
        let rejectGeneration;
        const generate = vi.fn(() => new Promise((resolve, reject) => { rejectGeneration = reject; }));
        httpsCallable.mockReturnValue(generate);
        await loadEmptyCaddy();
        const error = document.getElementById('practice-generate-error');
        const button = document.getElementById('btn-generate-practice');
        button.click();

        expect(generate).toHaveBeenCalledOnce();
        expect(button.disabled).toBe(true);
        expect(document.getElementById('practice-state-loading').classList.contains('hidden')).toBe(false);
        expect(error.classList.contains('hidden')).toBe(true);
        expect(error.textContent).toBe('');
        rejectGeneration(new Error('private service detail'));
        await vi.waitFor(() => expect(error.classList.contains('hidden')).toBe(false));
        expect(error.textContent).toBe(uncertainOutcome);
        expect(button.disabled).toBe(false);
    });

    it('hides a previous failure while retrying and after a plan is generated', async () => {
        const generate = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('service detail'), { code: 'functions/internal' }))
            .mockResolvedValueOnce({ data: {
                source: 'generated', drillId: 'new-plan', category: 'Putting', targetMetric: 'Pace',
                steps: ['A', 'B', 'C'], completedSteps: [],
            } });
        httpsCallable.mockReturnValue(generate);
        await loadEmptyCaddy();
        const error = document.getElementById('practice-generate-error');
        const button = document.getElementById('btn-generate-practice');

        button.click();
        await vi.waitFor(() => expect(error.classList.contains('hidden')).toBe(false));
        expect(error.textContent).toBe(uncertainOutcome);

        button.click();
        expect(error.classList.contains('hidden')).toBe(true);
        await vi.waitFor(() => expect(document.getElementById('practice-state-active').classList.contains('hidden')).toBe(false));
        expect(error.classList.contains('hidden')).toBe(true);
    });
});
