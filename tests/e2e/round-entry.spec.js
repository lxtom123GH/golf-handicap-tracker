// BL-UX-18: one round-entry affordance, including while a round is active.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Round Entry Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
}

test('BL-UX-18: past-round logging stays reachable from On Course', async ({ page }) => {
    await registerFreshUser(page);
    await expect(page.locator('#tab-oncourse')).toBeVisible();
    await expect(page.locator('#btn-oc-log-past-round')).toBeVisible();
    await expect(page.locator('#btn-open-log-round')).toHaveCount(0);

    await page.locator('#btn-oc-log-past-round').click();
    await expect(page.locator('#add-round-container')).toBeVisible();
    await expect(page.locator('#log-round-title')).toHaveText('⛳ Log a past round');
    await page.locator('#btn-close-log-round').click();
    await expect(page.locator('#add-round-container')).toBeHidden();

    // Setup is hidden as soon as a round starts; the past-round affordance must
    // remain reachable instead of disappearing with that container.
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    // Play mode (default; Ashgrove has a map): it sits at the top while the
    // group sheet is pulled up — reachable, and never on the map itself.
    await expect(page.locator('body')).toHaveClass(/play-mode/);
    await expect(page.locator('#btn-oc-log-past-round')).toBeHidden();
    await page.locator('#btn-oc-score-sheet').click();
    await expect(page.locator('#btn-oc-log-past-round')).toBeVisible();
    await page.locator('#btn-oc-score-sheet').click();

    // Normal round screen (Play mode off): below the one-thumb strip.
    // (the tab bar is hidden mid-round — switch tabs directly)
    await page.evaluate(() => document.getElementById('tab-btn-settings').click());
    await page.locator('#play-mode-toggle').uncheck();
    await page.evaluate(() => document.querySelector('.tab-btn[data-target="tab-oncourse"]').click());
    await expect(page.locator('body')).not.toHaveClass(/play-mode/);
    await expect(page.locator('#btn-oc-log-past-round')).toBeVisible();

    const strip = await page.locator('#oc-bottom-nav').boundingBox();
    const entry = await page.locator('#oc-past-round-entry').boundingBox();
    expect(strip).not.toBeNull();
    expect(entry).not.toBeNull();
    expect(entry.y).toBeGreaterThanOrEqual(strip.y + strip.height);
});

test('BL-UX-18: submitting a past round confirms the save', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('#btn-oc-log-past-round').click();
    await page.locator('#course-select').selectOption({ value: 'Keperra - Old (1-18)|Yellow (Men)' });
    await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
    await page.locator('#score').fill('88');

    await page.locator('#add-round-form button[type="submit"]').click();

    await expect(page.locator('#add-round-container')).toBeHidden();
    await expect(page.locator('#round-save-toast')).toBeVisible();
    await expect(page.locator('#round-save-toast')).toHaveText(/saved to your WHS record/i);
});

test('Log a past round saves a nine, with no pop-up on open or close', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await registerFreshUser(page);
    await page.locator('#btn-oc-log-past-round').click();
    await page.locator('#btn-close-log-round').click();
    await page.locator('#btn-oc-log-past-round').click();
    await page.locator('#course-select').selectOption({ value: 'Keperra – Old Course (9 holes)|Blue (Men)' });
    await expect(page.locator('#course-rating')).toHaveValue('35');
    await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
    await page.locator('#score').fill('44');

    await page.locator('#add-round-form button[type="submit"]').click();

    await expect(page.locator('#add-round-container')).toBeHidden();
    await expect(page.locator('#round-save-toast')).toHaveText(/saved to your WHS record/i);
    expect(dialogs).toEqual([]);
});
