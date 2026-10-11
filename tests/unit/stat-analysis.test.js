// Decision 15 (2026-10-07): the locker room's "Mental Routine" tile read
// simpleStats[h].routines.pre, a key nothing writes (Simple's chip wrote
// simpleStats[h].routine; Detailed routines live on the shot docs), so it
// always said N/A. The tile and its mentalScore field are gone.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.fn(async () => ({ data: { answer: 'ok' } }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }));
vi.mock('firebase/firestore', async (orig) => ({
    ...(await orig()),
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    getDocs: vi.fn(async () => ({
        forEach: (fn) => [{ roundId: "r1", uid: "me", penalty: 0 }]
            .forEach(d => fn({ data: () => d })),
    })),
}));
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'me' } }, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));

import { AppState } from '../../src/state.js';
import { runStatAnalysis } from '../../src/oncourse.js';

beforeEach(() => {
    document.body.innerHTML = `
        <div id="stat-analysis-modal" class="hidden"><div id="stat-analysis-results"></div></div>`;
    AppState.currentUser = { uid: 'me' };
    AppState.activeRoundId = 'r1';
    AppState.currentCoursePars = [4, 3, 5];
    AppState.liveRoundGroups = [{ uid: 'me', scores: { 1: 5, 2: 3, 3: 6 }, simpleStats: { 1: { putts: 2 } } }];
    callable.mockClear();
});

describe('Instant Analysis (decision 15)', () => {
    it('has no always-N/A "Mental Routine" tile, and sends no mentalScore', async () => {
        await runStatAnalysis();
        const html = document.getElementById('stat-analysis-results').innerHTML;
        expect(html).toMatch(/FIR%/); // the panel rendered
        expect(html).not.toMatch(/Mental Routine/);
        expect(callable).toHaveBeenCalledTimes(1);
        expect('mentalScore' in callable.mock.calls[0][0]).toBe(false);
    });
});
