// ==========================================================================
// map-first-dock.spec.js — D32 (simplify 2026-10-07, bigger move 1)
// ==========================================================================
// The Map-first dock: ✕, Penalty and "Details" on the map; Save plan on the
// dock; shot 2's lie and a holed putt recorded WITHOUT tapping Details.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

/** Is the element on screen AND the top thing at its centre (not covered)? */
async function onTop(page, sel) {
    return page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el || !el.offsetParent && getComputedStyle(el).position !== 'fixed') return { ok: false, why: 'hidden' };
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return { ok: false, why: 'no box' };
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return {
            ok: !!hit && (hit === el || el.contains(hit)),
            top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height, w: b.width,
            hit: hit ? (hit.id || hit.className || hit.tagName) : null,
        };
    }, sel);
}

const roundState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state') || 'null'));

async function swipe(page, canvas, from, to) {
    const box = await canvas.boundingBox();
    const tp = (type, f, buttons) => ({
        type, pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, buttons,
        clientX: box.x + box.width * 0.5, clientY: box.y + box.height * f, pointerWidth: 8, pointerHeight: 8,
    });
    await canvas.dispatchEvent('pointerdown', tp('pointerdown', from, 1));
    for (let i = 1; i <= 10; i++) await canvas.dispatchEvent('pointermove', tp('pointermove', from + (to - from) * i / 10, 1));
    await canvas.dispatchEvent('pointerup', tp('pointerup', to, 0));
}

test('D32 Map-first dock: ✕, Penalty, Details and Save plan on the map; lie and a holed putt record without Details', async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'map'));
    const email = throwawayEmail('mfdock');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Map Dock');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    const wizard = page.locator('#oncourse-wizard');
    await expect(wizard).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());
    await expect(wizard).toHaveClass(/map-first/);
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-start', /.+/, { timeout: 15_000 });
    await page.waitForTimeout(4600); // the round-start wake toast floats over the map
    const vp = page.viewportSize();

    // The top bar: ✕ left, Details right; Penalty on the map. All tappable.
    await expect(page.locator('#btn-line-done')).toHaveText('Details');
    for (const sel of ['#btn-wizard-cancel', '#btn-line-done', '#btn-wizard-penalty']) {
        const r = await onTop(page, sel);
        expect(r.ok, `${sel} ${JSON.stringify(r)}`).toBe(true);
        expect(r.h, sel).toBeGreaterThanOrEqual(44);
        expect(r.right, sel).toBeLessThanOrEqual(vp.width);
    }

    // Shot 1: an intended line puts Save plan on the dock (Hit gives way).
    await swipe(page, canvas, 0.85, 0.35);
    await expect(page.locator('#line-readout')).toContainText(/Intended \d+ m/);
    await expect(page.locator('#btn-save-plan')).toBeVisible();
    const plan = await onTop(page, '#btn-save-plan');
    expect(plan.ok, JSON.stringify(plan)).toBe(true);
    expect(plan.h).toBeGreaterThanOrEqual(44);
    expect(plan.bottom).toBeLessThanOrEqual(vp.height);
    const toolsRight = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.line-tools button')]
        .filter(b => b.offsetParent).map(b => b.getBoundingClientRect().right)));
    expect(toolsRight, 'tool row clears Save plan').toBeLessThanOrEqual(plan.left + 1);
    // Review P2: a hole with a saved plan also shows "Plan" - the row still
    // clears Save plan and stays on screen.
    const withPlan = await page.evaluate(() => {
        const b = document.getElementById('btn-line-use-plan');
        b.classList.remove('hidden');
        const shown = [...document.querySelectorAll('.line-tools button')].filter(x => x.offsetParent);
        const r = { left: Math.min(...shown.map(x => x.getBoundingClientRect().left)), right: Math.max(...shown.map(x => x.getBoundingClientRect().right)) };
        b.classList.add('hidden');
        return r;
    });
    expect(withPlan.left, 'row + Plan stays on screen').toBeGreaterThanOrEqual(0);
    expect(withPlan.right, 'row + Plan clears Save plan').toBeLessThanOrEqual(plan.left + 1);
    await page.screenshot({ path: testInfo.outputPath('dock-shot1-plan.png') });

    // Log shot 1 from the dock (pick a club first).
    await page.locator('#bag-buttons-grid .club-row .club-chip').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(wizard).toBeHidden();

    // Shot 2: the lie chips sit on the dock; Rough → Log records FW = missed.
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    await expect(wizard).toHaveClass(/map-first/);
    const rough = page.locator('#section-lie [data-val="Rough"]');
    const r = await onTop(page, '#section-lie [data-val="Rough"]');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.h).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('dock-shot2-lie.png') });
    await rough.click();
    await page.locator('#btn-save-shot-final').click();
    await expect(wizard).toBeHidden();
    await expect.poll(async () => (await roundState(page))?.liveRoundGroups?.[0]?.simpleStats?.[1]?.fwy).toBe(false);

    // Shot 3: Putter from All → Short / Holed / Past on the dock; Holed → Log
    // ends the hole without Details.
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 3');
    await page.locator('#bag-buttons-grid .club-all-btn').click();
    await page.locator('#bag-buttons-grid .club-grid-panel button[data-val="Putter"]').click();
    const holed = page.locator('#section-putting-outcome [data-val="Holed"]');
    await expect(holed).toBeVisible();
    const hr = await onTop(page, '#section-putting-outcome [data-val="Holed"]');
    expect(hr.ok, JSON.stringify(hr)).toBe(true);
    // The putt line/read questions stay in Details.
    await expect(page.locator('#section-putting-outcome [data-val="Misread"]')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('dock-shot3-putt.png') });
    await holed.click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /holed out/i }).first()).toBeVisible();
    await expect.poll(async () => (await roundState(page))?.currentHole, { timeout: 10_000 }).toBe(2);
    const st = await roundState(page);
    expect(st.liveRoundGroups[0].scores[1]).toBe(3);
    expect(st.liveRoundGroups[0].simpleStats[1].putts).toBe(1);
});
