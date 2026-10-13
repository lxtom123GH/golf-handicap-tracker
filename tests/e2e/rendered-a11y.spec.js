// Runtime WCAG 2.2 AA scan for the six rendered application states.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';
import { COURSE_DATA } from '../../src/course-data.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function verifyAuthEmulatorEmail(email, password) {
    const host = `127.0.0.1:${process.env.EMU_AUTH_PORT || 9099}`;
    const signedIn = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    if (!signedIn.ok) throw new Error(`Auth emulator sign-in failed: ${signedIn.status} ${await signedIn.text()}`);
    const { localId } = await signedIn.json();
    const verified = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId, emailVerified: true }),
    });
    if (!verified.ok) throw new Error(`Auth emulator verification failed: ${verified.status} ${await verified.text()}`);
}

async function audit(page, screen, reports) {
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const editableControls = screen.startsWith('on-course') || screen === 'scorecard'
        ? await page.locator('input:visible:not([readonly]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select:visible, textarea:visible')
            .evaluateAll(controls => controls.map(control => ({
                id: control.id, fontSize: parseFloat(getComputedStyle(control).fontSize),
            }))) : [];
    if (screen.startsWith('on-course')) expect(editableControls.length, 'setup input inventory').toBeGreaterThan(0);
    reports.push({
        screen,
        editableControls,
        violations: violations.map(({ id, impact, description, help, helpUrl, nodes }) => ({
            id, impact, description, help, helpUrl,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
        })),
    });
    console.log(`[axe] ${screen}: ${JSON.stringify(violations.map(({ id, impact, nodes }) => ({
        id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })))}`);
}

test('axe: sign-in, home, history, round start, scorecard and settings', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    // Explicit phone floors, with desktop coverage retained for header contrast.
    const viewport = {
        phone: { width: 412, height: 839 },
        'iphone-se': { width: 375, height: 667 },
        desktop: { width: 1280, height: 720 },
    }[testInfo.project.name];
    expect(viewport, 'accessibility journey requires a known viewport').toBeTruthy();
    await page.setViewportSize(viewport);
    const reports = [];

    await page.goto('/');
    await expect(page.locator('#auth-overlay')).toBeVisible();
    await audit(page, 'sign-in', reports);

    const email = throwawayEmail('rendered-a11y');
    await seedPreapprovedEmail(email);
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Axe Audit');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyAuthEmulatorEmail(email, 'e2e-password-1');
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });

    // Choose the screen explicitly; the new context and account have no saved tab.
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(page.locator('#tab-whs')).toBeVisible();
    await audit(page, 'home', reports);

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await expect(page.locator('#oncourse-setup')).toBeVisible();

    // Add one synthetic round so the history scan covers a rendered record row.
    await page.locator('#btn-oc-log-past-round').click();
    await expect(page.locator('#add-round-container')).toBeVisible();
    const availableCourses = await page.locator('#oc-course-select option').evaluateAll(options => options.map(o => o.value));
    const roundOption = await page.locator('#course-select option').evaluateAll((options, { availableCourses, data }) =>
        options.map(o => o.value).find(value => {
            const [course, tee] = value.split('|');
            return availableCourses.includes(course) && data[course]?.[tee]?.pars?.length === 18;
        }), { availableCourses, data: COURSE_DATA });
    expect(roundOption, 'a shared rated 18-hole course and tee must be available').toBeTruthy();
    const [course, tee] = roundOption.split('|');
    await page.locator('#course-select').selectOption(roundOption);
    const yesterday = await page.evaluate(() => {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    await page.locator('#date').fill(yesterday);
    await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
    await page.locator('#score').fill('90');
    await page.getByRole('button', { name: 'Save Round to Profile' }).click();
    await expect(page.locator('#add-round-container')).toBeHidden({ timeout: 20_000 });

    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(page.locator('#history-tbody tr')).toHaveCount(1, { timeout: 20_000 });
    await audit(page, 'history', reports);

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption(course);
    await page.locator('#oc-tee-select').selectOption(tee);
    await expect(page.locator('#oc-course-stats')).toBeVisible();
    await expect(page.locator('#oc-stat-par')).toHaveValue(String(COURSE_DATA[course][tee].par));
    await expect(page.locator('#oc-dh-value')).not.toHaveText('--');
    await audit(page, 'on-course round start', reports);
    await page.locator('#btn-mode-detailed').click();
    await audit(page, 'on-course detailed toggle', reports);
    await page.locator('#btn-mode-simple').click();

    // In play mode the tab row is hidden, so audit Settings before starting.
    await page.locator('#tab-btn-settings').click();
    await expect(page.locator('#tab-settings')).toBeVisible();
    await audit(page, 'settings', reports);

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await expect(page.locator('#oncourse-setup')).toBeVisible();
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await audit(page, 'scorecard', reports);

    // A file attachment survives the list reporter and is available to CI artifacts.
    const reportPath = testInfo.outputPath('axe-results.json');
    await writeFile(reportPath, JSON.stringify({ viewport, reports }, null, 2));
    await testInfo.attach('axe-results.json', { path: reportPath, contentType: 'application/json' });
    const blocking = reports.flatMap(({ screen, violations }) => violations
        .filter(({ impact }) => impact === 'serious' || impact === 'critical')
        .map(({ id, impact, nodes }) => ({ screen, id, impact, targets: nodes.map(({ target }) => target) })));
    const moderate = reports.flatMap(({ screen, violations }) => violations
        .filter(({ impact }) => impact === 'moderate')
        .map(({ id, nodes }) => ({ screen, id, targets: nodes.map(({ target }) => target) })));
    console.log(`[axe] moderate findings: ${JSON.stringify(moderate)}`);
    expect(reports.flatMap(({ violations }) => violations).filter(({ id }) => id === 'meta-viewport'),
        'mobile zoom must stay available at every impact level').toEqual([]);
    expect(await page.locator('meta[name="viewport"]').getAttribute('content'))
        .not.toMatch(/maximum-scale|user-scalable\s*=\s*(no|0)/i);
    expect(reports.flatMap(({ screen, editableControls }) => editableControls
        .filter(({ fontSize }) => !Number.isFinite(fontSize) || fontSize < 16).map(control => ({ screen, ...control }))),
        'on-course editable controls must avoid small-text focus zoom').toEqual([]);
    expect(blocking, 'unresolved serious or critical axe findings').toEqual([]);
});
