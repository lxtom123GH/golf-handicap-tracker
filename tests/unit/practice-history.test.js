/**
 * Simplify 2026-10-07 E36: Practice "Past sessions" actually shows — the last
 * 5, with delete — and the "No practice sessions yet" line only shows when
 * there are none. Real practice.js over the shipped Practice markup.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const h = vi.hoisted(() => ({ deleteDoc: vi.fn(() => Promise.resolve()), doc: vi.fn((db, c, id) => ({ c, id })) }));
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(), addDoc: vi.fn(),
    serverTimestamp: vi.fn(), getDocs: vi.fn(async () => ({ forEach() {}, docs: [] })), doc: h.doc, deleteDoc: h.deleteDoc,
    updateDoc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(() => Promise.resolve()), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
    limit: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const repo = resolve(import.meta.dirname, '../..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');

let practice, AppState;

beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').getElementById('tab-practice').outerHTML;
    ({ AppState } = await import('../../src/state.js'));
    practice = await import('../../src/practice.js');
    AppState.currentUser = { uid: 'me' };
});

const sessions = (n) => Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, uid: 'me', drillId: 'bunker_game', drillName: `Drill ${i}`, score: 10 + i, date: new Date(2026, 9, 7 - i),
}));
const shown = (id) => !document.getElementById(id).classList.contains('hidden');

describe('Practice: last 5 sessions', () => {
    it('no sessions: the empty line shows and the table is hidden', () => {
        AppState.currentPracticeRounds = [];
        practice.renderRecentPractice();
        expect(shown('practice-empty-state')).toBe(true);
        expect(shown('practice-table-container')).toBe(false);
    });

    it('after a save: the table shows the newest 5 and the empty line goes', () => {
        AppState.currentPracticeRounds = sessions(7);
        practice.renderRecentPractice();
        expect(shown('practice-empty-state')).toBe(false);
        expect(shown('practice-table-container')).toBe(true);
        const rows = [...document.querySelectorAll('#practice-history-tbody tr')];
        expect(rows).toHaveLength(5);
        expect(rows[0].textContent).toContain('Drill 0');
        expect(rows[4].textContent).toContain('Drill 4');
    });

    it('headers match the cells: Date, Drill, Score, delete', () => {
        AppState.currentPracticeRounds = sessions(1);
        practice.renderRecentPractice();
        const heads = [...document.querySelectorAll('#practice-table-container thead th')];
        const cells = [...document.querySelectorAll('#practice-history-tbody tr:first-child td')];
        expect(heads.length).toBe(cells.length);
        expect(heads.map(t => t.textContent.trim()).slice(0, 3)).toEqual(['Date', 'Drill', 'Score']);
        expect(cells[2].textContent.trim()).toBe('10');
        expect(cells[3].querySelector('button.del-prac-round')).not.toBeNull();
    });

    it('no inline display:none keeps the table hidden for ever', () => {
        expect(document.getElementById('practice-table-container').getAttribute('style') || '').not.toMatch(/display:\s*none/);
    });

    it('same-day sessions: the newest (by time) is first', () => {
        const d = (h) => new Date(2026, 9, 7, h);
        AppState.currentPracticeRounds = [
            { id: 'late', uid: 'me', drillName: 'Late', score: 1, date: d(18) },
            { id: 'early', uid: 'me', drillName: 'Early', score: 1, date: d(9) },
        ];
        practice.renderRecentPractice();
        expect(document.querySelector('#practice-history-tbody tr').textContent).toContain('Late');
        const src = readFileSync(resolve(repo, 'src/practice.js'), 'utf8');
        // Today's drills keep the time of day; only a backdated one is midnight.
        expect(src).toMatch(/dateInput\.value === localToday\(\) \? new Date\(\) : picked/);
    });

    it('only lists the signed-in golfer\'s sessions', () => {
        AppState.currentPracticeRounds = [...sessions(2), { id: 'x', uid: 'someone-else', drillName: 'Theirs', score: 9, date: new Date() }];
        practice.renderRecentPractice();
        expect(document.getElementById('practice-history-tbody').textContent).not.toContain('Theirs');
        expect(document.querySelectorAll('#practice-history-tbody tr')).toHaveLength(2);
    });

    it('cancelling the confirm deletes nothing', () => {
        practice.bindPracticeHistoryDelete();
        AppState.currentPracticeRounds = sessions(1);
        practice.renderRecentPractice();
        h.deleteDoc.mockClear();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        document.querySelector('#practice-history-tbody .del-prac-round').click();
        expect(h.deleteDoc).not.toHaveBeenCalled();
    });

    it('delete removes that session after a confirm', async () => {
        practice.bindPracticeHistoryDelete();
        AppState.currentPracticeRounds = sessions(2);
        practice.renderRecentPractice();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        document.querySelector('#practice-history-tbody .del-prac-round[data-id="p1"]').click();
        expect(h.deleteDoc).toHaveBeenCalledTimes(1);
        expect(h.doc.mock.calls.at(-1)).toEqual([{}, 'practice_rounds', 'p1']);
    });
});
