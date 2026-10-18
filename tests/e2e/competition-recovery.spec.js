import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup,
    findDocs, writeDocFields } from './helpers/emulator.js';

test('empty competition history points to a form that saves a competition round', async ({ page }, info) => {
    const email = throwawayEmail('competition-recovery');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Competition Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);
    const [user] = await findDocs('users', 'email', email);
    const compId = `recovery-${user._id}`;
    await writeDocFields(`profiles/${user._id}`, { displayName: 'Competition Tester', isApproved: true });
    await writeDocFields(`competitions/${compId}`, { name: 'Recovery Cup', visibility: 'public',
        ownerId: user._id, invitedUIDs: [user._id], rules: [], startingPoints: {}, createdAt: new Date() });
    await page.reload();
    await page.locator('.tab-btn[data-target="tab-comp"]').click();
    await expect(page.locator(`#comp-select option[value="${compId}"]`)).toBeAttached();
    await page.locator('#comp-select').selectOption(compId);
    const empty = page.locator('#comp-empty-state');
    await expect(empty).toBeVisible();
    await empty.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('competition-empty.png') });
    await expect(empty).toContainText('Log Round & Calculate Points');
    await expect(empty).not.toContainText('Log a past round');
    await page.locator('#comp-player-select').selectOption(user._id);
    await page.locator('#comp-date').fill('2026-01-15');
    await page.locator('#comp-score').fill('90');
    await page.locator('#comp-holes').selectOption('18');
    await page.locator('#log-comp-round-form').getByRole('button', { name: 'Log Round & Calculate Points' }).click();
    await expect(empty).toBeHidden();
    await expect(page.locator('#comp-recent-rounds-tbody tr')).toHaveCount(1);
    let rounds;
    await expect.poll(async () => {
        rounds = await findDocs('comp_rounds', 'compId', compId);
        return rounds.length;
    }).toBe(1);
    expect(rounds[0]).toMatchObject({ compId, uid: user._id, score: 90, holesPlayed: 18, totalPoints: 0 });
    expect(await findDocs('whs_rounds', 'uid', user._id)).toHaveLength(0);
});
