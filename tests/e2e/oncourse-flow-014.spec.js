import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedPreapprovedEmail, registerAndVerifySignup, findDocs } from './helpers/emulator.js';

test('nine synthetic holes: timing, correction, interruption and saved readback', async ({ page: initialPage, context }, info) => {
    let page = initialPage;
    test.setTimeout(180_000);
    const out = join('oncourse-evidence', info.project.name);
    mkdirSync(out, { recursive: true });
    const result = { project: info.project.name, timings: [], checks: {}, synthetic: true };
    const save = () => writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2));
    const email = `test-flow-${info.project.name}-${Date.now()}@example.invalid`;
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Synthetic Player');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('synthetic-pass-1');
    await registerAndVerifySignup(page, email);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption('Custom Course');
    await page.locator('#oc-custom-course-name').fill('Synthetic Nine');
    await page.locator('#oc-stat-par').fill('36');
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible();
    const scores = [5,4,6,3,5,4,5,6,4];
    const card = () => page.locator('#oc-group-scores .compact-score-card').first();
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state')));
    for (let h = 0; h < scores.length; h++) {
        const started = performance.now();
        let taps = 0;
        const tap = async selector => { await page.locator(selector).click(); taps++; };
        for (let s = 0; s < scores[h] + (h === 2 ? 1 : 0); s++)
            await tap('#oc-group-scores .compact-score-card:first-child .btn-grid-plus');
        if (h === 2) await tap('#oc-group-scores .compact-score-card:first-child .btn-grid-minus');
        for (let p = 0; p < 2; p++) await tap('#oc-group-scores .compact-score-card:first-child .putt-plus');
        await expect(card().locator('.oc-score-value')).toHaveText(String(scores[h]));
        if (h < 8) await tap('#btn-oc-next-hole');
        result.timings.push({ hole: h + 1, taps, robotMilliseconds: Math.round(performance.now() - started), correction: h === 2 });
        save();
        if (h === 1) {
            const before = await snapshot();
            await page.reload();
            await expect(page.locator('#oncourse-hub')).toBeVisible();
            expect(await snapshot()).toEqual(before);
            result.checks.onlineReload = 'exact round state retained';
        }
        if (h === 3) {
            const before = await snapshot();
            await context.setOffline(true);
            await page.reload();
            const recovered = await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/, { timeout: 12000 }).then(() => true, () => false);
            result.checks.warmOfflineReload = recovered;
            await context.setOffline(false);
            expect(recovered, 'the warmed offline application shell must recover before reconnect').toBe(true);
            await expect(page.locator('#oncourse-hub')).toBeVisible();
            expect(await snapshot()).toEqual(before);
            result.checks.networkReturn = 'exact round state retained';
        }
        if (h === 5) {
            const before = await snapshot();
            const devtools = await context.newCDPSession(page);
            const crashed = page.waitForEvent('crash');
            const request = devtools.send('Page.crash').catch(() => {});
            await crashed;
            await page.close();
            page = await context.newPage();
            await page.goto('/');
            await expect(page.locator('#oncourse-hub')).toBeVisible();
            expect(await snapshot()).toEqual(before);
            result.checks.rendererCrashReopen = 'exact round state retained in a new page, same browser context';
            await request;
        }
    }
    await page.locator('#btn-oc-more').click();
    result.checks.simpleModeWakeToggleVisible = await page.locator('#oc-more-sheet .wakelock-toggle').isVisible();
    await page.screenshot({ path: join(out, 'simple-round-options.png') });
    await page.locator('#btn-oc-finish').click();
    await expect(page.locator('#oc-finish-modal')).toBeVisible();
    await expect(page.locator('#sum-total-shots')).toContainText('42');
    await page.screenshot({ path: join(out, 'finish.png') });
    await page.locator('#btn-oc-save-whs').click();
    await expect(page.locator('#locker-room-msg')).toBeVisible();
    const [user] = await findDocs('users', 'email', email);
    let rounds;
    await expect.poll(async () => { rounds = await findDocs('whs_rounds', 'uid', user._id); return rounds.length; }).toBe(1);
    expect(rounds[0]).toMatchObject({ totalGross: 42, holesPlayed: 9, totalPutts: 18 });
    expect(rounds[0].holeScores.map(hole => hole.gross)).toEqual(scores);
    result.checks.savedRound = rounds.map(({ _id, uid, playerName, ...round }) => round);
    result.totalScoringTaps = result.timings.reduce((n, h) => n + h.taps, 0);
    save();
});

test('Simple mode keep-awake honours Off and newer On after delayed browser responses', async ({ page }, info) => {
    const out = join('oncourse-evidence', info.project.name); mkdirSync(out, { recursive: true });
    await page.addInitScript(() => {
        window.__wakeRequests = [];
        window.__wakeLocks = [];
        Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
            request: () => new Promise(resolve => window.__wakeRequests.push(resolve)),
        } });
        window.__grantWake = index => {
            const sentinel = new EventTarget();
            sentinel.released = false;
            sentinel.release = async () => { sentinel.released = true; sentinel.dispatchEvent(new Event('release')); };
            window.__wakeLocks[index] = sentinel;
            window.__wakeRequests[index](sentinel);
        };
    });
    const email = `test-wake-${info.project.name}-${Date.now()}@example.invalid`;
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Synthetic Wake Player');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('synthetic-pass-1');
    await registerAndVerifySignup(page, email);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption('Custom Course');
    await page.locator('#oc-custom-course-name').fill('Synthetic Nine');
    await page.locator('#oc-stat-par').fill('36');
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible();
    await page.locator('#btn-oc-more').click();
    const toggle = page.locator('#oc-more-sheet .wakelock-toggle');
    await toggle.click(); await toggle.click();
    await page.evaluate(() => window.__grantWake(0));
    await page.screenshot({ path: join(out, 'wake-off-late-grant.png') });
    await expect.poll(() => page.evaluate(() => window.__wakeLocks[0].released)).toBe(true);
    await expect(toggle).toContainText('Off');
    expect(await page.evaluate(() => localStorage.getItem('golf.keepAwake'))).toBeNull();
    await toggle.click(); await toggle.click(); await toggle.click();
    await page.evaluate(() => window.__grantWake(2));
    await expect(toggle).toContainText('On');
    await page.evaluate(() => window.__grantWake(1));
    await expect.poll(() => page.evaluate(() => window.__wakeLocks[1].released)).toBe(true);
    expect(await page.evaluate(() => window.__wakeLocks[2].released)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('golf.keepAwake'))).toBe('1');
    await page.screenshot({ path: join(out, 'wake-latest-choice.png') });
    await toggle.click();
    await expect.poll(() => page.evaluate(() => window.__wakeLocks[2].released)).toBe(true);
    await expect(toggle).toContainText('Off');
});
