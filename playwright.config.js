// ==========================================================================
// playwright.config.js — Tier-2 browser journeys (replaces the AUDIT-02-era
// "chaos suite" config; its hollow specs live in _ARCHIVE/legacy-e2e/)
// ==========================================================================
//
// `npm run test:e2e`. Boots the Firebase auth+firestore emulators and a
// production `vite preview` build itself. reuseExistingServer is false: a
// server already on those ports makes the run fail fast instead of being
// trusted (stop it, or pick other ports with scripts/run-e2e-isolated.mjs).
//
// The app's environment sniffer (firebase-config.js) routes localhost to the
// emulators, so specs register brand-new throwaway users through the real UI.
// Nothing here can touch production.
//
// Registrations used to be auto-approved on localhost (auth-v2.js) and the
// specs relied on it; F-19 (2026-09-10) removed that, because a security rule
// cannot tell localhost from production and so could not verify an approval
// the client was free to grant. Specs now seed the invite list through the
// emulator's REST API instead (tests/e2e/helpers/emulator.js) — a fixture, on
// the production code path, rather than an exemption only tests take.
//
// The `phone` project runs a Pixel 7 profile with geolocation GRANTED and
// mocked to the Keperra 1st tee — GPS features are testable without a golf
// course.

import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_PROJECT_ID, DENY_EXTERNAL_HOSTS_ARG, DENY_EXTERNAL_PROXY, assertEmulatorEnvIsLoopback, assertEmulatorConfigIsLoopback } from './tests/e2e/helpers/e2e-safety.js';

// Demo-only harness (fleet/e2e-demo-only): the emulators run the OFFLINE
// demo- project the app uses on localhost (src/emulator-project.js), every
// host is loopback, an already-listening server is never silently reused
// (it could be anything, e.g. a dev emulator on the real project id), and
// Chromium resolves no external hostname. Pinned by
// tests/unit/e2e-demo-safety.test.js.
assertEmulatorEnvIsLoopback();
// Resolve against this file's folder: Playwright runs webServer commands
// from here, so the file checked is the file the emulators start with.
const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const EMU_CONFIG_PATH = process.env.EMU_CONFIG ? resolve(ROOT_DIR, process.env.EMU_CONFIG) : null;
assertEmulatorConfigIsLoopback(EMU_CONFIG_PATH || resolve(ROOT_DIR, 'firebase.json'));
const DENY_EXTERNAL = { launchOptions: { args: [DENY_EXTERNAL_HOSTS_ARG] } };

// Keperra GC, Brisbane — near the clubhouse/1st tee.
const KEPERRA_FIRST_TEE = { latitude: -27.4136, longitude: 152.9465 };

export default defineConfig({
    testDir: 'tests/e2e',
    globalSetup: './tests/e2e/helpers/install-webkit.js',
    timeout: 60_000,
    expect: { timeout: 10_000 },
    workers: 1, // serialize journeys that share the emulator state
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: [['list']],
    use: {
        // S3c: matches the preview webServer's port (VITE_PREVIEW_PORT on the
        // runner, 4300 unchanged for local dev).
        baseURL: `http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}`,
        actionTimeout: 15_000,
        navigationTimeout: 15_000,
        trace: 'retain-on-failure',
        // All browser types, WebKit included: off-box requests hit a dead proxy.
        proxy: DENY_EXTERNAL_PROXY,
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'phone',
            use: {
                ...devices['Pixel 7'],
                permissions: ['geolocation'],
                geolocation: KEPERRA_FIRST_TEE,
                ...DENY_EXTERNAL,
            },
        },
        {
            // Field test 2026-09-13: the owner's real phone is an iPhone SE
            // (375x667), ~40px narrower and ~230px shorter than the Pixel 7
            // profile the app was built against. Chromium, not WebKit — this
            // pins the layout floor, not iOS rendering, which only the phone
            // itself can show.
            name: 'iphone-se',
            use: {
                ...devices['Pixel 7'],
                viewport: { width: 375, height: 667 },
                permissions: ['geolocation'],
                geolocation: KEPERRA_FIRST_TEE,
                ...DENY_EXTERNAL,
            },
        },
        {
            // The test:e2e runner starts this GPS project in its own
            // Playwright process after Chromium projects have stopped.
            name: 'iphone-webkit',
            testMatch: '**/keperra-west-round.spec.js',
            use: {
                ...devices['iPhone SE (3rd gen)'],
                browserName: 'webkit',
                permissions: ['geolocation'],
                geolocation: KEPERRA_FIRST_TEE,
            },
        },
        {
            name: 'desktop',
            use: { ...devices['Desktop Chrome'], ...DENY_EXTERNAL },
        },
    ],
    webServer: [
        {
            // S3c: EMU_CONFIG lets the runner point at firebase.ci.json (high
            // ports) so CI never collides with a dev's emulator; the ports are
            // echoed to the app build via VITE_EMU_* and to tests via EMU_*.
            command: `npx firebase emulators:start --only auth,firestore --project ${E2E_PROJECT_ID} --log-verbosity SILENT` + (EMU_CONFIG_PATH ? ` --config "${EMU_CONFIG_PATH}"` : ''),
            url: `http://127.0.0.1:${process.env.EMU_AUTH_PORT || 9099}`,
            reuseExistingServer: false,
            timeout: 120_000,
        },
        {
            command: `npm run build && npx vite preview --port ${process.env.VITE_PREVIEW_PORT || 4300} --strictPort`,
            url: `http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}`,
            reuseExistingServer: false,
            timeout: 180_000,
        },
    ],
});
