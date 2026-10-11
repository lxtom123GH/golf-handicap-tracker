// ============================================================================
// cold-start.spec.js — the first-run analytics preview on the iPhone SE floor
// ============================================================================

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail('cold-start');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Cold Start E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
}

test('first-run analytics show feature-specific unlock progress', async ({ page }) => {
    await registerFreshUser(page);

    await expect(page.locator('#history-tbody tr')).toHaveCount(0);
    await expect(page.locator('#chart-no-data')).toContainText('0 of 3 counting rounds', { timeout: 20_000 });
    await expect(page.locator('#chart-no-data')).toContainText('What this unlocks');

    await expect(page.locator('#index-explainer')).toContainText('0 of 54 counting holes'); // WHS: 54 holes, not 3 rounds
    await expect(page.locator('#index-explainer')).toContainText('What this unlocks');

    await page.locator('.tab-btn[data-target="tab-insights"]').click();
    await expect(page.locator('#performance-insights')).toBeVisible();
    await expect(page.locator('#performance-insights')).toContainText('0 of 3 rounds with putts logged');
    await expect(page.locator('#performance-insights')).toContainText('What this unlocks');
});
