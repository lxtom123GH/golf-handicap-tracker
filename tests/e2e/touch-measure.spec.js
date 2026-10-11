// ==========================================================================
// touch-measure.spec.js — long-press the hole map to measure a distance
// ==========================================================================
// Owner 2026-10-04: "being able to put my finger on the map to find out the
// distance". A press held still for ~350 ms drops a target; the canvas
// carries data-measure="<fromBall>,<toPin>" while it is pinned; a tap clears
// it without drawing a line.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

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

test('long-press on the hole map drops a measure target; a tap clears it', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#section-line')).toBeVisible({ timeout: 10_000 });
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-start', /.+/, { timeout: 15_000 });
    await canvas.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const box = await canvas.boundingBox();
    await expect(canvas).not.toHaveAttribute('data-measure', /.+/);

    // Long-press: down, hold still, then drag the target a little, then lift.
    // Middle-left of the map: clear of the inset (top-right) and the anchor.
    const x = box.x + box.width * 0.4, y = box.y + box.height * 0.4;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await expect(canvas).toHaveAttribute('data-measure', /^\d+,\d+$/);
    const live = await canvas.getAttribute('data-measure');
    await page.mouse.move(x, y - box.height * 0.15, { steps: 6 });
    // Dragging up the map (towards the green) moves the target live.
    await expect.poll(async () => await canvas.getAttribute('data-measure'), { timeout: 3000 })
        .not.toBe(live);
    await page.mouse.up();

    // Pinned after lift; both distances are positive and sane for a hole.
    const pinned = await canvas.getAttribute('data-measure');
    expect(pinned).toMatch(/^\d+,\d+$/);
    const [fromBall, toPin] = pinned.split(',').map(Number);
    expect(fromBall).toBeGreaterThan(0);
    expect(fromBall).toBeLessThan(700);
    expect(toPin).toBeLessThan(700);

    // A tap anywhere on the map clears it (and draws no line).
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
    await expect(canvas).not.toHaveAttribute('data-measure', /.+/);
});

// Codex review P2: exercise touch pointers (pointerType 'touch'), not just the
// mouse — the same dispatch pattern as gestures.spec.js.
test('touch long-press measures; a touch swipe still draws a line', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-start', /.+/, { timeout: 15_000 });
    await canvas.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const box = await canvas.boundingBox();
    const t = (type, x, y) => canvas.dispatchEvent(type, {
        pointerId: 21, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y,
        button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerWidth: 8, pointerHeight: 8,
    });
    const x = box.x + box.width * 0.4, y = box.y + box.height * 0.4;
    await t('pointerdown', x, y);
    await page.waitForTimeout(600);
    await t('pointerup', x, y);
    await expect(canvas).toHaveAttribute('data-measure', /^\d+,\d+$/);
    // Tap clears.
    await t('pointerdown', x, y + 40);
    await t('pointerup', x, y + 40);
    await expect(canvas).not.toHaveAttribute('data-measure', /.+/);
    // A quick touch swipe draws an intended line (readout gains a carry) and never measures.
    const before = await canvas.evaluate(el => el.toDataURL().length);
    await t('pointerdown', box.x + box.width * 0.5, box.y + box.height * 0.8);
    for (let i = 1; i <= 10; i++) await t('pointermove', box.x + box.width * 0.5, box.y + box.height * (0.8 - i * 0.05));
    await t('pointerup', box.x + box.width * 0.5, box.y + box.height * 0.3);
    await expect(canvas).not.toHaveAttribute('data-measure', /.+/);
    await expect.poll(async () => await canvas.evaluate(el => el.toDataURL().length)).not.toBe(before);
});
