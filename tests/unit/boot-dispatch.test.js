import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/state.js';

// Regression guard for the blank-boot bug: the AppState Proxy dispatches
// 'stateChange' on CHANGE only, and body[data-active-tab] (the sole visibility
// mechanism) is written by that event's listener. If initialState.activeTab is
// ever a real tab id again, booting into that same tab assigns an equal value,
// no event fires, and the whole app renders blank.
describe('boot activeTab dispatch (blank-screen regression)', () => {
    it('initial activeTab is null so the first switchTab always dispatches', () => {
        // Read the pristine value before any test mutates it.
        expect(AppState.activeTab).toBeNull();
    });

    it('assigning the default boot tab fires stateChange', () => {
        let fired = null;
        const handler = (e) => { if (e.detail.property === 'activeTab') fired = e.detail.newValue; };
        window.addEventListener('stateChange', handler);
        AppState.activeTab = 'tab-oncourse'; // the fresh-user fallback tab
        window.removeEventListener('stateChange', handler);
        expect(fired).toBe('tab-oncourse');
    });
});
