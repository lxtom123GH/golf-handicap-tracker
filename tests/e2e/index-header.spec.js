// The Handicap Index in the header is text, not an editable box; a new golfer
// declares an existing GA index through "Set starting index".

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

async function registerFreshUser(page) {
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Index Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);
}

test('the index is text; Set starting index declares one', async ({ page }, testInfo) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-whs"]').click();

    const index = page.locator('#handicap-index');
    await expect(index).toHaveText('—');
    expect(await index.evaluate(el => el.tagName)).toBe('SPAN');
    await expect(page.locator('.index-display input')).toHaveCount(0);
    await expect(page.locator('#btn-export-whs')).toHaveCount(0);

    const setBtn = page.locator('#btn-set-start-index');
    await expect(setBtn).toBeVisible({ timeout: 15_000 });
    const box = await setBtn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    // White on the header's green, not the grey secondary-button look.
    expect(await setBtn.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    await setBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: testInfo.outputPath('index-header.png') });

    page.once('dialog', d => d.accept('18.4'));
    await setBtn.click();
    await expect(index).toHaveText('18.4');

    // It's saved: after a reload the header still shows it (the next rounds
    // snapshot used to put "—" back), and the button stays until the app
    // calculates an index of its own.
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(index).toHaveText('18.4', { timeout: 15_000 });
    await expect(page.locator('#index-subtext')).toContainText('starting index');
    await expect(setBtn).toBeVisible();
    // The declared state keeps the button, so its subtext must stay one line:
    // the banner may take at most a third of an SE screen (as layout-se).
    if (testInfo.project.name === 'iphone-se') {
        const vh = page.viewportSize().height;
        const h = await page.locator('#tab-whs header.header').evaluate(el => Math.round(el.getBoundingClientRect().height));
        console.log(`[index-header] declared-index banner ${h}px of ${vh}px`);
        expect(h, `declared-index banner is ${h}px on a ${vh}px screen`).toBeLessThanOrEqual(Math.round(vh / 3));
    }
});
