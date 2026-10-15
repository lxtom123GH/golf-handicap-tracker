// ========================================================================
// Round journeys: score, recover offline, and approve a new user
// ========================================================================
// Emulator-only end-to-end coverage for the core round journeys. Registration fixtures and
// Firestore reads use the existing emulator helper; all journeys go through
// the production UI and Firestore rules.

import { test, expect } from '@playwright/test';
import {
    findDocs,
    readDoc,
    seedHandicapByEmail,
    seedPreapprovedEmail,
    throwawayEmail,
    verifyEmulatorEmail,
    writeDocFields,
} from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
const INDEX = 18;
const WEST_COURSE = 'Keperra – West Course (9 holes)';
const WEST_SCORES = [11, 5, 5, 6, 6, 5, 4, 5, 4];

async function register(page, { email, name }) {
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill(name);
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
}

async function registerApprovedGolfer(page, prefix) {
    const email = throwawayEmail(prefix);
    await seedPreapprovedEmail(email);
    await register(page, { email, name: 'Golden Path Golfer' });
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyEmulatorEmail(email);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    return email;
}

async function startSimpleNine(page, course) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: course });
    await page.locator('#oc-tee-select').selectOption('Blue (Men)');
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#oc-hole-display')).toHaveText('Hole 1');
}

async function scoreHole(page, strokes) {
    const card = page.locator('#oc-group-scores .compact-score-card').first();
    await expect(card.locator('.btn-grid-plus')).toBeVisible();
    // The score handler rebuilds its card after every tap. Send click events to
    // the live button each time in one browser task; Playwright pointer waits
    // for map layout stability on every stroke and makes a nine-hole card take
    // several minutes on this phone profile.
    await page.evaluate((count) => {
        for (let stroke = 0; stroke < count; stroke++) {
            const button = document.querySelector('#oc-group-scores .compact-score-card .btn-grid-plus');
            if (!button) throw new Error('Simple score button disappeared');
            button.click();
        }
    }, strokes);
    await expect(card.locator('.oc-score-value')).toHaveText(String(strokes));
}

async function finishAndSave(page) {
    await page.locator('#btn-oc-more').click();
    await page.locator('#btn-oc-finish').click();
    await expect(page.locator('#oc-finish-modal')).toBeVisible({ timeout: 10_000 });
    await page.locator('#btn-oc-save-whs').click();
    await expect(page.locator('#locker-room-msg')).toHaveText('Round Saved Successfully', { timeout: 15_000 });
}

async function savedRounds(email) {
    const [user] = await findDocs('users', 'email', email);
    if (!user) return [];
    return findDocs('whs_rounds', 'uid', user._id);
}

test('Simple nine-hole round is saved once and its differential appears in history', async ({ page }) => {
    test.setTimeout(240_000);
    const email = await registerApprovedGolfer(page, 'golden-score');
    await seedHandicapByEmail(email, INDEX);
    await startSimpleNine(page, WEST_COURSE);

    for (let i = 0; i < WEST_SCORES.length; i++) {
        await expect(page.locator('#oc-hole-display')).toHaveText(`Hole ${i + 1}`);
        await scoreHole(page, WEST_SCORES[i]);
        if (i < WEST_SCORES.length - 1) await page.locator('#btn-oc-next-hole').click();
    }

    await finishAndSave(page);
    await expect.poll(async () => (await savedRounds(email)).length, { timeout: 45_000 }).toBe(1);
    const [saved] = await savedRounds(email);
    expect(saved.holesPlayed).toBe(9);
    expect(saved.totalGross).toBe(51);
    expect(saved.adjustedGross).toBe(47);
    expect(saved.notCounting).toBe(false);
    expect(saved.holeScores.map(hole => hole.gross)).toEqual(WEST_SCORES);

    // With the seeded starting index of 18, the nine-hole WHS differential is
    // (47 - 35) × 113 / 131 + (0.52 × 18 + 1.2) = 20.9.
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    const row = page.locator('#history-tbody tr').filter({ hasText: WEST_COURSE });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(row.locator('td').nth(2)).toContainText('47');
    await expect(row.locator('td').nth(3)).toContainText('20.9');
});

test('Simple nine-hole round keeps offline strokes and syncs one complete round after reconnect', async ({ page, context }) => {
    test.setTimeout(240_000);
    const email = await registerApprovedGolfer(page, 'golden-offline');
    await seedHandicapByEmail(email, INDEX);
    const course = 'Keperra – Old Course (9 holes)';
    const scores = [6, 5, 5, 4, 6, 4, 5, 4, 6];
    await startSimpleNine(page, course);

    for (let i = 0; i < scores.length; i++) {
        await expect(page.locator('#oc-hole-display')).toHaveText(`Hole ${i + 1}`);
        if (i === 3) await context.setOffline(true);
        await scoreHole(page, scores[i]);
        if (i === 3) {
            await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
            await context.setOffline(false);
            await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
            await expect(page.locator('#oc-group-scores .compact-score-card').first().locator('.oc-score-value'))
                .toHaveText(String(scores[i]));
        }
        if (i < scores.length - 1) await page.locator('#btn-oc-next-hole').click();
    }

    await finishAndSave(page);
    await expect.poll(async () => (await savedRounds(email)).length, { timeout: 45_000 }).toBe(1);
    const rounds = await savedRounds(email);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].holesPlayed).toBe(9);
    expect(rounds[0].totalGross).toBe(scores.reduce((sum, strokes) => sum + strokes, 0));
    expect(rounds[0].holeScores.map(hole => hole.gross)).toEqual(scores);
    expect(rounds[0].holeScores.map(hole => hole.h)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('new user waits for an admin to approve the account, then enters the app', async ({ page, browser, baseURL }) => {
    const adminContext = await browser.newContext({ baseURL });
    const adminPage = await adminContext.newPage();

    try {
        const adminEmail = await registerApprovedGolfer(adminPage, 'golden-admin');
        await expect.poll(async () => (await findDocs('users', 'email', adminEmail)).length, { timeout: 15_000 }).toBe(1);
        const [admin] = await findDocs('users', 'email', adminEmail);

        // Create an admin fixture with the emulator's admin REST capability;
        // the actual approval of the pending user is performed in admin.js.
        await writeDocFields(`users/${admin._id}`, { isAdmin: true });
        await adminPage.reload();
        await expect(adminPage.locator('#main-app')).toBeVisible({ timeout: 20_000 });
        await expect(adminPage.locator('#tab-btn-admin')).toBeVisible();

        const pendingEmail = throwawayEmail('golden-pending');
        await register(page, { email: pendingEmail, name: 'Pending E2E Golfer' });
        await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('#main-app')).toBeHidden();
        await expect.poll(async () => (await findDocs('users', 'email', pendingEmail)).length, { timeout: 15_000 }).toBe(1);
        const [pending] = await findDocs('users', 'email', pendingEmail);
        expect(pending).toBeTruthy();
        expect(pending.isApproved).toBe(false);

        // Isolate admin approval from email verification: a verified account
        // without an invite must still be denied entry until the admin acts.
        expect(await verifyEmulatorEmail(pendingEmail)).toBe(pending._id);
        await page.locator('#btn-check-email').click();
        await expect(page.locator('#auth-pending-heading')).toHaveText('Account Pending');
        await expect(page.locator('#auth-pending-message')).toContainText('waiting for admin approval');
        await expect(page.locator('#auth-pending')).toBeVisible();
        await expect(page.locator('#main-app')).toBeHidden();
        expect((await readDoc(`users/${pending._id}`)).isApproved).toBe(false);

        await adminPage.locator('#tab-btn-admin').click();
        const pendingRow = adminPage.locator('#admin-users-list tr').filter({ hasText: pendingEmail });
        await expect(pendingRow).toHaveCount(1, { timeout: 15_000 });
        const approval = pendingRow.locator('input[type="checkbox"]').first();
        await expect(approval).not.toBeChecked();
        await approval.check();
        await expect.poll(async () => (await readDoc(`users/${pending._id}`))?.isApproved, { timeout: 15_000 }).toBe(true);

        // Recheck the same verified account after the admin grants access.
        await page.reload();
        await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('#auth-pending')).toBeHidden();
        await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
        await expect(page.locator('#oncourse-setup')).toBeVisible();
    } finally {
        await adminContext.close();
    }
});
