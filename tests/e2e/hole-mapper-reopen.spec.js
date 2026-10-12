// Track A item 8 (simplify review 07 Oct 2026): the hole mapper had no real
// destroy(). Closing it with ✕ threw, so the next open never mounted, and the
// card's buttons kept every earlier mount's listeners.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function openMapper(page) {
    // The picker is in Settings; Open switches to On Course, where the card is.
    await page.locator('.tab-btn[data-target="tab-settings"]').click();
    await page.locator('#mapper-course-select').selectOption('keperra');
    await page.waitForTimeout(600);
    await page.locator('#mapper-hole-select').selectOption('10');
    await page.locator('#btn-mapper-open').click();
    await expect(page.locator('#hole-mapper')).toBeVisible();
    await expect(page.locator('#mapper-hole-label')).toContainText('hole 10');
    await page.locator('#mapper-canvas').scrollIntoViewIfNeeded();
    await page.waitForTimeout(900); // let the photo load and redraw
}

test('mapper: close with ✕, open again, and it works once (no stacked buttons)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-se', 'the mapper is a thumb UI; measured on the iphone-se project');
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const email = throwawayEmail('mapper-reopen');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Mapper Reopen');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);

    await openMapper(page);
    await page.locator('#btn-mapper-exit').click();
    await expect(page.locator('#hole-mapper')).toBeHidden();

    await openMapper(page); // the second open mounts

    // Three taps, then ONE Undo: exactly one vertex comes off. With a stale
    // mount still listening, its Undo/render would also run.
    const c = await page.locator('#mapper-canvas').boundingBox();
    const taps = [[90, 180], [150, 150], [220, 160]];
    for (let i = 0; i < taps.length; i++) {
        await page.mouse.click(c.x + taps[i][0], c.y + taps[i][1]);
        // One tap, one vertex: a second live mount would also add (and its
        // render would overwrite this status with its own count).
        await expect(page.locator('#mapper-status')).toContainText(`open ring ${i + 1} vertex`);
    }
    await expect(page.locator('#mapper-status')).toContainText('open ring 3 vertexes');
    await page.locator('#btn-mapper-undo').click();
    await expect(page.locator('#mapper-status')).toContainText('open ring 2 vertexes');

    expect(errors.filter((m) => /destroy/.test(m))).toEqual([]);
});
