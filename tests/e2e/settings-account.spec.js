// settings-account.spec.js — Settings > Account shows who you are and its
// password reset button works (simplify 2026-10-07, E34).
import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

test('Settings › Account shows name + email (no uid) and sends a reset', async ({ page }) => {
    const email = throwawayEmail('acct');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Account E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    await page.locator('#tab-btn-settings').click();
    const info = page.locator('#settings-account-info');
    await expect(info).toContainText('Account E2E', { timeout: 10_000 });
    await expect(info).toContainText(email);
    await expect(info).not.toContainText('User ID');

    await page.locator('#btn-change-password').click();
    await expect(page.locator('#settings-pw-msg')).toContainText(`If an account exists for ${email}`, { timeout: 10_000 });

    // Sign out, then a different golfer signs in on the same phone: the card
    // shows the new golfer, not the last one (review P3, PR #241).
    // Logout reloads the page since #238, so wait for that load; the form
    // then starts in Sign In mode and Register switches it to Create Account.
    await Promise.all([
        page.waitForEvent('load', { timeout: 20_000 }),
        page.locator('#btn-logout').click(),
    ]);
    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 20_000 });
    const second = throwawayEmail('acct2');
    await seedPreapprovedEmail(second);
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Second Golfer');
    await page.locator('#auth-email').fill(second);
    await page.locator('#auth-password').fill('e2e-password-2');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-btn-settings').click();
    await expect(info).toContainText(second, { timeout: 10_000 });
    await expect(info).not.toContainText(email);
    // The first golfer's reset message is gone too.
    await expect(page.locator('#settings-pw-msg')).toBeHidden();
});
