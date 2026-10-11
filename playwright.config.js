// ==========================================================================
// playwright.config.js — Tier-2 browser journeys (replaces the AUDIT-02-era
// "chaos suite" config; its hollow specs live in _ARCHIVE/legacy-e2e/)
// ==========================================================================
//
// `npm run test:e2e`. Boots the Firebase auth+firestore emulators and a
// production `vite preview` build itself. It does not adopt existing listeners.
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
import { fileURLToPath } from 'node:url';
import { assertDemoHarnessEnvironment } from './src/ux-harness-safety.js';

const projectId = assertDemoHarnessEnvironment(process.env);
process.env.UX_HARNESS_PROJECT_ID = projectId;
process.env.GCLOUD_PROJECT = projectId;
process.env.GOOGLE_CLOUD_PROJECT = projectId;
process.env.VITE_FIREBASE_PROJECT_ID = projectId;
process.env.VITE_UX_HARNESS = 'true';
const firebaseCli = fileURLToPath(new URL('./node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url));

// Keperra GC, Brisbane — near the clubhouse/1st tee.
const KEPERRA_FIRST_TEE = { latitude: -27.4136, longitude: 152.9465 };

export default defineConfig({
    testDir: 'tests/e2e',
    globalSetup: './tests/e2e/helpers/install-webkit.js',
    timeout: 90_000,
    workers: 1, // auth + Firestore emulators are shared across all projects
    fullyParallel: false, // shared emulator state — keep journeys sequential
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 1,
    reporter: [['list']],
    use: {
        // S3c: matches the preview webServer's port (VITE_PREVIEW_PORT on the
        // runner, 4300 unchanged for local dev).
        baseURL: `http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'phone',
            use: {
                ...devices['Pixel 7'],
                permissions: ['geolocation'],
                geolocation: KEPERRA_FIRST_TEE,
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
            },
        },
        {
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
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: [
        {
            // S3c: EMU_CONFIG lets the runner point at firebase.ci.json (high
            // ports) so CI never collides with a dev's emulator; the ports are
            // echoed to the app build via VITE_EMU_* and to tests via EMU_*.
            command: `"${process.execPath}" "${firebaseCli}" emulators:start --only auth,firestore --project ${projectId}` + (process.env.EMU_CONFIG ? ` --config ${process.env.EMU_CONFIG}` : ''),
            url: `http://127.0.0.1:${process.env.EMU_AUTH_PORT || 9099}`,
            reuseExistingServer: false,
            timeout: 300_000,
        },
        {
            command: `npm run build && npx vite preview --port ${process.env.VITE_PREVIEW_PORT || 4300} --strictPort`,
            url: `http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}`,
            reuseExistingServer: false,
            timeout: 180_000,
        },
    ],
});
