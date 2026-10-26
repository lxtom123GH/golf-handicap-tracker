import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { registerAndVerifySignup, readDoc, throwawayEmail } from './helpers/emulator.js';

test.use({ serviceWorkers: 'block' });

test('a malformed mapped hole still logs a GPS shot and advances to shot 2', async ({ page }, testInfo) => {
    test.skip(!['phone', 'iphone-se'].includes(testInfo.project.name), 'phone GPS journey');
    const errors = [];
    const course = JSON.parse(readFileSync(new URL('../../public/courses/ashgrove.json', import.meta.url)));
    const { lat, lon } = course.holes[1].tee;
    delete course.holes[1].tee;
    await page.route('**/courses/ashgrove.json', route => route.fulfill({ json: course }));
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'both'));
    await page.context().setGeolocation({ latitude: lat, longitude: lon, accuracy: 30 });
    const email = throwawayEmail('malformed-hole');
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Synthetic GPS Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('synthetic-pass-1');
    await registerAndVerifySignup(page, email);
    // Observe round errors after boot; blocking SWs triggers an unrelated registration error.
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible();
    await expect(page.locator('#gps-lock-ring')).toBeVisible();
    await page.context().setGeolocation({ latitude: lat + 0.00001, longitude: lon, accuracy: 3 });
    await expect(page.locator('#gps-lock-ring')).toBeHidden();
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /Shot 1 logged/ }).first()).toBeVisible();
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
    await expect(page.locator('#line-readout')).toContainText('Start from GPS (±3 m)');

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state')));
    const [shot] = stored.currentHoleShots;
    expect(stored.liveRoundGroups[0].scores[1]).toBe(1);
    expect(shot).toMatchObject({ hole: 1, shotNumber: 1,
        startPos: { lat: lat + 0.00001, lon, accuracyM: 3 }, gpsCapture: { role: 'start', state: 'accepted' } });
    expect(shot.startXY).toBeUndefined();
    await expect.poll(() => readDoc(`shots/${shot.id}`)).toMatchObject({
        hole: 1, shotNumber: 1, startPos: shot.startPos, gpsCapture: shot.gpsCapture,
    });
    await testInfo.attach('persisted-shot', { body: JSON.stringify({
        startPos: shot.startPos, gpsCapture: shot.gpsCapture, score: stored.liveRoundGroups[0].scores[1],
    }), contentType: 'application/json' });
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    await expect(page.locator('#wizard-step')).toHaveText('No map for this hole yet - pick the club and result');
    await page.screenshot({ path: testInfo.outputPath('shot-2-fallback.png') });
    await page.locator('#btn-wizard-cancel').click();
    await page.locator('#btn-oc-next-hole').click();
    await expect(page.locator('#wizard-title')).toHaveText('🎯 Hole 2 — Shot 1');
    await expect(page.locator('#shot-line-canvas')).toHaveAttribute('data-view-mode', 'shot');
    expect(errors).toEqual([]);
});
