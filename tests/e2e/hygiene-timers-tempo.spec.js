import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

async function register(page) {
    const email = throwawayEmail('hygiene');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Hygiene Golfer');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);
}

test('bag confirmation survives a repeated save and is cleared on leaving Settings', async ({ page }) => {
    await register(page);
    await page.locator('.tab-btn[data-target="tab-settings"]').click();
    await page.clock.install();
    const message = page.locator('#bag-msg');
    // E35 (#246): each tick saves; the confirmation lasts 2 s after the latest.
    const sixty = page.locator('#my-bag-card .bag-check[data-val="60°"]');
    await sixty.check();
    await expect(message).toBeVisible();
    await page.clock.fastForward(1500);
    await sixty.uncheck();
    await page.clock.fastForward(1100);
    await expect(message).toBeVisible();
    await page.clock.fastForward(1000);
    await expect(message).toBeHidden();
    await sixty.check();
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await page.locator('.tab-btn[data-target="tab-settings"]').click();
    await expect(message).toBeHidden();
});

test('Tempo loops animate without forced layout and STOP leaves the ring hidden', async ({ page }) => {
    await page.addInitScript(() => {
        window.tempoLayoutReads = 0;
        window.tempoRingAnimations = 0;
        const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { ...width, get() {
            if (this.id === 'tempo-ring') window.tempoLayoutReads++;
            return width.get.call(this);
        } });
        const animate = HTMLElement.prototype.animate;
        HTMLElement.prototype.animate = function (...args) {
            if (this.id === 'tempo-ring') window.tempoRingAnimations++;
            return animate.apply(this, args);
        };
    });
    await register(page);
    await page.locator('.tab-btn[data-target="tab-practice"]').click();
    await page.locator('#tempo-speed-slider').press('Home');
    await page.locator('#tempo-speed-slider').press('ArrowRight');
    await page.locator('#tempo-speed-slider').press('ArrowRight');
    await page.locator('#tempo-delay-slider').press('Home');
    await expect(page.locator('#tempo-speed-slider')).toHaveValue('1');
    await expect(page.locator('#tempo-delay-slider')).toHaveValue('3');
    await page.locator('#tempo-loop-toggle').check();
    await page.locator('#tempo-play-btn').click();
    await expect.poll(() => page.locator('#tempo-swing-counter').textContent(), { timeout: 15_000 }).toBe('2');
    await expect.poll(() => page.evaluate(() => window.tempoRingAnimations), { timeout: 1_000 }).toBe(2);
    await expect(page.locator('#tempo-swing-counter')).toHaveText('2');
    expect(await page.evaluate(() => window.tempoLayoutReads)).toBe(0);
    await page.locator('#tempo-play-btn').click();
    await expect(page.locator('#tempo-swing-state')).toHaveText('READY');
    await expect(page.locator('#tempo-ring')).toBeHidden();
    await page.waitForFunction(() => document.getElementById('tempo-ring')?.getAnimations().length === 0);
    await expect(page.locator('#tempo-ring')).toBeHidden();
});
