// Decision 12 (simplify 2026-10-07): keep-awake remembers the golfer's last
// choice across launches instead of resetting to Off.
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

let request, released;
const flush = () => new Promise(r => setTimeout(r, 0));
const btn = () => document.querySelector('.wakelock-toggle');

beforeEach(() => {
    vi.resetModules();
    released = 0;
    request = vi.fn(async () => ({ addEventListener: vi.fn(), release: () => { released++; } }));
    vi.stubGlobal('navigator', { wakeLock: { request } });
    document.body.innerHTML = '<button class="wakelock-toggle"></button>';
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    localStorage.removeItem('golf.keepAwake');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('keep-awake remembers the last choice', () => {
    it('turning it on is remembered and re-applied at the next launch', async () => {
        (await import('../../src/wakelock.js')).initWakeLock();
        await flush();
        expect(request).not.toHaveBeenCalled(); // first launch: off
        btn().click();
        await flush();
        expect(localStorage.getItem('golf.keepAwake')).toBe('1');

        // Next launch: a fresh module and a fresh button.
        vi.resetModules();
        request.mockClear();
        document.body.innerHTML = '<button class="wakelock-toggle"></button>';
        (await import('../../src/wakelock.js')).initWakeLock();
        await flush();
        expect(request).toHaveBeenCalledTimes(1);
        expect(btn().classList.contains('active')).toBe(true);
        expect(btn().textContent).toContain('On');
    });

    it('turning it off is remembered too', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        (await import('../../src/wakelock.js')).initWakeLock();
        await flush();
        btn().click(); // on -> off
        await flush();
        expect(released).toBe(1);
        expect(localStorage.getItem('golf.keepAwake')).toBeNull();
    });

    it('Start Round re-applies it once (no double lock)', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        const m = await import('../../src/wakelock.js');
        m.initWakeLock();
        await flush();
        expect(await m.applyRememberedWakeLock()).toBeNull(); // already on: nothing to do
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('a remembered "on" that the browser refuses resolves false (Start Round tells the golfer)', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        request.mockRejectedValue(new Error('NotAllowedError'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const m = await import('../../src/wakelock.js');
        expect(await m.applyRememberedWakeLock()).toBe(false);
        expect(localStorage.getItem('golf.keepAwake')).toBe('1'); // still the golfer's choice
    });

    it('a refused boot re-apply retries on the next touch (a reloaded round has no Start tap)', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        request.mockRejectedValueOnce(new Error('NotAllowedError'));
        (await import('../../src/wakelock.js')).initWakeLock();
        await flush(); await flush();
        expect(btn().classList.contains('active')).toBe(false);
        document.dispatchEvent(new Event('pointerdown'));
        await flush(); await flush();
        expect(request).toHaveBeenCalledTimes(2);
        expect(btn().classList.contains('active')).toBe(true);
    });

    // Codex review P2: the tap showed On -> means Off; a re-apply that FAILS
    // meanwhile must not make the tap switch it back on.
    it('a tap (Off) while a re-apply is pending and then fails stays off and forgets "on"', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('alert', vi.fn());
        let refuse;
        request.mockImplementationOnce(() => new Promise((_, rej) => { refuse = () => rej(new Error('NotAllowedError')); }));
        const m = await import('../../src/wakelock.js');
        m.initWakeLock(); // re-apply in flight
        expect(btn().textContent).toContain('On');
        btn().click();    // golfer means Off
        refuse();
        await flush(); await flush(); await flush();
        expect(request).toHaveBeenCalledTimes(1); // no second request from the tap
        expect(btn().classList.contains('active')).toBe(false);
        expect(localStorage.getItem('golf.keepAwake')).toBeNull();
    });

    // Codex review P2: Start Round during a pending boot re-apply must still
    // learn that it failed (it shows the "couldn't keep awake" toast).
    it('a second call while a re-apply is pending gets its result (false on refusal)', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let refuse;
        request.mockImplementationOnce(() => new Promise((_, rej) => { refuse = () => rej(new Error('NotAllowedError')); }));
        const m = await import('../../src/wakelock.js');
        const first = m.applyRememberedWakeLock();
        const second = m.applyRememberedWakeLock(); // Start Round meanwhile
        refuse();
        expect(await first).toBe(false);
        expect(await second).toBe(false);
        expect(request).toHaveBeenCalledTimes(1);
    });

    // Codex review P2 (pass 4): Start Round tapped while the gesture-less boot
    // re-apply is pending asks again inside the tap; iOS may refuse the boot one.
    it('Start Round during a pending boot re-apply that fails: the tap\'s own request keeps it awake', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let refuse;
        request.mockImplementationOnce(() => new Promise((_, rej) => { refuse = () => rej(new Error('NotAllowedError')); }));
        const m = await import('../../src/wakelock.js');
        m.initWakeLock(); // boot re-apply in flight
        const atTap = m.applyRememberedWakeLock({ gesture: true });
        expect(request).toHaveBeenCalledTimes(2); // asked inside the tap, synchronously
        refuse();
        expect(await atTap).toBe(true);
        await flush();
        expect(btn().classList.contains('active')).toBe(true);
        btn().click(); // and that lock is the one the toggle releases
        await flush();
        expect(released).toBe(1);
        expect(localStorage.getItem('golf.keepAwake')).toBeNull();
    });

    it('Start Round during a pending boot re-apply that succeeds keeps one lock, not two', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        let grant;
        request.mockImplementationOnce(() => new Promise(r => { grant = () => r({ addEventListener: vi.fn(), release: () => { released++; } }); }));
        const m = await import('../../src/wakelock.js');
        m.initWakeLock();
        const atTap = m.applyRememberedWakeLock({ gesture: true });
        grant();
        expect(await atTap).toBe(true);
        expect(released).toBe(1); // the extra one from the tap
        expect(btn().classList.contains('active')).toBe(true);
    });

    it('Start Round during a pending boot re-apply: both refused -> false (the golfer is told)', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        request.mockRejectedValue(new Error('NotAllowedError'));
        const m = await import('../../src/wakelock.js');
        m.initWakeLock();
        expect(await m.applyRememberedWakeLock({ gesture: true })).toBe(false);
        expect(btn().classList.contains('active')).toBe(false);
    });

    // Codex review P2: after a refused boot re-apply, a touch ON the toggle is
    // the golfer's own choice; the retry must not flip the button first.
    it('a refused boot re-apply: tapping the toggle (Off showing) turns it On once, no retry', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        request.mockRejectedValueOnce(new Error('NotAllowedError'));
        (await import('../../src/wakelock.js')).initWakeLock();
        await flush(); await flush();
        expect(btn().classList.contains('active')).toBe(false);
        btn().dispatchEvent(new Event('pointerdown', { bubbles: true }));
        btn().click(); // Off showing -> the golfer means On
        await flush(); await flush();
        expect(request).toHaveBeenCalledTimes(2); // boot + the tap, no extra retry
        expect(btn().classList.contains('active')).toBe(true);
        expect(localStorage.getItem('golf.keepAwake')).toBe('1');
    });

    it('a tap while the re-apply is pending waits for it, then switches off cleanly', async () => {
        localStorage.setItem('golf.keepAwake', '1');
        let grant;
        request.mockImplementation(() => new Promise(r => { grant = () => r({ addEventListener: vi.fn(), release: () => { released++; } }); }));
        const m = await import('../../src/wakelock.js');
        m.initWakeLock(); // re-apply in flight
        expect(btn().textContent).toContain('On'); // shown at once
        btn().click();    // so a tap now means Off
        grant();
        await flush(); await flush();
        expect(released).toBe(1);
        expect(btn().classList.contains('active')).toBe(false);
        expect(localStorage.getItem('golf.keepAwake')).toBeNull();
    });
});
