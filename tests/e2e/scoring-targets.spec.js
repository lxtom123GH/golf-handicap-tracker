import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { seedPreapprovedEmail, registerAndVerifySignup } from './helpers/emulator.js';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

// Synthetic users only. Keperra exercises the form hub; Ashgrove also covers
// the Play-mode side rail and the expanded group sheet.
for (const course of [
    { name: 'Keperra – Old Course (9 holes)', holes: 9, key: 'form' },
    { name: 'Ashgrove GC', holes: 18, key: 'map' },
]) {
    test(`round controls meet the 44px phone target: ${course.key}`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        const email = `test-targets-${testInfo.project.name}-${Date.now()}@example.invalid`;
        await seedPreapprovedEmail(email);
        await page.goto('/');
        await page.locator('#btn-register').click();
        await page.locator('#auth-name').fill('Test Target Player');
        await page.locator('#auth-email').fill(email);
        await page.locator('#auth-password').fill('synthetic-pass-1');
        await registerAndVerifySignup(page, email);
        await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
        await page.locator('#btn-mode-simple').click();
        await page.locator(`#btn-round-${course.holes}`).click();
        await page.locator('#oc-course-select').selectOption({ label: course.name });
        await page.locator('#btn-oc-start').click();
        await expect(page.locator('#oncourse-hub')).toBeVisible();
        await page.addScriptTag({ path: axePath });
        const out = testInfo.outputPath('targets');
        mkdirSync(out, { recursive: true });
        const reports = [];
        for (const state of course.key === 'map' ? ['rail', 'sheet'] : ['form']) {
            if (state === 'sheet') await page.locator('#btn-oc-score-sheet').click();
            const rows = await page.locator('#oncourse-hub button:visible, #oncourse-hub [role="button"]:visible').evaluateAll(elements => elements.map(el => {
                const rect = el.getBoundingClientRect();
                return { id: el.id, classes: el.className, text: el.textContent.trim(),
                    width: rect.width, height: rect.height, left: rect.left, right: rect.right,
                    viewport: innerWidth };
            }));
            reports.push({ state, rows });
            reports.at(-1).axe = await page.evaluate(async () => {
                const result = await window.axe.run('#tab-oncourse', { runOnly: { type: 'rule',
                    values: ['color-contrast', 'color-contrast-enhanced', 'label-content-name-mismatch'] } });
                return { violations: result.violations, incomplete: result.incomplete };
            });
            await page.screenshot({ path: join(out, `${course.key}-${state}.png`), fullPage: true });
        }
        writeFileSync(join(out, 'measurements.json'), JSON.stringify(reports, null, 2));
        expect(reports.every(r => r.rows.length >= 4), 'non-empty actual hub inventory').toBe(true);
        const bad = reports.flatMap(r => r.rows.filter(b => b.width < 43.99 || b.height < 43.99
            || b.left < -0.5 || b.right > b.viewport + 0.5).map(b => ({ state: r.state, ...b })));
        expect(bad, 'every rendered hub button has a 44px box inside the phone width').toEqual([]);
        for (const report of reports) {
            expect(report.axe.violations,
                `${report.state}: scoped contrast and visible-name rules`).toEqual([]);
        }
    });
}
