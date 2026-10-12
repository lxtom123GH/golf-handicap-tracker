// The dated Handicap Index history is private: the app stores it in
// users/{uid}/private/handicap, and profiles/{uid} (readable by every signed-in
// user) keeps only the current handicapIndex. A profile still carrying the
// legacy indexHistory has it moved across on the next publish.
//
// Reads back what the app actually wrote (admin REST), since a green UI does
// not prove the stored schema.

import { test, expect } from '@playwright/test';
import {
    seedPreapprovedEmail,
    throwawayEmail,
    findDocs,
    readDoc,
    writeDocFields,
    registerAndVerifySignup,
} from './helpers/emulator.js';

async function registerFreshUser(page) {
    const email = throwawayEmail('private-hi');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('History Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);
    let user;
    for (let i = 0; i < 50 && !user; i++) {
        [user] = await findDocs('users', 'email', email);
        if (!user) await new Promise(r => setTimeout(r, 100));
    }
    if (!user) throw new Error(`no users doc for ${email}`);
    return user._id;
}

test('a published index lands in the private history; a legacy profile history moves across', async ({ page }) => {
    const uid = await registerFreshUser(page);
    // A profile from before the move: history on the public doc.
    const legacyDate = new Date(Date.now() - 30 * 86400_000).toISOString();
    await writeDocFields(`profiles/${uid}`, { handicapIndex: '25.0', indexHistory: [{ date: legacyDate, index: '25.0' }] });

    // Three 18s on CR 72 / SR 113 (differentials 18, 19, 20): index 16.0.
    for (const [i, ags] of [90, 91, 92].entries()) {
        await writeDocFields(`whs_rounds/e2e-${uid}-${i}`, {
            uid, course: 'E2E Links', rating: 72, slope: 113, adjustedGross: ags, holesPlayed: 18,
            notCounting: false, visibility: 'private', date: new Date(Date.now() - (i + 1) * 86400_000)
        });
    }
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(page.locator('#handicap-index')).toHaveText('16.0', { timeout: 20_000 });

    // The publish and the legacy strip are fire-and-forget: poll.
    let priv = null, profile = null;
    await expect.poll(async () => {
        priv = await readDoc(`users/${uid}/private/handicap`);
        profile = await readDoc(`profiles/${uid}`);
        return JSON.stringify({
            history: priv?.indexHistory?.map(e => e.index) ?? null,
            legacy: profile && 'indexHistory' in profile,
            hi: profile?.handicapIndex ?? null
        });
    }, { timeout: 20_000 }).toBe(JSON.stringify({ history: ['25.0', '16.0'], legacy: false, hi: '16.0' }));
    expect(priv.indexHistory[0].date).toBe(legacyDate);
    console.log(`[private-index-history] private=${JSON.stringify(priv.indexHistory)} profileKeys=${Object.keys(profile).join(',')}`);
});
