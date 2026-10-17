import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup, pinLegacyShotEntry } from './helpers/emulator.js';

test('West nine: physical hole 19 has three live big numbers that fit the phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'journey uses the phone projects’ mocked GPS');
    await page.context().setGeolocation({ latitude: -27.4086, longitude: 152.9530, accuracy: 6 });
    const email = throwawayEmail('big-numbers');
    await seedPreapprovedEmail(email);
    await pinLegacyShotEntry(page);
    const courseLoaded = page.waitForResponse(response => response.url().endsWith('/courses/keperra.json') && response.ok());
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('West Nine Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);

    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-detailed').click();
    await page.locator('#btn-round-9').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Keperra – West Course (9 holes)' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-wizard')).toBeVisible({ timeout: 15_000 });
    await courseLoaded;
    await page.locator('#btn-wizard-cancel').click();
    // C27 + decision 12: Start Round started GPS on this mapped course, so
    // the distance pill (Play mode's one GPS chip) opens the big view.
    await expect(page.locator('#btn-big-numbers')).toBeHidden();
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());
    await expect(page.locator('#oc-gps-widget')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#btn-play-gps')).toBeHidden();
    await page.locator('#oc-gps-widget').click();
    const overlay = page.locator('#big-numbers-view');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#big-hole')).toHaveText('Hole 19 · Par 4');
    for (const id of ['front', 'middle', 'back']) {
        await expect(page.locator(`#big-${id}`)).toHaveText(/^\d+$/);
    }
    await expect(page.locator('#big-accuracy')).toHaveText('GPS warming');
    const oldMiddle = await page.locator('#big-middle').textContent();
    // A coordinate nudge is needed to re-fire Playwright's watchPosition mock.
    await page.context().setGeolocation({ latitude: -27.40845, longitude: 152.9530, accuracy: 6 });
    await expect(page.locator('#big-middle')).not.toHaveText(oldMiddle);
    await expect(page.locator('#big-accuracy')).toHaveText('GPS ±6 m');
    await expect(page.locator('#big-accuracy')).toHaveClass(/gps-acc-good/);
    await expect(page.locator('#big-mode')).toHaveText('from you');
    for (const id of ['front', 'middle', 'back']) {
        const widget = await page.locator(`#gps-${id}`).textContent();
        await expect(page.locator(`#big-${id}`)).toHaveText(widget.replace('m', ''));
    }
    const layout = await overlay.evaluate(el => {
        const fits = [...el.querySelectorAll('header, section, footer')].every(child => {
            const box = child.getBoundingClientRect();
            return box.x >= 0 && box.right <= innerWidth && box.y >= 0 && box.bottom <= innerHeight;
        });
        // A block can fit while its large text runs past the viewport edge.
        const middle = document.getElementById('big-middle');
        const range = document.createRange();
        range.selectNodeContents(middle);
        const text = range.getBoundingClientRect();
        return { fits, textFits: text.left >= 0 && text.right <= innerWidth,
            left: text.left, right: text.right, width: innerWidth,
            scale: getComputedStyle(middle).transform, elementWidth: middle.offsetWidth,
            parentWidth: middle.parentElement.clientWidth,
            font: parseFloat(getComputedStyle(middle).fontSize), height: innerHeight };
    });
    expect(layout.fits).toBe(true);
    expect(layout.textFits, `every middle digit stays inside the viewport: ${JSON.stringify(layout)}`).toBe(true);
    expect(layout.font).toBeGreaterThanOrEqual(layout.height * 0.30);
    await page.screenshot({ path: testInfo.outputPath('big-numbers.png') });
    await page.locator('#big-middle').click();
    await expect(overlay).toBeHidden();
    await page.locator('#oc-gps-widget').click();
    await expect(overlay).toBeVisible();
    const url = page.url();
    await page.goBack();
    await expect(overlay).toBeHidden();
    expect(page.url()).toBe(url);
});
