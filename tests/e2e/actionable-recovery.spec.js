import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, registerAndVerifySignup,
    findDocs, writeDocFields } from './helpers/emulator.js';

async function register(page) {
    const email = throwawayEmail('recovery');
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Recovery Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('e2e-password-1');
    await registerAndVerifySignup(page, email);
    return email;
}

test('an oversized uploaded video gets local trim advice without service diagnostics', async ({ page }, info) => {
    const email = await register(page);
    const [user] = await findDocs('users', 'email', email);
    await writeDocFields(`videos/large-${user._id}`, { uid: user._id, path: `videos/${user._id}/large.mp4`,
        bytes: 20 * 1024 * 1024, createdAt: new Date(), angle: 'Synthetic large clip' });
    let calls = 0;
    await page.route('http://127.0.0.1:5001/**/analyzeSwingVideo', async route => {
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
        if (route.request().method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers }); return;
        }
        calls++;
        await route.fulfill({ status: 400, headers, contentType: 'application/json',
            body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: 'PRIVATE_SERVICE_DETAIL' } }) });
    });
    await page.locator('.tab-btn[data-target="tab-practice"]').click();
    await page.locator('.vid-ai').click();
    const result = page.locator('.vid-ai-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('19 MB maximum');
    await expect(result).toContainText('Trim it, then upload');
    await expect(result).not.toContainText('PRIVATE_SERVICE_DETAIL');
    await expect(page.locator('.vid-ai')).toBeEnabled();
    expect(calls).toBe(1);
    await result.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('oversized-video.png') });
});

test('rules microphone failures direct the player to rules help', async ({ page }, info) => {
    await page.addInitScript(() => {
        window.SpeechRecognition = class {
            constructor() { window.testSpeech = this; }
            start() { this.onstart(); }
            stop() { this.onend(); }
        };
    });
    await register(page);
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator('#btn-round-18').click();
    await page.locator('#oc-course-select').selectOption({ label: 'Ashgrove GC' });
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible();
    await page.locator('#btn-oc-more').click();
    await page.clock.install();
    for (const error of ['not-allowed', 'network']) {
        await page.locator('#btn-voice-rules').click();
        await page.evaluate(error => {
            window.testSpeech.onerror({ error });
            window.testSpeech.onend();
        }, error);
        await expect(page.locator('#voice-overlay')).toBeVisible();
        await expect(page.locator('#voice-status')).toContainText('competition committee');
        await expect(page.locator('#voice-status')).not.toContainText('score');
        if (error === 'not-allowed') await expect(page.locator('#voice-status')).toContainText('browser settings');
        else await expect(page.locator('#voice-status')).toContainText('Rules of Golf');
        await page.screenshot({ path: info.outputPath(`rules-${error}.png`) });
        await page.clock.fastForward(3000);
        await expect(page.locator('#voice-overlay')).toBeHidden();
    }
});
