// practice-drill-form.spec.js — drill counts start at 0 and saving shows a
// toast, not a pop-up (simplify 2026-10-07, E37).
import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

test('drill counts start at 0; Save shows a toast and no dialog', async ({ page }) => {
    const email = throwawayEmail('practice-form');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Practice Form');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-practice"]').click();

    await page.locator('#drill-select').selectOption('bunker_game');
    const inputs = page.locator('#form-log-practice .drill-outcome-field');
    const n = await inputs.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(inputs.nth(i)).toHaveValue('0');

    // Touch one count only.
    await inputs.first().fill('3');
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.locator('#btn-save-practice').click();
    // Require server acknowledgement, not merely the pending-request toast.
    await expect(page.getByRole('status').filter({ hasText: 'Practice session synced' })).toBeVisible({ timeout: 10_000 });
    expect(dialogs).toEqual([]);
});
