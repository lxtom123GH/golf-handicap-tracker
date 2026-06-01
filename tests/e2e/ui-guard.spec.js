import { test, expect } from '@playwright/test';

/**
 * Helper: navigates to the On-Course tab and starts a basic round
 * so that the Shot Wizard controls become available.
 */
async function startRoundAndOpenWizard(page) {
  // Go to the app using the configured baseURL (Firebase emulator / dev host)
  await page.goto('/');

  // If auth overlay is present, just wait for it to settle; these tests assume an already-authenticated session
  const authOverlay = page.locator('#auth-overlay');
  if (await authOverlay.isVisible().catch(() => false)) {
    // In emulator flows this may remain visible; we still proceed to exercise the UI guards.
  }

  // Navigate to the On-Course tab via the main tab button
  const onCourseTabBtn = page.locator('button.tab-btn[data-target="tab-oncourse"]');
  await onCourseTabBtn.click();

  // Select a valid Keperra course and tee so that Start Round succeeds
  await page.selectOption('#oc-course-select', 'Keperra – Old Course (9 holes)');
  await page.selectOption('#oc-tee-select', { label: 'Yellow (Men)' });

  // Start the round
  await page.locator('#btn-oc-start').click();

  // Ensure the on-course hub is visible
  await expect(page.locator('#oncourse-hub')).toBeVisible();

  // Open the Shot Wizard
  await page.locator('#btn-oc-track-shot').click();
  await expect(page.locator('#oncourse-wizard')).toBeVisible();
}

test.describe('GPS / Club Guard', () => {
  test('Cold Start - No GPS', async ({ page }) => {
    // Ensure no GPS lock and clear any persisted clubs before we enter the on-course flow
    await page.goto('/');
    await page.evaluate(() => {
      window.golfGpsReady = false;
      localStorage.removeItem('golfAppClubs');
    });

    // Drive into the on-course wizard
    await startRoundAndOpenWizard(page);

    // Guard should prevent any club buttons from rendering inside the bag grid
    await expect(page.locator('#bag-buttons-grid .btn-grid-compact')).toHaveCount(0);

    // User should see an explicit GPS wait message
    await expect(page.getByText('Waiting for GPS lock...')).toBeVisible();
  });

  test('GPS Lock - No Clubs', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.golfGpsReady = true;
      localStorage.removeItem('golfAppClubs');
      // Also clear any in-memory clubs on the AppState proxy if present
      if (window.appState) {
        window.appState.playerClubs = null;
      }
    });

    await startRoundAndOpenWizard(page);

    // With GPS ready but no clubs stored, we show the "No Clubs Defined" state instead of buttons
    await expect(page.getByText('No Clubs Defined', { exact: false })).toBeVisible();
    await expect(page.locator('#bag-buttons-grid .btn-grid-compact')).toHaveCount(0);
  });

  test('Fully Ready', async ({ page }) => {
    await page.goto('http://localhost:5000/');

    // Inject a valid bag configuration and mark GPS as ready before opening the wizard
    await page.evaluate(() => {
      window.golfGpsReady = true;
      const demoBag = {
        driver: true,
        woods: ['3 Wood'],
        irons: ['7 Iron', '9 Iron'],
        wedges: ['56'],
        putter: true
      };
      localStorage.setItem('golfAppClubs', JSON.stringify(demoBag));
      if (window.appState) {
        window.appState.playerClubs = demoBag;
      }
    });

    await startRoundAndOpenWizard(page);

    // Once GPS and clubs are ready, at least one club button should be rendered
    await expect(page.locator('#bag-buttons-grid .btn-grid-compact')).toHaveCountGreaterThan(0);
  });
});

