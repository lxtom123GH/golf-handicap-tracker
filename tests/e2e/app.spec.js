import { test, expect } from '@playwright/test';

test('App load and basics', async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/');

    // Expect title
    await expect(page).toHaveTitle(/Golf Handicap Tracker/);

    // If unauthenticated, there should be an auth container (login)
    const authContainer = page.locator('#auth-overlay');
    await authContainer.waitFor({ state: 'visible', timeout: 5000 });
    if (await authContainer.isVisible()) {
        const emailInput = page.locator('#auth-email');
        const passInput = page.locator('#auth-password');
        const loginBtn = page.locator('#btn-login');

        await expect(emailInput).toBeVisible();
        await expect(passInput).toBeVisible();
        await expect(loginBtn).toBeVisible();
    }
});
