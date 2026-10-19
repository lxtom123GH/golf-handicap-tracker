import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { registerAndVerifySignup, verifyEmulatorEmail, waitForEmulators,
    findDocs, patchDocFields, writeDocFields, readDoc } from '../e2e/helpers/emulator.js';
import { UX_PERSONAS, syntheticRounds } from './ux-fixtures.js';
import { fixedVisualIdentity } from './fixed-identity.js';
import { DENY_EXTERNAL_PROXY } from '../e2e/helpers/e2e-safety.js';
import { PROJECTS, SCREENS } from './capture-contract.mjs';

test('task 017 synthetic full-screen style census', async ({ browser }, testInfo) => {
    test.setTimeout(600_000);
    expect(PROJECTS).toContain(testInfo.project.name);
    // The allowlisted profile resolves inside this checkout's evidence directory.
    const out = resolve('style-evidence', testInfo.project.name);
    // Remove the previous journey, including its success marker, before any await.
    rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
    await waitForEmulators();
    const { browserName, launchOptions, defaultBrowserType, ...contextOptions } = testInfo.project.use;
    const contexts = [], users = new Map(), census = [];
    const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
    const stamp = `style-${testInfo.project.name}`;
    const captured = [];
    async function capture(page, name) {
        expect(SCREENS).toContain(name);
        expect(captured).not.toContain(name);
        await page.bringToFront();
        await page.evaluate(() => window.scrollTo({top:0, left:0, behavior:'instant'}));
        await expect(page.locator('body')).not.toContainText(/Keperra|Ashgrove|Redcliffe|Virginia/);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1100);
        // Chart.js uses canvas/rAF, which screenshot's CSS animation option does not settle.
        // Read the real rendered pixels; never replace, mask or redraw the chart for the test.
        if (await page.locator('#handicap-chart').isVisible()
            && await page.locator('#history-tbody tr').count() >= 3) {
            let previous = '';
            await expect.poll(async () => {
                const rendered = await page.locator('#handicap-chart').evaluate(canvas => {
                    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                    let blue = 0;
                    for (let i = 0; i < bytes.length; i += 4)
                        if (bytes[i+3] > 100 && bytes[i+2] > 150 && bytes[i+2] > bytes[i] + 50) blue++;
                    return { blue, image: canvas.toDataURL() };
                });
                const stable = rendered.blue > 100 && rendered.image === previous;
                previous = rendered.image;
                return stable;
            }, { timeout: 15000, intervals: [250, 250, 500] }).toBe(true);
        }
        await page.screenshot({ path: join(out, `${name}.png`), fullPage: true, scale: 'css', animations: 'disabled' });
        const styles = await page.locator('body *').evaluateAll(nodes => nodes.filter(el => el.getClientRects().length).map(el => {
            const s = getComputedStyle(el);
            return { tag: el.tagName, id: el.id, classes: el.className?.baseVal ?? el.className,
                fontSize: s.fontSize, gap: s.gap, borderRadius: s.borderRadius,
                color: s.color, backgroundColor: s.backgroundColor, padding: s.padding,
                margin: s.margin, fontFamily: s.fontFamily, boxShadow: s.boxShadow };
        }));
        writeFileSync(join(out, `${name}-styles.json`), JSON.stringify(styles, null, 2));
        await page.evaluate(axe);
        const result = await page.evaluate(async () => {
            const scan = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } });
            return { title: document.title, width: innerWidth, scrollWidth: document.scrollingElement.scrollWidth,
                violations: scan.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target:n.target, summary:n.failureSummary })) })),
                incomplete: scan.incomplete.map(v => ({ id:v.id, count:v.nodes.length })) };
        });
        census.push({ name, ...result });
        writeFileSync(join(out, 'census.json'), JSON.stringify(census, null, 2));
        captured.push(name);
    }
    try {
        for (const persona of UX_PERSONAS) {
            const context = await browser.newContext({ ...contextOptions, proxy: DENY_EXTERNAL_PROXY,
                locale: 'en-AU', timezoneId: 'Australia/Brisbane',
                baseURL: `http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}` });
            contexts.push(context);
            const page = await context.newPage();
            page.on('console', msg => { if(msg.type()==='error' && msg.text().includes('[Social] Failed to load feed:')) census.push({name:'feed-read-error',persona:persona.key,code:msg.text().includes('permission')?'permission-denied':'other; see local raw log'}); });
            const email = `test-${persona.key}-${stamp}@example.invalid`;
            const fixedUid = `style-${testInfo.project.name}-${persona.key}`;
            await fixedVisualIdentity(page, {uid:fixedUid, email});
            await page.goto('/');
            if (persona.key === 'player-a') await capture(page, 'auth-login');
            await page.locator('#btn-register').click();
            if (persona.key === 'player-a') await capture(page, 'auth-register');
            await page.locator('#auth-name').fill(persona.name);
            await page.locator('#auth-email').fill(email);
            await page.locator('#auth-password').fill('synthetic-pass-1');
            if (persona.approved === false) {
                await page.getByRole('button', { name: 'Create Account' }).click();
                await expect(page.locator('#auth-pending')).toBeVisible();
                await verifyEmulatorEmail(email);
                await page.locator('#btn-check-email').click();
                await expect(page.locator('#auth-pending-heading')).toHaveText('Account Pending');
                await expect(page.locator('#main-app')).toBeHidden();
            } else await registerAndVerifySignup(page, email);
            let user;
            await expect.poll(async () => {
                [user] = await findDocs('users', 'email', email); return user?._id;
            }).toBeTruthy();
            expect(user._id).toBe(fixedUid);
            users.set(persona.key, { ...user, page });
            if (persona.rounds) {
                // Seed the complete history while the app has no live listener.
                await page.goto('about:blank');
                for (const [i, round] of syntheticRounds(user._id).entries())
                    await writeDocFields(`whs_rounds/ux-${stamp}-${i}`, round);
                expect(await findDocs('whs_rounds', 'uid', user._id)).toHaveLength(26);
                await patchDocFields(`profiles/${user._id}`, {handicapIndex: 18});
                await writeDocFields(`users/${user._id}/private/handicap`, {indexHistory: []});
                await page.goto('/');
                await expect(page.locator('#main-app')).toBeVisible();
                await expect(page.locator('#history-tbody tr')).toHaveCount(26);
                await expect.poll(async () => (await readDoc(`users/${user._id}/private/handicap`))?.indexHistory?.length || 0).toBeGreaterThan(0);
                await expect(page.locator('#handicap-index')).toHaveText(/^[+-]?\d+(?:\.\d+)?$/, {timeout:15000});
            } else if (persona.rounds === 0) {
                expect(await findDocs('whs_rounds', 'uid', user._id)).toHaveLength(0);
            }
            if (persona.coach) {
                await patchDocFields(`users/${user._id}`, { isCoach: true });
                await writeDocFields(`users/${users.get('player-a')._id}`, { coaches: [user._id] });
            }
            if (persona.admin) await patchDocFields(`users/${user._id}`, { isAdmin: true });
            if (persona.approved !== false) {
                await page.reload();
                await expect(page.locator('#main-app')).toBeVisible();
                await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/);
            }
            await capture(page, `${persona.key}-home`);
        }
        const regular = users.get('player-a').page;
        await regular.locator('.tab-btn[data-target="tab-whs"]').click();
        await expect(regular.locator('#handicap-index')).toHaveText(/^[+-]?\d+(?:\.\d+)?$/, { timeout: 15_000 });
        await capture(regular, 'player-a-handicap');
        await regular.locator('.tab-btn[data-target="tab-oncourse"]').click();
        const coach = users.get('coach-d').page;
        await coach.locator('#tab-btn-coach').click();
        await expect(coach.locator('.coach-roster-card').filter({ hasText: 'Test Player A' })).toBeVisible();
        await coach.locator('.tab-btn[data-target="tab-oncourse"]').click();
        await expect(users.get('admin-e').page.locator('#tab-btn-admin')).toBeVisible();
        const pending = (await findDocs('users', 'email', users.get('pending-c').email))[0];
        expect(pending.isApproved).toBe(false);
        writeFileSync(join(out, 'fixture-summary.json'), JSON.stringify({
            project: testInfo.project.name, personas: UX_PERSONAS,
            playerRounds: { total: 26, nine: 0, eighteen: 26 }, coachLinkedToPlayer: true,
            pendingStillUnapproved: true, adminTabVisible: true,
        }, null, 2));
        for (const key of ['player-a', 'player-b', 'coach-d', 'admin-e']) {
            const page = users.get(key).page;
            const targets = await page.locator('.tab-btn').evaluateAll(els => els.filter(e => e.offsetParent !== null).map(e => e.dataset.target));
            for (const target of targets) {
                await page.locator(`.tab-btn[data-target="${target}"]`).click();
                await expect(page.locator(`#${target}`)).toBeVisible();
                await page.waitForTimeout(500);
                await capture(page, `${key}-${target}`);
            }
        }
        await regular.locator('.tab-btn[data-target="tab-whs"]').click();
        const row = regular.locator('#history-tbody tr').first();
        await row.locator('.round-actions > summary').click();
        await capture(regular, 'player-a-history-actions');
        await row.locator('.round-actions > summary').click();
        await regular.locator('.tab-btn[data-target="tab-oncourse"]').click();
        await regular.locator('#btn-oc-log-past-round').click();
        await capture(regular, 'player-a-log-past-round');
        await regular.locator('#btn-close-log-round').click();
        const admin = users.get('admin-e').page;
        await admin.locator('#tab-btn-admin').click();
        const approve = admin.locator('#admin-users-list tr').filter({hasText:users.get('pending-c').email}).locator('input[type=checkbox]').first();
        await expect(approve).toBeAttached();
        census.push({ name:'admin-approve-geometry', box:await approve.boundingBox(), width:admin.viewportSize().width });
        // Capture the baseline problem before Playwright scrolls the native checkbox into view.
        await capture(admin, 'admin-pending-before-approval');
        await approve.check();
        await expect.poll(async () => (await findDocs('users', 'email', users.get('pending-c').email))[0]?.isApproved).toBe(true);
        const pendingPage = users.get('pending-c').page;
        // Baseline has no approval listener/refresh action. Record that gap, then use a real page reload.
        await pendingPage.waitForTimeout(1500);
        census.push({name:'approval-recovery', automaticEntry:await pendingPage.locator('#main-app').isVisible(), recovery:'page reload'});
        await capture(pendingPage, 'pending-c-approved-but-still-pending');
        await pendingPage.reload();
        await expect(pendingPage.locator('#main-app')).toBeVisible();
        await capture(pendingPage, 'pending-c-approved');
        const newbie = users.get('player-b').page;
        await newbie.locator('.tab-btn[data-target="tab-oncourse"]').click();
        await newbie.locator('#btn-mode-simple').click();
        await newbie.locator('#btn-round-9').click();
        await newbie.locator('#oc-course-select').selectOption({label:'Synthetic Nine'});
        await newbie.locator('#oc-tee-select').selectOption('Fixture Tee');
        await newbie.locator('#oc-round-date').fill('2026-01-15');
        await capture(newbie, 'new-player-nine-setup');
        await newbie.locator('#btn-oc-start').click();
        await expect(newbie.locator('#oncourse-hub')).toBeVisible();
        const scorecard = newbie.locator('#oc-group-scores .compact-score-card').first();
        const scores = [5,4,6,3,5,4,5,6,4];
        for (let hole=0; hole<9; hole++) {
            for (let stroke=0; stroke<scores[hole]; stroke++) await scorecard.locator('.btn-grid-plus').click();
            for (let putt=0; putt<2; putt++) await scorecard.locator('.putt-plus').click();
            if (hole===0) await capture(newbie, 'new-player-hole-one-scored');
            if (hole<8) await newbie.locator('#btn-oc-next-hole').click();
        }
        await newbie.locator('#btn-oc-more').click();
        await capture(newbie, 'new-player-round-more');
        await newbie.locator('#btn-oc-finish').click();
        await expect(newbie.locator('#oc-finish-modal')).toBeVisible();
        await capture(newbie, 'new-player-finish-summary');
        await newbie.locator('#btn-oc-save-whs').click();
        await expect(newbie.locator('#locker-room-msg')).toBeVisible();
        await capture(newbie, 'new-player-round-saved');
        await newbie.locator('#btn-post-home').click();
        await expect.poll(async()=> (await findDocs('whs_rounds','uid',users.get('player-b')._id)).length).toBe(1);
        await newbie.locator('.tab-btn[data-target="tab-whs"]').click();
        await capture(newbie, 'new-player-index-after-one-nine');
        await newbie.locator('#history-tbody tr').first().locator('.round-actions > summary').click();
        await capture(newbie, 'new-player-excluded-round-reason');
        writeFileSync(join(out, 'census.json'), JSON.stringify(census, null, 2));
        expect(captured.sort()).toEqual(SCREENS);
        writeFileSync(join(out, 'capture-complete.json'), JSON.stringify({ screens: captured }, null, 2));

    } finally { await Promise.all(contexts.map(c => c.close())); }
});
