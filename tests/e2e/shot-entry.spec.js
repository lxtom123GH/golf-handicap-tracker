// ==========================================================================
// shot-entry.spec.js — S12 E: each mode on Ashgrove (spec's E2E gate).
// ==========================================================================
// The Settings tab sits behind the fullscreen round wizard, so the UI path
// is driven from the dashboard (select → change → persist) and the modes are
// asserted on a live Ashgrove round — via the real select, and via
// localStorage boot-mirror for the other two modes. A reload test pins the
// boot mirror.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('E2E Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
}

async function startAshgroveRound(page) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    // NOTE: do NOT wait on #section-line visibility here — 'buttons' mode
    // hides it by design. The mount readiness signal is data-view-mode.
    await expect(page.locator('#shot-line-canvas')).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });
}

test('S12 E: UI path — select Draw lines in Settings, the Ashgrove round collapses the grids', async ({ page }) => {
    await registerFreshUser(page);
    // The real UI path: Settings → Shot entry → Draw lines (dashboard side;
    // the round wizard covers the tab bar, so the choice is made up front).
    await page.locator('#tab-btn-settings').click();
    const sel = page.locator('#shot-entry-select');
    await expect(sel).toBeVisible({ timeout: 10_000 });
    await sel.selectOption('draw');

    await startAshgroveRound(page);
    // Draw mode: the map and the draw button stay; the grids fold (closed).
    await expect(page.locator('#section-line')).toBeVisible();
    await expect(page.locator('#btn-line-draw')).toBeVisible();
    await expect(page.locator('#shot-entry-result-details')).not.toHaveAttribute('open', /.*/);
    // Still there — the golfer can re-open the disclosure.
    await page.locator('#shot-entry-result-details summary').click();
    await expect(page.locator('#section-miss-pattern')).toBeVisible();
    await page.locator('#shot-entry-result-details summary').click();
    await expect(page.locator('#section-miss-pattern')).toBeHidden();
});

test('S12 E: Tap buttons mode hides the map, keeps the grids (Ashgrove)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'buttons'));
    await registerFreshUser(page);
    await startAshgroveRound(page);
    await expect(page.locator('#section-line')).toBeHidden();
    await expect(page.locator('#btn-line-draw')).toBeHidden();
    await expect(page.locator('#shot-entry-result-details')).toHaveAttribute('open', /.*/);
    await expect(page.locator('#section-miss-pattern')).toBeVisible();
});

test('with no saved choice, a shot opens on Map first by default', async ({ page }) => {
    await registerFreshUser(page);
    await startAshgroveRound(page);
    expect(await page.evaluate(() => localStorage.getItem('golf.shotEntry'))).toBeNull();
    await expect(page.locator('#oncourse-wizard')).toHaveClass(/map-first/);
    await expect(page.locator('#shot-entry-select')).toHaveValue('map');
});

test('S12 E: Both is the map-and-grids layout (Ashgrove)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'both'));
    await registerFreshUser(page);
    await startAshgroveRound(page);
    await expect(page.locator('#section-line')).toBeVisible();
    await expect(page.locator('#btn-line-draw')).toBeVisible();
    await expect(page.locator('#shot-entry-result-details')).toHaveAttribute('open', /.*/);
    await expect(page.locator('#section-miss-pattern')).toBeVisible();
});

test('S12 E: the boot mirror reads golf.shotEntry into AppState at boot', async ({ page }) => {
    // The stored preference exists BEFORE any app script runs — this is the
    // exact path a returning golfer takes (stored 'draw' from last round).
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'draw'));
    await registerFreshUser(page);

    // The Settings select renders FROM AppState.shotEntry at bind: its value
    // proves the boot mirror ran and normalised nothing away.
    await page.locator('#tab-btn-settings').click();
    await expect(page.locator('#shot-entry-select')).toHaveValue('draw');

    // And a fresh Ashgrove round applies the mirrored preference at mount.
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#shot-line-canvas')).toHaveAttribute('data-view-mode', 'shot', { timeout: 15_000 });
    await expect(page.locator('#shot-entry-result-details')).not.toHaveAttribute('open', /.*/);
    await expect(page.locator('#section-line')).toBeVisible();
});
