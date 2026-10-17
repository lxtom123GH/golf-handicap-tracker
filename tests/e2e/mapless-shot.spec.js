import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAndVerifySignup } from './helpers/emulator.js';

test('map-first falls back intentionally when the hole has no map', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: -27.4136, longitude: 152.9465, accuracy: 30 });
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'map'));
    const email = `test-mapless-${testInfo.project.name}-${Date.now()}@example.invalid`;
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Test Mapless');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('synthetic-pass-1');
    await registerAndVerifySignup(page, email);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    const wizard = page.locator('#oncourse-wizard');
    await expect(wizard).toBeVisible();
    // Reopen on a paused clock so the live accuracy can be measured before capture ends.
    await page.locator('#btn-wizard-cancel').click();
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.locator('#btn-oc-track-shot').click();
    await expect(wizard).not.toHaveClass(/draw-mode/);
    await expect(page.locator('#section-line')).toBeHidden();
    await expect(page.locator('#gps-lock-ring')).toBeVisible();
    await page.context().setGeolocation({ latitude: -27.41359, longitude: 152.9465, accuracy: 6 });
    let boxes;
    await expect.poll(async () => {
        await page.clock.runFor(150);
        boxes = await page.evaluate(() => {
            const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect();
                return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
            return { title: rect('#wizard-title'), ring: rect('#gps-lock-ring'),
                svg: rect('#gps-lock-ring svg'), accuracy: rect('.gps-lock-acc'),
                accuracyText: document.querySelector('.gps-lock-acc').textContent,
                text: document.getElementById('wizard-step').textContent };
        });
        return boxes.accuracyText;
    }, { timeout: 5_000 }).toBe('±6');
    const out = testInfo.outputPath('mapless'); mkdirSync(out, { recursive: true });
    await page.screenshot({ path: join(out, 'mapless-capture.png'), fullPage: true });
    writeFileSync(join(out, 'measurements.json'), JSON.stringify(boxes, null, 2));
    expect(boxes.accuracyText, 'measure the populated live GPS label').toBe('±6');
    const a = boxes.title, b = boxes.ring;
    expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
        'the GPS capture ring must not cover the Shot title').toBe(false);
    expect(b.left, 'the GPS row stays aligned with the title').toBe(a.left);
    expect(b.right, 'the GPS row fits the screen').toBeLessThanOrEqual(page.viewportSize().width);
    const label = boxes.accuracy, svg = boxes.svg;
    expect(label.left).toBeGreaterThanOrEqual(svg.left);
    expect(label.right).toBeLessThanOrEqual(svg.right);
    expect(label.top).toBeGreaterThanOrEqual(svg.top);
    expect(label.bottom).toBeLessThanOrEqual(svg.bottom);
    expect(label.top, 'GPS accuracy must clear the Shot title').toBeGreaterThanOrEqual(a.bottom);
    await expect(page.locator('#wizard-step')).toHaveText('No map for this hole yet - pick the club and result');
    await expect(page.locator('#wizard-step')).not.toContainText(/draw/i);
    await page.locator('#bag-buttons-grid button[data-val]').first().click();
    await page.locator('#btn-save-shot-final').click();
    await page.clock.resume();
    await expect(wizard).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: /Shot 1 logged/ }).first()).toBeVisible();
});
