// Quick win 2 (simplify review 07 Oct 2026): toasts let taps through.
// A toast sits over the map and the Log/club area for 2.5 s. A tap there
// must reach what is underneath. Decision 12 removed the round-start
// "Keep screen awake" toast (keep-awake is remembered now), so this checks
// the toast every Detailed golfer sees on every shot: "Shot N logged".

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

test('the shot-logged toast does not swallow taps', async ({ page }) => {
    const email = throwawayEmail('toast');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Toast Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });

    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });

    // The toast only lives 2.5 s, so a slow save could miss it with a
    // plain locator wait. Hit-test it the moment it is added instead.
    await page.evaluate(() => {
        new MutationObserver((records, obs) => {
            for (const r of records) for (const el of r.addedNodes) {
                if (!(el instanceof HTMLElement) || !/Shot \d+ logged/.test(el.textContent || '')) continue;
                obs.disconnect();
                requestAnimationFrame(() => {
                    const b = el.getBoundingClientRect();
                    const under = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
                    window.__toastHit = {
                        cls: String(el.className),
                        pointerEvents: getComputedStyle(el).pointerEvents,
                        hitIsToast: !!(under && (under === el || el.contains(under))),
                        hit: under ? (under.id || String(under.className) || under.tagName) : null,
                    };
                });
            }
        }).observe(document.body, { childList: true });
    });
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();

    await expect.poll(() => page.evaluate(() => !!window.__toastHit), { timeout: 20_000 }).toBe(true);
    const hit = await page.evaluate(() => window.__toastHit);
    console.log('shot-logged toast hit-test:', JSON.stringify(hit));
    expect(hit.pointerEvents).toBe('none');
    expect(hit.hitIsToast).toBe(false);
});
