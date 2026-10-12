// Track A item 6 (simplify review 07 Oct 2026): the coach "Intent vs
// execution" card was always blank. coach.js called renderIntentPanel without
// importing it, and the ReferenceError was swallowed by a try/catch.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, findDocs, FIRESTORE_PORT, PROJECT_ID, verifyEmulatorEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
const DOCS = `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function register(page, name, prefix) {
    const email = throwawayEmail(prefix);
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill(name);
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyEmulatorEmail(email);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    let user;
    for (let i = 0; i < 50 && !user; i++) {
        [user] = await findDocs('users', 'email', email);
        if (!user) await page.waitForTimeout(100);
    }
    expect(user).toBeTruthy();
    return { email, uid: user._id };
}

/** An admin-side fixture write (the emulator REST API bypasses rules). */
async function patchUser(uid, fields) {
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
    const res = await fetch(`${DOCS}/users/${uid}?${mask}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`patch users/${uid}: ${res.status} ${await res.text()}`);
}

/** One logged shot with both lines, as the shot wizard saves it. */
async function seedShot(uid) {
    const pt = (x, y) => ({ mapValue: { fields: { x: { doubleValue: x }, y: { doubleValue: y } } } });
    const res = await fetch(`${DOCS}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ fields: {
            uid: { stringValue: uid },
            club: { stringValue: '7i' },
            timestamp: { stringValue: new Date().toISOString() },
            lineIntended: { arrayValue: { values: [pt(0, 0), pt(0, 150)] } },
            lineActual: { arrayValue: { values: [pt(0, 0), pt(12, 148)] } },
        } }),
    });
    if (!res.ok) throw new Error(`seed shot: ${res.status} ${await res.text()}`);
}

test('a coach sees the athlete\'s Intent vs execution card', async ({ browser }) => {
    // Two browsers: the athlete and the coach.
    const athletePage = await (await browser.newContext()).newPage();
    const athlete = await register(athletePage, 'Intent Athlete', 'athlete');
    await athletePage.context().close();

    const context = await browser.newContext();
    const page = await context.newPage();
    const coach = await register(page, 'Intent Coach', 'coach');

    await patchUser(coach.uid, { isCoach: { booleanValue: true } });
    await patchUser(athlete.uid, { coaches: { arrayValue: { values: [{ stringValue: coach.uid }] } } });
    await seedShot(athlete.uid);

    await page.reload();
    await expect(page.locator('#tab-btn-coach')).toBeVisible({ timeout: 20_000 });
    await page.locator('#tab-btn-coach').click();
    const view = page.locator('.coach-roster-card', { hasText: 'Intent Athlete' }).locator('.athlete-view-btn');
    await expect(view).toBeVisible({ timeout: 20_000 });
    await view.click();

    const card = page.locator('#coach-intent-card');
    // The full panel, not the empty state: the coach can read the athlete's
    // shot under the rules, and the club picker, canvas and counts render.
    await expect(card).toContainText('What you planned vs what you did', { timeout: 15_000 });
    await expect(card.locator('select')).toHaveValue('7i');
    await expect(card.locator('canvas.intent-canvas')).toHaveCount(1);
    await expect(card).toContainText('1 of 5 shots logged for 7i.');
    const box = await card.boundingBox();
    const vw = page.viewportSize().width;
    expect(box.x + box.width).toBeLessThanOrEqual(vw); // fits the phone width
    await context.close();
});
