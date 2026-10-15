import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const lock = () => ({ addEventListener: vi.fn(), release: vi.fn() });
let request;
beforeEach(() => {
    vi.resetModules();
    localStorage.removeItem('golf.keepAwake');
    document.body.innerHTML = '<button class="wakelock-toggle">Keep screen awake: Off</button>';
    request = vi.fn();
    vi.stubGlobal('navigator', { wakeLock: { request } });
    vi.stubGlobal('alert', vi.fn());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { localStorage.removeItem('golf.keepAwake'); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const click = () => document.querySelector('.wakelock-toggle').click();
const button = () => document.querySelector('.wakelock-toggle');

describe('keep-awake interrupted permission requests', () => {
    it('On then Off while the request is pending releases a late grant and stays Off', async () => {
        const first = pending(), granted = lock(); request.mockReturnValue(first.promise);
        (await import('../../src/wakelock.js')).initWakeLock();
        click(); click();
        first.resolve(granted); await flush(); await flush();
        expect(granted.release).toHaveBeenCalledTimes(1);
        expect(button().textContent).toContain('Off');
        expect(localStorage.getItem('golf.keepAwake')).toBeNull();
        expect(alert).not.toHaveBeenCalled();
    });
    it('a late first grant cannot replace the newer On choice or leak its lock', async () => {
        const first = pending(), second = pending(), oldLock = lock(), newLock = lock();
        request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        (await import('../../src/wakelock.js')).initWakeLock();
        click(); click(); click();
        second.resolve(newLock); await flush();
        first.resolve(oldLock); await flush(); await flush();
        expect(oldLock.release).toHaveBeenCalledTimes(1);
        expect(newLock.release).not.toHaveBeenCalled();
        expect(button().textContent).toContain('On');
        expect(localStorage.getItem('golf.keepAwake')).toBe('1');
        click(); await flush();
        expect(newLock.release).toHaveBeenCalledTimes(1);
    });
    it('a late first rejection cannot turn a newer successful choice Off', async () => {
        const first = pending(), newLock = lock();
        request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(newLock);
        (await import('../../src/wakelock.js')).initWakeLock();
        click(); click(); click(); await flush();
        first.reject(new Error('Old request denied')); await flush(); await flush();
        expect(button().classList.contains('active')).toBe(true);
        expect(localStorage.getItem('golf.keepAwake')).toBe('1');
        expect(alert).not.toHaveBeenCalled();
    });
});
