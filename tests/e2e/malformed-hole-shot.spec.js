import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { registerAndVerifySignup, readDoc, throwawayEmail } from './helpers/emulator.js';

test.use({ serviceWorkers: 'block' });

test('a malformed mapped hole still logs a GPS shot and advances to shot 2', async ({ page }, testInfo) => {
    test.skip(!['phone', 'iphone-se'].includes(testInfo.project.name), 'phone GPS journey');
    const errors = [];
    const course = JSON.parse(readFileSync(new URL('../../public/courses/ashgrove.json', import.meta.url)));
    const { lat, lon } = course.holes[1].tee;
    delete course.holes[1].tee;
    await page.route('**/courses/ashgrove.json', route => route.fulfill({ json: course }));
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'both'));
    // Test-owned geolocation emits no implicit samples or native timestamps.
    await page.addInitScript(() => {
        const watches = new Map();
        let nextId = 1;
        const calls = [];
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
            watchPosition(success) { const id = nextId++; watches.set(id, success); return id; },
            clearWatch(id) { watches.delete(id); },
            getCurrentPosition() { throw new Error('Unexpected one-shot GPS request'); },
        } });
        window.__gpsFixture = {
            counts: () => ({ watches: watches.size, delivered: calls.length }),
            emit(latitude, longitude, accuracy) {
                if (watches.size !== 1) throw new Error('Expected one GPS watcher');
                const timestamp = Date.now();
                const position = { coords: { latitude, longitude, accuracy,
                    altitude: null, altitudeAccuracy: null, heading: null, speed: 0 }, timestamp };
                for (const callback of watches.values()) { callback(position); calls.push(position); }
                return timestamp;
            },
        };
    });
    const email = throwawayEmail('malformed-hole');
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Synthetic GPS Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('synthetic-pass-1');
    await registerAndVerifySignup(page, email);
    // Observe round errors after boot; blocking SWs triggers an unrelated registration error.
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible();
    await expect(page.locator('#gps-lock-ring')).toBeVisible();
    // Keep browser timers real: Start Round awaits Firestore before opening
    // the wizard. Deliver both test-owned callbacks in one browser task, so
    // no timer or runner round trip can interleave the 30 m and 3 m samples.
    const captureSamples = await page.evaluate(({ lat, lon }) => {
        const fixture = window.__gpsFixture;
        const before = fixture.counts();
        if (before.watches !== 1 || before.delivered !== 0) {
            throw new Error('GPS fixture must begin with one watcher and no samples');
        }
        const ring = document.getElementById('gps-lock-ring');
        if (!ring || ring.classList.contains('hidden')) {
            throw new Error('GPS capture window closed before fixture delivery');
        }
        const firstAt = fixture.emit(lat, lon, 30);
        const firstAccuracy = ring.querySelector('.gps-lock-acc')?.textContent;
        const secondAt = fixture.emit(lat + 0.00001, lon, 3);
        const secondAccuracy = ring.querySelector('.gps-lock-acc')?.textContent;
        return { before, after: fixture.counts(), firstAt, secondAt,
            accuracies: [firstAccuracy, secondAccuracy] };
    }, { lat, lon });
    expect(captureSamples.before).toEqual({ watches: 1, delivered: 0 });
    expect(captureSamples.after).toEqual({ watches: 1, delivered: 2 });
    expect(captureSamples.accuracies).toEqual(['±30', '±3']);
    await testInfo.attach('gps-fixture-samples', {
        body: JSON.stringify(captureSamples), contentType: 'application/json',
    });
    // Production's natural four-second final-decision timer remains unmodified.
    await expect(page.locator('#gps-lock-ring')).toBeHidden();
    expect(await page.evaluate(() => window.__gpsFixture.counts())).toEqual({ watches: 1, delivered: 2 });
    await page.locator('#bag-buttons-grid button').first().click();
    await page.locator('#btn-save-shot-final').click();
    await expect(page.getByRole('status').filter({ hasText: /Shot 1 logged/ }).first()).toBeVisible();
    await expect(page.locator('#oncourse-wizard')).toBeHidden();
    await expect(page.locator('#line-readout')).toContainText('Start from GPS (±3 m)');

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('golf_round_state')));
    const [shot] = stored.currentHoleShots;
    expect(stored.liveRoundGroups[0].scores[1]).toBe(1);
    expect(shot).toMatchObject({ hole: 1, shotNumber: 1,
        startPos: { accuracyM: 3 }, gpsCapture: {
            role: 'start', state: 'accepted', fixCount: { usable: 2, ignored: 0 },
        } });
    // Independent unit-sphere weighted mean of the two pinned fixture points.
    expect(lat).toBe(-27.4454585);
    expect(lon).toBe(152.9601132);
    expect(shot.startPos.lat).toBeCloseTo(-27.445448599009907, 11);
    expect(shot.startPos.lon).toBeCloseTo(152.9601132, 11);
    expect(shot.startXY).toBeUndefined();
    await expect.poll(() => readDoc(`shots/${shot.id}`)).toMatchObject({
        hole: 1, shotNumber: 1, startPos: shot.startPos, gpsCapture: shot.gpsCapture,
    });
    await testInfo.attach('persisted-shot', { body: JSON.stringify({
        startPos: shot.startPos, gpsCapture: shot.gpsCapture, score: stored.liveRoundGroups[0].scores[1],
    }), contentType: 'application/json' });
    await page.locator('#btn-oc-track-shot').click();
    await expect(page.locator('#wizard-title')).toContainText('Shot 2');
    await expect(page.locator('#wizard-step')).toHaveText('No map for this hole yet - pick the club and result');
    await page.screenshot({ path: testInfo.outputPath('shot-2-fallback.png') });
    await page.locator('#btn-wizard-cancel').click();
    await page.locator('#btn-oc-next-hole').click();
    await expect(page.locator('#wizard-title')).toHaveText('🎯 Hole 2 — Shot 1');
    await expect(page.locator('#shot-line-canvas')).toHaveAttribute('data-view-mode', 'shot');
    expect(errors).toEqual([]);
});
