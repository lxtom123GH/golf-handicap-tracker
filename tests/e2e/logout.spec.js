// Quick win 1 (simplify review 07 Oct 2026): Logout loads a fresh page.
// Before: sign out and back in without closing the app, and the app set itself
// up a second time, so "Log a past round" had two submit listeners and one
// past round saved as TWO whs_rounds rows (counted twice in the index).

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, findDocs, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page, prefix) {
    const email = throwawayEmail(prefix);
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Logout Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
    return email;
}

async function signInAndLogPastRound(page, email) {
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.locator('#btn-login').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    await page.locator('#btn-oc-log-past-round').click();
    await page.locator('#course-select').selectOption({ value: 'Keperra - Old (1-18)|Yellow (Men)' });
    await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
    await page.locator('#score').fill('88');
    await page.locator('#add-round-form button[type="submit"]').click();
    await expect(page.locator('#round-save-toast')).toHaveText(/saved to your WHS record/i);
}

async function expectExactlyOneRound(page, email) {
    const [user] = await findDocs('users', 'email', email);
    expect(user).toBeTruthy();
    let rounds = [];
    await expect.poll(async () => {
        rounds = await findDocs('whs_rounds', 'uid', user._id);
        return rounds.length;
    }, { timeout: 15_000 }).toBeGreaterThan(0);
    // Give a duplicate write time to land before the exact count.
    await page.waitForTimeout(1500);
    rounds = await findDocs('whs_rounds', 'uid', user._id);
    expect(rounds).toHaveLength(1);
}

test('Logout reloads, so a past round logged after signing back in saves once', async ({ page }) => {
    const email = await registerFreshUser(page, 'logout');

    // Logout must load a fresh page (a navigation), not just swap overlays.
    await Promise.all([
        page.waitForEvent('load', { timeout: 20_000 }),
        page.locator('#btn-logout').click(),
    ]);
    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 20_000 });

    await signInAndLogPastRound(page, email);
    await expectExactlyOneRound(page, email);
});

test('Signing out in another tab reloads this one too, so a past round still saves once', async ({ page, context }) => {
    const email = await registerFreshUser(page, 'logout-tab');

    // A second tab of the same browser shares the sign-in.
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    // Sign out THERE; this tab must reload rather than sit on a set-up page.
    await Promise.all([
        page.waitForEvent('load', { timeout: 20_000 }),
        other.locator('#btn-logout').click(),
    ]);
    await other.close();
    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 20_000 });

    await signInAndLogPastRound(page, email);
    await expectExactlyOneRound(page, email);
});
