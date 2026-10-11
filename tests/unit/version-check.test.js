// ==========================================================================
// version-check.test.js
// F-17 — the boot-time version check must not reload offline, or brick boot
// ==========================================================================
//
// The check compares a build-stamped constant against localStorage and calls
// location.reload() on mismatch. __BUILD_COMMIT__ changes on every deploy, and
// the service worker serves a stale cached shell offline (by design), so an
// offline launch after a deploy loads the OLD bundle, finds the version it
// stored while last online, and reloads itself — on the first tee, for no
// benefit, because a reload offline cannot fetch a newer bundle. It just
// re-serves the same cached shell.
//
// The second half is worse: the check sits at module top level, before any
// try. In a browser with site data blocked or the quota full, the setItem
// throws, the whole app-v4.js module body aborts and the app never boots at
// all — and that is precisely the browser least able to recover on its own.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/auth-v2.js', () => ({ setupAuthUI: vi.fn() }));
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: null }, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(async () => ({ exists: () => false })),
    getDocs: vi.fn(async () => ({ forEach: () => { } })), writeBatch: vi.fn(), deleteDoc: vi.fn(),
    increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

let reloadSpy;
const realLocation = window.location;
const realLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

beforeEach(() => {
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
        configurable: true, writable: true,
        value: { ...realLocation, reload: reloadSpy }
    });
    localStorage.clear();
});

afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation });
    Object.defineProperty(window, 'localStorage', realLocalStorage);
    vi.restoreAllMocks();
});

/** Pretend the browser is offline, the way navigator reports it. */
function goOffline() {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
}

/** A browser with site data blocked: every localStorage access throws. */
function blockStorage() {
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new Error('The operation is insecure.'); }
    });
}

describe('F-17 the version check does not reload while offline', () => {
    it('reloads once at boot when the stored version is stale', async () => {
        localStorage.setItem('app_version', 'v0.0.0-old');
        vi.resetModules();

        // The module runs the check itself on import — that IS the boot path.
        await import('../../src/app-v4.js');

        expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('does not reload offline — the SW would only re-serve the same shell', async () => {
        goOffline();
        const { checkAppVersion } = await import('../../src/app-v4.js');
        localStorage.setItem('app_version', 'v0.0.0-old');
        reloadSpy.mockClear();

        expect(checkAppVersion()).toBe(false);
        expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('leaves an announce flag when a recorded build changed, none on a first-ever run (owner 2026-09-19)', async () => {
        const { checkAppVersion } = await import('../../src/app-v4.js');
        localStorage.clear();
        checkAppVersion(); // first-ever run: nothing to announce
        expect(localStorage.getItem('app_version_announce')).toBeNull();
        const current = localStorage.getItem('app_version');

        localStorage.setItem('app_version', 'v0.0.0-old');
        checkAppVersion();
        expect(localStorage.getItem('app_version_announce')).toBe(current);
    });

    it('still records the version offline, so it settles without a reload', async () => {
        goOffline();
        const { checkAppVersion } = await import('../../src/app-v4.js');
        localStorage.setItem('app_version', 'v0.0.0-old');

        checkAppVersion();

        expect(localStorage.getItem('app_version')).not.toBe('v0.0.0-old');
    });

    it('does nothing at all when the version already matches', async () => {
        const { checkAppVersion } = await import('../../src/app-v4.js');
        checkAppVersion();
        reloadSpy.mockClear();

        expect(checkAppVersion()).toBe(false);
        expect(reloadSpy).not.toHaveBeenCalled();
    });
});

describe('F-17 unavailable storage degrades to skipping the check, not to no app', () => {
    it('does not throw when localStorage is blocked', async () => {
        const { checkAppVersion } = await import('../../src/app-v4.js');
        blockStorage();

        expect(() => checkAppVersion()).not.toThrow();
        expect(checkAppVersion()).toBe(false);
    });

    it('the module still loads and exports its bootstrap surface', async () => {
        blockStorage();
        vi.resetModules();

        const mod = await import('../../src/app-v4.js');

        expect(typeof mod.checkAppVersion).toBe('function');
        expect(typeof mod.bindWHSForm).toBe('function');
    });
});
