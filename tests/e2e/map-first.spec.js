// ==========================================================================
// map-first.spec.js — owner 2026-10-04 on course: "the map isn't full screen"
// ==========================================================================
// Shot entry 'Map first': every new shot opens on the full-screen map with
// the club row (3 chips + All) and Log docked underneath — drawn, picked and
// logged without leaving the map. Done shows the rest of the wizard.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

test('Map first by default: the shot opens full-screen; draw, club, Log all on the map', async ({ page }, testInfo) => {
    const email = throwawayEmail('mapfirst');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Map First');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);

    // A fresh device gets Map first without saving a device preference.
    expect(await page.evaluate(() => localStorage.getItem('golf.shotEntry'))).toBeNull();
    await expect(page.locator('#shot-entry-select option[value="map"]')).toHaveCount(1);
    await expect(page.locator('#shot-entry-select')).toHaveValue('map');

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    // One-tap logging: a Map first round on a mapped course logs
    // shots on the play map, so the wizard now opens from Track, not by itself.
    await expect(page.locator('body')).toHaveClass(/play-quick/, { timeout: 15_000 });
    await page.locator('#btn-oc-track-shot').click();
    const wizard = page.locator('#oncourse-wizard');
    await expect(wizard).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());

    // Straight into the full-screen map — no ✎ tap.
    await expect(wizard).toHaveClass(/draw-mode/);
    await expect(wizard).toHaveClass(/map-first/);
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-start', /.+/, { timeout: 15_000 });

    const vp = page.viewportSize();
    const geo = await page.evaluate(() => {
        const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b && { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height, w: b.width }; };
        return {
            canvas: r('#shot-line-canvas'), clubs: r('#section-weapon'), log: r('#btn-save-shot-final'),
            all: r('.club-all-btn'), tools: r('.line-tools'), step: r('#wizard-step'),
            chips: [...document.querySelectorAll('.club-row .club-chip')].map(b => b.getBoundingClientRect().height),
            // Every visible docked control stays inside the screen width.
            toolsRight: Math.max(...[...document.querySelectorAll('.line-tools button')]
                .filter(b => b.offsetParent).map(b => b.getBoundingClientRect().right)),
            versionShown: getComputedStyle(document.getElementById('footer-version')).visibility !== 'hidden',
        };
    });
    // Owner 2026-10-05 ("take up the entire screen"): the map IS the screen;
    // the glass bars float over it, and the hole is fitted between them.
    expect(geo.canvas.top, JSON.stringify(geo)).toBeLessThanOrEqual(1);
    expect(geo.canvas.h).toBeGreaterThanOrEqual(vp.height - 3);
    expect(geo.canvas.w).toBeGreaterThanOrEqual(vp.width - 3);
    const padTop = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('section-line')).getPropertyValue('--map-pad-top')));
    const padBottom = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('section-line')).getPropertyValue('--map-pad-bottom')));
    expect(Math.abs(padTop - (geo.step.bottom - geo.canvas.top)), 'fit window starts under the glass header').toBeLessThanOrEqual(2);
    expect(Math.abs((geo.canvas.bottom - padBottom) - geo.tools.top) <= 2 || (geo.canvas.bottom - padBottom) <= geo.tools.top + 2, 'fit window ends above the dock').toBe(true);
    // The bars are see-through glass, not white slabs.
    const bg = await page.evaluate(() => [getComputedStyle(document.getElementById('wizard-step')).backgroundColor, getComputedStyle(document.getElementById('section-weapon')).backgroundColor]);
    for (const c of bg) expect(c).toMatch(/rgba\(8, 12, 18, 0\.6/);
    // Club row and Log are docked on screen, at the bottom, thumb-sized.
    for (const k of ['clubs', 'log', 'all', 'tools']) {
        expect(geo[k].bottom, k).toBeLessThanOrEqual(vp.height);
        expect(geo[k].top, k).toBeGreaterThanOrEqual(vp.height * 0.7);
    }
    expect(geo.log.h).toBeGreaterThanOrEqual(44);
    expect(geo.toolsRight, 'tool row fits the width').toBeLessThanOrEqual(vp.width);
    // Codex P2: a hole with a saved plan adds the plan button — still fits.
    const withPlan = await page.evaluate(() => {
        const b = document.getElementById('btn-line-use-plan');
        b.classList.remove('hidden');
        const r = Math.max(...[...document.querySelectorAll('.line-tools button')]
            .filter(x => x.offsetParent).map(x => x.getBoundingClientRect().right));
        const h = b.getBoundingClientRect().height;
        b.classList.add('hidden');
        return { r, h };
    });
    expect(withPlan.r, 'tool row + Plan fits the width').toBeLessThanOrEqual(vp.width);
    expect(withPlan.h).toBeGreaterThanOrEqual(44);
    expect(geo.versionShown, 'version strip off the dock').toBe(false);
    for (const h of geo.chips) expect(h).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('map-first.png') });

    // All opens the grid upward over the map, fully on screen.
    await page.locator('#bag-buttons-grid .club-all-btn').click();
    const grid = page.locator('#bag-buttons-grid .club-grid-panel');
    await expect(grid).toBeVisible();
    const gb = await grid.boundingBox();
    expect(gb.y).toBeGreaterThanOrEqual(0);
    expect(gb.y + gb.height).toBeLessThanOrEqual(vp.height);
    expect(gb.x + gb.width).toBeLessThanOrEqual(vp.width);
    await page.screenshot({ path: testInfo.outputPath('map-first-all.png') });
    await grid.locator('button[data-val]').first().click();
    await expect(grid).toBeHidden();

    // D31: a club tap mid-swipe keeps the swipe (it used to re-mount the map
    // and drop the stroke). Touch the map, tap a club chip, finish the line.
    const sb = await canvas.boundingBox();
    const tp = (type, f, buttons) => ({
        type, pointerId: 31, pointerType: 'touch', isPrimary: true, button: 0, buttons,
        clientX: sb.x + sb.width * 0.5, clientY: sb.y + sb.height * f, pointerWidth: 8, pointerHeight: 8,
    });
    await canvas.dispatchEvent('pointerdown', tp('pointerdown', 0.85, 1));
    for (let i = 1; i <= 5; i++) await canvas.dispatchEvent('pointermove', tp('pointermove', 0.85 - i * 0.05, 1));
    await page.locator('#bag-buttons-grid .club-row .club-chip').nth(1).dispatchEvent('click');
    await page.waitForTimeout(400); // long enough for a re-mount, were there one
    for (let i = 6; i <= 10; i++) await canvas.dispatchEvent('pointermove', tp('pointermove', 0.85 - i * 0.05, 1));
    await canvas.dispatchEvent('pointerup', tp('pointerup', 0.35, 0));
    await expect(page.locator('#line-readout')).toContainText(/Intended \d+ m/);
    await expect(page.locator('.map-reset-chip')).toHaveCount(1);

    // Draw the actual line on the full-screen map, then Log from the dock.
    // Swipe inside the visible window between the glass bars (the canvas
    // runs under them, but the bars take those touches).
    const box = await canvas.boundingBox();
    const winTop = box.y + padTop, winH = box.height - padTop - padBottom;
    await page.locator('[data-line-mode="actual"]').click();
    await page.mouse.move(box.x + box.width * 0.5, winTop + winH * 0.9);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * 0.5, winTop + winH * (0.9 - i * 0.06));
    await page.mouse.up();
    await expect(page.locator('#line-readout')).toContainText(/Actual \d+ m/);
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /Shot 1 logged/ }).first()).toBeVisible();
    await expect(wizard).toBeHidden();
    // Codex P3: logging from the dock closes map first everywhere.
    await expect(page.locator('body')).not.toHaveClass(/map-first-open/);
    await expect(wizard).not.toHaveClass(/map-first|draw-mode/);

    // The next shot opens full-screen again.
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    await expect(wizard).toHaveClass(/map-first/);
    await expect(page.locator('body')).toHaveClass(/map-first-open/);
    // Codex P3: Cancel while map first is active clears it. The ✕ is hidden
    // under the full-screen map (as in plain draw mode), so fire its handler
    // directly — the cleanup path is what's under test.
    await page.evaluate(() => document.getElementById('btn-wizard-cancel').click());
    await expect(wizard).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/map-first-open/);
    await expect(wizard).not.toHaveClass(/map-first|draw-mode/);
    await page.locator('#btn-oc-track-shot').click();
    await expect(wizard).toHaveClass(/map-first/);

    // Done leaves the map for the full wizard (lie, results) — undocked.
    await page.locator('#btn-line-done').click();
    await expect(wizard).not.toHaveClass(/draw-mode/);
    await expect(wizard).not.toHaveClass(/map-first/);
    await expect(page.locator('#section-lie')).toBeVisible();
    const footerPos = await page.locator('.wizard-footer').evaluate(el => getComputedStyle(el).position);
    expect(footerPos).toBe('sticky');
    // Cancel (header ✕, reachable after Done) leaves nothing map-first behind.
    await page.locator('#btn-wizard-cancel').click();
    await expect(wizard).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/map-first-open/);
});
