// ==========================================================================
// update-watch.spec.js — a new deploy is visible (owner, 2026-09-19)
// ==========================================================================
// The built bundle carries __BUILD_COMMIT__; /version.json is what the live
// site would serve after the NEXT deploy. Intercepting it lets the test play
// "a newer build shipped while the app was open".

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail('update');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Update E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
}

/** The commit the served bundle was built from: the footer's last token. */
async function servedCommit(page) {
    const footer = await page.locator('#footer-version').textContent();
    const parts = footer.trim().split('·').map(s => s.trim());
    return parts[parts.length - 1];
}

test('a newer /version.json shows the banner on foreground; Later hides it and stays quiet for that commit', async ({ page }) => {
    await registerFreshUser(page);
    const commit = await servedCommit(page);
    expect(commit).toMatch(/^[0-9a-f]{7,}$/);

    await page.route('**/version.json', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 'v9.9.9', commit: 'deadbee', stamp: 'later' }),
    }));

    const banner = page.locator('#update-banner');
    await expect(banner).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#update-banner-text')).toContainText('v9.9.9 · deadbee');
    // Both controls meet the thumb floor.
    for (const id of ['#btn-update-reload', '#btn-update-later']) {
        const box = await page.locator(id).boundingBox();
        expect(Math.max(box.width, box.height), id).toBeGreaterThanOrEqual(44);
    }

    await page.locator('#btn-update-later').click();
    await expect(banner).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(800);
    await expect(banner).toBeHidden();
});

test('the same commit in /version.json shows nothing', async ({ page }) => {
    await registerFreshUser(page);
    const commit = await servedCommit(page);
    await page.route('**/version.json', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 'v7.0.0', commit, stamp: 'now' }),
    }));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(800);
    await expect(page.locator('#update-banner')).toBeHidden();
});

test('Reload on the banner reloads the page', async ({ page }) => {
    await registerFreshUser(page);
    await page.route('**/version.json', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 'v9.9.9', commit: 'deadbee', stamp: 'later' }),
    }));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('#update-banner')).toBeVisible({ timeout: 5000 });
    await Promise.all([
        page.waitForEvent('load'),
        page.locator('#btn-update-reload').click(),
    ]);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
});

test('the first run after a build change says "Updated to …" once', async ({ page }) => {
    await registerFreshUser(page);
    // Pretend the last recorded build was an older one; the boot check then
    // records the change, reloads once, and bootstrap announces it.
    await page.evaluate(() => localStorage.setItem('app_version', 'v0.0.0+old'));
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    const toast = page.locator('#update-toast');
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toContainText(/Updated to v\d+\.\d+\.\d+ · [0-9a-f]{7,}/);
    // Next boot: quiet.
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await expect(toast).toBeHidden();
});

test('Settings → Check for updates: says "latest" on the same commit, shows the banner on a newer one (owner 2026-09-20)', async ({ page }) => {
    await registerFreshUser(page);
    const commit = await servedCommit(page);
    await page.locator('#tab-btn-settings').click();
    const btn = page.locator('#btn-check-updates');
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#settings-build')).toContainText(commit);
    const box = await btn.boundingBox();
    expect(Math.max(box.width, box.height)).toBeGreaterThanOrEqual(44);

    // Same commit: "latest", no banner.
    await page.route('**/version.json', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 'v7.0.0', commit, stamp: 'now' }),
    }));
    await btn.click();
    await expect(page.locator('#check-updates-status')).toContainText('latest version', { timeout: 5000 });
    await expect(page.locator('#update-banner')).toBeHidden();

    // Newer commit: the banner, and the status points at it.
    await page.unroute('**/version.json');
    await page.route('**/version.json', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 'v9.9.9', commit: 'deadbee', stamp: 'later' }),
    }));
    await btn.click();
    await expect(page.locator('#update-banner')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#check-updates-status')).toContainText('newer version');
});
