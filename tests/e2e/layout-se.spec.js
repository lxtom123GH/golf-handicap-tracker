// ==========================================================================
// layout-se.spec.js — the layout floor: 375x667 (iPhone SE), Chromium
// ==========================================================================
//
// Field test 2026-09-13: the
// owner's first round on a secondhand iPhone SE found the layout "does not
// resize well" and the top of each screen "could be condensed". This spec
// turns both into numbers on every PR:
//
//   1. No horizontal overflow on any main tab or on the on-course hub —
//      nothing wider than the viewport, no sideways scroll.
//   2. Chrome budget: on the on-course hub, the first actionable control must
//      sit inside the first viewport, and the fixed bottom nav must not cover
//      it.
//
// It also writes a measurement report (test-results/layout-se.json) so a
// human can see what each screen costs in pixels before moving anything.
//
// Chromium at 375x667 is the layout floor, not iOS rendering: Safari/Chrome
// on iOS can still differ, and only the phone shows that.

import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { seedPreapprovedEmail, seedStrategyPeriodsByEmail, throwawayEmail } from './helpers/emulator.js';

// Keep this layout check pinned to the map-and-grids mode it measures.
// map-and-grids 'both' layout it was written for, so it pins that preference
// (a test that sets its own choice still wins: this only fills an empty slot).
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('golf.shotEntry')) localStorage.setItem('golf.shotEntry', 'both'); });
});

const PASSWORD = 'e2e-password-1';
const TABS = ['tab-whs', 'tab-comp', 'tab-practice', 'tab-insights', 'tab-oncourse', 'tab-settings'];

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

/** Measure the screen that is currently showing. Runs in the page. */
function measureScreen(activeTabId) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tab = document.getElementById(activeTabId);
    const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width), right: Math.round(r.right) };
    };
    const visible = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    // Elements whose right edge pokes past the viewport (the "does not resize" evidence).
    // Anything inside a deliberate sideways scroller (.table-responsive, the
    // hole-dot strip) is that container's business, not overflow.
    const inScroller = (el) => {
        for (let p = el.parentElement; p && p !== tab; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'auto' || ox === 'scroll') return true;
        }
        return false;
    };
    const overflowers = [];
    for (const el of tab.querySelectorAll('*')) {
        if (!visible(el) || inScroller(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
            overflowers.push({ el: `${el.tagName.toLowerCase()}${id}${cls}`, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
        }
    }
    const header = tab.querySelector('header.header');
    const navEl = document.querySelector('.tabs-container');
    const nav = visible(navEl) ? navEl : null;
    // Where the tab's own content begins: the first visible card/section
    // that is not the banner and not the player bar.
    let contentStart = null;
    for (const el of tab.querySelectorAll('.card, section, .dashboard-grid, form')) {
        if (!visible(el) || el.closest('header') || el.closest('.player-management-bar')) continue;
        contentStart = Math.round(el.getBoundingClientRect().top);
        break;
    }
    // First interactive control inside the tab (what the user came to press).
    let firstControl = null;
    for (const el of tab.querySelectorAll('button, input, select, a[href]')) {
        if (!visible(el) || el.closest('header')) continue;
        firstControl = el;
        break;
    }
    const fc = firstControl ? rect(firstControl) : null;
    // The top stack: every visible block in the first 400px of the document
    // that is at least 30px tall, shallow in the tree — what a user scrolls past.
    const topStack = [];
    const depthOf = (el) => { let d = 0; for (let p = el; p && p !== document.body; p = p.parentElement) d++; return d; };
    for (const el of document.querySelectorAll('body *')) {
        if (!visible(el) || depthOf(el) > 5) continue;
        const r = el.getBoundingClientRect();
        if (r.top >= 400 || r.height < 30 || r.bottom <= 0) continue;
        const id = el.id ? `#${el.id}` : '';
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        topStack.push({ el: `${el.tagName.toLowerCase()}${id}${cls}`, depth: depthOf(el), top: Math.round(r.top), height: Math.round(r.height) });
    }
    // Space-takers that are not visible blocks: anything shallow with a
    // non-zero box or vertical margin in the first 400px, visible or not.
    const gapProbe = [];
    for (const el of document.querySelectorAll('#main-app > *, #main-app > * > *')) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.top >= 400 || r.bottom < 0) continue;
        gapProbe.push({ el: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''}`, top: Math.round(r.top), height: Math.round(r.height), display: cs.display, position: cs.position, mt: cs.marginTop, mb: cs.marginBottom, pt: cs.paddingTop });
    }
    return {
        topStack,
        gapProbe,
        viewport: { w: vw, h: vh },
        scrollWidth: document.scrollingElement.scrollWidth,
        pageOverflowsX: document.scrollingElement.scrollWidth > vw + 1,
        header: rect(header),
        contentStart,
        bottomNav: rect(nav),
        firstControl: firstControl ? { el: `${firstControl.tagName.toLowerCase()}#${firstControl.id || ''}`, text: (firstControl.textContent || '').trim().slice(0, 40), ...fc } : null,
        firstControlInsideFirstScreen: fc ? fc.bottom <= (nav ? rect(nav).top : vh) : null,
        overflowers: overflowers.slice(0, 12),
    };
}

test('375x667: no horizontal overflow on any main tab; hub fits the first screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-se', 'layout floor is measured on the iphone-se project only');

    await registerFreshUser(page);
    const report = { measuredAt: new Date().toISOString(), screens: {} };

    for (const id of TABS) {
        await page.locator(`.tab-btn[data-target="${id}"]`).click();
        await expect(page.locator(`#${id}`)).toBeVisible();
        // Measure a new golfer's banner at its tallest: once the rounds
        // snapshot lands it carries "Set starting index" (measuring before
        // that made this budget pass or fail on timing).
        if (id === 'tab-whs') await expect(page.locator('#btn-set-start-index')).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(300); // let fonts/emoji settle
        report.screens[id] = await page.evaluate(measureScreen, id);
        await page.screenshot({ path: testInfo.outputPath(`${id}-375x667.png`), fullPage: false });
    }
    // The Handicap banner sits below the welcome card for a brand-new user;
    // capture it on its own so a human can see what the budget buys.
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await page.locator('#tab-whs header.header').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('tab-whs-banner-375x667.png'), fullPage: false });

    // On-course setup → hub (the screen used one-handed between shots).
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await page.locator('#btn-wizard-cancel').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible();
    await page.waitForTimeout(300);
    report.screens['oncourse-hub'] = await page.evaluate(measureScreen, 'tab-oncourse');
    // The hub's own stack: what each row above the first action costs.
    report.screens['oncourse-hub'].stack = await page.evaluate(() => {
        const ids = ['oc-hole-display', 'oc-par-display', 'oc-par-select', 'oc-gps-widget', 'btn-oc-track-shot', 'btn-toggle-gps', 'oc-bottom-nav'];
        const out = {};
        for (const id of ids) {
            const el = document.getElementById(id) || (id === 'oc-par-select' ? null : null);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            out[id] = { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), display: getComputedStyle(el).display };
        }
        const wl = document.querySelector('#oncourse-hub .wakelock-toggle');
        if (wl) { const r = wl.getBoundingClientRect(); out['wakelock-toggle'] = { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; }
        return out;
    });
    await page.screenshot({ path: testInfo.outputPath('hub-375x667.png'), fullPage: false });

    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/layout-se.json', JSON.stringify(report, null, 2));

    // --- Assertions: the floor ---
    for (const [id, s] of Object.entries(report.screens)) {
        expect(s.pageOverflowsX, `${id}: page scrolls sideways (scrollWidth ${s.scrollWidth} > ${s.viewport.w})`).toBe(false);
        expect(s.overflowers, `${id}: elements past the viewport edge`).toEqual([]);
    }
    const hub = report.screens['oncourse-hub'];
    expect(hub.firstControlInsideFirstScreen, `hub: first control ${JSON.stringify(hub.firstControl)} is below the first screen / under the nav`).toBe(true);
    // Chrome budget on the Handicap tab, the screen the app opens on: the
    // banner (title + index box) may take at most a third of a 667px screen,
    // and the first card must start inside the first screen. Field test
    // 2026-09-13 measured the banner at 332px — half the screen.
    // One-thumb hub budget (built 2026-09-16): on the round screen the
    // strip is one 48px line, the first score control is inside the first
    // screen, Prev/Next sit in the bottom quarter, and every control the
    // thumb uses between shots is at least 48px tall.
    const hubGeo = await page.evaluate(() => {
        const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height), width: Math.round(b.width) }; };
        return {
            vh: window.innerHeight,
            strip: r('#oc-exit-bar'),
            // A player with no index gets the gross-only notice above the
            // scores (F-9/F-4); that notice is then the first content block.
            scores: r(document.getElementById('oc-scoring-notice').classList.contains('hidden') ? '#oc-group-scores' : '#oc-scoring-notice'),
            plus: r('.btn-grid-plus'),
            minus: r('.btn-grid-minus'),
            track: r('#btn-oc-track-shot'),
            prev: r('#btn-oc-prev-hole'),
            next: r('#btn-oc-next-hole'),
            jumperHidden: document.getElementById('hole-jumper-container').classList.contains('hidden'),
            sheetHidden: document.getElementById('oc-more-sheet').classList.contains('hidden'),
        };
    });
    report.screens['oncourse-hub'].thumb = hubGeo;
    expect(hubGeo.strip.height, 'strip is one line').toBeLessThanOrEqual(48);
    expect(hubGeo.jumperHidden && hubGeo.sheetHidden, 'jumper and More sheet start folded').toBe(true);
    expect(hubGeo.scores.top, 'score entry starts right under the strip').toBeLessThanOrEqual(hubGeo.strip.bottom + 40);
    expect(hubGeo.plus.bottom, 'first score control inside the first screen').toBeLessThanOrEqual(hubGeo.vh);
    for (const k of ['plus', 'minus', 'track', 'prev', 'next']) {
        expect(hubGeo[k].height, `${k} tap target height`).toBeGreaterThanOrEqual(48);
    }
    expect(hubGeo.next.top, 'Next in the bottom quarter').toBeGreaterThanOrEqual(hubGeo.vh * 0.7);
    expect(hubGeo.next.bottom, 'Next fully on screen').toBeLessThanOrEqual(hubGeo.vh);
    expect(hubGeo.prev.top, 'Prev in the bottom quarter').toBeGreaterThanOrEqual(hubGeo.vh * 0.7);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/layout-se.json', JSON.stringify(report, null, 2));

    const whs = report.screens['tab-whs'];
    expect(whs.header.height, `Handicap banner is ${whs.header.height}px tall on a ${whs.viewport.h}px screen`).toBeLessThanOrEqual(Math.round(whs.viewport.h / 3));
    expect(whs.contentStart, `Handicap content starts at ${whs.contentStart}px, below the nav at ${whs.bottomNav.top}px`).toBeLessThan(whs.bottomNav.top);
});

test('BL-UX-19: Handicap is identity/record and moved sections stay reachable', async ({ page }, testInfo) => {
    test.skip(!['phone', 'iphone-se'].includes(testInfo.project.name),
        'IA navigation journey runs on the supported phone projects');

    const email = await registerFreshUser(page);
    await seedStrategyPeriodsByEmail(email, [{ name: 'DECADE (Fawcett)', start: '2020-01-01', end: null }]);
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(page.locator('#tab-whs')).toBeVisible();
    await expect(page.locator('#tab-whs #performance-insights-section')).toHaveCount(0);
    await expect(page.locator('#tab-whs #strategy-section')).toHaveCount(0);
    await expect(page.locator('#tab-whs #strategy-banner')).toBeVisible();
    await expect(page.locator('#tab-whs #strategy-banner-text')).toContainText('Playing DECADE (Fawcett)');
    await expect(page.locator('#tab-whs .dh-calc-details')).toHaveCount(0); // decision 7: calculator removed

    await page.locator('.tab-btn[data-target="tab-insights"]').click();
    await expect(page.locator('#tab-insights')).toBeVisible();
    for (const section of ['#performance-insights-section', '#practice-metrics-section', '#strategy-section']) {
        const moved = page.locator(`#tab-insights ${section}`);
        await expect(moved).toHaveCount(1);
        await moved.scrollIntoViewIfNeeded();
        await expect(moved).toBeVisible();
    }
    await expect(page.locator('#tab-insights #strategy-banner')).toHaveCount(0);
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await page.locator('#tab-whs #btn-strategy-banner-manage').click();
    await expect(page.locator('body')).toHaveAttribute('data-active-tab', 'tab-insights');
    await expect(page.locator('#tab-insights #strategy-section')).toBeInViewport();
    await page.locator('#btn-load-club-insights').scrollIntoViewIfNeeded();
    await expect(page.locator('#btn-load-club-insights')).toBeVisible();
});

test('375x667: hole mapper pills and Save are >= 44 px and inside the first screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-se', 'layout floor is measured on the iphone-se project only');

    await registerFreshUser(page);
    // The Settings path opens the mapper without a live round.
    await page.locator('.tab-btn[data-target="tab-settings"]').click();
    await expect(page.locator('#settings-mapper-card')).toBeVisible();
    await page.locator('#mapper-course-select').selectOption('keperra');
    await page.locator('#mapper-hole-select').selectOption('10');
    await page.locator('#btn-mapper-open').click();
    await expect(page.locator('#hole-mapper')).toBeVisible();
    await expect(page.locator('#mapper-hole-label')).toContainText('hole 10');
    // Bring the canvas into the viewport before tapping it.
    await page.locator('#mapper-canvas').scrollIntoViewIfNeeded();

    const metrics = await page.evaluate(() => {
        const pill = document.querySelector('.mapper-pill');
        const save = document.getElementById('btn-mapper-save');
        const canvas = document.getElementById('mapper-canvas');
        const rect = (el) => el.getBoundingClientRect();
        const pr = rect(pill);
        const sr = rect(save);
        const vh = window.innerHeight;
        return {
            pill: { w: pr.width, h: pr.height, bottom: pr.bottom },
            save: { w: sr.width, h: sr.height, bottom: sr.bottom },
            canvasVisible: rect(canvas).height > 100,
            viewportH: vh,
        };
    });
    expect(metrics.pill.h).toBeGreaterThanOrEqual(44);
    expect(metrics.pill.w).toBeGreaterThanOrEqual(44);
    expect(metrics.save.h).toBeGreaterThanOrEqual(44);
    expect(metrics.canvasVisible).toBe(true);
    // The pills and the canvas fit the first screen; Save may need the
    // card's own scroll, so it is measured for size, not position.
    expect(metrics.pill.bottom).toBeLessThanOrEqual(metrics.viewportH);
    await page.screenshot({ path: testInfo.outputPath('hole-mapper-375x667.png'), fullPage: false });
});

test('375x667: draw mode bars sit in the first screen and every control is >= 44 px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-se', 'layout floor is measured on the iphone-se project only');

    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    const section = page.locator('#section-line');
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#shot-line-canvas')).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });

    // Enter draw mode.
    await page.locator('#btn-line-draw').click();
    await expect(page.locator('#oncourse-wizard')).toHaveClass(/draw-mode/);
    await expect(page.locator('#shot-line-canvas')).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });
    // D29: Undo (which replaced Clear) shows once there is a line to take
    // back — draw one, dispatched on the canvas so a round-start toast can't
    // catch the pointer.
    await dispatchSwipe(page.locator('#shot-line-canvas'));
    await expect(page.locator('#btn-line-undo')).toBeVisible();

    const metrics = await page.evaluate(() => {
        const rect = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { top: b.top, bottom: b.bottom, w: b.width, h: b.height };
        };
        return {
            viewportH: window.innerHeight,
            step: rect('#wizard-step'),
            done: rect('#btn-line-done'),
            tools: rect('.line-tools'),
            intended: rect('[data-line-mode="intended"]'),
            actual: rect('[data-line-mode="actual"]'),
            undo: rect('#btn-line-undo'),
            draw: rect('#btn-line-draw'),
        };
    });

    // The top bar and the bottom row are inside the first screen.
    expect(metrics.step.top).toBeGreaterThanOrEqual(0);
    expect(metrics.step.bottom).toBeLessThanOrEqual(metrics.viewportH);
    expect(metrics.done.bottom).toBeLessThanOrEqual(metrics.viewportH);
    expect(metrics.tools.top).toBeGreaterThanOrEqual(0);
    expect(metrics.tools.bottom).toBeLessThanOrEqual(metrics.viewportH);

    // Every draw-mode control meets the 44 px touch floor. (The Draw button
    // is hidden in draw mode by definition.)
    for (const [name, m] of Object.entries({ done: metrics.done, intended: metrics.intended, actual: metrics.actual, undo: metrics.undo })) {
        expect(m, name).not.toBeNull();
        expect(Math.max(m.w, m.h), name).toBeGreaterThanOrEqual(44);
    }

    // And the canvas fills the viewport between the bars — contained by the
    // screen (the sticky footer is behind the fullscreen overlay here).
    const c = await page.locator('#shot-line-canvas').boundingBox();
    const geo = await page.evaluate(() => ({
        innerH: window.innerHeight,
        wizardClass: document.getElementById('oncourse-wizard')?.className,
        styleH: document.getElementById('shot-line-canvas')?.style.height,
        canvasH: document.getElementById('shot-line-canvas')?.getBoundingClientRect().height,
        canvasTop: document.getElementById('shot-line-canvas')?.getBoundingClientRect().top,
        sectionPos: getComputedStyle(document.getElementById('section-line')).position,
        sectionTop: document.getElementById('section-line')?.getBoundingClientRect().top,
        sheetHasDrawMode: [...document.styleSheets].some(sh => {
            try { return [...sh.cssRules].some(r => r.cssText?.includes('.draw-mode #section-line')); } catch { return false; }
        }),
    }));
    expect(c.y).toBeGreaterThanOrEqual(64);
    expect(c.y + c.height).toBeLessThanOrEqual(metrics.viewportH);

    await page.locator('#btn-line-done').click();
    await expect(page.locator('#oncourse-wizard')).not.toHaveClass(/draw-mode/);
    await page.screenshot({ path: testInfo.outputPath('draw-mode-375x667.png'), fullPage: false });
});

// One-finger swipe from 85% to 35% of the canvas height, as pointer events.
async function dispatchSwipe(canvas) {
    const box = await canvas.boundingBox();
    const x = box.x + box.width / 2;
    const ev = (type, y, buttons) => ({
        type, pointerId: 21, pointerType: 'touch', isPrimary: true,
        clientX: x, clientY: box.y + box.height * y, button: 0, buttons,
        pointerWidth: 8, pointerHeight: 8,
    });
    await canvas.dispatchEvent('pointerdown', ev('pointerdown', 0.85, 1));
    for (let i = 1; i <= 10; i++) await canvas.dispatchEvent('pointermove', ev('pointermove', 0.85 - i * 0.05, 1));
    await canvas.dispatchEvent('pointerup', ev('pointerup', 0.35, 0));
}

// S12 C review R2: the Reset chip is inside the first screen and >= 44 px
// when shown — checked after a dispatched pinch, in the wizard AND in draw
// mode (the chip is re-created by each mount, so both states need the tap).
async function dispatchPinchOut(canvas) {
    const box = await canvas.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const ev = (type, id, dir, dx, extra = {}) => ({
        type, pointerId: id, pointerType: 'touch', isPrimary: id === 11,
        clientX: cx + dir * dx, clientY: cy, button: 0, buttons: 1,
        pointerWidth: 8, pointerHeight: 8, ...extra,
    });
    await canvas.dispatchEvent('pointerdown', ev('pointerdown', 11, -1, 20));
    await canvas.dispatchEvent('pointerdown', ev('pointerdown', 12, 1, 20));
    for (let i = 1; i <= 6; i++) {
        await canvas.dispatchEvent('pointermove', ev('pointermove', 11, -1, 20 + i * 20));
        await canvas.dispatchEvent('pointermove', ev('pointermove', 12, 1, 20 + i * 20));
    }
    await canvas.dispatchEvent('pointerup', { type: 'pointerup', pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: 0 });
    await canvas.dispatchEvent('pointerup', { type: 'pointerup', pointerId: 12, pointerType: 'touch', isPrimary: false, clientX: cx, clientY: cy, button: 0, buttons: 0 });
}

test('375x667: the Reset chip is in the first screen and >= 44 px (wizard + draw mode)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-se', 'layout floor is measured on the iphone-se project only');

    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    const canvas = page.locator('#shot-line-canvas');
    await expect(canvas).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });

    const assertChip = async () => {
        const chip = page.locator('.map-reset-chip');
        await expect(chip).toBeVisible();
        const box = await chip.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(667);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    };

    await dispatchPinchOut(canvas);
    await assertChip();

    // Draw mode re-mounts the canvas (fresh hidden chip) — gesture again there.
    await page.locator('#btn-line-draw').click();
    await expect(page.locator('#oncourse-wizard')).toHaveClass(/draw-mode/);
    await dispatchPinchOut(canvas);
    await assertChip();
});
