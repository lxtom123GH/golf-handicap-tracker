import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, registerAndVerifySignup, seedHandicapByEmail,
    findDocs, patchDocFields, verifyEmulatorEmail, readDoc, writeDocFields } from '../e2e/helpers/emulator.js';
test.beforeAll(async ({ browser }) => {
    expect(browser.version(), 'Use pinned Chrome Headless Shell155.0.8059.39 for committed screenshot baselines').toBe('155.0.8059.39');
});
const password = 'synthetic-fixture-only';
async function registration(page, email, name = 'Synthetic Player') {
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill(name);
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(password);
}
async function approved(page, info, suffix = '') {
    const email = `test-golden-${info.project.name}-${info.repeatEachIndex}-${Date.now()}${suffix}@example.invalid`;
    await seedPreapprovedEmail(email);
    await registration(page, email);
    await registerAndVerifySignup(page, email);
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible();
    await expect(page.locator('#logged-in-user-name')).toHaveText('Synthetic Player');
    return email;
}
async function image(page, name) {
    await page.evaluate(() => document.fonts.ready);
    // Collect every changed screen in one run; soft failures still fail the test.
    await expect.soft(page).toHaveScreenshot(name+'.png', {
        mask: [page.locator('#app-version'), page.locator('#footer-version'), page.locator('#logged-in-user-name'), page.locator('.firebase-emulator-warning')],
    });
}
async function setup(page, holes) {
    await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
    await page.locator('#btn-mode-simple').click();
    await page.locator(`#btn-round-${holes}`).click();
    await page.locator('#oc-course-select').selectOption(holes === 9 ? 'Synthetic Nine' : 'Synthetic Eighteen');
    await page.locator('#oc-tee-select').selectOption('Fixture Tee');
    await page.locator('#oc-round-date').fill('2026-01-15');
}
test('synthetic nine: sign in, every hole, saved round and updated differential', async ({ page }, info) => {
    test.setTimeout(150_000);
    const email = await approved(page, info);
    await seedHandicapByEmail(email, 18);
    await page.locator('#btn-logout').click();
    await expect(page.locator('#btn-login')).toHaveText('Login');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(password);
    await page.locator('#btn-login').click();
    await expect(page.locator('#main-app')).toBeVisible();
    await setup(page, 9);
    await expect(page.locator('#oc-dh-value')).toHaveText('8');
    await page.locator('#btn-oc-start').click();
    const scores = [5,4,6,3,5,4,5,6,4];
    for (let h=0; h<9; h++) {
        await expect(page.locator('#oc-hole-display')).toHaveText(`Hole ${h+1}`);
        const card = page.locator('#oc-group-scores .compact-score-card').first();
        for(let n=0;n<scores[h];n++) await card.locator('.btn-grid-plus').click();
        await expect(card.locator('.oc-score-value')).toHaveText(String(scores[h]));
        if(h<8) await page.locator('#btn-oc-next-hole').click();
    }
    await page.locator('#btn-oc-more').click();
    await page.locator('#btn-oc-finish').click();
    await expect(page.locator('#sum-total-shots')).toHaveText('42');
    await page.locator('#btn-oc-save-whs').click();
    await expect(page.locator('#locker-room-msg')).toBeVisible();
    await expect(page.locator('#locker-room-msg')).toHaveText('Round Saved Successfully');
    await page.locator('#btn-post-home').click();
    await expect(page.locator('.tab-btn[data-target="tab-whs"]')).toBeVisible();
    const [user] = await findDocs('users','email',email);
    let rounds;
    await expect.poll(async()=>{ rounds=await findDocs('whs_rounds','uid',user._id);return rounds.length; }).toBe(1);
    expect(rounds[0]).toMatchObject({ totalGross:42, adjustedGross:42, holesPlayed:9, notCounting:false });
    expect(rounds[0].holeScores.map(h=>h.gross)).toEqual(scores);
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    const row=page.locator('#history-tbody tr').filter({hasText:'Synthetic Nine'});
    await expect(row).toHaveCount(1);
    // Existing app method on a fictional CR36/SR113/HI18 fixture: 6 + 10.56 = 16.6.
    // This pins displayed behaviour, not GA/WHS certification (task029 owns that).
    await expect(row.locator('td').nth(3)).toContainText('16.6');
    await page.reload();
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await expect(row.locator('td').nth(3)).toContainText('16.6');
});
test('eighteen-hole abandonment removes active state and creates no scored round', async ({page},info)=>{
    const email=await approved(page,info);
    await setup(page,18);
    await page.locator('#btn-oc-start').click();
    await expect(page.locator('#oncourse-hub')).toBeVisible();
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('golf_round_state')));
    expect(state.currentRoundHoles).toBe(18);
    await page.locator('#oc-group-scores .compact-score-card').first().locator('.btn-grid-plus').click();
    const [user]=await findDocs('users','email',email);
    expect(state.activeRoundId).toEqual(expect.any(String));
    expect(state.activeRoundId).not.toBe('');
    // Simple scoring creates no shot documents. Seed a logged shot explicitly
    // so the real golfer's abandonment must delete persisted data under rules.
    const shotId=`golden-abandon-${state.activeRoundId}-${user._id}`;
    await writeDocFields(`shots/${shotId}`, {
        uid:user._id, roundId:state.activeRoundId, hole:1, shotNumber:1,
        club:'Driver', timestamp:'2026-01-15T00:00:00.000Z',
    });
    expect(await findDocs('shots','roundId',state.activeRoundId))
        .toEqual([expect.objectContaining({_id:shotId,uid:user._id})]);
    page.once('dialog',d=>d.accept());
    await page.locator('#btn-oc-more').click();await page.locator('#btn-oc-exit').click();
    await expect(page.locator('#oncourse-setup')).toBeVisible();
    await expect.poll(async()=>await findDocs('shots','roundId',state.activeRoundId), {
        message:'Abandonment must delete the persisted active-round shot',
    }).toHaveLength(0);
    await page.reload();await expect(page.locator('#oncourse-setup')).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('golf_round_state'))).toBeNull();
    expect(await findDocs('whs_rounds','uid',user._id)).toHaveLength(0);
    expect(await findDocs('shots','roundId',state.activeRoundId)).toHaveLength(0);
});
test('pending user cannot score; admin approval admits them after verification refresh',async({page,browser,baseURL},info)=>{
    const adminEmail=await approved(page,info,'-admin');
    const [admin]=await findDocs('users','email',adminEmail);
    await patchDocFields(`users/${admin._id}`,{isAdmin:true});
    await page.reload();await page.locator('#tab-btn-admin').click();
    const context=await browser.newContext({baseURL,viewport:page.viewportSize()});
    try{
        const pending=await context.newPage();
        const email=`test-pending-${info.project.name}-${info.repeatEachIndex}-${Date.now()}@example.invalid`;
        await registration(pending,email,'Synthetic Pending');
        await pending.getByRole('button',{name:'Create Account'}).click();
        await expect(pending.locator('#auth-pending')).toBeVisible();
        await expect(pending.locator('#main-app')).toBeHidden();
        await expect(pending.locator('#btn-oc-start')).toBeHidden();
        let user;
        await expect.poll(async()=>{[user]=await findDocs('users','email',email);return !!user;}).toBe(true);
        expect(user.isApproved).toBe(false);
        await verifyEmulatorEmail(email);
        await pending.locator('#btn-check-email').click();
        await expect(pending.locator('#auth-pending')).toBeVisible();
        await expect(pending.locator('#main-app')).toBeHidden();
        await page.locator('.tab-btn[data-target="tab-whs"]').click();
        await page.locator('#tab-btn-admin').click();
        const row=page.locator('#admin-users-list tr').filter({hasText:email});
        await expect(row).toHaveCount(1);
        await row.locator('input[type="checkbox"]').first().check();
        await expect.poll(async()=>(await readDoc(`users/${user._id}`))?.isApproved).toBe(true);
        await pending.reload();await expect(pending.locator('#main-app')).toBeVisible();
        await setup(pending,9);await pending.locator('#btn-oc-start').click();
        await expect(pending.locator('#oncourse-hub')).toBeVisible();
    }finally{await context.close();}
});
test('five stable synthetic screens',async({page},info)=>{
    await page.goto('/');await expect(page.locator('#btn-register')).toBeVisible();
    await image(page,'01-login');
    await approved(page,info);
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    await image(page,'02-new-player-home');
    await page.locator('.tab-btn[data-target="tab-settings"]').click();
    await image(page,'05-settings');
    await setup(page,9);await image(page,'03-round-setup');
    await page.locator('#btn-oc-start').click();await expect(page.locator('#oncourse-hub')).toBeVisible();
    await image(page,'04-scoring-hub');
});
