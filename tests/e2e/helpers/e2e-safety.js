// ==========================================================================
// tests/e2e/helpers/e2e-safety.js — demo-project + loopback guards
// ==========================================================================
//
// The browser suite must only ever talk to an OFFLINE demo project on this
// machine. playwright.config.js, scripts/run-e2e-isolated.mjs and the seed
// helpers (emulator.js and the specs' REST calls) all take the project id from
// here, and refuse non-loopback hosts. Pinned by
// tests/unit/e2e-demo-safety.test.js.

import { EMULATOR_PROJECT_ID } from '../../../src/emulator-project.js';

/** @param {string} id */
export function assertDemoProjectId(id) {
    if (typeof id !== 'string' || !/^demo-[a-z0-9-]+$/.test(id)) {
        throw new Error(`e2e safety: project id "${id}" is not a demo- project; refusing to run against it`);
    }
    return id;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Accepts "host", "host:port", "[::1]" or "[::1]:port".
 * @param {string} hostOrHostPort
 */
export function assertLoopbackHost(hostOrHostPort) {
    const raw = String(hostOrHostPort ?? '').trim();
    let host = raw;
    const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(raw);
    if (bracket) host = bracket[1];
    else if (/^[^:]+:\d+$/.test(raw)) host = raw.split(':')[0];
    if (!LOOPBACK.has(host.toLowerCase())) {
        throw new Error(`e2e safety: "${raw}" is not a loopback host; the e2e suite only talks to emulators on this machine`);
    }
    return raw;
}

/** Throw if any emulator-host env var points off this machine. */
export function assertEmulatorEnvIsLoopback(env = process.env) {
    for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FUNCTIONS_EMULATOR_HOST']) {
        if (env[key]) assertLoopbackHost(env[key]);
    }
}

export const E2E_PROJECT_ID = assertDemoProjectId(EMULATOR_PROJECT_ID);

/**
 * Chromium flag: every hostname except loopback resolves to NOTFOUND, so the
 * app under test can't fetch anything off-box (fonts, weather, tiles, Google).
 */
export const DENY_EXTERNAL_HOSTS_ARG =
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1';
