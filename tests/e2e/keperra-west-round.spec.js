// ==========================================================================
// keperra-west-round.spec.js — the owner's Sunday round, end to end
// ==========================================================================
// Sun 4 Oct 2026, 05:30: nine holes at Keperra, West nine off the 19th tee,
// on the live app. This walks that exact round against the emulators with a
// mocked phone: start "Keperra – West Course (9 holes)", check app hole 1 is
// physical 19 (par + green), stand on every tee and 100 m short of every
// green and read Front/Centre/Back, score and putt each hole, reload mid-round,
// drop offline for a hole, finish, and read the saved round back out of
// Firestore with its nine-hole differential.

import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    seedPreapprovedEmail,
    seedHandicapByEmail,
    throwawayEmail,
    findDocs,
    registerAndVerifySignup,
} from './helpers/emulator.js';
import { COURSE_DATA, KEPERRA_GPS } from '../../src/course-data.js';
import { roundDifferential } from '../../src/differential.js';
import { previewProxy } from './helpers/preview-proxy.js';

const test = base.extend({
    offlineProxy: async ({ browserName, baseURL }, use) => {
        const proxy = browserName === 'webkit' ? await previewProxy(baseURL) : null;
        try { await use(proxy); } finally { await proxy?.stop(); }
    },
});

const COURSE = 'Keperra – West Course (9 holes)';
const TEE = 'Blue (Men)';
const PASSWORD = 'e2e-password-1';
const INDEX = 18; // representative established index; not the owner's private value
const keperra = JSON.parse(readFileSync(resolve('public/courses/keperra.json'), 'utf8'));

// Pinned fixture readings, not measurements of ground accuracy. Positions
// come from the app's data; this checks its mapping and displayed rounding.
const TEE_TO_CENTRE = { 19: 243, 20: 341, 21: 268, 22: 325, 23: 383, 24: 331, 25: 126, 26: 241, 27: 155 };
const PARS = [4, 4, 4, 4, 5, 4, 3, 4, 3];
const SI = [8, 3, 6, 1, 4, 2, 7, 9, 5];
// Blob on physical 19, net par on SI 1 (physical 22): moving the extra
// handicap stroke between them changes the total, unlike uniform bogeys.
const SCORES = [11, 5, 5, 6, 6, 5, 4, 5, 4];

function metres(aLat, aLon, bLat, bLon) {
    const r = (x) => (x * Math.PI) / 180;
    const h = Math.sin(r(bLat - aLat) / 2) ** 2
        + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** The point `back` metres short of the green centre on the tee->centre line. */
function shortOfGreen(tee, centre, back) {
    const f = 1 - back / metres(tee.lat, tee.lon, centre[0], centre[1]);
    return { latitude: tee.lat + (centre[0] - tee.lat) * f, longitude: tee.lon + (centre[1] - tee.lon) * f };
}

const num = async (loc) => Number((await loc.textContent()).replace(/[^\d]/g, ''));

async function readFMB(page) {
    return {
        f: await num(page.locator('#gps-front')),
        m: await num(page.locator('#gps-middle')),
        b: await num(page.locator('#gps-back')),
    };
}

/** Put the phone at `pos` and check the exact rounded fixture reading. */
async function standAt(page, pos, expectM) {
    // Two fixes: the strip's warm-up wants two good ones, and the widget
    // updates on each.
    await page.context().setGeolocation({ ...pos, accuracy: 5 });
    await expect.poll(() => num(page.locator('#gps-middle')), { timeout: 10_000 }).toBe(expectM);
    await page.context().setGeolocation({ ...pos, accuracy: 4 });
    await expect.poll(() => num(page.locator('#gps-middle')), { timeout: 10_000 }).toBe(expectM);
    return readFMB(page);
}

test('Sunday: 9 holes Keperra West (19-27) — mapping, F/M/B, scoring, reload, offline, save with a 9-hole differential', async ({ page, offlineProxy }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'phone geolocation journey');
    test.setTimeout(240_000);

    // Sign in (fresh preapproved user).
    const email = throwawayEmail('sunday');
    await seedPreapprovedEmail(email);
    await page.goto(offlineProxy?.url || '/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Sunday E2E');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
    await seedHandicapByEmail(email, INDEX);

    // On Course -> 9 holes -> Keperra West; both tees offered.
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption(COURSE);
    const tees = await page.locator('#oc-tee-select option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    expect(tees).toEqual(expect.arrayContaining(['Blue (Men)', 'White (Men)']));
    await page.locator('#oc-tee-select').selectOption(TEE);
    // PR #17 CI triage (Claude), issuecomment-6167035331: explicit category.
    await page.locator('#oc-handicap-category').selectOption('men');
    const teeData = COURSE_DATA[COURSE][TEE];
    expect(teeData.physicalHoles).toEqual([19, 20, 21, 22, 23, 24, 25, 26, 27]);
    expect(teeData.pars).toEqual(PARS);
    expect(teeData.strokeIndex).toEqual(SI);
    await expect(page.locator('#oc-stat-cr')).toHaveValue(String(teeData.rating));
    await expect(page.locator('#oc-stat-sr')).toHaveValue(String(teeData.slope));
    // The actual preview calculates DH 10 from profile HI 18, West CR/SR
    // and nine holes. No manually typed Daily Handicap bypasses that path.
    await expect(page.locator('#oc-dh-value')).toHaveText('10');
    await expect(page.locator('#oc-dh-override')).toHaveValue('10');

    // Seed before watchPosition: Chromium otherwise interleaves an unavailable
    // position while switching from its default clubhouse mock to the West tee.
    // Decision 12: GPS starts with the round, so seed before Start Round.
    const firstTee = keperra.holes[19].tee;
    await page.context().setGeolocation({ latitude: firstTee.lat, longitude: firstTee.lon, accuracy: 4 });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#oc-hole-display')).toHaveText('Hole 1');
    const player = await page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state')).liveRoundGroups[0]);
    expect(player.handicapIndex).toBe(INDEX);
    expect(player.dailyHandicap).toBe(10);

    // Decision 12: Start Round on a mapped course already started GPS.
    await expect(page.locator('#btn-toggle-gps')).not.toHaveText(/OFF/);
    await expect(page.locator('#oc-gps-widget')).toBeVisible({ timeout: 10_000 });

    const card = () => page.locator('#oc-group-scores .compact-score-card').nth(0);
    const readings = [];
    for (let i = 0; i < 9; i++) {
        const holeNo = i + 1;
        const physical = teeData.physicalHoles[i];
        const par = teeData.pars[i];
        await expect(page.locator('#oc-hole-display')).toHaveText(`Hole ${holeNo}`);
        await expect(page.locator('#oc-par-display')).toHaveText(`Par ${par}`);
        // keperra.json supplies geometry; its par/handicap metadata is null.
        // Scoring pars and SI are pinned independently above.

        const tee = keperra.holes[physical].tee;
        const g = KEPERRA_GPS[physical];
        const atTee = await standAt(page, { latitude: tee.lat, longitude: tee.lon }, TEE_TO_CENTRE[physical]);
        expect(atTee.f, `hole ${physical} tee F<M`).toBeLessThan(atTee.m);
        expect(atTee.b, `hole ${physical} tee B>M`).toBeGreaterThan(atTee.m);
        expect(atTee.b - atTee.f, `hole ${physical} green depth`).toBeLessThan(45);
        const at100 = await standAt(page, shortOfGreen(tee, g, 100), 100);
        expect(at100.f).toBeLessThan(100);
        expect(at100.b).toBeGreaterThan(100);
        readings.push({ physical, tee: atTee, at100 });

        // Varied scores with two putts.
        const score = SCORES[i];
        for (let s = 0; s < score; s++) await card().locator('.btn-grid-plus').click();
        for (let s = 0; s < 2; s++) await card().locator('.putt-plus').click();
        await expect(card().locator('.oc-score-value')).toHaveText(String(score));
        await expect(card()).toContainText('2 P');

        if (holeNo === 4) {
            // Controlled page reload checks restoration, not real iOS eviction.
            await page.reload();
            await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
            await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 15_000 });
            await expect(page.locator('#oc-hole-display')).toHaveText('Hole 4');
            await expect(card().locator('.oc-score-value')).toHaveText(String(score));
            await expect(card()).toContainText('2 P');
        }
        if (holeNo === 6) {
            // A dead spot on the course: this hole was scored online; go
            // offline, move on, score the next hole, come back.
            await page.context().setOffline(true);
        }
        if (holeNo === 7) {
            // Offline reload: the service worker must serve the shell. The
            // marker proves a real reload happened (not a silently failed one).
            await page.evaluate(() => { window.__beforeReload = true; });
            if (offlineProxy) {
                // Playwright #42775: WebKit's offline flag rejects SW responses.
                // Stop this private origin instead; reapply the flag after reload.
                await offlineProxy.stop();
                await page.context().setOffline(false);
            }
            const response = await page.reload();
            expect(response.fromServiceWorker()).toBe(true);
            await expect(page.locator('#oncourse-hub')).toBeVisible({ timeout: 20_000 });
            expect(await page.evaluate(() => window.__beforeReload === true)).toBe(false);
            expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
            await expect(page.locator('#oc-hole-display')).toHaveText('Hole 7');
            await expect(card().locator('.oc-score-value')).toHaveText(String(score));
            if (offlineProxy) {
                await page.context().setOffline(true);
                await offlineProxy.start();
            }
            // Remain in the dead spot through Finish and Save.
        }
        if (holeNo < 9) {
            await page.locator('#btn-oc-next-hole').click();
        }
    }
    // Simplify C23: on the last hole Next says what it does.
    await expect(page.locator('#btn-oc-next-hole')).toHaveText('Finish ✓');
    testInfo.annotations.push({ type: 'readings', description: JSON.stringify(readings) });
    console.log('F/M/B readings:', JSON.stringify(readings));

    // Finish -> summary -> save.
    await page.locator('#btn-oc-more').click();
    await page.locator('#btn-oc-finish').click();
    await expect(page.locator('#oc-finish-modal')).toBeVisible({ timeout: 10_000 });
    const gross = SCORES.reduce((t, s) => t + s, 0);
    await expect(page.locator('#sum-total-shots')).toHaveText(String(gross));
    await expect(page.locator('#sum-total-putts')).toHaveText('18');
    await expect(page.locator('#oc-finish-holes')).toHaveValue('9');
    const summaryPoints = Number(await page.locator('#sum-total-points').textContent());
    expect(summaryPoints).toBe(16);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await page.locator('#btn-oc-save-whs').click();
    await expect(page.locator('#locker-room-msg')).toHaveText('Round Saved Locally', { timeout: 15_000 });
    await expect(page.locator('#locker-room-msg')).not.toContainText(/NOT/);
    const backup = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => k.startsWith('round_backup_'));
        return key ? JSON.parse(localStorage.getItem(key)) : null;
    });
    expect(backup).not.toBeNull();
    expect(backup.synced).toBe(false);
    expect(backup.course).toBe(COURSE);
    expect(Object.values(backup.players[0].scores)).toEqual(SCORES);
    await page.context().setOffline(false); // replay the queued write to the emulator

    // Read the round back out of Firestore.
    const [user] = await findDocs('users', 'email', email);
    let saved;
    await expect.poll(async () => {
        [saved] = await findDocs('whs_rounds', 'uid', user._id);
        return !!saved;
    }, { timeout: 15_000 }).toBe(true);
    expect(saved.courseName).toBe(COURSE);
    expect(saved.holesPlayed).toBe(9);
    expect(saved.rating).toBe(teeData.rating);
    expect(saved.slope).toBe(teeData.slope);
    expect(saved.totalGross).toBe(gross);
    expect(saved.totalPutts).toBe(18);
    expect(saved.dailyHandicap).toBe(10);
    expect(saved.notCounting).toBe(false);
    // The summary he reads before tapping Save shows the points that are saved
    // (after two reloads, so the tee came from the round, not the <select>).
    expect(saved.totalStableford).toBe(16);
    expect(summaryPoints).toBe(saved.totalStableford);
    expect(saved.holeScores.map((h) => h.h)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const diff = roundDifferential(saved, INDEX);
    expect(saved.adjustedGross).toBe(47);
    // Synthetic component calculation: (AGS47 - CR35) * 113 / SR131 = 10.351…
    // This is one played nine, pending its partner; no expected unplayed nine.
    expect(diff).toBe(10.4);
    console.log('saved round:', JSON.stringify({ ags: saved.adjustedGross, stableford: saved.totalStableford, diff }));
});
