// Late starts keep course-hole scoring keys while navigation wraps in play order.
import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
const GPS = { latitude: -27.4112, longitude: 152.9524, accuracy: 40 };

test.beforeEach(({}, testInfo) => {
    test.skip(!['phone', 'iphone-se'].includes(testInfo.project.name), 'phone layouts only');
});

async function startNorthNine(page, prefix, startHole = 1) {
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'map'));
    await page.context().setGeolocation(GPS);
    const email = throwawayEmail(prefix);
    await seedPreapprovedEmail(email);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Hole Order');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – North Course (9 holes)' });
    await expect(page.locator('#oc-start-hole option')).toHaveCount(9);
    await page.locator('#oc-start-hole').selectOption(String(startHole));
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());
    await expect(page.locator('body')).toHaveClass(/play-quick/, { timeout: 15_000 });
    await expect(page.locator('#oc-hole-display')).toHaveText(`Hole ${startHole}`);
    await expect(page.locator('#oc-play-map canvas')).toHaveAttribute('data-hole', String(startHole + 9));
}

test('the map hole chip opens the existing 9-hole jumper and jumps to hole 4 without a shot', async ({ page }) => {
    await startNorthNine(page, 'hole-chip-jump');
    const holeChip = page.locator('#btn-play-hole');
    await expect(holeChip).toBeVisible();
    const vp = page.viewportSize();
    for (const id of ['btn-play-hole', 'btn-play-settings']) {
        const box = await page.locator(`#${id}`).boundingBox();
        expect(box.height, id).toBeGreaterThanOrEqual(44);
        expect(box.y, id).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, id).toBeLessThanOrEqual(vp.height);
        expect(box.x + box.width, id).toBeLessThanOrEqual(vp.width);
        expect(await page.evaluate(({ id, x, y }) => {
            const target = document.getElementById(id);
            const hit = document.elementFromPoint(x, y);
            return hit === target || target.contains(hit);
        }, { id, x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
    }
    await holeChip.click();
    const jumper = page.locator('#hole-jumper-container');
    await expect(jumper).toBeVisible();
    await expect(jumper.locator('button')).toHaveCount(9);
    await page.getByRole('button', { name: 'Go to hole 4' }).click();
    await expect(page.locator('#oc-hole-display')).toHaveText('Hole 4');
    await expect(holeChip).toHaveText('Hole 4 ▾');
    await expect(page.locator('#oc-play-map canvas')).toHaveAttribute('data-hole', '13');
    await expect(page.locator('#oc-group-scores .oc-score-value').first()).toHaveText('0');
    await expect(page.locator('#btn-quick-undo')).toBeDisabled();
    await expect(page.locator('#play-quick-hint')).toContainText('Shot 1');
});

test('starting late wraps to hole 1 and keeps scores on course-hole keys', async ({ page }) => {
    await startNorthNine(page, 'hole-chip-order', 8);
    const score = page.locator('#oc-group-scores .compact-score-card').first();
    await score.locator('.btn-grid-plus').click();
    await expect(score.locator('.oc-score-value')).toHaveText('1');
    await page.locator('#btn-oc-next-hole').click();
    await expect(page.locator('#oc-hole-display')).toHaveText('Hole 9');
    await expect(page.locator('#oc-play-map canvas')).toHaveAttribute('data-hole', '18');
    await score.locator('.btn-grid-plus').click();
    await page.locator('#btn-oc-next-hole').click();
    await expect(page.locator('#oc-hole-display')).toHaveText('Hole 1');
    await expect(page.locator('#oc-play-map canvas')).toHaveAttribute('data-hole', '10');
    await score.locator('.btn-grid-plus').click();
    await expect(score.locator('.oc-score-value')).toHaveText('1');
    const round = await page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state')));
    expect(round.currentRoundStartHole).toBe(8);
    expect(round.currentHole).toBe(1);
    expect(round.liveRoundGroups[0].scores).toMatchObject({ 1: 1, 8: 1, 9: 1 });
});
