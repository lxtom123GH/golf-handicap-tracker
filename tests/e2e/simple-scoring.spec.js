// ==========================================================================
// simple-scoring.spec.js — Simple mode: score only, no wizard, no lines
// ==========================================================================
// Owner 2026-09-19: the brothers should be able to test "just the scoring"
// for a competition without the drawing-lines flow. Simple mode has existed
// as the Start Round default all along but nothing in the suite exercised
// it; this is the canary. It also proves the two things a tester will hit
// first: a guest by name scores alongside you, and a reload keeps the card.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail('simple');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Simple E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
}

test('Simple mode: start with a guest, score two players, Next/Prev keeps scores, reload keeps the round, no wizard ever', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();

    // Simple is the default; tapping it makes the intent explicit.
    await page.locator('#btn-mode-simple').click();
    await expect(page.locator('#oc-mode-desc')).toContainText(/Simple/);
    await page.locator('#btn-round-18').click(); // Ashgrove is an 18-hole course; 9 hides it
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });

    // A brother without an account as a guest by name — added FIRST, with no
    // Add tap for myself. Owner decision 2026-09-20: I am in my own round
    // regardless (until 2026-09-19 this started a round without me).
    await page.locator('#oc-guest-name').fill('Brother One');
    await page.locator('#btn-oc-add-guest').click();
    await expect(page.locator('#oc-players-list')).toContainText('Brother One');

    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });

    // The whole point: no wizard, no Track-my-shot, no line canvas.
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
    await expect(page.locator('#btn-oc-track-shot')).toBeHidden();
    await expect(page.locator('#section-line')).toBeHidden();
    await expect(page.locator('#oc-hole-display')).toContainText('Hole 1');

    // Two score cards: me and the guest.
    const cards = page.locator('#oc-group-scores .compact-score-card');
    await expect(cards).toHaveCount(2);
    // Play mode (on by default; Ashgrove has a map): your card is on the
    // map, the guest's is in the pull-up group sheet.
    await expect(page.locator('body')).toHaveClass(/play-mode/);
    await page.locator('#btn-oc-score-sheet').click();

    // Score 4 for me, 5 for the guest; two putts and a fairway for me.
    for (let i = 0; i < 4; i++) await cards.nth(0).locator('.btn-grid-plus').click();
    for (let i = 0; i < 5; i++) await cards.nth(1).locator('.btn-grid-plus').click();
    await expect(cards.nth(0).locator('.oc-score-value')).toHaveText('4');
    await expect(cards.nth(1).locator('.oc-score-value')).toHaveText('5');
    const fwy = cards.nth(0).locator('.mini-stat', { hasText: /FIR|FWY|Fairway/i }).first();
    if (await fwy.count()) await fwy.click();

    // Next hole, then back: the hole-1 scores are still there.
    // Simplify C23: Prev is disabled on hole 1 and live from hole 2.
    await expect(page.locator('#btn-oc-prev-hole')).toBeDisabled();
    await page.locator('#btn-oc-next-hole').click();
    await expect(page.locator('#oc-hole-display')).toContainText('Hole 2');
    await expect(page.locator('#btn-oc-prev-hole')).toBeEnabled();
    await expect(page.locator('#oc-group-scores .compact-score-card').nth(0).locator('.oc-score-value')).toHaveText('0');
    await page.locator('#btn-oc-prev-hole').click();
    await expect(page.locator('#oc-hole-display')).toContainText('Hole 1');
    await expect(page.locator('#oc-group-scores .compact-score-card').nth(0).locator('.oc-score-value')).toHaveText('4');
    await expect(page.locator('#oc-group-scores .compact-score-card').nth(1).locator('.oc-score-value')).toHaveText('5');

    // A reload mid-round (flat battery, tab eviction) keeps the card.
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
    await expect(page.locator('#oc-hole-display')).toContainText('Hole 1');
    await expect(page.locator('#oc-group-scores .compact-score-card').nth(0).locator('.oc-score-value')).toHaveText('4');
    await expect(page.locator('#oc-group-scores .compact-score-card').nth(1).locator('.oc-score-value')).toHaveText('5');
});

test('Simple mode: Finish opens the round summary with the shots counted', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-18').click(); // Ashgrove is an 18-hole course; 9 hides it
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });

    const me = page.locator('#oc-group-scores .compact-score-card').nth(0);
    for (let i = 0; i < 5; i++) await me.locator('.btn-grid-plus').click();
    await expect(me.locator('.oc-score-value')).toHaveText('5');

    // Finish lives in the strip's ⋯ menu.
    await page.locator('#btn-oc-more').click();
    await page.locator('#btn-oc-finish').click();
    await expect(page.locator('#oc-finish-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#sum-total-shots')).toContainText('5');
    // Simplify C20: nothing scored after hole 9 of this 18, so the summary
    // pre-selects 9 holes and says only 1 was scored. The choice stays visible.
    await expect(page.locator('#oc-finish-holes')).toBeVisible();
    await expect(page.locator('#oc-finish-holes')).toHaveValue('9');
    await expect(page.locator('#oc-finish-holes-warn')).toContainText('You scored 1 hole but chose 9.');
    // Review P1: a nine off an 18-hole tee has no nine-hole rating; it's kept but not counted.
    await expect(page.locator('#oc-finish-holes-warn')).toContainText("won't count in your index");
    // Back keeps the round going — nothing is written by this test.
    // Simplify C21: the summary has one pair of exits, in its header.
    await expect(page.locator('#btn-oc-discard, #btn-oc-cancel-finish')).toHaveCount(0);
    await page.locator('#btn-oc-finish-close').click();
    await expect(page.locator('#oc-finish-modal')).toBeHidden();
    await expect(page.locator('#oncourse-hub')).toBeVisible();
});

test('Owner 2026-09-20: removing yourself is honoured; the ⋯ menu and the summary header are reachable without scrolling sideways or to the bottom', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });

    // Add myself, add a guest, then REMOVE myself: the round is the guest's only.
    await page.locator('#btn-oc-add-player').click();
    await page.locator('#oc-guest-name').fill('Brother Two');
    await page.locator('#btn-oc-add-guest').click();
    await expect(page.locator('#oc-players-list .remove-player-btn')).toHaveCount(2);
    await page.locator('#oc-players-list .remove-player-btn').first().click();
    await expect(page.locator('#oc-players-list .remove-player-btn')).toHaveCount(1);
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#oc-group-scores .compact-score-card')).toHaveCount(1);
    await expect(page.locator('#oc-group-scores')).toContainText('Brother Two');

    // The ⋯ menu: every button inside the viewport width (Finish and Abandon
    // used to sit off the right edge on a 375 px screen).
    await page.locator('#btn-oc-more').click();
    const vw = page.viewportSize().width;
    for (const id of ['#btn-oc-review-round', '#btn-oc-map-hole', '#btn-oc-finish', '#btn-oc-exit']) {
        const box = await page.locator(id).boundingBox();
        expect(box, id).not.toBeNull();
        expect(box.x, id).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${id} right edge`).toBeLessThanOrEqual(vw + 0.5);
        expect(Math.max(box.width, box.height), id).toBeGreaterThanOrEqual(44);
    }

    // Simplify C22: whatever the ⋯ sheet opens folds it. Review Card first…
    await page.locator('#btn-oc-review-round').click();
    await expect(page.locator('#review-round-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#oc-more-sheet')).toBeHidden();
    await expect(page.locator('#btn-oc-more')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#btn-close-review').click();
    await page.locator('#btn-oc-more').click();

    // The summary's header carries Back and Abandon; Back closes it from the top.
    await page.locator('#btn-oc-finish').click();
    const modal = page.locator('#oc-finish-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#oc-more-sheet')).toBeHidden(); // …then Finish (C22)
    // Header band: Abandon sits above the summary stats, not below the
    // 18-hole table. (A pixel threshold here
    // was brittle across the three projects: 136 / 222 / 235 px.)
    // Measured in ONE evaluate: the modal scrolls into view when it opens, and
    // two separate boundingBox() calls straddled that animation.
    const order = await page.evaluate(() => {
        const top = (id) => document.getElementById(id).getBoundingClientRect().top;
        return { abandon: top('btn-oc-finish-abandon'), stats: top('sum-total-shots') };
    });
    expect(order.abandon, JSON.stringify(order)).toBeLessThan(order.stats);
    await page.locator('#btn-oc-finish-close').click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#oncourse-hub')).toBeVisible();
});

test('Owner 2026-09-20: a saved guest is pickable next round (same record) and every player has a Daily HC box', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });

    // Create the guest once.
    await page.locator('#oc-guest-name').fill('Brother Three');
    await page.locator('#btn-oc-add-guest').click();
    await expect(page.locator('#oc-players-list')).toContainText('Brother Three');
    // The picker lists them straight away (this session) …
    const guestOpt = page.locator('#oc-player-select #oc-player-guests option');
    await expect(guestOpt).toHaveCount(1);
    const guestUid = await guestOpt.first().getAttribute('value');
    expect(guestUid).toMatch(/^guest_/);

    // Daily HC: type 18 for the guest, blank stays "auto" for me.
    const guestHc = page.locator(`#oc-players-list .player-hc-input[data-uid="${guestUid}"]`);
    await expect(guestHc).toHaveAttribute('placeholder', 'auto');
    await guestHc.fill('18');
    await guestHc.blur();
    // The list re-renders from state; the value survives.
    await expect(page.locator(`#oc-players-list .player-hc-input[data-uid="${guestUid}"]`)).toHaveValue('18');

    // … and after a reload, from Firestore: pick them again with no new guest minted.
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await expect(page.locator('#oc-player-select #oc-player-guests option')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('#oc-player-select #oc-player-guests option').first()).toHaveAttribute('value', guestUid);
    await page.locator('#oc-player-select').selectOption(guestUid);
    await page.locator('#btn-oc-add-player').click();
    await expect(page.locator('#oc-players-list')).toContainText('Brother Three');
    await expect(page.locator('#oc-players-list')).toContainText('(guest)');
    await expect(page.locator('#oc-players-list .remove-player-btn')).toHaveCount(1);

    // Start: me (auto-included) + the same guest, two cards, Stableford live for the guest with an HC.
    await page.locator(`#oc-players-list .player-hc-input[data-uid="${guestUid}"]`).fill('18');
    await page.locator(`#oc-players-list .player-hc-input[data-uid="${guestUid}"]`).blur();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#oc-group-scores .compact-score-card')).toHaveCount(2);
    await expect(page.locator('#oc-group-scores')).toContainText('Brother Three');
});

test('Owner 2026-09-20: a guest handicap is typed once — remembered, prefilled next round, and the guest is deletable in Settings', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#oc-guest-name').fill('Sam');
    await page.locator('#btn-oc-add-guest').click();
    const uid = await page.locator('#oc-player-select #oc-player-guests option').first().getAttribute('value');

    // Type 18 once.
    const hc = page.locator(`#oc-players-list .player-hc-input[data-uid="${uid}"]`);
    await hc.fill('18');
    await hc.blur();

    // Settings shows it remembered, on the guest itself.
    await page.locator('#tab-btn-settings').click();
    const row = page.locator('#settings-guests-list li', { hasText: 'Sam' });
    await expect(row).toContainText('HC 18', { timeout: 15_000 });

    // A fresh round prefills it — no retyping.
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await expect(page.locator('#oc-player-select #oc-player-guests option')).toHaveCount(1, { timeout: 15_000 });
    await page.locator('#oc-player-select').selectOption(uid);
    await page.locator('#btn-oc-add-player').click();
    await expect(page.locator(`#oc-players-list .player-hc-input[data-uid="${uid}"]`)).toHaveValue('18');

    // And Settings deletes the guest (the duplicate-guest cure).
    page.once('dialog', d => d.accept());
    await page.locator('#tab-btn-settings').click();
    await page.locator('#settings-guests-list li', { hasText: 'Sam' }).locator('.guest-delete-btn').click();
    await expect(page.locator('#settings-guests-status')).toContainText('deleted', { timeout: 15_000 });
    await expect(page.locator('#settings-guests-list')).not.toContainText('Sam');
});
