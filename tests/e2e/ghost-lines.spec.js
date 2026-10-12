// ==========================================================================
// ghost-lines.spec.js - S7: an abandoned round supplies ghost lines (iphone-se)
// ==========================================================================

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, verifyEmulatorEmail } from './helpers/emulator.js';

// Keep this spec pinned to the map-and-grids layout it exercises.
// map-and-grids 'both' layout it was written for, so it pins that preference;
// Map first's own coverage lives in map-first*.spec.js and map-follow.spec.js.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('golf.shotEntry')) localStorage.setItem('golf.shotEntry', 'both'); });
});

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
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyEmulatorEmail(email);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
}

async function startDetailedRound(page, courseLabel, holesBtn) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator(holesBtn).click();
    await page.locator('#oc-course-select').selectOption({ label: courseLabel });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
}

// S7 rebase fix: the trial's round-2 query returned 0 because non-planned
// shot docs carried no `timestamp` field and Firestore silently excludes
// docs missing the orderBy field. Fixed on the write path (score-input
// stamps every stored shot); this test is live again.
test('an abandoned round supplies one intended ghost line to a new round', async ({
  page,
}) => {
  test.setTimeout(60_000);

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await registerFreshUser(page);
  await startDetailedRound(page, 'Ashgrove GC', '#btn-round-18');

  await expect(page.locator('#section-line')).toBeVisible();

  const canvas = page.locator('#shot-line-canvas');
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  // Draw only the intended line; do not perform an actual-line swipe.
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.92,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.35,
    { steps: 12 },
  );
  await page.mouse.up();

  await expect(page.locator('#line-readout')).toContainText(/Intended \d+ m/);

  await page.locator('#bag-buttons-grid').getByRole('button').first().click();
  await page
    .locator('[data-group="missPattern"][data-val="On Target"]')
    .click();
  await page.locator('#btn-save-shot-final').click();
  // S12 renamed the toast: "Shot N logged · ..." — match on 'logged'.
  await expect(
    page.getByRole('status').filter({ hasText: 'logged' }).first(),
  ).toBeVisible();

  // The wizard usually auto-closes after the save toast; cancel only if open.
  const wizardCancel = page.locator('#btn-wizard-cancel');
  await page.waitForTimeout(800);
  if (await wizardCancel.isVisible().catch(() => false)) {
    await wizardCancel.click();
  }
  // Finish the round (Finish → Confirm & Save) so the shot doc is fully
  // persisted server-side before the new round queries for ghosts.
  await page.locator('#btn-oc-more').click();
  await expect(page.locator('#oc-more-sheet')).toBeVisible();
  await page.locator('#btn-oc-finish').click();
  await expect(page.locator('#oc-finish-modal')).toBeVisible();
  await page.locator('#btn-oc-save-whs').click();
  await expect(page.locator('#oc-finish-modal')).toBeHidden({ timeout: 15_000 });
  // F-11: the shot save is fire-and-forget; give the local queue a moment
  // to flush to the emulator before round 2 queries the server view.
  await page.waitForTimeout(2000);
  // EndRoundCleanup routes to the Locker Room - go back home before the
  // second round.
  await page.locator('#btn-post-home').click();
  await startDetailedRound(page, 'Ashgrove GC', '#btn-round-18');

  await expect(page.locator('#section-line')).toBeVisible();

  const ghostCount = page.locator('#line-ghost-count');
  const ghostsButton = page.locator('#btn-line-ghosts');

  // The ghost query runs asynchronously after the line section mounts.
  await expect(ghostCount).toBeVisible({ timeout: 15_000 });
  await expect(ghostCount).toHaveText('1 previous line', { timeout: 30_000 });
  await expect(ghostsButton).toBeVisible({ timeout: 15_000 });

  await ghostsButton.click(); // intended -> both
  await ghostsButton.click(); // both -> none
  await expect(ghostCount).toHaveClass(/(?:^|\s)hidden(?:\s|$)/);

  await ghostsButton.click(); // none -> intended
  await expect(ghostCount).not.toHaveClass(/(?:^|\s)hidden(?:\s|$)/);
  await expect(ghostCount).toBeVisible();
  await expect(ghostCount).toHaveText('1 previous line');
});
