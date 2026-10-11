// ==========================================
// intent.spec.js — S2: per-club intent vs execution panel
// (brief: docs/agent-briefs/overlay-followons/S2-intent-vs-execution.md)
// ==========================================
// iphone-se. Logs two shots with both curves on Ashgrove (a course with an
// overlay), then checks the Insights card: the club select renders, the
// canvas draws, and with fewer than five shots the verdict is the Log-5
// prompt (never a fabricated pattern).

import { test, expect } from '@playwright/test';
import { FIRESTORE_PORT, throwawayEmail, seedPreapprovedEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('E2E Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
}

async function startDetailedRound(page) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    // Decision 12 starts GPS with the round; this spec is about the drawn
    // lines, so location is refused (GPS stays off quietly) and the mock's
    // missing re-fires can't turn the readout into "GPS refused: no fix".
    await page.context().clearPermissions();
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
}

/** Drag a curve across the canvas from (x0,y0) to (x1,y1) in canvas fractions. */
async function swipe(page, canvas, from, to, bend = 0) {
    const box = await canvas.boundingBox();
    const pt = (t) => {
        const x = box.x + box.width * (from[0] + (to[0] - from[0]) * t + bend * Math.sin(Math.PI * t));
        const y = box.y + box.height * (from[1] + (to[1] - from[1]) * t);
        return [x, y];
    };
    const [sx, sy] = pt(0);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { const [x, y] = pt(i / 12); await page.mouse.move(x, y); }
    await page.mouse.up();
}

async function logShotWithBothLines(page) {
    await expect(page.locator('#section-line')).toBeVisible({ timeout: 10_000 });
    const canvas = page.locator('#shot-line-canvas');
    // The section appears before its async plan lookup and pointer-handler mount.
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });
    await swipe(page, canvas, [0.5, 0.92], [0.5, 0.35], -0.08);
    await expect(page.locator('#line-readout')).toContainText(/Intended \d+ m/);
    await page.locator('[data-line-mode="actual"]').click();
    await swipe(page, canvas, [0.5, 0.92], [0.68, 0.48], 0.06);
    await expect(page.locator('#line-readout')).toContainText(/· (Draw|Fade|Hook|Slice|Straight) · \d+ m (long|short)/);
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i }).first()).toBeVisible();
}

test('intent vs execution: two-shot club shows the canvas and the Log-5 prompt', async ({ page }) => {
    let delayedPlanReads = 0;
    // Keep the real plan read, but make a cold mount slow enough to exercise readiness.
    await page.route(`http://127.0.0.1:${FIRESTORE_PORT}/**`, async route => {
        if (route.request().postData()?.includes('holePlans')) {
            delayedPlanReads++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await route.continue();
    });
    await registerFreshUser(page);
    await startDetailedRound(page);

    // Shot 1: the wizard opens at round start. Shot 2: from the More sheet.
    await logShotWithBothLines(page);
    await page.locator('#btn-oc-more').click();
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    await logShotWithBothLines(page);

    // Insights: the panel mounts when the tendencies render. The tab bar is
    // hidden while a round is in progress, so switch the tab directly — the
    // production render path (analyse button → renderIntentPanel) is what we
    // are exercising here, not the navigation.
    await page.evaluate(() => document.querySelector('.tab-btn[data-target="tab-insights"]').click());
    await page.locator('#btn-load-club-insights').click();
    const card = page.locator('#intent-card');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText(/Log 5 .+ shots with both lines to see your pattern\./);
    const canvas = card.locator('canvas');
    await expect(canvas).toBeAttached();
    const width = await canvas.evaluate((c) => c.clientWidth || c.width);
    expect(width).toBeGreaterThan(200);
    // The club select offers the logged club; the count table names both rows.
    await expect(card.locator('select')).toBeAttached();
    await expect(card).toContainText('Planned —');
    await expect(card).toContainText('Executed —');
    expect(delayedPlanReads).toBeGreaterThan(0);
});
