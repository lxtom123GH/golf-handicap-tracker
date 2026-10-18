import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { makeFrame, fromFrame } from '../../src/geo.js';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const hole = JSON.parse(fs.readFileSync(new URL('../../public/courses/ashgrove.json', import.meta.url))).holes[1];
const frame = makeFrame([hole.tee.lat, hole.tee.lon], [hole.green.centre.lat, hole.green.centre.lon]);

test('first shot at a forward tee remains a GPS start and saves that position', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'requires mocked geolocation');
    const [latitude, longitude] = fromFrame(frame, [0, 30]);
    await page.context().setGeolocation({ latitude, longitude, accuracy: 30 });
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Forward Tee Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#shot-line-canvas')).toHaveAttribute('data-view-mode', 'shot');
    await page.locator('#btn-wizard-cancel').click();
    // Control fresh fixes on a new capture, after the hole frame is ready.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#shot-line-canvas')).toHaveAttribute('data-view-mode', 'shot');
    await page.context().setGeolocation({ latitude: latitude + 0.000001, longitude, accuracy: 6 });
    await expect.poll(async () => {
        await page.clock.runFor(150);
        return page.locator('.gps-lock-acc').textContent();
    }).toBe('\u00b16');
    await page.context().setGeolocation({ latitude: latitude + 0.000002, longitude, accuracy: 3 });
    await expect(page.locator('#line-readout')).toContainText('Start from GPS', { timeout: 12_000 });
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i }).first()).toBeVisible();
    const shot = await page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state')).currentHoleShots[0]);
    expect(shot.startXY.y).toBeCloseTo(30, 0);
    expect(shot.startPos.lat).toBeCloseTo(latitude, 5);
    expect(shot.finishXY).toBeUndefined();
    console.log('Saved forward-tee shot:', JSON.stringify({ startXY: shot.startXY, startPos: shot.startPos, finishXY: shot.finishXY, gpsCapture: shot.gpsCapture }));
});
