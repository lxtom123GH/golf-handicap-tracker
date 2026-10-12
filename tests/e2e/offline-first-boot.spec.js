// Synthetic regression: first-session offline reload must boot without a warm-up reload.
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedPreapprovedEmail, registerAndVerifySignup } from './helpers/emulator.js';

const OUT = process.env.RETEST_OUT || 'test-results/offline-boot';
for (const variant of ['no-online-reload-first', 'online-reload-first']) {
    test(`offline reload mid-round: ${variant}`, async ({ page, context }, testInfo) => {
        test.setTimeout(3 * 60_000);
        const dir = join(OUT, testInfo.project.name, 'offline-repro'); mkdirSync(dir, { recursive: true });
        const logs = [];
        const failures = [];
        page.on('requestfailed', req => failures.push({at: Date.now(), type: req.resourceType(), path: new URL(req.url()).pathname, error: req.failure()?.errorText}));
        page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
        const em = `test-offline-${Date.now()}@example.invalid`;
        await seedPreapprovedEmail(em);
        await page.goto('/');
        await page.locator('#btn-register').click();
        await page.locator('#auth-name').fill('Test Offline');
        await page.locator('#auth-email').fill(em);
        await page.locator('#auth-password').fill('synthetic-pass-1');
        await registerAndVerifySignup(page, em);
        if (variant === 'online-reload-first') {
            await page.reload();
            await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/, { timeout: 20_000 });
        }
        await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
        await page.locator('#btn-mode-simple').click();
        await page.locator('#btn-round-9').click();
        await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old Course (9 holes)' });
        await page.locator('#btn-oc-start').click();
        await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
        const card = page.locator('#oc-group-scores .compact-score-card').first();
        for (let i = 0; i < 4; i++) await card.locator('.btn-grid-plus').click();
        await page.waitForTimeout(1500);
        await context.setOffline(true);
        const mark = logs.length;
        const cacheBeforeReload = await page.evaluate(async () => {
            const entries = [];
            for (const name of await caches.keys()) {
                const cache = await caches.open(name);
                const requests = await cache.keys();
                const variants = await Promise.all(requests
                    .filter(request => new URL(request.url).pathname.startsWith('/assets/'))
                    .map(async request => ({
                        path: new URL(request.url).pathname,
                        origin: request.headers.get('origin'),
                        vary: (await cache.match(request))?.headers.get('vary'),
                    })));
                entries.push({ name, paths: requests.map(request => new URL(request.url).pathname), variants });
            }
            return { controlled: !!navigator.serviceWorker.controller, entries };
        });
        await page.reload();
        const ok = await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/, { timeout: 30_000 }).then(() => true, () => false);
        await page.screenshot({ path: join(dir, `${variant}.png`) });
        const after = logs.slice(mark).filter(l => /Auth|error|warn|offline|Firestore/i.test(l)).slice(0, 25);
        writeFileSync(join(dir, `${variant}-${testInfo.repeatEachIndex}.json`), JSON.stringify({ variant, cloakCleared: ok,
            cacheBeforeReload, failures,
            score: ok ? await card.locator('.oc-score-value').textContent().catch(() => '?') : null, logs: after }, null, 2));
        await context.setOffline(false);
        expect(ok, JSON.stringify({variant, cacheBeforeReload, failures}, null, 2)).toBe(true);
        await expect(page.locator('#oncourse-hub')).toBeVisible();
        await expect(card.locator('.oc-score-value')).toHaveText('4');
    });
}
