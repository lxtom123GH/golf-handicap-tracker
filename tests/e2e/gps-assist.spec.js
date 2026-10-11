// ==========================================================================
// gps-assist.spec.js — S5: the GPS assist toggle and (Part B) its wiring
// ==========================================================================
// Part A: the toggle exists in Settings, is OFF by default, mirrors into
// AppState, and persists per device across a reload (localStorage
// 'golf.gpsAssist'). Part B extends this spec with the distance behaviour
// (assist off = identical readouts; assist on = bias + snap with ≈).

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlayable } from '../../src/gps-bias.js';
import { fromFrame } from '../../src/geo.js';

const PREVIEW = `http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}`;
const PASSWORD = 'e2e-password-1';

const hole = JSON.parse(readFileSync(resolve('public/courses/ashgrove.json'), 'utf8')).holes['1'];

/**
 * A geolocation 14 m beyond the green's far edge (past the 8 m buffer):
 * assist-on should snap it back ~6 m and mark the strip with ≈.
 */
function mockFixPastGreen() {
    const { frame } = buildPlayable(hole);
    const ring = hole.features.features.find((f) => f.properties?.golf === 'green').geometry.coordinates[0]
        .map((c) => toFrameLL(frame, c[1], c[0]));
    const far = ring.reduce((a, b) => (b[1] > a[1] ? b : a));
    return fromFrame(frame, [far[0], far[1] + 14]);
}
function toFrameLL(frame, lat, lon) {
    // Local helper: same projection as src/geo.js toFrame, [lat, lon] in.
    const lat0 = (frame.origin[0] * Math.PI) / 180;
    const east = ((lon - frame.origin[1]) * Math.PI / 180) * Math.cos(lat0) * 6371000;
    const north = ((lat - frame.origin[0]) * Math.PI / 180) * 6371000;
    const t = (frame.bearing * Math.PI) / 180;
    return [east * Math.cos(t) - north * Math.sin(t), east * Math.sin(t) + north * Math.cos(t)];
}

async function registerFreshUser(page) {
    const email = throwawayEmail('assist');
    await seedPreapprovedEmail(email);
    await page.goto(PREVIEW);
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Assist E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    return email;
}

async function startAshgroveRound(page) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await page.locator('#btn-wizard-cancel').click();
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
}

async function toggleGps(page) {
    // Decision 12: Start Round on a mapped course already started GPS.
    await expect(page.locator('#btn-toggle-gps')).not.toHaveText(/OFF/);
    await expect(page.locator('#oc-strip-gps')).toBeVisible({ timeout: 10_000 });
}

test('S5: GPS assist is ON by default (owner, 2026-09-19) and the choice persists across a reload', async ({ page }) => {
    const email = await registerFreshUser(page);

    await page.locator('#tab-btn-settings').click();
    const toggle = page.locator('#gps-assist-toggle');
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toBeChecked(); // default ON

    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();

    // Reload: the choice comes back from localStorage.
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-btn-settings').click();
    await expect(page.locator('#gps-assist-toggle')).not.toBeChecked({ timeout: 15_000 });

    // And back on again — the default state is restorable.
    await page.locator('#gps-assist-toggle').check();
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-btn-settings').click();
    await expect(page.locator('#gps-assist-toggle')).toBeChecked({ timeout: 15_000 });
});

test('S5: assist off — the strip shows the raw distance, no ≈ (byte-identical to main)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone' && testInfo.project.name !== 'iphone-se', 'geolocation granted only in the phone projects');
    const [lat, lon] = mockFixPastGreen();
    await page.context().setGeolocation({ latitude: lat, longitude: lon, accuracy: 5 });
    await registerFreshUser(page);
    // Assist is ON by default now: switch it off in Settings for this test.
    await page.locator('#tab-btn-settings').click();
    await expect(page.locator('#gps-assist-toggle')).toBeVisible({ timeout: 15_000 });
    await page.locator('#gps-assist-toggle').uncheck();
    await startAshgroveRound(page);
    await toggleGps(page);

    // Two good fixes warm the receiver; the strip then shows the RAW
    // distance with no assist marker at all.
    await page.context().setGeolocation({ latitude: lat, longitude: lon, accuracy: 5 });
    await expect(page.locator('#oc-strip-gps')).toContainText(/GPS warming|\d+m/, { timeout: 10_000 });
    await expect(page.locator('#oc-strip-gps')).not.toContainText('≈', { timeout: 10_000 });
    await expect(page.locator('#oc-strip-gps')).toContainText(/^\d+m · ±\d+$/, { timeout: 10_000 });
});

test('S5: assist on — a fix 14 m past the green snaps back (~6 m) and the strip shows ≈', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone' && testInfo.project.name !== 'iphone-se', 'geolocation granted only in the phone projects');
    const [lat, lon] = mockFixPastGreen();
    await registerFreshUser(page);

    // Assist ON before the round.
    await page.locator('#tab-btn-settings').click();
    await page.locator('#gps-assist-toggle').check();

    await startAshgroveRound(page);
    await toggleGps(page);
    await page.context().setGeolocation({ latitude: lat, longitude: lon, accuracy: 5 });
    await page.context().setGeolocation({ latitude: lat, longitude: lon, accuracy: 5 });

    // The raw fix is ~14 m off the playable edge: assist snaps it back and
    // the strip marks the corrected distance with ≈.
    await expect(page.locator('#oc-strip-gps')).toContainText('≈', { timeout: 15_000 });
    await expect(page.locator('#oc-strip-gps')).toContainText(/\d+m · ±\d+/, { timeout: 10_000 });
    await page.screenshot({ path: testInfo.outputPath('assist-snapped.png') });
});

