// my-bag.spec.js — My Bag sits first in Settings and saves on every tick
// (simplify 2026-10-07, E35).
import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

test('My Bag: first in Settings, one tick saves, survives a reload', async ({ page }, testInfo) => {
    const email = throwawayEmail('bag');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Bag E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    await page.locator('#tab-btn-settings').click();
    const card = page.locator('#my-bag-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#tab-settings .card').first()).toHaveId('my-bag-card');
    await expect(page.locator('#btn-save-bag')).toHaveCount(0);

    const sixty = card.locator('.bag-check[data-val="60°"]');
    await expect(sixty).not.toBeChecked();
    await sixty.check();
    await expect(page.locator('#bag-msg')).toBeVisible();
    const box = await card.locator('label.bag-row').first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('my-bag.png') });

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('golfAppClubs')));
    expect(saved.wedges).toContain('60°');

    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-btn-settings').click();
    await expect(page.locator('#my-bag-card .bag-check[data-val="60°"]')).toBeChecked();
});
