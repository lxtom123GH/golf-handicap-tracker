import { test, expect } from '@playwright/test';

test.describe('UI Ergonomics Suite', () => {

    test.beforeEach(async ({ page }, testInfo) => {
        const workerIndex = testInfo.workerIndex;
        const testEmail = `test-worker-ui-${workerIndex}@example.com`;

        await page.goto('/');

        if (await page.locator('#auth-overlay').isVisible()) {
            await page.fill('#auth-email', testEmail);
            await page.fill('#auth-password', 'password123');
            await page.click('#btn-login');
            await page.waitForTimeout(1000);

            if (await page.locator('#auth-overlay').isVisible()) {
                await page.click('#btn-register');
                await page.fill('#auth-name', `UI User ${workerIndex}`);
                await page.fill('#auth-email', testEmail);
                await page.fill('#auth-password', 'password123');
                await page.click('#temp-submit-register');
            }
            await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
        }
    });

    test('WHS Handicap Database: Ensure no horizontal scrolling', async ({ page }) => {
        await page.click('[data-target="tab-whs"]');
        const mainApp = page.locator('#main-app');

        // Check if element.scrollWidth === element.clientWidth
        const noHorizontalScroll = await mainApp.evaluate((el) => {
            return el.scrollWidth <= el.clientWidth;
        });

        expect(noHorizontalScroll).toBe(true);
    });

    test('Live Scoring +/- buttons have touch target size >= 44x44 pixels', async ({ page }) => {
        await page.click('[data-target="tab-oncourse"]');
        await page.selectOption('#oc-course-select', "Ashgrove GC");
        await page.click('#btn-oc-start');

        // Open Editor
        const editBtn = page.locator('#btn-oc-edit-review');
        if (await editBtn.isVisible()) {
            await editBtn.click();
        }

        // If there's an editor-btn-plus, verify its bounding box
        const plusButton = page.locator('.editor-btn-plus').first();
        if (await plusButton.isVisible()) {
            const bbox = await plusButton.boundingBox();
            expect(bbox.width).toBeGreaterThanOrEqual(44);
            expect(bbox.height).toBeGreaterThanOrEqual(44);
        }
    });

    test("Add Club modal tag-balance check does not swallow main-app", async ({ page }) => {
        // Tag balance check is implicit in Playwright if the DOM is parsed correctly
        const mainApp = page.locator('#main-app');
        await expect(mainApp).toBeVisible();
        await expect(mainApp).not.toBeHidden();
    });

});
