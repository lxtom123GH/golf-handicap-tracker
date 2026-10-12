// @vitest-environment node
// The local/CI browser harness must only ever talk to an offline demo
// project on loopback. Firebase treats `demo-*` project ids as offline-only:
// the emulators refuse to reach real services for them, so a misrouted call
// can't land in the production project. These tests pin that contract for
// the launcher (playwright.config.js webServer), the browser
// (src/firebase-config.js on localhost) and the Node seed helpers.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const REAL_PROJECT = 'golf-handicap-tracker-b677c';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
});

describe('e2e safety helpers', () => {
    it('agrees on ONE demo-prefixed project id for the browser and the helpers', async () => {
        const { EMULATOR_PROJECT_ID } = await import('../../src/emulator-project.js');
        const safety = await import('../e2e/helpers/e2e-safety.js');
        expect(EMULATOR_PROJECT_ID).toMatch(/^demo-[a-z0-9-]+$/);
        expect(safety.E2E_PROJECT_ID).toBe(EMULATOR_PROJECT_ID);
    });

    it('refuses a non-demo project id', async () => {
        const { assertDemoProjectId } = await import('../e2e/helpers/e2e-safety.js');
        expect(() => assertDemoProjectId(REAL_PROJECT)).toThrow(/demo-/);
        expect(() => assertDemoProjectId('')).toThrow();
        expect(() => assertDemoProjectId('demo-golf-tracker')).not.toThrow();
    });

    it('refuses a non-loopback host', async () => {
        const { assertLoopbackHost } = await import('../e2e/helpers/e2e-safety.js');
        for (const bad of ['firestore.googleapis.com', `${REAL_PROJECT}.web.app`, '10.0.0.5', '0.0.0.0', 'localhost.evil.com']) {
            expect(() => assertLoopbackHost(bad), bad).toThrow(/loopback/);
        }
        for (const ok of ['127.0.0.1', 'localhost', '[::1]', '::1', '127.0.0.1:18080']) {
            expect(() => assertLoopbackHost(ok), ok).not.toThrow();
        }
    });
});

describe('playwright.config.js', () => {
    const load = async () => (await import('../../playwright.config.js')).default;

    it('starts the emulators for the demo project only, with no Functions', async () => {
        const cfg = await load();
        const emu = cfg.webServer.find((s) => s.command.includes('emulators:start'));
        const { EMULATOR_PROJECT_ID } = await import('../../src/emulator-project.js');
        expect(emu.command).toMatch(/--project demo-[a-z0-9-]+(\s|$)/);
        // the SAME demo id the browser and the seed helpers use, not just any demo-
        expect(emu.command).toContain(`--project ${EMULATOR_PROJECT_ID}`);
        expect(emu.command).toContain('--only auth,firestore');
        expect(emu.command).not.toMatch(/functions/);
    });

    it('never reuses an unexpected server already listening on the ports', async () => {
        const cfg = await load();
        for (const s of cfg.webServer) expect(s.reuseExistingServer, s.command).toBe(false);
    });

    it('points the browser and server probes at loopback only', async () => {
        const cfg = await load();
        expect(new URL(cfg.use.baseURL).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
        for (const s of cfg.webServer) expect(new URL(s.url).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    });

    it('refuses to load when an emulator host env var points off-box', async () => {
        vi.stubEnv('FIRESTORE_EMULATOR_HOST', 'firestore.example.com:8080');
        await expect(load()).rejects.toThrow(/loopback/);
    });

    it('sends every browser type\'s off-box traffic to a dead loopback proxy', async () => {
        const cfg = await load();
        for (const p of cfg.projects) {
            const proxy = p.use.proxy || cfg.use.proxy;
            expect(proxy, p.name).toBeTruthy();
            expect(new URL(proxy.server).hostname, p.name).toBe('127.0.0.1');
            expect(proxy.bypass.split(',').map(s => s.trim()).sort(), p.name).toEqual(['127.0.0.1', '[::1]', 'localhost']);
        }
    });

    it('denies external hosts in the Chromium projects', async () => {
        const cfg = await load();
        for (const p of cfg.projects.filter((x) => (x.use.browserName || 'chromium') === 'chromium')) {
            const args = p.use.launchOptions?.args || [];
            expect(args.some((a) => a.startsWith('--host-resolver-rules=MAP * ~NOTFOUND')), p.name).toBe(true);
        }
    });
});

describe('browser config on localhost', () => {
    it.each([['localhost', 'demo'], ['127.0.0.1', 'demo'], [`${REAL_PROJECT}.web.app`, 'real']])(
        '%s initialises the %s project', async (hostname, which) => {
            const initializeApp = vi.fn(() => ({}));
            vi.doMock('firebase/app', () => ({ initializeApp }));
            vi.doMock('firebase/app-check', () => ({ initializeAppCheck: vi.fn(), ReCaptchaEnterpriseProvider: vi.fn() }));
            vi.doMock('firebase/auth', () => ({ initializeAuth: vi.fn(), getAuth: vi.fn(), browserLocalPersistence: {}, connectAuthEmulator: vi.fn() }));
            vi.doMock('firebase/firestore', () => ({ initializeFirestore: vi.fn(), persistentLocalCache: vi.fn(), persistentMultipleTabManager: vi.fn(), connectFirestoreEmulator: vi.fn() }));
            vi.doMock('firebase/storage', () => ({ getStorage: vi.fn(), connectStorageEmulator: vi.fn() }));
            vi.doMock('firebase/functions', () => ({ getFunctions: vi.fn(), connectFunctionsEmulator: vi.fn() }));
            vi.stubGlobal('window', { location: { hostname } });
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            vi.spyOn(console, 'log').mockImplementation(() => {});
            await import('../../src/firebase-config.js');
            const { projectId } = initializeApp.mock.calls[0][0];
            if (which === 'demo') expect(projectId).toMatch(/^demo-/);
            else expect(projectId).toBe(REAL_PROJECT);
        });
});

describe('e2e specs and helpers', () => {
    it('never name the real project id', () => {
        const dirs = [join(ROOT, 'tests', 'e2e'), join(ROOT, 'tests', 'e2e', 'helpers')];
        const offenders = [];
        for (const d of dirs) {
            for (const f of readdirSync(d).filter((n) => /\.(m?js)$/.test(n))) {
                if (readFileSync(join(d, f), 'utf8').includes(REAL_PROJECT)) offenders.push(f);
            }
        }
        expect(offenders).toEqual([]);
    });
});
