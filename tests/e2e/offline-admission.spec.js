// Offline shell availability must not bypass the existing admission gates.
import { test, expect } from '@playwright/test';
import { findDocs, patchDocFields, verifyEmulatorEmail, waitForEmulators,
    PROJECT_ID, FIRESTORE_PORT } from './helpers/emulator.js';

for (const state of ['approval-false', 'approval-missing', 'email-unverified']) {
    test(`offline reload never admits an unapproved or unverified account: ${state}`, async ({ page, context }, testInfo) => {
        test.setTimeout(120_000);
        await waitForEmulators();
        const email = `test-pending-${state}-${testInfo.project.name}-${Date.now()}@example.invalid`;
        await page.goto('/');
        await page.locator('#btn-register').click();
        await page.locator('#auth-name').fill('Test Pending');
        await page.locator('#auth-email').fill(email);
        await page.locator('#auth-password').fill('synthetic-pass-1');
        await page.getByRole('button', { name: 'Create Account' }).click();
        await expect(page.locator('#auth-pending')).toBeVisible();
        let user;
        await expect.poll(async () => {
            [user] = await findDocs('users', 'email', email);
            return user?._id;
        }).toBeTruthy();
        if (state === 'approval-missing') {
            // Delete only the approval field, strictly on the local demo emulator.
            const url = `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${user._id}?updateMask.fieldPaths=isApproved`;
            const result = await fetch(url, { method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
                body: JSON.stringify({ fields: {} }) });
            expect(result.ok).toBe(true);
        } else await patchDocFields(`users/${user._id}`, { isApproved: state === 'email-unverified' });
        if (state !== 'email-unverified') {
            await verifyEmulatorEmail(email);
            await page.locator('#btn-check-email').click();
            await expect(page.locator('#auth-pending-heading')).toHaveText('Account Pending');
        }
        await expect(page.locator('#main-app')).toBeHidden();
        await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        });
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/, { timeout: 30_000 });
        // Existing offline gate may return to Login if the user doc cannot be
        // read; either outcome must fail closed, never expose the app.
        await expect(page.locator('#auth-pending:visible, #auth-overlay:visible')).toHaveCount(1);
        await expect(page.locator('#main-app')).toBeHidden();
        if (state === 'email-unverified') await expect(page.locator('#auth-pending-heading'))
            .toHaveText('Check your inbox to finish joining');
        await context.setOffline(false);
    });
}
