// Simplify 2026-10-07 E38: a finished Caddy plan closes with one "Done" tap
// instead of a 5-star rating nobody reads.
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
import { doc, getDoc, updateDoc } from 'firebase/firestore';

describe('Practice Caddy: one Done tap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = readFileSync('index.html', 'utf8');
        AppState.currentUser = { uid: 'alice' };
        doc.mockImplementation((db, ...path) => path.join('/'));
        updateDoc.mockReturnValue(new Promise(() => {})); // offline: never settles
        getDoc.mockResolvedValue({ exists: () => true, data: () => ({
            status: 'active', drillId: 'p', completedSteps: [0, 1, 2],
            drill: { category: 'Putting', targetMetric: 'Lag', steps: ['A', 'B', 'C'] },
        }) });
    });

    it('a finished plan shows Done, no stars, and Done closes it even offline', async () => {
        expect(document.querySelector('.star-btn')).toBeNull();
        expect(document.getElementById('btn-submit-rating')).toBeNull();
        bindPracticeCaddyUI();
        const section = document.getElementById('practice-rating-section');
        await vi.waitFor(() => expect(section.classList.contains('hidden')).toBe(false));
        const done = document.getElementById('btn-practice-done');
        expect(done.textContent).toContain('Done');
        done.click();
        expect(updateDoc).toHaveBeenCalledTimes(1);
        expect(updateDoc).toHaveBeenCalledWith('users/alice/practice_plans/active', { status: 'completed' });
        // The plan closes without waiting for the write.
        expect(document.getElementById('practice-state-empty').classList.contains('hidden')).toBe(false);
    });
});
