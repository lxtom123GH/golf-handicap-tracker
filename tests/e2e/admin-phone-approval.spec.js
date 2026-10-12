import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { waitForEmulators, findDocs, verifyEmulatorEmail, patchDocFields,
    registerAndVerifySignup } from './helpers/emulator.js';

async function fillSignup(page, email, name) {
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill(name);
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('synthetic-pass-1');
}

test('admin approves a pending tester without horizontal phone scrolling', async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000);
    await waitForEmulators();
    const key = `${testInfo.project.name}-${Date.now()}`;
    const pendingEmail = `test-pending-${key}@example.invalid`;
    await fillSignup(page, pendingEmail, 'Test Pending C');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#auth-pending')).toBeVisible();
    await verifyEmulatorEmail(pendingEmail);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#auth-pending-heading')).toHaveText('Account Pending');
    await expect(page.locator('#main-app')).toBeHidden();

    const adminContext = await browser.newContext({ viewport: page.viewportSize(),
        baseURL: new URL(page.url()).origin });
    try {
        const admin = await adminContext.newPage();
        const adminEmail = `test-admin-${key}@example.invalid`;
        await fillSignup(admin, adminEmail, 'Test Administrator');
        await registerAndVerifySignup(admin, adminEmail);
        const [user] = await findDocs('users', 'email', adminEmail);
        await patchDocFields(`users/${user._id}`, { isAdmin: true });
        await admin.reload();
        await admin.locator('#tab-btn-admin').click();
        const row = admin.locator('#admin-users-list tr').filter({ hasText: pendingEmail });
        await expect(row).toBeVisible();
        const approve = row.locator('input[type="checkbox"]').first();
        const bounds = await approve.evaluate(el => {
            const r = el.parentElement.getBoundingClientRect();
            return { left: r.left, right: r.right, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, scrollX };
        });
        const out = testInfo.outputPath('admin-phone'); mkdirSync(out, { recursive: true });
        let axe;
        if (process.env.AXE_CORE_PATH) {
            await admin.addScriptTag({ path: process.env.AXE_CORE_PATH });
            axe = await admin.evaluate(() => window.axe.run('#tab-admin',
                { runOnly: { type: 'rule', values: ['label'] } }).then(r => ({ violations: r.violations })));
        }
        await admin.screenshot({ path: join(out, 'pending-before-approval.png'), fullPage: true });
        writeFileSync(join(out, 'measurements.json'), JSON.stringify({ bounds, axe }, null, 2));
        expect(bounds.scrollX).toBe(0);
        expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewport);
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
        await expect(approve).toHaveAccessibleName(/Approve Test Pending C/);
        if (axe) expect(axe.violations).toEqual([]);
        await approve.check();
        await expect.poll(async () => (await findDocs('users', 'email', pendingEmail))[0]?.isApproved).toBe(true);
        await page.reload();
        await expect(page.locator('#main-app')).toBeVisible({ timeout: 25_000 });
        await expect(page.locator('#auth-pending')).toBeHidden();
        await admin.screenshot({ path: join(out, 'approved.png'), fullPage: true });
    } finally { await adminContext.close(); }
});
