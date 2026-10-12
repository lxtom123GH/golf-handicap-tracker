// practice-one-ai.spec.js — Practice has one AI plan (the Caddy's Generate);
// the "✨ Ask AI Coach" button is gone (simplify 2026-10-07, E39).
import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup } from './helpers/emulator.js';

test('Practice shows the Caddy Generate and no Ask AI Coach', async ({ page }) => {
    const email = throwawayEmail('one-ai');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('One AI');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);
    await page.locator('.tab-btn[data-target="tab-practice"]').click();
    await expect(page.locator('#btn-generate-practice')).toBeVisible();
    await expect(page.locator('#tab-practice').getByText(/Ask\s+AI\s+Coach/)).toHaveCount(0);
    await expect(page.locator('#btn-ask-ai')).toHaveCount(0);
});
