import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { registerAndVerifySignup, findDocs, patchDocFields } from './helpers/emulator.js';

// These tests use only the demo emulator, with fictional accounts. They never
// exercise AI buttons or change the production admission/visibility policy.
function output(info) {
    const dir = join('accessibility-evidence', info.project.name);
    mkdirSync(dir, { recursive: true });
    return dir;
}

test('registration remains reachable above the emulator warning', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/);
    await page.locator('#btn-register').click();
    const back = page.locator('#link-back-login');
    await back.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output(info), 'registration.png') });
    const hit = await back.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    expect(hit, 'Back to Login must receive an actual pointer hit').toBe(true);
    await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('#auth-overlay .auth-card *')]
            .map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
        for (const [el, size] of sizes) el.style.fontSize = `${size * 2}px`;
    });
    await back.scrollIntoViewIfNeeded();
    const card = await page.locator('#auth-overlay .auth-card').boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    await page.screenshot({ path: join(output(info), 'registration-text-200.png') });
    await back.click();
    await expect(page.locator('#register-fields')).toBeHidden();
    await expect(page.locator('.firebase-emulator-warning')).toBeVisible();
});

test('secondary content contrast and Feed reflow remain usable', async ({ page }, info) => {
    test.setTimeout(180_000);
    const email = `accessibility-${info.project.name}-${Date.now()}@example.invalid`;
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Test Accessibility Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('synthetic-pass-1');
    await registerAndVerifySignup(page, email);
    const require = createRequire(import.meta.url);
    const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    await page.locator('.tab-btn[data-target="tab-feed"]').click();
    await expect(page.locator('#feed-activity-list')).toContainText(/Error loading activity|Follow some players/);
    await page.evaluate(axe);
    const playerScan = await page.evaluate(async () => {
        const r = await window.axe.run('#tab-feed', { runOnly: { type: 'rule', values: ['color-contrast'] } });
        return { target: 'nonadmin-feed', violations: r.violations, incomplete: r.incomplete };
    });
    expect.soft(playerScan.violations, 'Feed error or empty state must remain readable').toEqual([]);
    const [user] = await findDocs('users', 'email', email);
    await patchDocFields(`users/${user._id}`, { isCoach: true, isAdmin: true });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible();
    await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/);
    await page.evaluate(axe);
    const scans = [playerScan];
    const clippedLabels = await page.evaluate(() => {
        const labels = [...document.querySelectorAll('.tab-btn .tab-lbl')]
            .filter(el => el.getClientRects().length);
        const original = labels.map(el => [el, el.style.fontSize, parseFloat(getComputedStyle(el).fontSize)]);
        for (const [el, , size] of original) el.style.fontSize = `${size * 2}px`;
        const clipped = labels.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent);
        for (const [el, inline] of original) el.style.fontSize = inline;
        return clipped;
    });
    expect.soft(clippedLabels, '200% navigation labels remain complete in the scrollable row').toEqual([]);
    // Scope only the remaining contrast work. PR #1 owns header-version,
    // viewport and mode hints; task099 owns admin inputs; task100 owns scoring.
    for (const target of ['tab-practice', 'tab-insights', 'tab-feed']) {
        await page.locator(`.tab-btn[data-target="${target}"]`).click();
        await expect(page.locator(`#${target}`)).toBeVisible();
        await page.waitForTimeout(400);
        const result = await page.evaluate(async target => {
            const r = await window.axe.run({ include: [[`#${target}`], ['#tab-btn-coach'], ['#tab-btn-admin']] },
                { runOnly: { type: 'rule', values: ['color-contrast'] } });
            return { target, violations: r.violations, incomplete: r.incomplete };
        }, target);
        scans.push(result);
        await page.screenshot({ path: join(output(info), `${target}.png`), fullPage: true });
        expect.soft(result.violations, `${target} readable secondary content`).toEqual([]);
    }
    writeFileSync(join(output(info), 'contrast.json'), JSON.stringify(scans, null, 2));
    for (const scale of [1, 2]) {
        // Double every computed font size, including px-sized labels, rather
        // than pretending root rem scaling covers inline pixel declarations.
        if (scale === 2) await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('#tab-feed *')]
                .map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
            for (const [el, size] of sizes) el.style.fontSize = `${size * 2}px`;
        });
        const cards = await page.locator('#tab-feed .card:visible').evaluateAll(els =>
            els.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
        for (const card of cards) {
            expect.soft(card.left, `Feed left at ${scale * 100}% text`).toBeGreaterThanOrEqual(0);
            expect.soft(card.right, `Feed right at ${scale * 100}% text`).toBeLessThanOrEqual(page.viewportSize().width + 1);
        }
        await page.screenshot({ path: join(output(info), `feed-text-${scale * 100}.png`), fullPage: true });
        await page.locator('#feed-search-input').fill('Synthetic golfer');
        await page.locator('#feed-search-input').focus();
        await page.keyboard.press('Tab');
        await expect(page.locator('#btn-feed-search')).toBeFocused();
    }
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible();
    await page.locator('#oc-group-scores .compact-score-card').first().locator('.btn-grid-plus').click();
    await page.locator('#btn-oc-more').click();
    for (const ids of [['#btn-oc-finish'], ['#btn-oc-finish-close', '#btn-oc-save-whs']]) {
        for (const id of ids) await expect(page.locator(id)).toBeVisible();
        const scan = await page.evaluate(async ids => {
            const r = await window.axe.run({ include: ids.map(id => [id]) },
                { runOnly: { type: 'rule', values: ['color-contrast-enhanced'] } });
            return { target: ids.join(','), violations: r.violations, incomplete: r.incomplete };
        }, ids);
        scans.push(scan);
        expect.soft(scan.violations, 'Finish/save controls meet enhanced text contrast').toEqual([]);
        if (ids.length === 1) await page.locator('#btn-oc-finish').click();
    }
    await page.screenshot({ path: join(output(info), 'finish-contrast.png'), fullPage: true });
    await page.locator('#btn-oc-finish-close').click();
    await expect(page.locator('#oc-finish-modal')).toBeHidden();
    writeFileSync(join(output(info), 'contrast.json'), JSON.stringify(scans, null, 2));
});
