// ==========================================================================
// one-tap-logging.spec.js — Map-first quick logging
// on the play map, a shot is logged without the
// target button, the wizard or a mode switch. Right rail Plan / Actual /
// Undo; left the likely club. A chip must be armed before a finger draws.
// Fixture coordinates use the public course data.
// ==========================================================================

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, findDocs, verifyEmulatorEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
// Physical hole 10: tee and green centre (public/courses/keperra.json).
const TEE = { lat: -27.4112264, lon: 152.9524138 };
const GREEN = { lat: -27.40899, lon: 152.949281 };
const along = (f) => ({ latitude: TEE.lat + (GREEN.lat - TEE.lat) * f, longitude: TEE.lon + (GREEN.lon - TEE.lon) * f });

test.beforeEach(({ }, testInfo) => {
    test.skip(!['phone', 'iphone-se'].includes(testInfo.project.name), 'phone layouts only');
});

async function startQuickRound(page, prefix, gps, mockWakeLock = false, lookupUid = true) {
    await page.addInitScript((mock) => {
        localStorage.setItem('golf.shotEntry', 'map');
        if (mock) Object.defineProperty(navigator, 'wakeLock', {
            configurable: true,
            value: { request: async () => ({ addEventListener() {}, release: async () => {} }) },
        });
    }, mockWakeLock);
    await page.context().setGeolocation(gps);
    const email = throwawayEmail(prefix);
    await seedPreapprovedEmail(email);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('One Tap');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyEmulatorEmail(email);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – North Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());
    await expect(page.locator('body')).toHaveClass(/play-quick/, { timeout: 15_000 });
    const canvas = page.locator('#oc-play-map canvas');
    await expect(canvas).toHaveAttribute('data-hole', '10', { timeout: 15_000 });
    await expect(canvas).toHaveAttribute('data-quick', 'idle');
    // No wizard popped up over the map (a Detailed round used to open one).
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
    if (!lookupUid) return { canvas };
    const [user] = await findDocs('users', 'email', email);
    return { canvas, uid: user._id };
}

/** One-finger swipe up the middle of the map, clear of the rails. */
async function swipe(page, from = 0.7, to = 0.4) {
    const vp = page.viewportSize();
    const x = vp.width * 0.5;
    await page.mouse.move(x, vp.height * from);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + i, vp.height * (from + (to - from) * i / 10));
    await page.mouse.up();
}

async function shotsFor(uid, want) {
    let shots = [];
    await expect.poll(async () => { shots = await findDocs('shots', 'uid', uid); return shots.length; }, { timeout: 15_000 }).toBe(want);
    return shots;
}

test('One-tap logging: Plan → drag → Actual → drag logs a shot with both lines; no target button, no wizard', async ({ page }, testInfo) => {
    // Weak GPS (±40 m): Actual arms drawing instead of one tap.
    const { canvas, uid } = await startQuickRound(page, 'onetapdraw', { ...along(0.45), accuracy: 40 });
    const vp = page.viewportSize();
    const me = page.locator('#oc-group-scores .compact-score-card').first();

    // Every chip is thumb-sized, on screen, in the lower 60 %, and on top.
    const ids = ['btn-quick-plan', 'btn-quick-actual', 'btn-quick-undo', 'btn-pc-up', 'btn-pc-down'];
    const geo = await page.evaluate((ids) => [...ids.map(id => document.getElementById(id)), document.querySelector('#play-clubs .pc-club.sel')]
        .map((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { id: el.id || 'club', top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, onTop: !!hit && (hit === el || el.contains(hit)) };
        }), ids);
    console.log(`[one-tap] ${testInfo.project.name} ${vp.width}x${vp.height}: ${geo.map(g => `${g.id} ${Math.round(g.top)}-${Math.round(g.bottom)} h${Math.round(g.h)}`).join(' | ')}`);
    for (const g of geo) {
        expect(g.h, g.id).toBeGreaterThanOrEqual(44);
        expect(g.top, `${g.id} in the lower 60 %`).toBeGreaterThanOrEqual(vp.height * 0.4);
        expect(g.bottom, g.id).toBeLessThanOrEqual(vp.height);
        expect(g.left, g.id).toBeGreaterThanOrEqual(0);
        expect(g.right, g.id).toBeLessThanOrEqual(vp.width);
        expect(g.onTop, `${g.id} is tappable`).toBe(true);
    }
    // Plan / Actual / Undo on the right rail, the club on the left.
    for (const g of geo.slice(0, 3)) expect(g.left, g.id).toBeGreaterThanOrEqual(vp.width - 100);
    for (const g of geo.slice(3)) expect(g.right, g.id).toBeLessThanOrEqual(90);
    // Your score card moved up, clear of the shot chips.
    const card = await page.locator('#oc-score-sheet').boundingBox();
    expect(card.y + card.height, 'score card above Plan').toBeLessThanOrEqual(geo[0].top + 1);
    expect(card.y, 'score card under the strip').toBeGreaterThanOrEqual(52);
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBeLessThanOrEqual(vp.width);

    // The likely club: a badge; ▼ steps away (↺ names the likely one); a tap on the club goes back.
    const sug = page.locator('#pc-sug');
    await expect(sug).toHaveText('likely');
    const likely = await page.locator('#play-clubs .pc-club.sel').getAttribute('data-val');
    await page.locator('#btn-pc-down').click();
    await expect(sug).toHaveText(/^↺ /);
    await page.locator('#play-clubs .pc-club.sel').click();
    await expect(sug).toHaveText('likely');
    await expect(page.locator('#play-clubs .pc-club.sel')).toHaveAttribute('data-val', likely);
    await expect(page.locator('#play-quick-hint')).toContainText('Shot 1');
    await expect(page.locator('.app-toast')).toHaveCount(0, { timeout: 8_000 }); // round-start toasts gone
    await page.screenshot({ path: testInfo.outputPath('one-tap-idle.png') });

    // A stray touch with nothing armed only pans: no line, no shot.
    await expect(canvas).toHaveAttribute('data-read-only', 'true');
    await swipe(page);
    await page.waitForTimeout(300);
    await expect(canvas).toHaveAttribute('data-plan', '0');
    await expect(canvas).toHaveAttribute('data-quick', 'idle');
    await expect(me.locator('.oc-score-value')).toHaveText('0');

    // Plan → drag: the intended line, from the start dot (the tee).
    await page.locator('#btn-quick-plan').click();
    await expect(page.locator('#btn-quick-plan')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-read-only', 'false');
    await swipe(page, 0.72, 0.38);
    await expect(canvas).toHaveAttribute('data-plan', /^[2-9]|\d\d/);
    await expect(page.locator('#btn-quick-plan')).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas).toHaveAttribute('data-read-only', 'true'); // disarmed after one line

    // Actual with weak GPS arms drawing; drag → the shot is logged.
    await expect(page.locator('#btn-quick-actual')).toHaveAttribute('data-one-tap', 'false');
    await page.locator('#btn-quick-actual').click();
    await expect(canvas).toHaveAttribute('data-quick', 'actual');
    await expect(page.locator('#play-quick-hint')).toContainText('drag to where it finished');
    await page.screenshot({ path: testInfo.outputPath('one-tap-actual-armed.png') });
    await swipe(page, 0.72, 0.45);
    await expect(page.getByRole('status').filter({ hasText: /Shot 1 logged/ }).first()).toBeVisible();
    await expect(page.locator('.undo-card')).toHaveCount(0); // the chips' Undo, not a card over them
    await expect(me.locator('.oc-score-value')).toHaveText('1');
    await expect(canvas).toHaveAttribute('data-quick', 'idle');
    await expect(page.locator('#play-quick-hint')).toContainText('Shot 2');
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/active-wizard-mode/);
    await page.screenshot({ path: testInfo.outputPath('one-tap-logged.png') });

    // The same shot document the wizard saves: both lines, club, frame.
    const [shot] = await shotsFor(uid, 1);
    expect(shot).toMatchObject({ hole: 1, shotNumber: 1, club: likely });
    expect(shot.planned).toBeFalsy();
    expect(shot.lineIntended.length).toBeGreaterThanOrEqual(2);
    expect(shot.lineActual.length).toBeGreaterThanOrEqual(2);
    expect(shot.lineIntended[0]).toEqual(shot.lineActual[0]); // both from the start dot
    expect(Math.hypot(shot.lineActual[0].x, shot.lineActual[0].y)).toBeLessThan(1); // the tee
    expect(shot.lineFrame).toMatchObject({ courseSlug: 'keperra', physicalHole: 10 });
    expect(typeof shot.timestamp).toBe('string');
});

test('One-tap logging: good GPS makes Actual one tap from the start to you; Undo takes it back', async ({ page }, testInfo) => {
    const { canvas, uid } = await startQuickRound(page, 'onetapgps', { ...along(0.4), accuracy: 5 });
    const me = page.locator('#oc-group-scores .compact-score-card').first();
    const actual = page.locator('#btn-quick-actual');
    await expect(actual).toHaveAttribute('data-one-tap', 'true', { timeout: 10_000 });
    await expect(actual).toContainText('here');
    await expect(page.locator('#play-quick-hint')).toContainText('Tap Actual (1 tap)');

    await actual.click(); // the only tap
    await expect(me.locator('.oc-score-value')).toHaveText('1');
    await expect(canvas).toHaveAttribute('data-quick', 'adjust'); // a drag now nudges it
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('one-tap-gps.png') });
    const [shot] = await shotsFor(uid, 1);
    expect(shot.lineActual).toHaveLength(2);
    expect(Math.hypot(shot.lineActual[0].x, shot.lineActual[0].y)).toBeLessThan(1); // from the tee
    expect(shot.finishXY.y).toBeGreaterThan(100); // to where you stand, ~40 % up the hole
    expect(shot.gpsCapture).toMatchObject({ role: 'finish', accuracyM: 5 });
    expect(shot.distanceToPinM).toBeGreaterThan(250);

    // The nudge window closes on its own.
    await expect(canvas).toHaveAttribute('data-quick', 'idle', { timeout: 10_000 });
    // Undo takes the shot off: stroke and document.
    await page.locator('#btn-quick-undo').click();
    await expect(me.locator('.oc-score-value')).toHaveText('0');
    await shotsFor(uid, 0);
    await expect(page.locator('#btn-quick-undo')).toBeDisabled();
});

test('On-course settings: the map gear opens live settings without leaving the round', async ({ page }) => {
    await startQuickRound(page, 'oncourse-settings', { ...along(0.45), accuracy: 5 }, true, false);

    const gear = page.locator('#btn-play-settings');
    await expect(gear).toBeVisible();
    const vp = page.viewportSize();
    const box = await gear.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    const stripBox = await page.locator('#oc-exit-bar').boundingBox();
    expect(box.x - (stripBox.x + stripBox.width)).toBeGreaterThanOrEqual(12);
    await gear.click();
    const sheet = page.locator('#play-settings-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator('#play-shot-entry')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#play-settings-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#play-shot-entry')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(gear).toBeFocused();
    await gear.click();
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Shot entry');
    await expect(sheet).toContainText('GPS');
    await expect(sheet).toContainText('Keep screen awake');
    await expect(sheet).toContainText('Rotate map');

    await page.locator('#play-shot-entry').selectOption('both');
    await expect(page.locator('body')).not.toHaveClass(/play-quick/);
    await expect(page.locator('#oc-play-map canvas')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('golf.shotEntry'))).toBe('both');

    await page.locator('#play-setting-gps').click();
    await expect(page.locator('#play-setting-gps')).toHaveAttribute('aria-checked', 'false');
    await page.locator('#play-setting-awake').click();
    await expect(page.locator('#play-setting-awake')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#play-setting-rotate').click();
    await expect(page.locator('#play-setting-rotate')).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('golf.rotateMap'))).toBe('on');
    await expect(page.locator('body')).toHaveClass(/round-active/);
    await expect(page.locator('#oncourse-hub')).toBeVisible();
});
