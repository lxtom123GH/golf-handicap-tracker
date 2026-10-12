// ==========================================================================
// hole-overlay.spec.js — draw the intended and actual line on a real hole
// ==========================================================================
//
// Ashgrove is fully mapped in OSM, so its wizard shows the hole overlay.
// The test draws an intended line and an actual line with the pointer,
// checks the readout reports both carries, and saves the shot through the
// real UI. Keperra's Old front nine has no overlay (not in OSM), so the
// section must stay hidden there — that is pinned too.

import { test, expect } from '@playwright/test';
import { FIRESTORE_PORT, seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

// Keep this spec pinned to the map-and-grids layout it exercises.
// map-and-grids 'both' layout it was written for, so it pins that preference;
// Map first's own coverage lives in map-first*.spec.js and map-follow.spec.js.
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
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    return email;
}

async function startDetailedRound(page, courseLabel, holesBtn) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator(holesBtn).click();
    await page.locator('#oc-course-select').selectOption({ label: courseLabel });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
}

/** Drag a curve across the canvas from (x0,y0) to (x1,y1) in canvas fractions. */
async function swipe(page, canvas, from, to, bend = 0) {
    // A golfer scrolls the canvas clear of the sticky footer before drawing;
    // do the same, then measure.
    await canvas.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
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

test('Ashgrove: the wizard shows the hole, takes an intended and an actual line, and saves them with the shot', async ({ page }, testInfo) => {
    const email = await registerFreshUser(page);
    await startDetailedRound(page, 'Ashgrove GC', '#btn-round-18');

    const section = page.locator('#section-line');
    await expect(section).toBeVisible({ timeout: 10_000 });
    const canvas = page.locator('#shot-line-canvas');
    // The mount is async (course overlay + the S3 plan lookup); a late mount
    // resets the readout — wait for it (data-start is written by the mount).
    await expect(canvas).toHaveAttribute('data-start', /.+/, { timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThanOrEqual(200);
    await expect(page.locator('#line-attribution')).toContainText('OpenStreetMap');

    // S11: the wizard opens in the shot view (closer than the whole hole) with
    // step 1 showing; the inset tap toggles to the hole view and back.
    await expect(page.locator('#wizard-step')).toContainText('Shot 1 · draw');
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot');
    const mppShot = Number(await canvas.getAttribute('data-mpp'));
    await page.mouse.click(box.x + box.width - 30, box.y + 30); // the inset, top-right
    await expect(canvas).toHaveAttribute('data-view-mode', 'hole');
    const mppHole = Number(await canvas.getAttribute('data-mpp'));
    expect(mppHole).toBeGreaterThan(mppShot * 1.4);
    await page.mouse.click(box.x + box.width - 30, box.y + 30);
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot');
    // Glass chips PR 5: the visible Hole / Shot chip does the same, >= 44 px.
    const viewChip = page.locator('#section-line .map-view-chip');
    await expect(viewChip).toHaveText(/Hole/);
    expect((await viewChip.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await viewChip.click();
    await expect(canvas).toHaveAttribute('data-view-mode', 'hole');
    await expect(viewChip).toHaveText(/Shot/);
    await viewChip.click();
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot');

    // S12 A2 review: the canvas bottom must stay above the sticky footer,
    // without scrolling, in every wizard state (the shared rule, asserted).
    const overlap = async () => {
        const c = await canvas.boundingBox();
        const f = await page.locator('.wizard-footer').boundingBox();
        return { bottom: c.y + c.height, footerTop: f.y };
    };
    const o1 = await overlap();
    expect(o1.bottom).toBeLessThanOrEqual(o1.footerTop);

    // Intended: from the tee (bottom centre) up the hole with a gentle draw.
    await swipe(page, canvas, [0.5, 0.92], [0.5, 0.35], -0.08);
    await expect(page.locator('#line-readout')).toContainText(/Intended \d+ m/);
    await expect(page.locator('#wizard-step')).toContainText('Shot 1 · hit it');
    await expect(page.locator('#btn-save-plan')).toBeVisible();
    const o2 = await overlap();
    expect(o2.bottom).toBeLessThanOrEqual(o2.footerTop);

    // Actual: switch mode, swipe a slice that finishes right.
    await page.locator('[data-line-mode="actual"]').click();
    await expect(page.locator('#line-mode-caption')).toContainText('actual line');
    await swipe(page, canvas, [0.5, 0.92], [0.72, 0.45], 0.06);
    await expect(page.locator('#line-readout')).toContainText(/Intended \d+ m · Actual \d+ m · \([+-]?\d+ m\)/);
    await expect(page.locator('#wizard-step')).toContainText('Shot 1 · check');
    await expect(page.locator('#btn-save-plan')).toBeHidden();
    await expect(page.locator('#btn-save-shot-final')).toHaveText(/Log shot 1$/);

    // S1 Part B: the derived prefill lights startLine/shape from the curves
    // and the readout carries the derived summary.
    await expect(page.locator('[data-group="startLine"].active-choice')).toHaveCount(1);
    await expect(page.locator('[data-group="shape"].active-choice')).toHaveCount(1);
    await expect(page.locator('#line-readout')).toContainText(/· Start (Left|Straight|Right)/);
    await expect(page.locator('#line-readout')).toContainText(/· (Draw|Fade|Hook|Slice|Straight) · \d+ m (long|short)/);

    // A deliberate tap survives the next swipe: the Manual flag blocks prefill.
    // The shape grid lives in the collapsed Swing detail — open it first.
    await page.locator('#section-swing-detail').evaluate(el => { el.open = true; });
    await page.locator('[data-group="shape"][data-val="Draw"]').click();
    await expect(page.locator('[data-group="shape"][data-val="Draw"].active-choice')).toHaveCount(1);
    await swipe(page, canvas, [0.5, 0.92], [0.72, 0.45], 0.06);
    await expect(page.locator('[data-group="shape"][data-val="Draw"].active-choice')).toHaveCount(1);

    await page.screenshot({ path: testInfo.outputPath('wizard-overlay.png') });

    // Save through the real wizard: club + result, then the toast.
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('[data-group="missPattern"][data-val="On Target"]').click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i })).toBeVisible();

    // S12 A2: one start point per shot — read the shot back and prove BOTH
    // curves begin at the anchor (data-start, the frame-metre x,y).
    const dataStart = await canvas.getAttribute('data-start');
    expect(dataStart).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    const [ax, ay] = dataStart.split(',').map(Number);
    // The app gets VITE_EMU_FS_PORT; the helper accepts both CI's legacy
    // EMU_FS_PORT and P030's EMU_FIRESTORE_PORT so both speak to the same one.
    const docsPort = FIRESTORE_PORT;
    // The save is fire-and-forget (F-11): the doc reaches the emulator a few
    // hundred ms after the toast. Read until it lands (5 s cap).
    let check;
    for (let attempt = 0; attempt < 20; attempt++) {
    check = await page.evaluate(async ({ email, docsPort, ax, ay }) => {
        const base = `http://127.0.0.1:${docsPort}/v1/projects/golf-handicap-tracker-b677c/databases/(default)/documents`;
        const runQuery = async (collectionId, filters) => {
            const res = await fetch(`${base}:runQuery`, {
                method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
                body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath: filters[0].path }, op: 'EQUAL', value: filters[0].value } }, limit: 20 } }),
            });
            const rows = await res.json();
            return (rows || []).filter((r) => r.document).map((r) => r.document);
        };
        const mine1 = await runQuery('users', [{ path: 'email', value: { stringValue: email } }]);
        if (!mine1.length) return { error: 'user not found' };
        const uid = mine1[0].name.split('/').pop();
        const mine2 = await runQuery('shots', [{ path: 'uid', value: { stringValue: uid } }]);
        const withLines = mine2.filter((d) => d.fields?.lineIntended?.arrayValue?.values?.length >= 2
            && d.fields?.lineActual?.arrayValue?.values?.length >= 2);
        if (!withLines.length) return { error: 'no shot with both curves', shots: mine2.length };
        const first = (doc, field) => {
            const v = doc.fields[field].arrayValue.values[0].mapValue.fields;
            return [Number(v.x.doubleValue ?? v.x.integerValue), Number(v.y.doubleValue ?? v.y.integerValue)];
        };
        const doc = withLines[0];
        const [ix, iy] = first(doc, 'lineIntended');
        const [rx, ry] = first(doc, 'lineActual');
        return { ix, iy, rx, ry };
    }, { email, docsPort, ax, ay });
    if (!check.error) break;
    await page.waitForTimeout(250);
    }
    expect(check.error, JSON.stringify(check)).toBeUndefined();
    const near = (a, b) => Math.abs(a - b) < 0.5;
    expect(near(check.ix, ax) && near(check.iy, ay)).toBe(true);
    expect(near(check.rx, ax) && near(check.ry, ay)).toBe(true);
    expect(near(check.ix, check.rx) && near(check.iy, check.ry)).toBe(true);

    // Re-open the shot: both curves are still there (they rode on the shot document).
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    await expect(page.locator('#line-readout')).toContainText('Swipe the line');
    await page.locator('#btn-wizard-cancel').click();
});

test('Keperra North: schematic strip from the OSM line with the traced green on top, Qld attribution shown', async ({ page }, testInfo) => {
    await registerFreshUser(page);
    await startDetailedRound(page, 'Keperra – North Course (9 holes)', '#btn-round-9');
    await expect(page.locator('#section-line')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#line-attribution')).toContainText('OpenStreetMap');
    await expect(page.locator('#line-attribution')).toContainText('State of Queensland');
    // S6 Part 1: the shipped aerial image draws under the base — the canvas
    // centre is photo, not the flat #d9f0d3 fill. The <img> loads async, so
    // poll until the redraw swaps it in.
    await expect.poll(async () => {
        return page.locator('#shot-line-canvas').evaluate((c) => {
            const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
            return `${d[0]},${d[1]},${d[2]}`;
        });
    }, { timeout: 10_000 }).not.toBe('217,240,211');
    await page.screenshot({ path: testInfo.outputPath('wizard-keperra-10.png') });
});

test('Keperra Old front nine: no overlay in OSM yet, so the section stays hidden', async ({ page }) => {
    await registerFreshUser(page);
    await startDetailedRound(page, 'Keperra – Old Course (9 holes)', '#btn-round-9');
    await expect(page.locator('#section-weapon')).toBeVisible();
    await expect(page.locator('#section-line')).toBeHidden();
});

test('S11: Save plan keeps no stroke, the hub names the pending shot, Log shot counts it', async ({ page }) => {
    await registerFreshUser(page);
    await startDetailedRound(page, 'Ashgrove GC', '#btn-round-18');
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    // The overlay mounts async and resizes the canvas; swipe only once it has.
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot');

    // Step 1 → draw the plan → step 2 → Save plan (no stroke).
    await swipe(page, canvas, [0.5, 0.92], [0.5, 0.35], -0.05);
    await expect(page.locator('#wizard-step')).toContainText('Shot 1 · hit it');
    await page.locator('#btn-save-plan').click();
    await expect(page.getByRole('status').filter({ hasText: /Plan saved/ })).toBeVisible();
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
    await expect(page.locator('#btn-oc-track-shot')).toHaveText(/Log shot 1 · draw what happened/);
    await expect(page.locator('.compact-score-card .oc-score-value').first()).toHaveText('0');

    // Reopen: the same shot, at step 2, with the plan drawn; log it → stroke 1.
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');
    await expect(page.locator('#wizard-step')).toContainText('Shot 1 · hit it');
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot'); // overlay re-mounted for this shot
    // S12 A2 review: the reopened planned shot (delete button in the header)
    // must also keep the canvas above the footer.
    const o3 = await (async () => {
        const c = await canvas.boundingBox();
        const f = await page.locator('.wizard-footer').boundingBox();
        return { bottom: c.y + c.height, footerTop: f.y };
    })();
    expect(o3.bottom).toBeLessThanOrEqual(o3.footerTop);
    await page.locator('[data-line-mode="actual"]').click();
    await swipe(page, canvas, [0.5, 0.92], [0.6, 0.4], 0.04);
    await expect(page.locator('#wizard-step')).toContainText('Shot 1 · check');
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /Shot 1 logged/ })).toBeVisible();
    await expect(page.locator('#btn-oc-track-shot')).toHaveText(/Track My Shot/);
    await expect(page.locator('.compact-score-card .oc-score-value').first()).toHaveText('1');
});
