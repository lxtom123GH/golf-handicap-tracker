import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAndVerifySignup } from '../e2e/helpers/emulator.js';

test('actionable empty, loading, input-error, service-error and offline copy', async ({page, context}, info) => {
    test.setTimeout(120000);
    const out=join('copy-evidence',info.project.name); mkdirSync(out,{recursive:true});
    const states=[];
    async function capture(name) {
        await expect(page.locator('body')).not.toContainText(/Keperra|Ashgrove|Redcliffe|Virginia/);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({path:join(out,name+'.png'),fullPage:true,animations:'disabled',scale:'css'});
        states.push({name, viewport:page.viewportSize(), width:await page.evaluate(() => document.scrollingElement.scrollWidth)});
        writeFileSync(join(out,'states.json'),JSON.stringify(states,null,2));
    }
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Test Player Copy');
    const email=`test-copy-${info.project.name}-r${info.repeatEachIndex}@example.invalid`;
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill('synthetic-pass-1');
    await registerAndVerifySignup(page,email);
    // The copy census covers a returning admitted user, after the initial signup bootstrap.
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible();
    await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/);
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(page.locator('#whs-welcome')).toBeVisible();
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#whs-welcome')).toContainText('handicap estimate in this app');
    await expect(page.locator('#empty-state')).toContainText('Start a round on On Course');
    await capture('empty-rounds');
    await page.locator('#btn-manage-coaches').click();
    await expect(page.locator('#my-coaches-list')).toBeVisible();
    await expect(page.locator('#my-coaches-list')).toContainText('email address above');
    await capture('empty-coaches');
    await page.locator('#btn-close-coaches').click();
    await page.locator('.tab-btn[data-target="tab-practice"]').click();
    await expect(page.locator('#video-library')).toBeVisible();
    await expect(page.locator('#video-library')).toContainText('Choose a video above');
    await capture('empty-practice-videos');
    await page.locator('#video-file-input').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic non-video')});
    await page.locator('#btn-upload-video').click();
    await expect(page.locator('#video-upload-status')).toHaveText('That file is not a video. Choose a video file, then try again.');
    await expect(page.locator('#btn-upload-video')).toBeEnabled();
    await capture('input-correction');
    let release, called=0;
    const held=new Promise(resolve => {release=resolve;});
    await page.route('http://127.0.0.1:5001/**', async route => {
        const url=new URL(route.request().url());
        expect(url.pathname).toBe('/demo-golf-tracker/australia-southeast1/generatePracticePlan');
        if(route.request().method()==='OPTIONS') {
            await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}}); return;
        }
        called++; await held;
        await route.fulfill({status:500,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
            body:JSON.stringify({error:{status:'INTERNAL',message:'SENSITIVE_DIAGNOSTIC synthetic backend failure'}})});
    });
    await page.locator('#btn-generate-practice').click();
    await expect(page.locator('#practice-state-loading')).toBeVisible();
    await expect(page.locator('#practice-state-loading')).toContainText('Creating your practice plan');
    await expect.poll(() => called).toBe(1);
    await capture('practice-loading');
    release();
    await expect(page.locator('#practice-generate-error')).toBeVisible();
    await expect(page.locator('#practice-generate-error')).toHaveText('Could not create your practice plan. Check your connection, then try generating it again.');
    await expect(page.locator('#btn-generate-practice')).toBeEnabled();
    await expect(page.locator('body')).not.toContainText('SENSITIVE_DIAGNOSTIC');
    await capture('service-error');
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await context.setOffline(true);
    await expect(page.locator('#offline-banner')).toBeVisible();
    await expect(page.locator('#offline-banner')).toContainText('Avoid reloading during your round');
    await capture('offline');
    await context.setOffline(false);
    await expect(page.locator('#offline-banner')).toBeHidden();
    expect(called).toBe(1); // Exactly one synthetic intercepted request; no Functions server was started.
});
