// practice-caddy-done.spec.js — a finished Caddy plan closes with one Done
// tap; no star rating (simplify 2026-10-07, E38).
import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, findDocs, FIRESTORE_PORT } from './helpers/emulator.js';

const PROJECT = 'golf-handicap-tracker-b677c'; // as helpers/emulator.js

async function planDoc(uid, method = 'GET', body) {
    const url = `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}/practice_plans/active`;
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: body && JSON.stringify(body) });
    if (!res.ok) throw new Error(`plan ${method}: ${res.status} ${await res.text()}`);
    return res.json();
}

test('ticking the last step shows one Done; Done closes the plan', async ({ page }) => {
    const email = throwawayEmail('caddy-done');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Caddy Done');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    let user;
    for (let i = 0; i < 50 && !user; i++) {
        [user] = await findDocs('users', 'email', email);
        if (!user) await new Promise(r => setTimeout(r, 100));
    }
    const s = (v) => ({ stringValue: v });
    await planDoc(user._id, 'PATCH', { fields: {
        status: s('active'), drillId: s('d1'), category: s('Putting'), targetMetric: s('Lag putts'),
        steps: { arrayValue: { values: [s('Ten 30-footers.'), s('Ten 6-footers.'), s('Finish with a 3-footer.')] } },
        completedSteps: { arrayValue: { values: [{ integerValue: '0' }, { integerValue: '1' }] } },
    } });

    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-practice"]').click();
    await expect(page.locator('#practice-state-active')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#practice-rating-section')).toBeHidden();

    await page.locator('#practice-steps-list input[type="checkbox"][data-idx="2"]').check();
    const done = page.locator('#btn-practice-done');
    await expect(done).toBeVisible();
    await expect(page.locator('.star-btn')).toHaveCount(0);
    const box = await done.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);

    await done.click();
    await expect(page.locator('#practice-state-empty')).toBeVisible();
    await expect.poll(async () => (await planDoc(user._id)).fields.status.stringValue).toBe('completed');
});
