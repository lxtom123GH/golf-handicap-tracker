import { afterEach, expect, it, vi } from 'vitest';

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/app-check', () => ({ initializeAppCheck: vi.fn(), ReCaptchaEnterpriseProvider: vi.fn() }));
vi.mock('firebase/auth', () => ({ initializeAuth: vi.fn(), getAuth: vi.fn(), browserLocalPersistence: {}, connectAuthEmulator: vi.fn() }));
vi.mock('firebase/firestore', () => ({ initializeFirestore: vi.fn(), persistentLocalCache: vi.fn(() => 'persistent-cache'), persistentMultipleTabManager: vi.fn(), connectFirestoreEmulator: vi.fn() }));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(), connectStorageEmulator: vi.fn() }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), connectFunctionsEmulator: vi.fn() }));
import { initializeFirestore } from 'firebase/firestore';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([['localhost', true], ['127.0.0.1', true], ['golf-handicap-tracker-b677c.web.app', false]])(
    'uses nonstreaming emulator transport only on local hosts: %s', async (hostname, local) => {
        vi.resetModules();
        initializeFirestore.mockClear();
        vi.stubGlobal('window', { location: { hostname } });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        await import('../../src/firebase-config.js');
        expect(initializeFirestore).toHaveBeenCalledWith(expect.anything(), {
            localCache: 'persistent-cache', experimentalForceLongPolling: local,
        });
    });
