// Codex review 2 of PR #37: ownership must be proven before an upload can start.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), writeBatch: vi.fn(), deleteDoc: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
import { noteAccount } from '../../src/diagnostics/hooks.js';
import { mountFlightRecorderCard } from '../../src/diagnostics/panel.js';
import { createStorage } from '../vitest.setup.js';

const KEY = 'golf.flightrec.acct';

describe('P1 a missing tag is unowned: clear before confirming', () => {
    it('no tag + clear fails -> not confirmed; no tag + clear ok -> confirmed', async () => {
        const st = createStorage();
        const failing = { clearAll: vi.fn(async () => false) };
        expect(await noteAccount('uidA', failing, st)).toBe(false);
        expect(failing.clearAll).toHaveBeenCalledTimes(1);
        const ok = { clearAll: vi.fn(async () => true) };
        expect(await noteAccount('uidA', ok, st)).toBe(true);
        expect(ok.clearAll).toHaveBeenCalledTimes(1);
        expect(await noteAccount('uidA', ok, st)).toBe(true); // same owner: no clear
        expect(ok.clearAll).toHaveBeenCalledTimes(1);
    });
});

describe('P1 a failed switch invalidates ownership', () => {
    it('A -> B (clear fails) -> A again is NOT confirmed until a clear succeeds', async () => {
        const st = createStorage();
        const ok = { clearAll: async () => true };
        expect(await noteAccount('uidA', ok, st)).toBe(true);
        expect(await noteAccount('uidB', { clearAll: async () => false }, st)).toBe(false);
        expect(st.getItem(KEY)).not.toMatch(/^[0-9a-f]{16}$/);
        const bad = { clearAll: vi.fn(async () => false) };
        expect(await noteAccount('uidA', bad, st)).toBe(false);
        expect(bad.clearAll).toHaveBeenCalled();
        expect(await noteAccount('uidA', ok, st)).toBe(true);
    });
});

describe('P2 Clear reports what actually happened', () => {
    it('a refused clear is not reported as success', async () => {
        document.body.innerHTML = '<div><div id="app-update-card"></div></div>';
        const rec = await import('../../src/diagnostics/recorder.js');
        rec._resetRecorderForTests();
        const r = rec.recorder();
        vi.spyOn(r, 'clearAll').mockResolvedValue(false);
        globalThis.confirm = () => true;
        const card = mountFlightRecorderCard();
        card.querySelector('.flightrec-clear').click();
        await new Promise(res => setTimeout(res, 0));
        expect(card.querySelector('.flightrec-msg').textContent).toMatch(/could not be confirmed/i);
        clearInterval(card._flightrecInterval);
    });
});
