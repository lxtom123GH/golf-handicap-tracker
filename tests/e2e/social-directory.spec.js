import { test, expect } from '@playwright/test';
import {
    seedPreapprovedEmail, throwawayEmail, verifyEmulatorEmail,
    findDocs, patchDocFields
} from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

test('an approved player can search the profile directory and request to follow a player', async ({ page }) => {
    const email = throwawayEmail('social-directory');
    await seedPreapprovedEmail(email);

    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Directory Searcher');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyEmulatorEmail(email);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    const [searcher] = await findDocs('users', 'email', email);
    expect(searcher?._id).toBeTruthy();
    const targetUid = `directory_target_${Date.now()}`;
    await patchDocFields(`profiles/${targetUid}`, {
        displayName: 'Directory Search Target',
        isApproved: true,
        isCoach: false,
        handicapIndex: 18.4
    });

    const feedTab = page.locator('#tab-btn-feed');
    await expect(feedTab).toBeVisible();
    await feedTab.click();
    await page.locator('#feed-search-input').fill('Directory Search Target');
    await page.locator('#btn-feed-search').click();

    const result = page.locator('#feed-search-results').getByText('Directory Search Target');
    await expect(result).toBeVisible({ timeout: 10_000 });
    const followButton = page.locator(`#feed-search-results button[data-uid="${targetUid}"]`);
    await expect(followButton).toHaveText('Follow');
    await followButton.click();
    await expect(followButton).toHaveText('Requested');
});
