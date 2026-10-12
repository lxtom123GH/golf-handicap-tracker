// ==========================================================================
// draw-mode.spec.js — S12 Part B: full-height draw mode + auto-extend
// ==========================================================================
// The spec's E2E: in draw mode on Ashgrove, a swipe that runs to the top
// edge ends with data-view-mode="shot" and data-mpp larger than at the
// start (the frame grew), and the stored intended carry is over 250 m.
// Done returns to the wizard with the curve drawn.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

// This spec covers map-and-grids controls; map-first behavior is covered separately.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('golf.shotEntry')) localStorage.setItem('golf.shotEntry', 'both'); });
});

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('E2E Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
}

async function startDetailedRound(page) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    // The emulator's warning banner is fixed at the viewport bottom and
    // intercepts clicks on the draw-mode bottom row. It is emulator-only
    // chrome — never in production — so drop it for this spec.
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());
}

async function swipe(page, canvas, from, to) {
    await canvas.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const box = await canvas.boundingBox();
    const [sx, sy] = [box.x + box.width * from[0], box.y + box.height * from[1]];
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) {
        await page.mouse.move(
            box.x + box.width * (from[0] + (to[0] - from[0]) * i / 14),
            box.y + box.height * (from[1] + (to[1] - from[1]) * i / 14),
        );
    }
    await page.mouse.up();
}

test('S12 B: draw mode re-mounts full height, auto-extends past the frame, Done returns the curve', async ({ page }, testInfo) => {
    await registerFreshUser(page);
    await startDetailedRound(page);

    const section = page.locator('#section-line');
    await expect(section).toBeVisible({ timeout: 10_000 });
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });
    await expect(canvas).toHaveAttribute('data-start', /.+/, { timeout: 15_000 });
    const hWizard = (await canvas.boundingBox()).height;

    // Enter draw mode: the card carries the class, Done appears, Draw hides.
    await page.locator('#btn-line-draw').click();
    await expect(page.locator('#oncourse-wizard')).toHaveClass(/draw-mode/);
    await expect(page.locator('#btn-line-done')).toBeVisible();
    await expect(page.locator('#btn-line-draw')).toBeHidden();
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });
    // Draw mode re-mounts the overlay asynchronously; wait until the canvas
    // is the tall full-screen mount before measuring or drawing.
    await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0, { timeout: 5000 })
        .toBeGreaterThan((hWizard) + 100);
    await expect(canvas).toHaveAttribute('data-start', /.+/, { timeout: 15_000 });
    const hDraw = (await canvas.boundingBox()).height;
    expect(hDraw).toBeGreaterThan(hWizard + 100); // the map got genuinely bigger

    // The top bar (step line + Done) and the bottom row stay in the first screen.
    const vp = page.viewportSize();
    const stepBox = await page.locator('#wizard-step').boundingBox();
    const doneBox = await page.locator('#btn-line-done').boundingBox();
    const toolsBox = await page.locator('.line-tools').boundingBox();
    expect(stepBox.y).toBeGreaterThanOrEqual(0);
    expect(stepBox.y + stepBox.height).toBeLessThanOrEqual(vp.height);
    expect(doneBox.y + doneBox.height).toBeLessThanOrEqual(vp.height);
    expect(toolsBox.y + toolsBox.height).toBeLessThanOrEqual(vp.height);

    // A swipe that runs to the top edge: the frame grows (mpp up) and the
    // carry blows past the wizard view's ~250 m frame.
    const mpp0 = Number(await canvas.getAttribute('data-mpp'));
    await swipe(page, canvas, [0.5, 0.85], [0.5, 0.01]);
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot');
    await expect.poll(async () => Number(await canvas.getAttribute('data-mpp')), { timeout: 5_000 })
        .toBeGreaterThan(mpp0);
    await expect(page.locator('#line-readout')).toContainText(/Intended (2[6-9]\d|[3-9]\d\d) m/);

    // Done: back to the wizard, the curve drawn (the readout still reports it).
    // But first — Undo (a draw-mode control) reverts the curve to nothing.
    await page.locator('#btn-line-undo').click();
    await expect(page.locator('#line-readout')).not.toContainText(/Intended \d+ m/);

    // Draw again (a plain in-frame swipe this time), then leave draw mode.
    await swipe(page, canvas, [0.5, 0.85], [0.5, 0.3]);
    await expect(page.locator('#line-readout')).toContainText(/Intended \d+ m/);
    await page.locator('#btn-line-done').click();
    await expect(page.locator('#oncourse-wizard')).not.toHaveClass(/draw-mode/);
    await expect(page.locator('#line-readout')).toContainText(/Intended \d+ m/);
    await expect(page.locator('#wizard-step')).toContainText('Shot 1 · hit it');
    await page.screenshot({ path: testInfo.outputPath('after-done.png') });
});
