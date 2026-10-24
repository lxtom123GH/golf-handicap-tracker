import { describe, it, expect, vi } from 'vitest';
const { getDoc, getDocs, query, collection, limit } = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn(), query: vi.fn((...args) => args), collection: vi.fn((db, name) => name), limit: vi.fn(n => ({ limit: n })) }));
vi.mock('../../src/firebase-config.js', () => ({ db:{}, functions:{} }));
vi.mock('firebase/firestore', () => ({ getDoc, collection,query,where:vi.fn(),getDocs,doc:vi.fn(),updateDoc:vi.fn(),addDoc:vi.fn(),serverTimestamp:vi.fn(),orderBy:vi.fn(),limit,arrayUnion:vi.fn(),arrayRemove:vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable:vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI:{} }));
vi.mock('../../src/state.js', () => ({ AppState:{currentUser:{uid:'synthetic-player'}} }));
vi.mock('../../src/ai.js', () => ({ generateAIResponse:vi.fn() }));
vi.mock('../../src/analytics.js', () => ({ aggregateShotPatterns:vi.fn() }));
vi.mock('../../src/modules/hole-plan-card.js', () => ({ mountHolePlanCard:vi.fn() }));
vi.mock('../../src/modules/intent-render.js', () => ({ renderIntentPanel:vi.fn() }));
vi.mock('../../src/videos.js', () => ({ renderVideoLibrary: vi.fn() }));
import { bindCoachTools, bindCoachDashboard } from '../../src/coach.js';

describe('coach list state copy', () => {
    it('replaces loading with a safe recovery message after a read fails', async () => {
        document.body.innerHTML='<button id="btn-manage-coaches">Manage</button><div id="manage-coaches-container"><ul id="my-coaches-list"></ul></div>';
        getDoc.mockRejectedValueOnce(new Error('SENSITIVE_DIAGNOSTIC'));
        bindCoachTools();
        document.getElementById('btn-manage-coaches').click();
        const list=document.getElementById('my-coaches-list');
        await vi.waitFor(() => expect(list.textContent).toMatch(/Could not load/));
        expect(list.textContent).toMatch(/reopen|try again/);
        expect(list.textContent).not.toMatch(/Loading|SENSITIVE_DIAGNOSTIC/);
    });
});

// PR #17 review, 13 Oct, P3 (issuecomment-6146051522).
it('bounds practice history independently of the complete WHS pairing record', async () => {
    document.body.innerHTML = '<div id="coach-roster-list"></div><div id="coach-view-name"></div>';
    getDoc.mockResolvedValue({ exists: () => false });
    const empty = { forEach: () => {} };
    getDocs.mockImplementation(async args => args[0] === 'users'
        ? { forEach: fn => fn({ id: 'athlete', data: () => ({ displayName: 'Test Athlete' }) }) } : empty);
    query.mockClear();
    window.currentUserIsCoach = true;
    bindCoachDashboard();
    await vi.waitFor(() => expect(document.querySelector('.athlete-view-btn')).not.toBeNull());
    document.querySelector('.athlete-view-btn').click();
    await vi.waitFor(() => expect(query.mock.calls.some(args => args[0] === 'practice_rounds')).toBe(true));
    const practiceQuery = query.mock.calls.find(args => args[0] === 'practice_rounds');
    expect(practiceQuery).toContainEqual({ limit: 10 });
    expect(query.mock.calls.filter(args => args[0] === 'whs_rounds').every(args => !args.some(arg => arg?.limit))).toBe(true);
});
