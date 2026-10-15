import { describe, it, expect, vi } from 'vitest';
const getDoc = vi.hoisted(() => vi.fn());
vi.mock('../../src/firebase-config.js', () => ({ db:{}, functions:{} }));
vi.mock('firebase/firestore', () => ({ getDoc, collection:vi.fn(),query:vi.fn(),where:vi.fn(),getDocs:vi.fn(),doc:vi.fn(),updateDoc:vi.fn(),addDoc:vi.fn(),serverTimestamp:vi.fn(),orderBy:vi.fn(),limit:vi.fn(),arrayUnion:vi.fn(),arrayRemove:vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable:vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI:{} }));
vi.mock('../../src/state.js', () => ({ AppState:{currentUser:{uid:'synthetic-player'}} }));
vi.mock('../../src/ai.js', () => ({ generateAIResponse:vi.fn() }));
vi.mock('../../src/analytics.js', () => ({ aggregateShotPatterns:vi.fn() }));
vi.mock('../../src/modules/hole-plan-card.js', () => ({ mountHolePlanCard:vi.fn() }));
vi.mock('../../src/modules/intent-render.js', () => ({ renderIntentPanel:vi.fn() }));
import { bindCoachTools } from '../../src/coach.js';

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
