// practice-log.spec.js — Practice: a saved drill shows in "Last 5 sessions"
// and can be deleted (simplify 2026-10-07, E36).
import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

test('a saved drill appears in Last 5 sessions and can be deleted', async ({ page }) => {
    const email = throwawayEmail('practice-log');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Practice Log');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-practice"]').click();

    await expect(page.locator('#practice-empty-state')).toBeVisible();
    await expect(page.locator('#practice-table-container')).toBeHidden();

    await page.locator('#drill-select').selectOption('bunker_game');
    const inputs = page.locator('#form-log-practice input[type="number"]');
    // E37 pre-fills every count with 0.
    await expect(inputs.first()).toHaveValue('0');
    page.on('dialog', d => d.accept());
    // E37: an all-zero session is refused (nothing entered = no save) ...
    await page.locator('#btn-save-practice').click();
    await expect(page.getByText('Enter at least one count before saving.')).toBeVisible();
    await expect(page.locator('#practice-history-tbody tr')).toHaveCount(0);
    // A real save hides the form; the refusal leaves it (and the empty line) up.
    await expect(page.locator('#form-log-practice')).toBeVisible();
    await expect(page.locator('#practice-empty-state')).toBeVisible();
    // ... so log one count, as a golfer would.
    await inputs.first().fill('1');
    await page.locator('#btn-save-practice').click();

    const rows = page.locator('#practice-history-tbody tr');
    await expect(rows).toHaveCount(1, { timeout: 10_000 });
    await expect(rows.first()).toContainText('Bunker Game');
    await expect(page.locator('#practice-empty-state')).toBeHidden();
    await expect(page.locator('#practice-table-container')).toBeVisible();

    await rows.first().locator('.del-prac-round').click();
    await expect(rows).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('#practice-empty-state')).toBeVisible();
});
