// ==========================================================================
// hole-plans.spec.js — S3: the full plan flow through the Settings card
// ==========================================================================
// Part A seeded the plan via the emulator REST (the Settings card did not
// exist yet). Part B lands the card, so this spec walks the REAL
// acceptance: the player draws a plan for Ashgrove hole 1 in Settings,
// saves it, starts a round there, and adopts it with one tap — and the
// saved shot carries the planId.
//
// Ports follow the runner and CI pattern (EMU_FIRESTORE_PORT or EMU_FS_PORT /
// EMU_AUTH_PORT / VITE_PREVIEW_PORT), so the suite runs unchanged on the
// self-hosted runner's high ports and on a developer's default-port stack.

import { test, expect } from '@playwright/test';
import { FIRESTORE_PORT, seedPreapprovedEmail, throwawayEmail, verifyEmulatorEmail } from './helpers/emulator.js';

// Keep this spec pinned to the map-and-grids layout it exercises.
// map-and-grids 'both' layout it was written for, so it pins that preference;
// Map first's own coverage lives in map-first*.spec.js and map-follow.spec.js.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('golf.shotEntry')) localStorage.setItem('golf.shotEntry', 'both'); });
});

const PASSWORD = 'e2e-password-1';
const PREVIEW = `http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}`;
const FS_PORT = FIRESTORE_PORT;
const DOCS = `http://127.0.0.1:${FS_PORT}/v1/projects/golf-handicap-tracker-b677c/databases/(default)/documents`;

async function registerFreshUser(page) {
    const email = throwawayEmail('plan');
    await seedPreapprovedEmail(email);
    await page.goto(PREVIEW);
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Plan E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyEmulatorEmail(email);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    return email;
}

test('S3: a plan drawn in the Settings card shows on the hole and fills the intended line', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    page.on('console', (m) => {
        if (m.type() === 'warning' || m.type() === 'error') console.log('PAGE:', m.type(), m.text().slice(0, 220));
    });
    const email = await registerFreshUser(page);

    // --- Settings: draw the plan through the card -------------------------
    await page.locator('#tab-btn-settings').click();
    const root = page.locator('#settings-plan-root');
    await expect(root.locator('.plan-course-select')).toBeVisible({ timeout: 15_000 });

    await root.locator('.plan-course-select').selectOption('ashgrove');
    await expect(root.locator('.plan-hole-select option')).not.toHaveCount(0, { timeout: 15_000 });
    await root.locator('.plan-hole-select').selectOption('1');

    // The canvas mounts for Ashgrove 1; draw the plan as one swipe up the
    // middle — the overlay commits a curve on pointerdown→move→up, the same
    // stroke the wizard records.
    const canvas = root.locator('.plan-canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await root.scrollIntoViewIfNeeded(); // the card sits below the fold on a small phone
    await page.waitForTimeout(800); // mount + first paint
    const box = await canvas.boundingBox();
    expect(box?.height).toBeGreaterThan(100);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.78);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.55, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 8 });
    await page.mouse.up();

    await expect(root.locator('.plan-status')).toContainText(/point(s)? drawn/, { timeout: 10_000 });
    await root.locator('.plan-note').fill('straight away');
    await root.locator('.plan-save').click();
    await expect(root.locator('.plan-status')).toContainText(/saved \d+ points?/, { timeout: 15_000 });
    await page.screenshot({ path: testInfo.outputPath('plan-drawn.png') });

    // --- The round: the plan shows, and one tap adopts it ------------------
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();

    await expect(page.locator('#section-line')).toBeVisible({ timeout: 15_000 });
    // Before the tap: the readout must NOT show an intended carry — the
    // plan is only a faint dashed suggestion until the player adopts it.
    const readout = page.locator('#line-readout');
    await expect(readout).not.toContainText('Intended');

    await page.locator('#btn-line-use-plan').click();
    await expect(readout).toContainText(/Intended\s+\d+\s*m/, { timeout: 10_000 });

    // --- Save the shot; it must carry the planId ---------------------------
    // The real wizard save: club, miss pattern, then the final button.
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('[data-group="missPattern"][data-val="On Target"]').click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i })).toBeVisible({ timeout: 15_000 });
    // The save is fire-and-forget (F-11): the doc reaches the emulator a few
    // hundred ms after the toast. Read until it lands (5 s cap).
    let shot;
    for (let attempt = 0; attempt < 20; attempt++) {
    shot = await page.evaluate(async ({ email, docs }) => {
        // Resolve the user's uid by a structured query on email (the store
        // holds 200+ users — a name-ordered page can miss the newest), then
        // take this user's newest hole-1 shot carrying the planId.
        const runQuery = async (collectionId, filters) => {
            const res = await fetch(`${docs}:runQuery`, {
                method: 'POST',
                headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
                body: JSON.stringify({ structuredQuery: {
                    from: [{ collectionId }],
                    where: { fieldFilter: { field: { fieldPath: filters[0].path }, op: 'EQUAL', value: filters[0].value } },
                    limit: 20,
                } }),
            });
            const rows = await res.json();
            return (rows || []).filter((r) => r.document).map((r) => r.document);
        };
        const mine1 = await runQuery('users', [{ path: 'email', value: { stringValue: email } }]);
        if (!mine1.length) return { error: 'user not found' };
        const uid = mine1[0].name.split('/').pop();
        const mine2 = await runQuery('shots', [{ path: 'uid', value: { stringValue: uid } }]);
        const hit = mine2.find((d) => d.fields?.planId?.stringValue === 'ashgrove-1');
        if (!hit) {
            const dump = mine2.map((d) => ({ hole: d.fields?.holeNumber, planId: d.fields?.planId, keys: Object.keys(d.fields || {}) }));
            return { error: 'no matching shot with planId', uid, shots: dump };
        }
        return {
            planId: hit.fields.planId.stringValue,
            intended: hit.fields.lineIntended?.arrayValue?.values?.length ?? 0,
        };
    }, { email, docs: DOCS });
    if (!shot.error) break;
    await page.waitForTimeout(250);
    }
    expect(shot.error, `shot lookup: ${JSON.stringify(shot)}`).toBeUndefined();
    expect(shot.planId).toBe('ashgrove-1');
    expect(shot.intended).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: testInfo.outputPath('hole-plan-used.png') });
});
