// ==========================================================================
// map-follow.spec.js — owner 2026-10-05: "I'd like the map view to be a bit
// like a GPS map which defaults to orient in the direction of travel"
// ==========================================================================
// Map first: the full-screen map turns so YOU → the green points up, and it
// follows the live GPS as you walk (target-up, like a golf GPS app). The
// shot's recorded start never moves with it.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
const ashgrove = JSON.parse(readFileSync(new URL('../../public/courses/ashgrove.json', import.meta.url)));
const hole1 = ashgrove.holes[0] || ashgrove.holes['1'];

/** A point `t` of the way tee -> green centre, pushed `sideM` metres east. */
function along(t, sideM = 0) {
    const a = hole1.tee, b = hole1.green.centre;
    const lat = a.lat + (b.lat - a.lat) * t;
    const lon = a.lon + (b.lon - a.lon) * t + sideM / (111320 * Math.cos((lat * Math.PI) / 180));
    return { latitude: lat, longitude: lon };
}

test('Map first follows GPS: target-up from where you stand, re-turns as you walk', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'geolocation is granted only in the phone project');
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'map'));
    await page.context().setGeolocation({ ...along(0.5, 35), accuracy: 5 });

    const email = throwawayEmail('mapfollow');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Map Follow');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    // One-tap logging: a Map first round on a mapped course logs
    // shots on the play map, so the wizard now opens from Track, not by itself.
    await expect(page.locator('body')).toHaveClass(/play-quick/, { timeout: 15_000 });
    await page.locator('#btn-oc-track-shot').click();
    const wizard = page.locator('#oncourse-wizard');
    await expect(wizard).toBeVisible({ timeout: 15_000 });
    // Map first opens on the map, where the header ✕ is hidden: close it
    // through its handler (the round hub is what we want next).
    await page.evaluate(() => document.getElementById('btn-wizard-cancel').click());
    await expect(wizard).toBeHidden();

    // Decision 12: Start Round on a mapped course already started GPS (a tap
    // on 📡 here would turn it OFF). Two fixes to warm the receiver.
    await expect(page.locator('#btn-toggle-gps')).not.toHaveText(/OFF/);
    await expect(page.locator('#oc-strip-gps')).toBeVisible({ timeout: 10_000 });
    await page.context().setGeolocation({ ...along(0.5, 35), accuracy: 5 });
    await page.context().setGeolocation({ ...along(0.5, 35), accuracy: 5 });
    await expect(page.locator('#oc-strip-gps')).toContainText(/\d+m/, { timeout: 15_000 });

    // Open the shot: full-screen map, a live "you" position, turned so you ->
    // green is up. Standing 35 m right of the line, the turn is not zero.
    await page.locator('#btn-oc-track-shot').click();
    await expect(wizard).toHaveClass(/map-first/);
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-live-anchor', /^-?\d+,-?\d+$/, { timeout: 15_000 });
    // Let the shot's own GPS capture settle first (it owns data-start).
    await expect(page.locator('#gps-lock-ring')).toBeHidden({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const rot1 = Number(await canvas.getAttribute('data-auto-rot'));
    expect(Math.abs(rot1), 'target-up turns the map').toBeGreaterThan(0.05);
    const start1 = await canvas.getAttribute('data-start');
    const live1 = await canvas.getAttribute('data-live-anchor');
    await page.screenshot({ path: testInfo.outputPath('follow-1.png') });

    // Walk 60 m up and back toward the line: the map follows and re-turns.
    await page.context().setGeolocation({ ...along(0.7, 5), accuracy: 5 });
    await expect(canvas).not.toHaveAttribute('data-live-anchor', live1, { timeout: 10_000 });
    const rot2 = Number(await canvas.getAttribute('data-auto-rot'));
    expect(Math.abs(rot2 - rot1), 'the turn follows you').toBeGreaterThan(0.02);
    // The recorded shot start did not move with the walk.
    await expect(canvas).toHaveAttribute('data-start', start1);
    await page.screenshot({ path: testInfo.outputPath('follow-2.png') });

    // Near the green the heading holds (Codex P2): the dot moves, the turn
    // does not.
    const rotBefore = await canvas.getAttribute('data-auto-rot');
    const live2 = await canvas.getAttribute('data-live-anchor');
    const liveBefore = live2;
    await page.context().setGeolocation({ ...along(0.97, 8), accuracy: 5 });
    await expect(canvas).not.toHaveAttribute('data-live-anchor', liveBefore, { timeout: 10_000 });
    await expect(canvas).toHaveAttribute('data-auto-rot', rotBefore);
    await page.context().setGeolocation({ ...along(0.7, 5), accuracy: 5 });
    await expect(canvas).toHaveAttribute('data-live-anchor', live2, { timeout: 10_000 });

    // A poor fix (60 m accuracy) is ignored.
    await page.context().setGeolocation({ ...along(0.3, 0), accuracy: 60 });
    await page.waitForTimeout(1500);
    await expect(canvas).toHaveAttribute('data-live-anchor', live2);
});
