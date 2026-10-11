import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../src/ui.js', () => ({ UI: {} }));
let subscription;
afterEach(() => {
    subscription?.mock.calls.forEach(([event, handler]) => window.removeEventListener(event, handler));
    vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers();
});

it('hydrates, saves and tears down the bag without loading On Course', async () => {
    vi.resetModules(); vi.useFakeTimers();
    subscription = vi.spyOn(window, 'addEventListener');
    document.body.innerHTML = '<div id="my-bag-card">'
        + '<input class="bag-check" type="checkbox" data-cat="driver">'
        + '<input class="bag-check" type="checkbox" data-cat="irons" data-val="7">'
        + '</div><div id="bag-msg" class="hidden"></div>';
    const { AppState } = await import('../../src/state.js');
    AppState.playerClubs = { driver: true, woods: [], irons: ['7'], wedges: [], putter: false };
    const modulePath = '../../src/bag-settings.js';
    const { bindBagSettings } = await import(modulePath);
    bindBagSettings();
    expect([...document.querySelectorAll('.bag-check')].every(input => input.checked)).toBe(true);
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const driver = document.querySelector('[data-cat="driver"]');
    driver.checked = false;
    // E35: the tick itself saves; there is no Update button.
    driver.dispatchEvent(new Event('change', { bubbles: true }));
    const bagHideTimer = timeoutSpy.mock.results.at(-1).value;
    expect(AppState.playerClubs.driver).toBe(false);
    expect(JSON.parse(localStorage.getItem('golfAppClubs'))).toEqual(AppState.playerClubs);
    const message = document.getElementById('bag-msg');
    expect(message.classList.contains('hidden')).toBe(false);
    window.dispatchEvent(new CustomEvent('stateChange', {
        detail: { property: 'activeTab', newValue: 'tab-whs' }
    }));
    expect(clearTimeoutSpy).toHaveBeenCalledWith(bagHideTimer);
    expect(message.classList.contains('hidden')).toBe(true);
});
