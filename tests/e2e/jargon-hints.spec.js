// BL-UX-20: first-encounter jargon help on the two phone profiles.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
const PHONE_PROJECTS = new Set(['phone', 'iphone-se']);

async function registerFreshUser(page) {
    const email = throwawayEmail('jargon');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Jargon E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
}

async function openHint(page, term, expectedText, method = 'keyboard') {
    const hint = page.locator(`[data-term-hint="${term}"]`);
    const summary = hint.locator('summary');
    await expect(summary).toHaveAttribute('aria-label', `Explain ${term}`);
    const box = await summary.boundingBox();
    expect(box?.width, `${term} hint width`).toBeGreaterThanOrEqual(44);
    expect(box?.height, `${term} hint height`).toBeGreaterThanOrEqual(44);
    if (method === 'mouse') {
        await summary.click();
    } else {
        await summary.focus();
        await page.keyboard.press('Enter');
    }
    await expect(hint).toHaveAttribute('open', '');
    const body = hint.locator('.term-hint-body');
    await expect(body).toBeVisible();
    await expect(body).toContainText(expectedText);
    const bodyBox = await body.boundingBox();
    const viewport = page.viewportSize();
    const viewportWidth = viewport.width;
    expect(bodyBox?.x, `${term} hint stays inside the viewport`).toBeGreaterThanOrEqual(0);
    expect(bodyBox?.x + bodyBox?.width, `${term} hint stays inside the viewport`).toBeLessThanOrEqual(viewportWidth);
    expect(bodyBox?.y, `${term} hint stays below the viewport top`).toBeGreaterThanOrEqual(0);
    expect(bodyBox?.y + bodyBox?.height, `${term} hint stays above the viewport bottom`).toBeLessThanOrEqual(viewport.height);
    await expect(body).toHaveCSS('overflow-y', /auto|scroll/);
}

test('first-encounter ? hints explain golf jargon with keyboard-sized controls', async ({ page }, testInfo) => {
    test.skip(!PHONE_PROJECTS.has(testInfo.project.name), 'jargon hint phone journey runs on phone profiles only');

    await registerFreshUser(page);

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await expect(page.locator('#oncourse-setup')).toBeVisible();
    await openHint(page, 'GIR', 'green in regulation', 'mouse');
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(page.locator('[data-term-hint="GIR"]')).not.toHaveAttribute('open', '');
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await expect(page.locator('[data-term-hint="GIR"] summary')).toBeVisible();
    await page.locator('#btn-mode-simple').click();

    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old Course (9 holes)' });
    await expect(page.locator('#oc-course-stats')).toBeVisible();
    await openHint(page, 'Par', 'very good golfer', 'mouse');
    await openHint(page, 'CR', 'Course Rating', 'mouse');
    await expect(page.locator('[data-term-hint="Par"]')).not.toHaveAttribute('open', '');
    await openHint(page, 'SR', 'Slope Rating', 'mouse');
    await expect(page.locator('[data-term-hint="CR"]')).not.toHaveAttribute('open', '');

    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(page.locator('#btn-open-log-round')).toHaveCount(0);
    await expect(page.locator('#btn-oc-log-past-round')).toBeHidden();
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await expect(page.locator('#btn-oc-log-past-round')).toBeVisible();
    await page.locator('#btn-oc-log-past-round').click();
    await expect(page.locator('#add-round-container')).toBeVisible();
    await openHint(page, 'Stableford', 'Stableford points', 'mouse');
    await page.locator('#btn-close-log-round').click();

    await page.locator('.tab-btn[data-target="tab-insights"]').click();
    await expect(page.locator('#strategy-section')).toBeVisible();
    await openHint(page, 'DECADE', 'aggressive off the tee', 'mouse');
    await page.locator('[data-term-hint="DECADE"] summary').click();
    await openHint(page, 'Vision54', 'Vision54 Think/Play Box', 'mouse');
});
