// ==========================================================================
// play-mode.spec.js — owner 2026-10-06: "a play mode where the entire screen
// is the map and anything that I need to press during the round is a glass
// chip on the map"
// ==========================================================================
// On by default for Simple and Detailed rounds on a mapped course; a
// Settings switch turns it off. The chips are the round's existing controls.
// Keperra's map file covers physical holes 10-27 (North + West), so these
// rounds are on the North nine: round hole 1 = physical 10.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page, prefix) {
    const email = throwawayEmail(prefix);
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Play Mode');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
}

/** Every control's box inside the viewport, at least 44 px, and on top. */
async function chipGeometry(page, ids) {
    return page.evaluate((ids) => ids.map((id) => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        return { id, top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height,
            onTop: !!hit && (hit === el || el.contains(hit)) };
    }), ids);
}

test('Play mode: a Simple round is a full-screen map with glass chips; score, sheet, Next all work', async ({ page }, testInfo) => {
    await registerFreshUser(page, 'playsimple');
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – North Course (9 holes)' });
    await page.locator('#oc-guest-name').fill('Sam');
    await page.locator('#btn-oc-add-guest').click();
    await expect(page.locator('#oc-players-list')).toContainText('Sam');
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());

    // The map fills the screen.
    await expect(page.locator('body')).toHaveClass(/play-mode/);
    const canvas = page.locator('#oc-play-map canvas');
    await expect(canvas).toHaveAttribute('data-hole', '10', { timeout: 15_000 });
    const vp = page.viewportSize();
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);

    // Owner 2026-10-06: the hole takes up most of the view, scaled to the
    // hole — fills the height between bar and card, or the full width.
    const fit = await canvas.evaluate(c => ({ w: +c.dataset.fitW, h: +c.dataset.fitH }));
    console.log(`[play-mode] ${testInfo.project.name}: hole fitted ${fit.w}x${fit.h} on ${vp.width}x${vp.height}`);
    expect(fit.h >= vp.height * 0.55 || fit.w >= vp.width * 0.95, JSON.stringify(fit)).toBe(true);

    // Chips: on screen, thumb-sized, nothing covering them.
    // Decision 12: Start Round on a mapped course starts GPS (granted on the
    // phone projects), so the distance pill is the GPS chip; with location
    // refused (desktop) it is C27's one 📡 chip. Never the 🔢 opener.
    const gpsChip = testInfo.project.name === 'desktop' ? 'btn-play-gps' : 'oc-gps-widget';
    await expect(page.locator(`#${gpsChip}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#btn-big-numbers')).toBeHidden();
    if (gpsChip === 'oc-gps-widget') await expect(page.locator('#btn-play-gps')).toBeHidden();
    const geo = await chipGeometry(page, ['btn-oc-hole-strip', 'btn-oc-more', gpsChip, 'btn-play-view',
        'btn-oc-score-sheet', 'btn-oc-prev-hole', 'btn-oc-next-hole']);
    for (const g of geo) {
        expect(g.top, g.id).toBeGreaterThanOrEqual(0);
        expect(g.bottom, g.id).toBeLessThanOrEqual(vp.height);
        expect(g.left, g.id).toBeGreaterThanOrEqual(0);
        expect(g.right, g.id).toBeLessThanOrEqual(vp.width);
        expect(g.h, g.id).toBeGreaterThanOrEqual(44);
        expect(g.onTop, `${g.id} is tappable`).toBe(true);
    }
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    await expect(page.locator('#footer-version')).toBeHidden(); // never on the Prev/Next chips
    // Layout A: the rails sit at the screen's edges, the hole's centre line clear.
    for (const g of geo.filter(g => [gpsChip, 'btn-play-view', 'btn-oc-score-sheet'].includes(g.id))) {
        expect(g.right, `${g.id} on the left rail`).toBeLessThanOrEqual(80);
    }
    // Simple rounds: no club strip.
    await expect(page.locator('#play-clubs')).toBeHidden();
    // Opens on the shot view, outlined.
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot');

    // Your score is on the map; the guest's card is in the pull-up sheet.
    const cards = page.locator('#oc-group-scores .compact-score-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toBeVisible();
    await expect(cards.nth(1)).toBeHidden();
    await expect(page.locator('#btn-oc-score-sheet')).toHaveText('👥 2');
    // Owner 2026-10-06: putts and your score on the right rail; GIR is worked
    // out, never pressed; FW only on a par 4/5 in Simple rounds.
    const me = cards.nth(0);
    await expect(me.locator('.oc-putts')).toBeVisible();
    await expect(me.locator('.mini-gir')).toBeHidden();
    const par = Number((await page.locator('#oc-par-display').textContent()).replace(/\D/g, ''));
    if (par >= 4) await expect(me.locator('.mini-fw')).toBeVisible();
    else await expect(me.locator('.mini-fw')).toBeHidden();
    const rail = await me.boundingBox();
    expect(rail.x, 'score card on the right rail').toBeGreaterThanOrEqual(vp.width - 80);
    for (let i = 0; i < par; i++) await me.locator('.btn-grid-plus').click();
    await me.locator('.putt-plus').click();
    await me.locator('.putt-plus').click();
    await expect(me.locator('.oc-score-value')).toHaveText(String(par));
    await expect(me.locator('.oc-card-gir')).toHaveText('GIR ✓');
    // Simplify C24: a fresh account has no Daily Handicap (F-4), and the gross-only
    // notice folds away with the group sheet, so your rail card says it.
    await expect(me.locator('.oc-card-grossonly')).toHaveText('Gross only');
    await expect(me.locator('.oc-card-grossonly')).toBeVisible();
    // Decision 15: no Routine chip in a Simple round (it saved nothing).
    await expect(page.locator('#btn-play-routine')).toBeHidden();
    // 🎯 → the whole hole, and back.
    await page.locator('#btn-play-view').click();
    await expect(canvas).toHaveAttribute('data-view-mode', 'hole');
    await page.waitForTimeout(600);
    await page.screenshot({ path: testInfo.outputPath('play-simple-hole-view.png') });
    await page.locator('#btn-play-view').click();
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot');
    await page.screenshot({ path: testInfo.outputPath('play-simple.png') });

    await page.locator('#btn-oc-score-sheet').click();
    await expect(cards.nth(1)).toBeVisible();
    await expect(page.locator('#btn-oc-log-past-round')).toBeVisible(); // BL-UX-18
    await cards.nth(1).locator('.btn-grid-plus').click();
    await expect(cards.nth(1).locator('.oc-score-value')).toHaveText('1');
    await page.screenshot({ path: testInfo.outputPath('play-sheet-open.png') });
    await page.locator('#btn-oc-score-sheet').click();
    await expect(cards.nth(1)).toBeHidden();

    // Next hole: the map follows (physical hole 2), the score persisted.
    await page.locator('#btn-oc-next-hole').click();
    await expect(page.locator('#oc-hole-display')).toHaveText('Hole 2');
    await expect(canvas).toHaveAttribute('data-hole', '11');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state')));
    expect(st.liveRoundGroups[0].scores['1']).toBe(par);
    expect(st.liveRoundGroups[0].simpleStats['1']).toMatchObject({ putts: 2, gir: true });
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot'); // a new hole opens on the shot view

    // ⋯ opens over the map, every button reachable.
    await page.locator('#btn-oc-more').click();
    for (const id of ['#btn-oc-review-round', '#btn-oc-finish', '#btn-oc-exit']) {
        const b = await page.locator(id).boundingBox();
        expect(b.y + b.height, id).toBeLessThanOrEqual(vp.height);
        expect(b.x + b.width, id).toBeLessThanOrEqual(vp.width + 0.5);
    }
    await page.screenshot({ path: testInfo.outputPath('play-more.png') });

    // Abandon ends play mode.
    page.once('dialog', d => d.accept());
    await page.locator('#btn-oc-exit').click();
    await expect(page.locator('#oncourse-setup')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toHaveClass(/play-mode/);
    await expect(page.locator('#oc-play-map')).toBeHidden();
});

test('Play mode: Detailed round — Track shot chip opens the wizard; GPS chip starts GPS', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'phone layouts only');
    await registerFreshUser(page, 'playdetail');
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – North Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await page.locator('#btn-wizard-cancel').click();
    await expect(page.locator('body')).toHaveClass(/play-mode/);
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());

    const track = page.locator('#btn-oc-track-shot');
    await expect(track).toBeVisible();
    const tb = await track.boundingBox();
    expect(tb.height).toBeGreaterThanOrEqual(44);
    expect(tb.y + tb.height).toBeLessThanOrEqual(page.viewportSize().height);

    if (testInfo.project.name === 'phone' || testInfo.project.name === 'iphone-se') {
        // Decision 12: GPS is already on from Start Round; a new fix moves it.
        await page.context().setGeolocation({ latitude: -27.4112, longitude: 152.9524, accuracy: 10 });
        await expect(page.locator('#oc-gps-widget')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#btn-play-gps')).toBeHidden();
        // The distances stand on the left rail, off the hole's centre line.
        const pill = await page.locator('#oc-gps-widget').boundingBox();
        expect(pill.x + pill.width).toBeLessThanOrEqual(80);
        expect(pill.height).toBeGreaterThanOrEqual(44);
        // Cosmetic only: keep the wake toast out of the screenshot (it no
        // longer blocks taps, so no other step waits for it).
        await expect(page.locator('.app-toast')).toHaveCount(0, { timeout: 5_000 });
        await page.screenshot({ path: testInfo.outputPath('play-detailed-gps.png') });
    }

    // Club strip: three clubs, the suggestion in the middle; ▼ picks a
    // shorter one; Routine ✓; Track opens the wizard with both filled in.
    const strip = page.locator('#play-clubs');
    await expect(strip).toBeVisible();
    await expect(page.locator('#pc-sug')).toHaveText('SUGGESTED');
    const sel = strip.locator('.pc-club.sel');
    await expect(sel).toHaveCount(1);
    const first = await sel.getAttribute('data-val');
    await page.locator('#btn-pc-down').click();
    const picked = await sel.getAttribute('data-val');
    expect(picked).not.toBe(first);
    await expect(page.locator('#pc-sug')).toContainText('SUGG.');
    await page.locator('#btn-play-routine').click();
    await expect(track).toHaveText(/Track/); // the real button, same id
    const sb = await strip.boundingBox();
    expect(sb.x + sb.width).toBeLessThanOrEqual(80);
    // C27: measured again here - the rail is one chip shorter with GPS off,
    // so the Track box taken before GPS started is stale once the pill shows.
    const tbNow = await track.boundingBox();
    expect(tbNow.y).toBeGreaterThanOrEqual(sb.y + sb.height - 1); // Track under the strip
    await page.screenshot({ path: testInfo.outputPath('play-detailed-clubs.png') });

    await track.click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');

    await expect(page.locator(`#bag-buttons-grid [data-val="${picked}"].active-choice`).first()).toBeAttached();
    await expect(page.locator('.wiz-routine-btn[data-routine="pre"][data-val="Pass"]')).toHaveClass(/active/);
});

test('Play mode off in Settings: the round uses the normal screen', async ({ page }) => {
    await registerFreshUser(page, 'playoff');
    await page.locator('#tab-btn-settings').click();
    const toggle = page.locator('#play-mode-toggle');
    await expect(toggle).toBeChecked(); // on by default
    await expect(page.locator('#play-reach')).toHaveValue('230'); // My longest shot
    await toggle.uncheck();
    expect(await page.evaluate(() => localStorage.getItem('golf.playMode'))).toBe('off');

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – North Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500); // the map file would have loaded by now
    await expect(page.locator('body')).not.toHaveClass(/play-mode/);
    await expect(page.locator('#oc-play-map')).toBeHidden();
    await expect(page.locator('#btn-oc-score-sheet')).toBeHidden();
});
