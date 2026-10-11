// ==========================================================================
// practice-basis.test.js — S8: "why this plan" under the drill title
// ==========================================================================

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

import { bindPracticeCaddyUI, practiceBasisText } from '../../src/ui.js';
import { AppState } from '../../src/state.js';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

describe('Practice Caddy cached preferences notice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = readFileSync('index.html', 'utf8');
        AppState.currentUser = { uid: 'alice' };
        getDoc.mockResolvedValue({ exists: () => false });
        doc.mockImplementation((db, ...path) => path.join('/'));
    });

    it.each([true, false])('shows a notice only when preferences were ignored: %s', async preferencesIgnored => {
        httpsCallable.mockReturnValue(vi.fn().mockResolvedValue({ data: {
            source: 'cache', drillId: 'cached', category: 'Putting', steps: ['A', 'B', 'C'], preferencesIgnored,
        } }));
        bindPracticeCaddyUI();
        document.getElementById('btn-generate-practice').click();
        await vi.waitFor(() => expect(document.getElementById('btn-generate-practice').disabled).toBe(false));
        const notice = document.getElementById('practice-preferences-notice');
        expect(notice).not.toBeNull();
        expect(notice.classList.contains('hidden')).toBe(!preferencesIgnored);
        if (preferencesIgnored) expect(notice.textContent).toContain('preferences were not applied');
    });

    it('reloads private drill content from the user plan without a shared-library read', async () => {
        getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({
            status: 'active', drillId: 'private', completedSteps: [0],
            drill: { category: 'Driver', targetMetric: 'Accuracy', steps: ['Dave at Keperra', 'B', 'C'] },
        }) });
        bindPracticeCaddyUI();
        await vi.waitFor(() => expect(document.querySelectorAll('.practice-step')).toHaveLength(3));
        expect(document.getElementById('practice-steps-list').textContent).toContain('Dave at Keperra');
        expect(document.querySelector('.practice-step input').checked).toBe(true);
        expect(getDoc.mock.calls).toEqual([['users/alice/practice_plans/active']]);
    });
});

describe('practiceBasisText', () => {
    it('reads the callable shape { clubs: [...] }', () => {
        const text = practiceBasisText({ clubs: [
            { club: 'Driver', gapType: 'start line', gapValue: 4.2, unit: 'deg' },
            { club: '7 Iron', gapType: 'distance', gapValue: 12, unit: 'm' },
        ] });
        expect(text).toBe('Based on: Driver start line 4.2° off plan; 7 Iron 12 m off plan');
    });

    it('reads the stored shape (a bare array on the plan document)', () => {
        const text = practiceBasisText([{ club: 'Driver', gapType: 'shape', gapValue: 1, unit: '' }]);
        expect(text).toBe('Based on: Driver shape differs from plan');
    });

    it('is empty for a plan with no basis, so the line stays hidden', () => {
        expect(practiceBasisText(null)).toBe('');
        expect(practiceBasisText(undefined)).toBe('');
        expect(practiceBasisText({})).toBe('');
        expect(practiceBasisText({ clubs: [] })).toBe('');
        expect(practiceBasisText([])).toBe('');
    });

    it('reads naturally when the function pooled shots that named no club', () => {
        const text = practiceBasisText({ clubs: [
            { club: 'Your shots', gapType: 'start line', gapValue: 8.9, unit: 'deg' },
        ] });
        expect(text).toBe('Based on: start line 8.9° off plan (all clubs)');
        expect(text).not.toContain('Your shots start line');
    });

    it('skips malformed entries rather than printing undefined', () => {
        const text = practiceBasisText({ clubs: [
            { club: '', gapType: 'start line', gapValue: 5, unit: 'deg' },
            { club: 'Driver' },
            { club: '5 Iron', gapType: 'distance', gapValue: -8, unit: 'm' },
        ] });
        expect(text).toBe('Based on: 5 Iron 8 m off plan');
        expect(text).not.toContain('undefined');
    });
});
