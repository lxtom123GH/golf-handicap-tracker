import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAndVerifySignup, verifyEmulatorEmail, waitForEmulators,
    findDocs, patchDocFields, writeDocFields } from './helpers/emulator.js';
import { UX_PERSONAS, syntheticRounds } from './helpers/ux-fixtures.js';
import { DENY_EXTERNAL_PROXY } from './helpers/e2e-safety.js';

test('five synthetic personas support a repeatable local UX session', async ({ browser }, testInfo) => {
    const hold = process.env.UX_HARNESS_HOLD === '1';
    test.setTimeout(hold ? 0 : 180_000);
    await waitForEmulators();
    const { browserName, launchOptions, defaultBrowserType, ...contextOptions } = testInfo.project.use;
    const contexts = [], users = new Map();
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const out = testInfo.outputPath('ux-personas'); mkdirSync(out, { recursive: true });
    try {
        for (const persona of UX_PERSONAS) {
            const context = await browser.newContext({ ...contextOptions, proxy: DENY_EXTERNAL_PROXY,
                locale: 'en-AU', timezoneId: 'Australia/Brisbane',
                baseURL: `http://localhost:${process.env.VITE_PREVIEW_PORT || 4300}` });
            contexts.push(context);
            const page = await context.newPage();
            const email = `test-${persona.key}-${stamp}@example.invalid`;
            await page.goto('/');
            await page.locator('#btn-register').click();
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
            users.set(persona.key, { ...user, page });
            if (persona.rounds) {
                for (const [i, round] of syntheticRounds(user._id).entries())
                    await writeDocFields(`whs_rounds/ux-${stamp}-${i}`, round);
                expect(await findDocs('whs_rounds', 'uid', user._id)).toHaveLength(26);
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
            await page.screenshot({ path: join(out, `${persona.key}-home.png`) });
        }
        const regular = users.get('player-a').page;
        await regular.locator('.tab-btn[data-target="tab-whs"]').click();
        await expect(regular.locator('#handicap-index')).toHaveText(/^[+-]?\d+(?:\.\d+)?$/, { timeout: 15_000 });
        await regular.screenshot({ path: join(out, 'player-a-handicap.png') });
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
            playerRounds: { total: 26, nine: 9, eighteen: 17 }, coachLinkedToPlayer: true,
            pendingStillUnapproved: true, adminTabVisible: true,
        }, null, 2));
        if (hold) {
            console.log('Five demo users ready. Use the separate browser windows; no paid AI calls. Ctrl+C stops everything.');
            await new Promise(() => {});
        }
    } finally { await Promise.all(contexts.map(c => c.close())); }
});
