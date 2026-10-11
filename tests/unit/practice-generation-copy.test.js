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

const uncertainOutcome = "We couldn't confirm whether your plan was created. Reload this page to check for an active plan before generating again.";

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
            'goal must not contain invisible or bidirectional control characters'],
        ['functions/permission-denied', 'private service detail',
            'Your account is awaiting approval. Ask an admin to approve it before using AI features.'],
        ['functions/resource-exhausted', 'private service detail',
            "You've reached today's AI practice plan limit. Try again tomorrow."],
        ['functions/unauthenticated', 'private service detail',
            'Your session has ended. Sign in again to generate a practice plan.'],
        ['functions/internal', 'private backend trace marker', uncertainOutcome],
        ['functions/unavailable', 'private network endpoint', uncertainOutcome],
    ])('shows safe actionable copy for %s only after generation fails', async (code, rawMessage, expected) => {
        const fail = Object.assign(new Error(rawMessage), { code });
        httpsCallable.mockReturnValue(vi.fn().mockRejectedValue(fail));
        bindPracticeCaddyUI();

        const message = document.getElementById('practice-generate-error');
        expect(message.classList.contains('hidden')).toBe(true);
        document.getElementById('btn-generate-practice').click();
        await vi.waitFor(() => expect(message.classList.contains('hidden')).toBe(false));

        expect(message.textContent).toBe(expected);
        expect(message.textContent).not.toContain('private');
        expect(message.textContent).not.toContain('trace marker');
        expect(document.getElementById('btn-generate-practice').disabled).toBe(false);
    });

    it('hides a previous failure while retrying and after a plan is generated', async () => {
        const generate = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('service detail'), { code: 'functions/internal' }))
            .mockResolvedValueOnce({ data: {
                source: 'generated', drillId: 'new-plan', category: 'Putting', targetMetric: 'Pace',
                steps: ['A', 'B', 'C'], completedSteps: [],
            } });
        httpsCallable.mockReturnValue(generate);
        bindPracticeCaddyUI();
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
