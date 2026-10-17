import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup, findDocs, writeDocFields, readDoc } from './helpers/emulator.js';
import { createRequire } from 'node:module';

const { normalizePracticeInputs } = createRequire(import.meta.url)('../../functions/lib/practice-inputs.js');
let email;

test.beforeEach(async ({ page }) => {
    email = throwawayEmail('practice-inputs');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Practice Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);
    await expect(page.locator('#main-app')).toBeVisible();
    await page.locator('.tab-btn[data-target="tab-practice"]').click();
    await expect(page.locator('#practice-state-empty')).toBeVisible();
});

const plan = { drillId: 'fake-drill', category: 'Short Game', targetMetric: 'Bunker distance',
    steps: ['Hit ten bunker shots.', 'Vary the landing spot.', 'Finish with a distance challenge.'],
    completedSteps: [] };

// Only the billable callable is mocked; signup and plan reads use real emulators.
async function mockPlan(page, respond) {
    const sent = [];
    await page.route('**/generatePracticePlan', async route => {
        const headers = { 'access-control-allow-origin': '*',
            'access-control-allow-headers': 'authorization,content-type,x-firebase-appcheck',
            'access-control-allow-methods': 'POST,OPTIONS' };
        if (route.request().method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
        }
        sent.push(route.request().postDataJSON().data);
        let response;
        try {
            // Exercise production validation; only the billable model result is scripted.
            normalizePracticeInputs(sent.at(-1));
            response = await respond(sent.length);
        } catch (error) {
            response = { error: { status: 'INVALID_ARGUMENT', message: error.message } };
        }
        await route.fulfill({ status: response.error ? 400 : 200, headers,
            contentType: 'application/json', body: JSON.stringify(response) });
    });
    return sent;
}

test('Practice Caddy sends the chosen focus, goal and minutes from a phone', async ({ page }) => {
    await page.locator('#practice-focus').selectOption('Short Game');
    await page.locator('#practice-goal').fill('  Improve bunker distance  ');
    await page.locator('#practice-minutes').selectOption('45');
    await expect(page.locator('#practice-goal')).toHaveAttribute('maxlength', '120');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const sent = await mockPlan(page, () => ({ result: plan }));
    await page.locator('#btn-generate-practice').click();
    await expect(page.locator('#practice-state-active')).toBeVisible();
    await expect(page.locator('.practice-step')).toHaveCount(3);
    await expect(page.locator('#practice-category-badge')).toHaveText('Short Game');
    await expect(page.locator('#practice-steps-list')).toContainText('Hit ten bunker shots.');
    expect(sent).toEqual([{ focus: 'Short Game', goal: 'Improve bunker distance', minutes: 45 }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Practice Caddy does not send an untouched default time as a preference', async ({ page }) => {
    const sent = await mockPlan(page, () => ({ result: plan }));
    await page.locator('#btn-generate-practice').click();
    await expect(page.locator('#practice-state-active')).toBeVisible();
    expect(sent).toEqual([{ focus: '', goal: '' }]);
});

test('real goal validation rejects invisible text and allows a corrected goal on retry', async ({ page }) => {
    await expect(page.locator('#practice-focus')).toHaveValue('');
    await expect(page.locator('#practice-goal')).toHaveValue('');
    await expect(page.locator('#practice-minutes')).toHaveValue('30');
    await page.locator('#practice-goal').fill('Putts\u200b under 32');
    const sent = await mockPlan(page, () => ({ result: plan }));
    await page.locator('#btn-generate-practice').click();
    await expect(page.locator('#practice-generate-error'))
        .toContainText('goal must not contain invisible or bidirectional control characters');
    await expect(page.locator('#btn-generate-practice')).toBeEnabled();
    await expect(page.locator('#practice-goal')).toHaveValue('Putts\u200b under 32');
    await page.locator('#practice-goal').fill('Putts < 32 per round');
    await page.locator('#btn-generate-practice').click();
    await expect(page.locator('#practice-state-active')).toBeVisible();
    await expect(page.locator('#practice-generate-error')).toBeHidden();
    expect(sent).toEqual([
        { focus: '', goal: 'Putts\u200b under 32' },
        { focus: '', goal: 'Putts < 32 per round' },
    ]);
});

test('a cached active plan explains that the newly submitted preferences were ignored', async ({ page }) => {
    await page.locator('#practice-focus').selectOption('Driver');
    await page.locator('#practice-minutes').selectOption('15');
    await mockPlan(page, () => ({ result: { ...plan, source: 'cache', preferencesIgnored: true } }));
    await page.locator('#btn-generate-practice').click();
    await expect(page.locator('#practice-state-active')).toBeVisible();
    await expect(page.locator('#practice-preferences-notice')).toBeVisible();
    await expect(page.locator('#practice-preferences-notice')).toContainText('preferences were not applied');
    await expect(page.locator('#practice-preferences-notice')).toContainText('New Drill');
});

test('service failures show safe actions and clear on a successful retry', async ({ page }) => {
    const uncertain = "We couldn't confirm whether your plan was created. Reload this page to check for an active plan before generating again.";
    const failures = [
        ['PERMISSION_DENIED', 'Your account is awaiting approval. Ask an admin to approve it before using AI features.'],
        ['RESOURCE_EXHAUSTED', "You've reached today's limit across AI features. Try again tomorrow."],
        ['UNAUTHENTICATED', 'Your session has ended. Sign in again to generate a practice plan.'],
        ['INTERNAL', uncertain],
        ['INVALID_ARGUMENT', uncertain],
    ];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const sent = await mockPlan(page, async attempt => {
        if (attempt <= failures.length) {
            return { error: { status: failures[attempt - 1][0], message: 'private backend trace <img src=x>' } };
        }
        await pending;
        return { result: plan };
    });
    const error = page.locator('#practice-generate-error');
    const button = page.locator('#btn-generate-practice');
    await expect(error).toBeHidden();
    for (const [, message] of failures) {
        await button.click();
        await expect(error).toBeVisible();
        await expect(error).toHaveText(message);
        await expect(error).toHaveAttribute('role', 'alert');
        await expect(button).toBeEnabled();
        await expect(error.locator('img')).toHaveCount(0);
    }
    await button.click();
    await expect(page.locator('#practice-state-loading')).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(error).toBeHidden();
    release();
    await expect(page.locator('#practice-state-active')).toBeVisible();
    await expect(page.locator('#practice-steps-list')).toContainText(plan.steps[0]);
    await expect(error).toBeHidden();
    expect(sent).toHaveLength(failures.length + 1);
});

test('reload recovers the stored plan after a lost generation response', async ({ page }) => {
    const [user] = await findDocs('users', 'email', email);
    const path = `users/${user._id}/practice_plans/active`;
    const stored = { status: 'active', drillId: plan.drillId, drill: plan, completedSteps: [0] };
    const sent = await mockPlan(page, async () => {
        // Simulate a committed server write followed by a lost callable response.
        await writeDocFields(path, stored);
        return { error: { status: 'DEADLINE_EXCEEDED', message: 'private timeout detail' } };
    });
    await page.locator('#btn-generate-practice').click();
    await expect(page.locator('#practice-generate-error')).toContainText('Reload this page');
    expect(await readDoc(path)).toEqual(stored);
    await page.reload();
    await page.locator('.tab-btn[data-target="tab-practice"]').click();
    await expect(page.locator('#practice-state-active')).toBeVisible();
    await expect(page.locator('#practice-steps-list')).toContainText(plan.steps[0]);
    await expect(page.locator('.practice-step input').first()).toBeChecked();
    await expect(page.locator('#practice-generate-error')).toBeHidden();
    expect(sent).toHaveLength(1);
});
