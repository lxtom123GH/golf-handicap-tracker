// ==========================================================================
// hole-mapper.spec.js — S6 Part 2b: the save flow, end to end
// ==========================================================================
// Open the mapper for Keperra hole 10, tap six points as a green, close the
// ring, save — then read the trace back through the emulator REST and expect
// exactly one saved feature with a closed ring. The photo-fit assertion from
// the Part 2a review (corners inside the canvas at zoom 1) is pinned here
// too, plus the screenshot for the human check.

import { test, expect } from '@playwright/test';
import { FIRESTORE_PORT, PROJECT_ID, seedPreapprovedEmail, throwawayEmail, verifyEmulatorEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
const PROJECT = PROJECT_ID;
const DOCS = `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = { headers: { Authorization: 'Bearer owner' } };

async function registerFreshUser(page) {
    const email = throwawayEmail('mapper');
    await seedPreapprovedEmail(email);
    await page.goto(`http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}`);
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Mapper E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyEmulatorEmail(email);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    return email;
}

test('mapper: tap 6 points as a green and 4 as water on Keperra 10, close, save — both land in holeTraces', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-se', 'the mapper is a thumb UI; measured on the iphone-se project');

    const email = await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-settings"]').click();
    await page.locator('#mapper-course-select').selectOption('keperra');
    await page.waitForTimeout(600);
    await page.locator('#mapper-hole-select').selectOption('10');
    await page.locator('#btn-mapper-open').click();
    await expect(page.locator('#hole-mapper')).toBeVisible();
    await expect(page.locator('#mapper-hole-label')).toContainText('hole 10');
    await page.locator('#mapper-canvas').scrollIntoViewIfNeeded();
    await page.waitForTimeout(900); // let the photo load and redraw

    // Part 2a review requirement: the photo's four corners sit inside the
    // canvas at zoom 1 — the view fits the imagery, not a cut triangle.
    const fit = await page.evaluate(() => {
        const handle = document.getElementById('hole-mapper')._mapper;
        const { w, h } = handle.canvasSize();
        const corners = handle.cornersScreen();
        return {
            w, h,
            corners,
            allInside: corners.every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h),
        };
    });
    expect(fit.allInside, `photo corners inside the canvas: ${JSON.stringify(fit.corners)} on ${fit.w}x${fit.h}`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('hole-mapper-photo-fit.png') });

    // Tap six points as a green (the crosshair lands 40 px above the finger).
    const c = await page.locator('#mapper-canvas').boundingBox();
    const taps = [[90, 180], [150, 150], [220, 160], [260, 210], [230, 270], [140, 250]];
    for (const [dx, dy] of taps) {
        await page.mouse.click(c.x + dx, c.y + dy);
        await page.waitForTimeout(120);
    }
    await expect(page.locator('#mapper-status')).toContainText('open ring 6 vertexes');
    await page.locator('#btn-mapper-close-ring').click();
    await expect(page.locator('#mapper-status')).toContainText('saved features 1/12');

    // Simplify review A7: a traced pond must save as the OSM tag the course
    // map draws (water_hazard), not the pill's name.
    await page.locator('#mapper-pills .mapper-pill[data-kind="water"]').click();
    for (const [dx, dy] of [[80, 300], [130, 290], [140, 330], [90, 340]]) {
        await page.mouse.click(c.x + dx, c.y + dy);
        await page.waitForTimeout(120);
    }
    await page.locator('#btn-mapper-close-ring').click();
    await expect(page.locator('#mapper-status')).toContainText('saved features 2/12');

    // Save through the real UI. The write is NOT awaited (F-9/F-11 pattern:
    // under the persistent local cache it resolves only on the server ack),
    // so the status flips immediately and the doc reaches the emulator store
    // asynchronously — poll the read-back.
    await page.locator('#btn-mapper-save').click();
    await expect(page.locator('#mapper-status')).toContainText('saved 2 feature');

    // Read it back through the emulator: resolve the uid by email, then the
    // trace doc. The emulator persists between runs, so scope by user.
    const readBack = await page.evaluate(async ({ email, docs, auth }) => {
        // Query, never list: a persistent emulator caps the users page (150
        // here) and this run's user can sit past it (same fix as the S9 spec).
        const q = await (await fetch(`${docs.replace(/\/documents$/, '')}/documents:runQuery`, {
            ...auth, method: 'POST', headers: { ...(auth.headers || {}), 'Content-Type': 'application/json' },
            body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email } } } } }),
        })).json();
        const me = (Array.isArray(q) ? q : []).map((r) => r.document).filter(Boolean)[0];
        if (!me) return { found: false };
        const uid = me.name.split('/').pop();
        const url = `${docs}/users/${uid}/holeTraces/keperra-10`;
        // The un-awaited write syncs from the local cache — poll briefly.
        for (let i = 0; i < 20; i++) {
            const res = await fetch(url, auth);
            if (res.ok) {
                const doc = await res.json();
                const f = doc.fields?.features?.mapValue?.fields?.features?.arrayValue?.values || [];
                return {
                    found: true,
                    featureCount: f.length,
                    firstGolf: f[0]?.mapValue?.fields?.properties?.mapValue?.fields?.golf?.stringValue,
                    golfs: f.map((x) => x?.mapValue?.fields?.properties?.mapValue?.fields?.golf?.stringValue),
                    ringLen: f[0]?.mapValue?.fields?.geometry?.mapValue?.fields?.ring?.arrayValue?.values?.length,
                    authorUid: doc.fields?.authorUid?.stringValue,
                };
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        return { found: false };
    }, { email, docs: DOCS, auth: AUTH });
    expect(readBack.found, 'the trace doc exists in holeTraces').toBe(true);
    expect(readBack.featureCount).toBe(2);
    expect(readBack.firstGolf).toBe('green');
    expect(readBack.golfs).toEqual(['green', 'water_hazard']);
    // Six vertices + the GeoJSON closure point.
    expect(readBack.ringLen).toBe(7);
    expect(readBack.authorUid).toBeTruthy();
});
