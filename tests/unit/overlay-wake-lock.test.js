import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createOverlayWakeLock } from '../../src/overlay-wake-lock.js';

let open, visibility, wake, request, lock;
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
    open = false;
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    lock = { release: vi.fn().mockResolvedValue(), addEventListener: vi.fn() };
    request = vi.fn().mockResolvedValue(lock);
    vi.stubGlobal('navigator', { wakeLock: { request } });
    wake = createOverlayWakeLock(() => open);
});
afterEach(() => { wake.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('requests screen wake on open once and releases on close', async () => {
    open = true;
    wake.sync();
    wake.sync();
    await settle();
    expect(request).toHaveBeenCalledExactlyOnceWith('screen');
    open = false;
    wake.sync();
    expect(lock.release).toHaveBeenCalledTimes(1);
});

it('releases when hidden and reacquires on return only while still open', async () => {
    open = true;
    wake.sync();
    await settle();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(lock.release).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    open = false;
    wake.sync();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(request).toHaveBeenCalledTimes(2);
});

it.each(['close', 'hide'])('releases a late-acquired lock after %s', async action => {
    let resolve;
    request.mockReturnValue(new Promise(done => { resolve = done; }));
    open = true;
    wake.sync();
    if (action === 'close') open = false;
    else visibility = 'hidden';
    wake.sync();
    resolve(lock);
    await settle();
    expect(lock.release).toHaveBeenCalledTimes(1);
});

it('continues gracefully when the API is missing or the request is refused', async () => {
    open = true;
    request.mockRejectedValue(new Error('battery policy'));
    wake.sync();
    await settle();
    vi.stubGlobal('navigator', {});
    expect(() => wake.sync()).not.toThrow();
});
