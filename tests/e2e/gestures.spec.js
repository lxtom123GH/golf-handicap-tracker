// ==========================================================================
// gestures-e2e.spec.js — S12 Part C: two-pointer gestures + Reset chip
// ==========================================================================
// Two pointer events with distinct ids on the wizard canvas: the view
// zooms (data-mpp drops), the Reset chip appears, and Reset restores
// data-mpp to the pre-gesture value.

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

test('S12 C: pinch gesture zooms the shot view and Reset restores it', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    const section = page.locator('#section-line');
    await expect(section).toBeVisible({ timeout: 10_000 });
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });
    const mpp0 = Number(await canvas.getAttribute('data-mpp'));

    // Two-pointer pinch-out: two pointerids, spreading apart. Chromium
    // dispatches these as real pointer events on the canvas.
    const box = await canvas.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const pinch = async (spread) => {
        const events = [];
        // PointerEventInit takes clientX/clientY (x/y are readonly aliases,
        // not init members — both fingers would land at (0,0) without them).
        const pt = (id, dir, dx, extra = {}) => ({
            type: id === 11 ? 'pointerdown' : 'pointermove', pointerId: id, pointerType: 'touch',
            isPrimary: id === 11, clientX: cx + dir * dx, clientY: cy,
            button: 0, buttons: 1, pointerWidth: 8, pointerHeight: 8, ...extra,
        });
        events.push(pt(11, -1, 20, { type: 'pointerdown' }), pt(12, 1, 20, { type: 'pointerdown' }));
        for (let i = 1; i <= 6; i++) {
            events.push(pt(11, -1, 20 + spread * i / 6), pt(12, 1, 20 + spread * i / 6));
        }
        for (const id of [11, 12]) {
            events.push({ type: 'pointerup', pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: cx, clientY: cy, button: 0, buttons: 0 });
        }
        for (const ev of events) await canvas.dispatchEvent(ev.type, ev);
    };
    await pinch(120);

    // The frame zoomed in (metres per pixel dropped) and the chip appeared.
    await expect.poll(async () => Number(await canvas.getAttribute('data-mpp')), { timeout: 3000 })
        .toBeLessThan(mpp0);
    await expect(page.locator('.map-reset-chip')).toBeVisible();

    // Reset restores the automatic view: mpp back to the pre-gesture value,
    // chip hidden again.
    await page.locator('.map-reset-chip').click();
    await expect.poll(async () => Number(await canvas.getAttribute('data-mpp')), { timeout: 3000 })
        .toBeCloseTo(mpp0, 1);
    await expect(page.locator('.map-reset-chip')).toBeHidden();
});

test('S12 C review B1: pinch-in zooms back out (mpp rises again)', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    const section = page.locator('#section-line');
    await expect(section).toBeVisible({ timeout: 10_000 });
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });

    const pinch = async (spread0, spread1) => {
        const box = await canvas.boundingBox();
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const ev = (type, id, dir, dx, extra = {}) => ({
            type, pointerId: id, pointerType: 'touch', isPrimary: id === 11,
            clientX: cx + dir * dx, clientY: cy, button: 0, buttons: 1,
            pointerWidth: 8, pointerHeight: 8, ...extra,
        });
        await canvas.dispatchEvent('pointerdown', ev('pointerdown', 11, -1, spread0));
        await canvas.dispatchEvent('pointerdown', ev('pointerdown', 12, 1, spread0));
        for (let i = 1; i <= 6; i++) {
            const d = spread0 + ((spread1 - spread0) * i) / 6;
            await canvas.dispatchEvent('pointermove', ev('pointermove', 11, -1, d));
            await canvas.dispatchEvent('pointermove', ev('pointermove', 12, 1, d));
        }
        await canvas.dispatchEvent('pointerup', { type: 'pointerup', pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: 0 });
        await canvas.dispatchEvent('pointerup', { type: 'pointerup', pointerId: 12, pointerType: 'touch', isPrimary: false, clientX: cx, clientY: cy, button: 0, buttons: 0 });
    };

    const mppOf = async () => Number(await canvas.getAttribute('data-mpp'));
    const mpp0 = await mppOf();

    // Zoom IN first (pinch out): mpp drops.
    await pinch(20, 140);
    const mppIn = await mppOf();
    expect(mppIn).toBeLessThan(mpp0);

    // Pinch IN (fingers together past the gesture start): mpp RISES again —
    // the review's blocking defect had this stuck (ratio < 1 clamped to 1).
    await pinch(140, 40);
    const mppBack = await mppOf();
    expect(mppBack).toBeGreaterThan(mppIn);
});
