// ============================================================================
// cold-start.spec.js — the first-run analytics preview on the iPhone SE floor
// ============================================================================

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup, findDocs, writeDocFields, readDoc } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail('cold-start');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Cold Start E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
    return email;
}

test('first-run analytics show feature-specific unlock progress', async ({ page }) => {
    await registerFreshUser(page);

    await expect(page.locator('#history-tbody tr')).toHaveCount(0);
    await expect(page.locator('#chart-no-data')).toContainText('0 of 3 completed 18-hole scores', { timeout: 20_000 });
    await expect(page.locator('#chart-no-data')).toContainText('What this unlocks');

    await expect(page.locator('#index-explainer')).toContainText('0 of 54 counting holes'); // WHS: 54 holes, not 3 rounds
    await expect(page.locator('#index-explainer')).toContainText('What this unlocks');

    await page.locator('.tab-btn[data-target="tab-insights"]').click();
    await expect(page.locator('#performance-insights')).toBeVisible();
    await expect(page.locator('#performance-insights')).toContainText('0 of 3 rounds with putts logged');
    await expect(page.locator('#performance-insights')).toContainText('What this unlocks');
});

// Synthetic journey, not published-example acceptance evidence.
// Report: PR #17 CI triage (Claude), issuecomment-6167035331.
test('five nines stay locked until the sixth completes the third pair', async ({ page }) => {
    const email = await registerFreshUser(page);
    const [user] = await findDocs('users', 'email', email);
    const originals = [];
    async function seed(i) {
        const path = `whs_rounds/${user._id}-cold-${i}`;
        await writeDocFields(path, { uid: user._id, course: 'Synthetic Nine',
            rating: 36, slope: 113, adjustedGross: 41, holesPlayed: 9,
            date: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
            notCounting: false, visibility: 'private' });
        originals.push({ path, data: await readDoc(path) });
    }
    for (let i = 0; i < 5; i++) await seed(i);
    await expect(page.locator('#chart-no-data')).toContainText('2 of 3 completed 18-hole scores');
    await expect(page.locator('#handicap-index')).toHaveText('—');
    await expect(page.locator('#history-tbody')).toContainText('Pending another nine');
    await seed(5);
    await expect(page.locator('#handicap-index')).toHaveText('8.0');
    await expect(page.locator('#chart-no-data')).toBeHidden();
    await expect(page.locator('#history-tbody')).not.toContainText('Pending another nine');
    await expect.poll(async () => (await readDoc(`profiles/${user._id}`))?.handicapIndex).toBe('8.0');
    await page.reload();
    await expect(page.locator('#handicap-index')).toHaveText('8.0');
    for (const original of originals) expect(await readDoc(original.path)).toEqual(original.data);
});
