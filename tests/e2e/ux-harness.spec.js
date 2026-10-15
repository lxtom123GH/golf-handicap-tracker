import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    seedUxHarnessFixtures, UX_HARNESS_PASSWORD, UX_HARNESS_PERSONAS,
} from './helpers/emulator.js';

test.beforeAll(async () => {
    await seedUxHarnessFixtures();
});

async function capture(page, testInfo, name) {
    const screenshot = await page.screenshot({ fullPage: true });
    const outputDir = fileURLToPath(new URL('../../docs/ux-harness-screenshots/', import.meta.url));
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, `${testInfo.project.name}-${name}.png`), screenshot);
    await testInfo.attach(`ux-${name}`, {
        body: screenshot,
        contentType: 'image/png',
    });
}

async function signIn(page, persona) {
    await page.goto('/');
    await page.locator('#auth-email').fill(persona.email);
    await page.locator('#auth-password').fill(UX_HARNESS_PASSWORD);
    await page.locator('#btn-login').click();
}

test('signed-out demo view', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('#auth-overlay')).toBeVisible();
    await expect(page.locator('#main-app')).toBeHidden();
    await capture(page, testInfo, 'signed-out');
});

test('pending demo account view', async ({ page }, testInfo) => {
    await signIn(page, UX_HARNESS_PERSONAS.pending);
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#auth-pending-heading')).toHaveText('Account Pending');
    await expect(page.locator('#auth-pending-message')).toContainText('waiting for admin approval');
    await expect(page.locator('#btn-check-email')).toBeHidden();
    await expect(page.locator('#btn-resend-verification')).toBeHidden();
    await expect(page.locator('#main-app')).toBeHidden();
    await capture(page, testInfo, 'pending');
});

test('approved player demo view', async ({ page }, testInfo) => {
    await signIn(page, UX_HARNESS_PERSONAS.player);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#tab-btn-coach')).toBeHidden();
    await expect(page.locator('#tab-btn-admin')).toBeHidden();
    await capture(page, testInfo, 'player');
});

test('coach demo view', async ({ page }, testInfo) => {
    await signIn(page, UX_HARNESS_PERSONAS.coach);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#tab-btn-coach')).toBeVisible();
    await expect(page.locator('#tab-btn-admin')).toBeHidden();
    await page.locator('#tab-btn-coach').click();
    await expect(page.locator('#tab-coach')).toBeVisible();
    await capture(page, testInfo, 'coach');
});

test('admin demo view', async ({ page }, testInfo) => {
    await signIn(page, UX_HARNESS_PERSONAS.admin);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#tab-btn-admin')).toBeVisible();
    await page.locator('#tab-btn-admin').click();
    await expect(page.locator('#tab-admin')).toBeVisible();
    await capture(page, testInfo, 'admin');
});
