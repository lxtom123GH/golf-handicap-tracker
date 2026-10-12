// ==========================================
// gps-capture.spec.js — S10: hold-still capture policy on the phone
// (brief: docs/agent-briefs/overlay-followons/S10-gps-capture-policy.md)
// ==========================================
// The mocked geolocation only exists in the phone project. Sequence rules
// learned in S4 and honoured here:
//   - an accuracy-only setGeolocation change does NOT re-fire the watcher —
//     each step nudges the coordinates (~1 m, a real position change);
//   - an override after the toggle interleaves one POSITION_UNAVAILABLE
//     error — the app now tolerates that transient (S10 oncourse.js) instead
//     of killing the watcher, so the new fix arrives.

import { test, expect } from '@playwright/test';
import { FIRESTORE_PORT, PROJECT_ID, seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';
import { GPS_POLICY } from '../../src/gps-capture.js';

const PASSWORD = 'e2e-password-1';
const KEPERRA_TEE = { latitude: -27.4136, longitude: 152.9465 };
// Ashgrove hole 1 tee (public/courses/ashgrove.json) — the drag test needs the
// mock fix ON the mapped course, or the marker draws 30 km off-canvas.
const ASHGROVE_TEE = { latitude: -27.4454585, longitude: 152.9601132 };

async function registerFreshUser(page) {
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto(`http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}`);
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('E2E Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    return email;
}

async function startRound(page, courseLabel = 'Keperra – Old Course (9 holes)', holesBtn = '#btn-round-9') {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator(holesBtn).click();
    await page.locator('#oc-course-select').selectOption({ label: courseLabel });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await page.locator('#btn-wizard-cancel').click();
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
}

async function toggleGps(page) {
    // Decision 12: Start Round on a mapped course already started GPS.
    await expect(page.locator('#btn-toggle-gps')).not.toHaveText(/OFF/);
    await expect(page.locator('#oc-strip-gps')).toBeVisible({ timeout: 10_000 });
}

test('capture: 30 → 6 → 5 accepts at the 5 m fix and the readout says ±5 m', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone' && testInfo.project.name !== 'iphone-se', 'geolocation granted only in the phone projects');

    await page.context().setGeolocation({ ...KEPERRA_TEE, accuracy: 30 });
    await registerFreshUser(page);
    await startRound(page);
    await toggleGps(page);

    // This case controls fix ordering; the separate running-clock case tests expiry.
    await page.clock.install();
    // A target a second ahead: the browser clock started at install and may
    // already be past Node's "now" ("Cannot fast-forward to the past").
    // Nothing is waiting on a timer yet, so the jump is harmless.
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');
    // The lock ring is on while the capture runs, off after the decision.
    await expect(page.locator('#gps-lock-ring')).toBeVisible();

    // Step 2: 6 m — usable, waits (a lone good fix is not convergence).
    await page.context().setGeolocation({ latitude: KEPERRA_TEE.latitude + 0.00001, longitude: KEPERRA_TEE.longitude, accuracy: 6 });
    // The ring repaints on a 120 ms interval and the fix lands asynchronously:
    // step the paused clock until the 6 m reading shows (well inside the window).
    await expect.poll(async () => {
        await page.clock.runFor(150);
        return page.locator('.gps-lock-acc').textContent();
    }, { timeout: 5_000 }).toBe('±6');
    // Step 3: 5 m after a 6 m → two good fixes in a row → accepted now.
    await page.context().setGeolocation({ latitude: KEPERRA_TEE.latitude + 0.00002, longitude: KEPERRA_TEE.longitude, accuracy: 5 });

    await expect(page.locator('#line-readout')).toContainText('Start from GPS (±5 m)', { timeout: 8_000 });
    await expect(page.locator('#gps-lock-ring')).toBeHidden();
});

test('capture: expires without a fresh fix on the running browser clock', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'geolocation granted only in the phone project');
    await page.context().setGeolocation({ ...KEPERRA_TEE, accuracy: GPS_POLICY.preciseOffM * 2 });
    await registerFreshUser(page);
    await startRound(page);
    await toggleGps(page);
    // No clock override: exercise the actual browser timeout when fixes stop.
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');
    await expect(page.locator('#gps-lock-ring')).toBeVisible();
    await expect(page.locator('#gps-lock-ring')).toBeHidden({ timeout: GPS_POLICY.windowMs + 2000 });
    await expect(page.locator('#line-readout')).toContainText('GPS refused:');
    await expect(page.locator('#line-readout')).not.toContainText('Start from GPS');
});

test('capture: two fixes over 1000 m refuse as Precise Location off', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone' && testInfo.project.name !== 'iphone-se', 'geolocation granted only in the phone projects');

    await page.context().setGeolocation({ ...KEPERRA_TEE, accuracy: 2000 });
    await registerFreshUser(page);
    await startRound(page);
    await toggleGps(page);

    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');
    // The seed (2000 m) is stale by the time the capture starts, so both
    // hopeless fixes come live: 1900 then 1800 → the first two usable fixes
    // both above preciseOffM freeze the decision.
    await page.context().setGeolocation({ latitude: KEPERRA_TEE.latitude + 0.00001, longitude: KEPERRA_TEE.longitude, accuracy: 1900 });
    await page.context().setGeolocation({ latitude: KEPERRA_TEE.latitude + 0.00002, longitude: KEPERRA_TEE.longitude, accuracy: 1800 });

    await expect(page.locator('#line-readout')).toContainText(/Precise Location is off|GPS refused: 1800 m/, { timeout: 8_000 });
    // No positions chained on a refusal.
    await expect(page.locator('#line-readout')).not.toContainText('Start from GPS');
});

test('capture: the low-confidence/accepted marker drags and the readout says adjusted', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone' && testInfo.project.name !== 'iphone-se', 'geolocation granted only in the phone projects');

    await page.context().setGeolocation({ ...ASHGROVE_TEE, accuracy: 10 });
    await registerFreshUser(page);
    // Ashgrove has a hole overlay — the marker lives on the map, not just in data.
    await startRound(page, 'Ashgrove GC', '#btn-round-18');
    await toggleGps(page);

    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');
    // A fresh fix mid-capture (real phones re-fire every second; the mock
    // needs the nudge — see the file header). 10 m ≤ acceptWindowM → the
    // window accepts it as 'accepted'.
    await page.context().setGeolocation({ latitude: ASHGROVE_TEE.latitude + 0.00001, longitude: ASHGROVE_TEE.longitude, accuracy: 10 });
    // Accepted at window end (the lone 10 m seed is ≤ 12 m).
    await expect(page.locator('#line-readout')).toContainText('Start from GPS (±10 m)', { timeout: 8_000 });

    // Find the ring: scan the canvas for its exact green (16,185,129) and
    // take the bounding-box centre (the ring's circle centre).
    const ring = await page.locator('#shot-line-canvas').evaluate((canvas) => {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const img = ctx.getImageData(0, 0, w, h).data;
        const pts = [];
        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
                const i = (y * w + x) * 4;
                if (img[i] === 16 && img[i + 1] === 185 && img[i + 2] === 129) pts.push([x, y]);
            }
        }
        if (!pts.length) return null;
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const dpr = w / canvas.clientWidth;
        return {
            x: (Math.min(...xs) + Math.max(...xs)) / 2 / dpr,
            y: (Math.min(...ys) + Math.max(...ys)) / 2 / dpr,
        };
    });
    expect(ring, 'the accepted marker is drawn on the canvas').toBeTruthy();

    // Drag it 20 px: pointer down on the ring, move, up.
    const box = await page.locator('#shot-line-canvas').boundingBox();
    await page.mouse.move(box.x + ring.x, box.y + ring.y);
    await page.mouse.down();
    await page.mouse.move(box.x + ring.x + 20, box.y + ring.y - 20, { steps: 5 });
    await page.mouse.up();

    // A deliberate placement counts as ±3 m and marks the capture adjusted.
    await expect(page.locator('#line-readout')).toContainText('Start from GPS (±3 m)');
    await expect(page.locator('#line-readout')).toContainText('adjusted');

    // The adjusted capture rides on the saved shot.
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i }).first()).toBeVisible();
});

test('S9: flight unseen logs endpoint-only and reopens with the GPS finish, no curve', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone' && testInfo.project.name !== 'iphone-se', 'geolocation granted only in the phone projects');

    await page.context().setGeolocation({ ...ASHGROVE_TEE, accuracy: 10 });
    const email = await registerFreshUser(page);
    await startRound(page, 'Ashgrove GC', '#btn-round-18');
    await toggleGps(page);

    // Shot 1: flight unseen — the Actual button becomes the GPS label.
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');
    await page.context().setGeolocation({ latitude: ASHGROVE_TEE.latitude + 0.00001, longitude: ASHGROVE_TEE.longitude, accuracy: 10 });
    // The toggle lives in the collapsed Swing detail — open it first.
    await page.locator('#section-swing-detail summary').click();
    await page.locator('#wiz-toggle-flight-unseen').click();
    await expect(page.locator('[data-line-mode="actual"]')).toHaveText('Finish from GPS');
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i }).first()).toBeVisible();

    // Shot 2: the capture accepts and the S4 chain stamps shot 1's finish.
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    await page.context().setGeolocation({ latitude: ASHGROVE_TEE.latitude + 0.00002, longitude: ASHGROVE_TEE.longitude, accuracy: 10 });
    await expect(page.locator('#line-readout')).toContainText('Start from GPS (±10 m)', { timeout: 8_000 });
    await page.waitForTimeout(300); // the local finish patch runs with the decision

    // Find THIS run's shot 1 in the emulator. The emulator persists between
    // runs (deliberately), so the lookup is scoped: resolve the user's uid
    // from the users collection by the throwaway email, then take that
    // user's newest endpoint-only shot 1 — never a stale document.
    const fsPort = FIRESTORE_PORT;
    const shotId = await page.evaluate(async ({ email, fsPort, project }) => {
        const base = (path) => `http://127.0.0.1:${fsPort}/v1/projects/${project}/databases/(default)/documents/${path}`;
        const headers = { Authorization: 'Bearer owner' };
        // Query, never list: a persistent emulator holds hundreds of users and
        // shots, and the REST list caps a page (150 here) before this run's
        // documents appear. runQuery returns exactly the matching documents.
        const runQuery = async (collectionId, filters) => {
            const res = await fetch(base(':runQuery').replace('/documents/:runQuery', '/documents:runQuery'), {
                method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ structuredQuery: {
                    from: [{ collectionId }],
                    where: { compositeFilter: { op: 'AND', filters: filters.map(([fieldPath, value]) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value } })) } },
                } }),
            });
            return (await res.json()).map(r => r.document).filter(Boolean);
        };
        const me = (await runQuery('users', [['email', { stringValue: email }]]))[0];
        if (!me) return null;
        const uid = me.name.split('/').pop();
        const mine = (await runQuery('shots', [['uid', { stringValue: uid }], ['actualEndpointOnly', { booleanValue: true }]]))
            .filter(d => {
                const f = d.fields || {};
                return f.shotNumber?.integerValue === '1';
            })
            .sort((a, b) => (b.fields.timestamp?.stringValue || '').localeCompare(a.fields.timestamp?.stringValue || ''));
        return mine.length ? mine[0].name.split('/').pop() : null;
    }, { email, fsPort, project: PROJECT_ID });
    expect(shotId, 'the endpoint-only shot document exists').toBeTruthy();

    // Cancel shot 2 and reopen shot 1 through the app's own re-entry.
    await page.locator('#btn-wizard-cancel').click();
    await page.evaluate((id) => window.loadExistingShotData(id), shotId);
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');

    // The readout names the GPS finish (and never a drawn Actual).
    await expect(page.locator('#line-readout')).toContainText('Finish from GPS');
    await expect(page.locator('#line-readout')).not.toContainText('Actual');

    // The canvas shows the finish DOT, not an orange curve: the orange
    // (249,115,22) pixels must stay within a small dot-sized bounding box.
    const orange = await page.locator('#shot-line-canvas').evaluate((canvas) => {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const img = ctx.getImageData(0, 0, w, h).data;
        const pts = [];
        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
                const i = (y * w + x) * 4;
                if (img[i] === 249 && img[i + 1] === 115 && img[i + 2] === 22) pts.push([x, y]);
            }
        }
        if (!pts.length) return { n: 0 };
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        return { n: pts.length, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    });
    expect(orange.n).toBeGreaterThan(20);    // the dot is drawn
    expect(orange.w).toBeLessThan(60);       // a dot, not a curve
    expect(orange.h).toBeLessThan(60);
});
