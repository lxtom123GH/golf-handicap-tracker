import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAndVerifySignup } from './helpers/emulator.js';

test('map-first falls back intentionally when the hole has no map', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
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
    await expect(wizard).not.toHaveClass(/draw-mode/);
    await expect(page.locator('#section-line')).toBeHidden();
    await expect(page.locator('#gps-lock-ring')).toBeVisible();
    const boxes = await page.evaluate(() => {
        const rect = id => { const r = document.getElementById(id).getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
        return { title: rect('wizard-title'), ring: rect('gps-lock-ring'),
            text: document.getElementById('wizard-step').textContent };
    });
    const out = testInfo.outputPath('mapless'); mkdirSync(out, { recursive: true });
    await page.screenshot({ path: join(out, 'mapless-capture.png'), fullPage: true });
    writeFileSync(join(out, 'measurements.json'), JSON.stringify(boxes, null, 2));
    const a = boxes.title, b = boxes.ring;
    expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
        'the GPS capture ring must not cover the Shot title').toBe(false);
    await expect(page.locator('#wizard-step')).toHaveText('No map for this hole yet - pick the club and result');
    await expect(page.locator('#wizard-step')).not.toContainText(/draw/i);
    await page.locator('#bag-buttons-grid button[data-val]').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(wizard).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: /Shot 1 logged/ }).first()).toBeVisible();
});
