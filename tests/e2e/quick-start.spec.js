// ==========================================================================
// quick-start.spec.js — owner 2026-10-05: "make it easier and faster to start
// a new round"
// ==========================================================================
// Play a Detailed 18-hole round with a saved guest at Keperra, leave it, and
// the Start New Round screen offers a Play again card with that exact setup;
// one tap starts it. The form also opens on those choices, and (geolocation
// is granted at Keperra in the phone projects) the course you are standing
// at is picked for a brand-new golfer.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
const OLD18 = 'Keperra - Old (1-18)';

async function registerFreshUser(page, prefix) {
    const email = throwawayEmail(prefix);
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Quick Start');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
}

const roundState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state') || 'null'));

// Geolocation is granted (at Keperra) only in the phone projects; desktop
// has no permission, so the GPS parts are checked there only.
const GPS_PROJECTS = new Set(['phone', 'iphone-se']);

test('Play again: leave a Detailed 18 with a guest, one tap starts the same round', async ({ page }, testInfo) => {
    await registerFreshUser(page, 'quickstart');
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    // No round played yet: no card.
    await expect(page.locator('#oc-quick-start')).toBeHidden();

    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – Old + North (Par 72)' });
    await page.locator('#oc-tee-select').selectOption('Blue (Men)'); // not the first tee
    await page.locator('#oc-guest-name').fill('Sam');
    await page.locator('#btn-oc-add-guest').click();
    await expect(page.locator('#oc-players-list')).toContainText('Sam');
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await page.locator('#btn-wizard-cancel').click();

    // Leave the round (Abandon), back to Start New Round.
    page.once('dialog', d => d.accept());
    await page.locator('#btn-oc-more').click();
    await page.locator('#btn-oc-exit').click();
    await expect(page.locator('#oncourse-setup')).toBeVisible({ timeout: 10_000 });

    // A reload too: the card is per user on this phone and waits for the
    // player list (the saved guest comes back from Firestore).
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();

    const card = page.locator('#oc-quick-start');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#oc-quick-start-course')).toHaveText('Keperra – Old + North (Par 72)');
    await expect(page.locator('#oc-quick-start-details')).toHaveText('Blue (Men) tees · 18 holes · Detailed');
    await expect(page.locator('#oc-quick-start-players')).toHaveText('Players: You, Sam (guest)');
    // GPS (granted, at Keperra) says you're at this course; with no
    // permission (desktop) nothing is asked and the card says nothing.
    if (GPS_PROJECTS.has(testInfo.project.name)) {
        await expect(page.locator('#oc-quick-start-here')).toBeVisible({ timeout: 15_000 });
    } else {
        await expect(page.locator('#oc-quick-start-here')).toBeHidden();
    }

    // The form underneath opens on the same choices; date is today.
    await expect(page.locator('#oc-course-select')).toHaveValue(OLD18);
    await expect(page.locator('#oc-tee-select')).toHaveValue('Blue (Men)');
    await expect(page.locator('#btn-round-18')).toHaveClass(/active/);
    await expect(page.locator('#btn-mode-detailed')).toHaveClass(/active/);
    const today = await page.evaluate(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await expect(page.locator('#oc-round-date')).toHaveValue(today);

    // Fits the phone: thumb-sized button, nothing off the right edge.
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());
    const geo = await page.evaluate(() => {
        const b = document.getElementById('btn-oc-play-again').getBoundingClientRect();
        const c = document.getElementById('oc-quick-start').getBoundingClientRect();
        return { bh: b.height, br: b.right, cr: c.right, sw: document.scrollingElement.scrollWidth };
    });
    const vp = page.viewportSize();
    expect(geo.bh, JSON.stringify(geo)).toBeGreaterThanOrEqual(44);
    expect(geo.br).toBeLessThanOrEqual(vp.width);
    expect(geo.cr).toBeLessThanOrEqual(vp.width);
    expect(geo.sw).toBeLessThanOrEqual(vp.width);
    await page.screenshot({ path: test.info().outputPath('play-again-card.png') });

    // One tap.
    await page.locator('#btn-oc-play-again').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 }); // Detailed opens the wizard
    const st = await roundState(page);
    expect(st.currentRoundCourseName).toBe(OLD18);
    expect(st.currentRoundTee).toBe('Blue (Men)');
    expect(st.currentRoundHoles).toBe(18);
    expect(st.currentTrackingMode).toBe('detailed');
    expect(st.currentRoundDate).toBe(today);
    expect(st.liveRoundGroups).toHaveLength(2);
    const guest = st.liveRoundGroups.find(p => p.isGuest);
    expect(guest?.name).toBe('Sam');
    expect(guest?.uid).toMatch(/^guest_/);
});

test('GPS: a new golfer standing at Keperra gets Keperra picked, and can change it', async ({ page }, testInfo) => {
    test.skip(!GPS_PROJECTS.has(testInfo.project.name), 'geolocation is granted only in the phone projects');
    await registerFreshUser(page, 'quickgps');
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await expect(page.locator('#oc-course-gps-note')).toContainText("You're at Keperra", { timeout: 15_000 });
    await expect(page.locator('#oc-course-select')).toHaveValue(/Keperra/);
    await expect(page.locator('#oc-quick-start')).toBeHidden(); // nothing played yet

    // The player's own pick wins and the note goes.
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await expect(page.locator('#oc-course-gps-note')).toBeHidden();
    await page.waitForTimeout(1500);
    await expect(page.locator('#oc-course-select')).toHaveValue('Ashgrove GC');
});
