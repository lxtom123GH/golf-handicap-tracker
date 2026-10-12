// ==========================================================================
// round-journey.spec.js — the core detailed-round journey, on a phone
// ==========================================================================
//
// Register (throwaway user, preapproved via a seeded invite) → start a detailed
// 9-hole round at Keperra → wizard auto-opens → log shot 1 → shot 2 shows
// the lie row → putter collapses the screen to putt language → GPS widget
// lives with mocked coordinates.
//
// Everything goes through the real UI against the emulators — no state is
// injected. If this passes, a first-time user can play a hole.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

/**
 * Register a fresh user through the real auth UI and land in the app.
 *
 * F-19 (2026-09-10): registrations used to be auto-approved on localhost, and
 * this helper relied on it. That shortcut is gone — a rule cannot tell
 * localhost from production, so the approval decision could not be verified
 * server-side while the client was free to grant it. The user is now genuinely
 * preapproved instead: the invite is seeded into the emulator first, and the
 * app takes the ordinary production path through preapproved_emails. See
 * registration.spec.js, which pins both halves of that contract.
 */
async function registerFreshUser(page) {
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('E2E Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
    return email;
}

test('detailed round: register → start → shot 1 → lie on shot 2 → putt screen → GPS', async ({ page }) => {
    await registerFreshUser(page);

    // --- On Course setup ---
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old Course (9 holes)' });
    await page.locator('#btn-oc-start').click();

    // Detailed mode auto-opens the wizard on hole 1 (owner feedback 2026-07-05).
    const wizard = page.locator('#oncourse-wizard');
    await expect(wizard).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');

    // Shot 1 is the tee shot — no lie row yet.
    await expect(page.locator('#section-lie')).toBeHidden();

    // --- Log shot 1: club + result ---
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('[data-group="missPattern"][data-val="On Target"]').click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i })).toBeVisible();

    // --- Shot 2: lie capture appears (BL-OC2-03) ---
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    await expect(page.locator('#section-lie')).toBeVisible();
    // Glass chips PR 3: five lies, Green included, all on screen.
    await expect(page.locator('#section-lie [data-group="lie"]')).toHaveCount(5);
    await expect(page.locator('[data-group="lie"][data-val="Green"]')).toBeVisible();
    await page.locator('[data-group="lie"][data-val="Rough"]').click();

    // --- Putter collapses the screen to putt language (BL-OC2-03) ---
    // Glass chips (2026-10-04): the row holds 3 likely clubs; the putter is
    // reached through the All grid, which closes once a club is chosen.
    await page.locator('#bag-buttons-grid .club-all-btn').click();
    await page.locator('#bag-buttons-grid .club-grid-panel button[data-val="Putter"]').click();
    await expect(page.locator('#bag-buttons-grid .club-grid-panel')).toBeHidden();
    await expect(page.locator('#section-putting-outcome')).toBeVisible();
    await expect(page.locator('#section-swing-detail')).toBeHidden();
    await expect(page.locator('#section-miss-pattern')).toBeHidden();
    await expect(page.locator('#section-lie')).toBeHidden();
    await expect(page.locator('[data-group="puttLine"][data-val="On Line"]')).toBeVisible();
    await expect(page.locator('[data-group="puttRead"][data-val="Misread"]')).toBeVisible();

    // Leave the putt unlogged — close the wizard.
    await page.locator('#btn-wizard-cancel').click();
    await expect(wizard).toBeHidden();
});

test('GPS widget lights up with mocked coordinates', async ({ page }, testInfo) => {
    // Geolocation is granted + mocked to the Keperra tee only in the phone
    // project; on desktop the permission is denied and the widget correctly
    // stays hidden — that's the product behaviour, not a failure.
    test.skip(testInfo.project.name !== 'phone' && testInfo.project.name !== 'iphone-se', 'geolocation granted only in the phone projects');

    await registerFreshUser(page);
    // S4: override BEFORE GPS starts (now at Start Round, decision 12) — the toggle's watchPosition then
    // fires once with accuracy 10 directly. (An override AFTER the toggle
    // interleaves a POSITION_UNAVAILABLE error; S10's handler tolerates that
    // transient, but pre-toggle overrides keep the journey deterministic.)
    await page.context().setGeolocation({ latitude: -27.4136, longitude: 152.9465, accuracy: 10 });
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await page.locator('#btn-wizard-cancel').click();

    // Decision 12: Start Round on a mapped course already started GPS.
    await expect(page.locator('#btn-toggle-gps')).not.toHaveText(/OFF/);
    await expect(page.locator('#oc-gps-widget')).toBeVisible({ timeout: 10_000 });
    // S10: the app starts cold (the first fix is the unreliable one) and the
    // strip says "GPS warming" until two good fixes arrive. Real phones stream
    // fixes every second; the mock needs a nudge for the second one.
    await expect(page.locator('#oc-strip-gps')).toHaveText('GPS warming', { timeout: 5_000 });
    await page.context().setGeolocation({ latitude: -27.41361, longitude: 152.9465, accuracy: 10 });
    // The strip shows the centre distance (and live accuracy) once warm.
    await expect(page.locator('#oc-strip-gps')).toHaveText(/\d+m · ±\d+/, { timeout: 10_000 });

    // S4: with a 10 m fix, the chain runs — log shot 1, then open shot 2;
    // the readout says the new shot starts from the measured GPS spot. The
    // fix was overridden to accuracy 10 before the toggle (see top of test).
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 1');
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /logged/i })).toBeVisible();
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    // S10: the capture needs a FRESH fix — the toggle-time fix is stale by
    // now (maxFixAgeMs 2000). Nudge the coordinates ~1 m so the watcher
    // re-fires with the same 10 m accuracy mid-capture.
    await page.context().setGeolocation({ latitude: -27.41361, longitude: 152.9465, accuracy: 10 });
    await expect(page.locator('#line-readout')).toContainText('Start from GPS (±10 m)', { timeout: 8_000 });
});

test('flight-unseen toggle clears and dims line/flight/shape (BL-OC2-03)', async ({ page }) => {
    await registerFreshUser(page);

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });

    // Open swing detail, pick a start line, then declare the flight unseen.
    await page.locator('#section-swing-detail summary').click();
    await page.locator('[data-group="startLine"][data-val="Left"]').click();
    await page.locator('#wiz-toggle-flight-unseen').click();

    // The chosen start line is cleared and the rows are dimmed + disabled.
    await expect(page.locator('[data-group="startLine"][data-val="Left"]'))
        .not.toHaveClass(/active-choice/);
    await expect(page.locator('[data-group="startLine"][data-val="Left"]'))
        .toHaveClass(/wiz-dimmed/);
    // Strike stays live — you feel contact without seeing flight.
    await expect(page.locator('[data-group="strikeQuality"][data-val="Thin"]'))
        .not.toHaveClass(/wiz-dimmed/);
});
