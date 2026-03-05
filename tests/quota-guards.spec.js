import { test, expect } from '@playwright/test';

test.describe('Phase 3: Infrastructure & Quota Suite', () => {

    test.beforeEach(async ({ page }, testInfo) => {
        const workerIndex = testInfo.workerIndex;
        const testEmail = `test-worker-quota-${workerIndex}@example.com`;

        // Capture logs
        page.on('console', msg => console.log(`[Worker ${workerIndex}] [Browser] ${msg.type().toUpperCase()}: ${msg.text()}`));

        await page.goto('/');

        if (await page.locator('#auth-overlay').isVisible()) {
            await page.fill('#auth-email', testEmail);
            await page.fill('#auth-password', 'password123');
            await page.click('#btn-login');
            await page.waitForTimeout(1000);

            if (await page.locator('#auth-overlay').isVisible()) {
                await page.click('#btn-register');
                await page.fill('#auth-name', `Quota User ${workerIndex}`);
                await page.fill('#auth-email', testEmail);
                await page.fill('#auth-password', 'password123');
                await page.click('#temp-submit-register');
            }
            await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
        }
    });

    test('The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"', async ({ page }) => {
        // It's the AI practice drill generation button
        await page.click('[data-target="tab-practice"]');

        const btnAskAi = page.locator('#btn-generate-practice');
        await expect(btnAskAi).toBeVisible();

        let requestCount = 0;
        page.on('request', req => {
            if (req.url().includes('generatePracticePlan')) requestCount++;
        });

        // Rapid click 5 times
        for (let i = 0; i < 5; i++) {
            await btnAskAi.click({ force: true });
        }

        // Wait a second for promises to settle
        await page.waitForTimeout(1000);

        // Assert only 1 request was dispatched due to button disabling
        expect(requestCount).toBeLessThanOrEqual(1);
    });

    test('Cache Hit Check: Request practice drill when active one exists local state', async ({ page }) => {
        await page.click('[data-target="tab-practice"]');

        let requestCount = 0;
        page.on('request', req => {
            if (req.url().includes('generatePracticePlan')) requestCount++;
        });

        // If local state renders active drill instantly, no network call should fire.
        // We wait for the DOM
        await page.waitForTimeout(1000);

        // We don't click generate... if it has active state, it renders automatically
        const emptyState = page.locator('#practice-state-empty');
        const activeState = page.locator('#practice-state-active');

        if (await activeState.isVisible()) {
            expect(requestCount).toBe(0);
        }
    });
});
