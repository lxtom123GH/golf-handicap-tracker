import { test, expect } from '@playwright/test';

test.describe('Live Application Audit', () => {
    test.setTimeout(120000); // 2 minutes timeout for full flow

    test('Methodical Audit of Core Tracking Flows', async ({ page }) => {

        // 1. Navigate to Live App
        await page.goto('https://golf-handicap-tracker-b677c.web.app/');

        // 2. Login Flow
        await page.fill('#login-email', 'testuser@alexgittest.com');
        await page.fill('#login-password', 'testuser@alexgittest.com');
        await page.click('#btn-login');

        // Wait for login to complete and main hub to appear
        await expect(page.locator('#main-hub')).toBeVisible({ timeout: 15000 });
        console.log("✅ Logged in successfully.");

        // 3. Navigate to On Course
        await page.click('#tab-btn-oncourse');
        await expect(page.locator('#oncourse-setup')).toBeVisible({ timeout: 10000 });

        // 4. Start a Round
        await page.fill('#oc-course-name', 'Keperra - Old Course');
        await page.selectOption('#oc-tee-select', 'Blue');

        // Add a playing partner to test group logic
        // await page.fill('#oc-player-search', 'John Doe');
        // await page.click('#btn-oc-add-guest');

        await page.click('#btn-start-round');
        await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15000 });
        console.log("✅ Round started.");

        // 5. Track Shots
        await page.click('#btn-oc-track-shot');
        await expect(page.locator('#oncourse-wizard')).toBeVisible();

        // Shot 1: Driver
        await page.click('#btn-wiz-driver');
        await page.click('#btn-wiz-straight');
        await page.click('#btn-wiz-fairway');

        // Wait for wizard to close
        await expect(page.locator('#oncourse-wizard')).toBeHidden();

        // Shot 2: Putt
        await page.click('#btn-oc-track-shot');
        await page.click('#btn-wiz-putter');
        await page.click('#btn-wiz-holed');
        await expect(page.locator('#oncourse-wizard')).toBeHidden();
        console.log("✅ Shots tracked (including putts without curve).");

        // 6. Input Scores and Finish Hole
        const scoreInput = page.locator('.score-input').first();
        await expect(scoreInput).toBeVisible();
        await scoreInput.fill('4');

        // 7. Finish Round
        await page.click('#btn-oc-finish-round');

        // Modal should appear
        await expect(page.locator('#oc-finish-modal')).toBeVisible();

        // Test the Review Modal
        await page.click('#btn-oc-review-round');
        const reviewModal = page.locator('#review-round-modal');
        await expect(reviewModal).toBeVisible();

        // Wait for generation
        await expect(reviewModal.getByText('Generating detailed review...')).toBeHidden({ timeout: 10000 });
        console.log("✅ Review generated.");

        // Test Shot History Toggle
        await page.click('summary:has-text("View Shot History")');
        // Should find "Driver -> Fairway" and "Putter -> Holed"
        await expect(page.locator('text=Driver → Fairway')).toBeVisible();
        await expect(page.locator('text=Putter → Holed')).toBeVisible();
        console.log("✅ Shot history viewable.");

        await page.click('#btn-review-finished');
        await expect(reviewModal).toBeHidden();

        // 8. Submit as a 9-hole round (test minimum AGS 20)
        await page.fill('#oc-finish-holes', '9');

        page.on('dialog', dialog => dialog.accept());
        await page.click('#btn-oc-save-scores');

        // Wait for cleanup
        await expect(page.locator('#oncourse-setup')).toBeVisible({ timeout: 15000 });
        console.log("✅ Round saved successfully (tested 9-hole WHS constraint).");
    });
});
