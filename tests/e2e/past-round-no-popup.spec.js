// Quick win 4 (simplify review 07 Oct 2026), Track A item 5: opening or
// closing "Log a past round" switched the Viewing selector, which auto-clicked
// the Daily Handicap calculator; its fields start empty, so every open and
// close popped "Please fill in valid numbers for all fields".

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

test('opening and closing Log a past round shows no pop-up', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });

    const email = throwawayEmail('nopopup');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Popup Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);

    await page.locator('#btn-oc-log-past-round').click();
    await expect(page.locator('#add-round-container')).toBeVisible();
    await page.locator('#btn-close-log-round').click();
    await expect(page.locator('#add-round-container')).toBeHidden();

    // Twice, and the backdrop close too.
    await page.locator('#btn-oc-log-past-round').click();
    await expect(page.locator('#add-round-container')).toBeVisible();
    await page.locator('#add-round-container').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#add-round-container')).toBeHidden();

    await page.waitForTimeout(300); // let any queued alert surface
    expect(dialogs).toEqual([]);
});
