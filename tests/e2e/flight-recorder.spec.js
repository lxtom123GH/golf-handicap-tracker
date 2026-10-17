// Flight recorder: a broken recorder must never stop a round being scored and
// saved; a healthy one records locally and exports sanitized JSON.

import { test, expect } from '@playwright/test';
import { findDocs, seedHandicapByEmail, seedPreapprovedEmail, throwawayEmail, verifyEmulatorEmail } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';
const WEST_COURSE = 'Keperra – West Course (9 holes)';
const SCORES = [5, 5, 4, 6, 5, 4, 5, 4, 5];

async function registerApprovedGolfer(page, prefix) {
    const email = throwawayEmail(prefix);
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Recorder Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await verifyEmulatorEmail(email);
    await page.locator('#btn-check-email').click();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    return email;
}

async function playAndSaveNine(page) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: WEST_COURSE });
    await page.locator('#oc-tee-select').selectOption('Blue (Men)');
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    for (let i = 0; i < SCORES.length; i++) {
        await expect(page.locator('#oc-hole-display')).toHaveText(`Hole ${i + 1}`);
        const card = page.locator('#oc-group-scores .compact-score-card').first();
        await expect(card.locator('.btn-grid-plus')).toBeVisible();
        await page.evaluate((count) => {
            for (let s = 0; s < count; s++) document.querySelector('#oc-group-scores .compact-score-card .btn-grid-plus').click();
        }, SCORES[i]);
        await expect(card.locator('.oc-score-value')).toHaveText(String(SCORES[i]));
        if (i < SCORES.length - 1) await page.locator('#btn-oc-next-hole').click();
    }
    await page.locator('#btn-oc-more').click();
    await page.locator('#btn-oc-finish').click();
    await expect(page.locator('#oc-finish-modal')).toBeVisible({ timeout: 10_000 });
    await page.locator('#btn-oc-save-whs').click();
    await expect(page.locator('#locker-room-msg')).toHaveText('Round Saved Successfully', { timeout: 15_000 });
}

async function savedRounds(email) {
    const [user] = await findDocs('users', 'email', email);
    if (!user) return [];
    return findDocs('whs_rounds', 'uid', user._id);
}

test('a recorder whose every storage path throws never stops the round scoring and saving', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
        // Break ONLY the recorder's own storage (Firestore keeps its IndexedDB).
        const realOpen = indexedDB.open.bind(indexedDB);
        indexedDB.open = (name, v) => { if (name === 'golf-flightrec') throw new Error('flightrec idb broken'); return realOpen(name, v); };
        const proto = Object.getPrototypeOf(localStorage);
        const realSet = proto.setItem;
        proto.setItem = function (k, val) { if (String(k).startsWith('golf.flightrec')) throw new DOMException('full', 'QuotaExceededError'); return realSet.call(this, k, val); };
        const realGet = proto.getItem;
        proto.getItem = function (k) { if (String(k).startsWith('golf.flightrec')) throw new Error('flightrec get broken'); return realGet.call(this, k); };
        window.PerformanceObserver = function () { throw new Error('no observers'); };
    });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));

    const email = await registerApprovedGolfer(page, 'flightrec-broken');
    await seedHandicapByEmail(email, 18);
    // Hostile values straight into the recorder's error listeners mid-session
    // (hostile stateChange details are unit-tested: the app's own listeners
    // would throw on them, which is not the recorder's doing).
    await page.evaluate(() => {
        const evil = {}; Object.defineProperty(evil, 'name', { get() { throw new Error('getter'); } });
        window.dispatchEvent(new ErrorEvent('error', { error: evil, message: 'alex@example.com' }));
        window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: evil }));
    });
    await playAndSaveNine(page);

    await expect.poll(async () => (await savedRounds(email)).length, { timeout: 45_000 }).toBe(1);
    const [saved] = await savedRounds(email);
    expect(saved.holeScores.map(h => h.gross)).toEqual(SCORES);

    // The recorder says honestly that nothing could be saved; the app ran on.
    await page.locator('.tab-btn[data-target="tab-settings"]').click();
    const status = page.locator('.flightrec-card .flightrec-status');
    await expect(status).toHaveText(/NOT being saved|stopped itself/, { timeout: 30_000 });
    console.log('[flightrec e2e] broken-storage status:', await status.textContent());
    expect(pageErrors.filter(e => /flightrec|getter/.test(e))).toEqual([]);
});

test('a healthy recorder commits locally during a round and exports sanitized JSON with the build SHA', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch { /* ignore */ } });
    const email = await registerApprovedGolfer(page, 'flightrec-ok');
    await seedHandicapByEmail(email, 18);
    await playAndSaveNine(page);
    await expect.poll(async () => (await savedRounds(email)).length, { timeout: 45_000 }).toBe(1);

    await page.locator('.tab-btn[data-target="tab-settings"]').click();
    const card = page.locator('.flightrec-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.flightrec-toggle')).toBeChecked();
    await expect(card.locator('.flightrec-cloud')).toContainText('Cloud upload: off');
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20_000 }),
        card.locator('.flightrec-export').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^golf-diagnostics-\d{8}-\d{4}\.json$/);
    const text = await (await download.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString('utf8'));
    const out = JSON.parse(text);
    expect(out.schema).toBe('golf-flightrec/1');
    expect(out.exportBuild).toMatch(/^v\d+\.\d+\.\d+\+([0-9a-f]{40}|unknown)$/);
    const events = out.batches.flatMap(b => b.events);
    const kinds = new Set(events.map(e => e.k));
    console.log('[flightrec e2e] kinds:', [...kinds].join(','), 'status:', JSON.stringify(out.status));
    for (const k of ['boot', 'round_start', 'hole', 'score', 'write']) expect(kinds.has(k)).toBe(true);
    // The WHS save was seen as an attempt (its server ack is recorded separately, never inferred).
    expect(events.some(e => e.k === 'write' && e.kind === 'round' && e.status === 'attempt')).toBe(true);
    expect(out.status.committed).toBeGreaterThan(0);
    expect(text).not.toContain(email);
    expect(text).not.toContain('Recorder Golfer');
    expect(text).not.toMatch(/"(lat|lon|uid|email)"/);
    console.log('[flightrec e2e] export:', out.status.storage, 'committed', out.status.committed, 'events', events.length, 'build', out.exportBuild);
});
