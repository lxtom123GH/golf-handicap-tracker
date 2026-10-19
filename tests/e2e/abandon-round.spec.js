// ==========================================================================
// abandon-round.spec.js — simplify C21: ⋯ → ✕ Abandon deletes the round's
// shots ONLINE, for an ordinary (non-admin) golfer.
// ==========================================================================
// Review P1 (PR #245): the shot deletes used to share one writeBatch with a
// delete of whs_rounds/<round>_<uid>. That doc doesn't exist for an unsaved
// round, the whs_rounds delete rule reads resource.data.uid (null resource →
// denied for non-admins), and a batch is all-or-nothing — so the shots were
// never deleted. Admins passed via isAdmin(), which hid it. This spec runs as
// a freshly registered, non-admin user against the Firestore emulator (rules
// enforced) and reads back with an admin REST query.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, findDocs, registerAndVerifySignup, pinLegacyShotEntry } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail('abandon');
    await seedPreapprovedEmail(email);
    await pinLegacyShotEntry(page);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Abandon Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
}

async function startDetailedRound(page) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
}

const activeRoundId = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state') || 'null')?.activeRoundId);

/** Poll the emulator (admin read) until `pred(shots)` holds or ~10 s pass. */
async function shotsOf(roundId, pred) {
    let shots = [];
    for (let i = 0; i < 40; i++) {
        shots = await findDocs('shots', 'roundId', roundId);
        if (pred(shots)) break;
        await new Promise(r => setTimeout(r, 250));
    }
    return shots;
}

test('⋯ Abandon deletes the round\'s shots on the server (non-admin golfer)', async ({ page }) => {
    await registerFreshUser(page);
    await startDetailedRound(page);

    // Log shot 1 (the wizard opens on hole 1 in Detailed mode).
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i }).first()).toBeVisible();

    const roundId = await activeRoundId(page);
    expect(roundId).toBeTruthy();
    const before = await shotsOf(roundId, s => s.length > 0);
    expect(before.length, 'the logged shot reached the server').toBeGreaterThan(0);

    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    page.once('dialog', d => d.accept());
    await page.locator('#btn-oc-more').click();
    await page.locator('#btn-oc-exit').click();
    await expect(page.locator('#oncourse-setup')).toBeVisible({ timeout: 10_000 });

    const after = await shotsOf(roundId, s => s.length === 0);
    console.log(`abandon: shots before=${before.length} after=${after.length}`);
    expect(after, 'the abandoned round\'s shots are deleted').toHaveLength(0);
    expect(errors.filter(e => /Discard sync failed/.test(e))).toEqual([]);
});

// Review P3: a double-tap on ✕ Abandon asked twice.
test('a double-tap on ✕ Abandon asks once', async ({ page }) => {
    await registerFreshUser(page);
    await startDetailedRound(page);
    await page.locator('#btn-wizard-cancel').click();

    let prompts = 0;
    page.on('dialog', d => { prompts++; d.accept(); });
    await page.locator('#btn-oc-more').click();
    await page.evaluate(() => {
        const b = document.getElementById('btn-oc-exit');
        b.click();
        b.click();
    });
    await expect(page.locator('#oncourse-setup')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    expect(prompts).toBe(1);
});
