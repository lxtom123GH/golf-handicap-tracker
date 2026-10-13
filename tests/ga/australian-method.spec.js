import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAndVerifySignup, findDocs, readDoc, writeDocFields } from '../e2e/helpers/emulator.js';

test('Australian pairing and explicit category work without rewriting scores', async ({page},info)=>{
 test.setTimeout(120000);
 const out=join('ga-evidence',info.project.name);mkdirSync(out,{recursive:true});
 const evidence=[];
 async function capture(name){
  await expect(page.locator('body')).not.toContainText(/Keperra|Ashgrove|Redcliffe|Virginia/);
  await page.screenshot({path:join(out,name+'.png'),fullPage:true,animations:'disabled'});
  evidence.push({name,viewport:page.viewportSize(),width:await page.evaluate(()=>document.scrollingElement.scrollWidth)});
  writeFileSync(join(out,'states.json'),JSON.stringify(evidence,null,2));
 }
 await page.goto('/');await page.locator('#btn-register').click();
 const email=`test-ga-${info.project.name}-${info.repeatEachIndex}@example.invalid`;
 await page.locator('#auth-name').fill('Test Australian Player');await page.locator('#auth-email').fill(email);
 await page.locator('#auth-password').fill('synthetic-pass-1');await registerAndVerifySignup(page,email);
 await page.reload();await expect(page.locator('#main-app')).toBeVisible();
 await expect(page.locator('#app-loading-cloak')).toHaveClass(/cloak-hidden/);
 const [user]=await findDocs('users','email',email);expect(user._id).toBeTruthy();
 const uid=user._id, originals=[];
 async function seed(i,ags=41){
  const path=`whs_rounds/${uid}-ga-${i}`;
  await writeDocFields(path,{uid,course:'Synthetic Nine',rating:36,slope:113,adjustedGross:ags,holesPlayed:9,
   date:new Date(`2026-01-${String(i+1).padStart(2,'0')}T00:00:00Z`),notCounting:false,visibility:'private'});
  originals.push({path,data:await readDoc(path)});
 }
 await page.locator('.tab-btn[data-target="tab-whs"]').click();
 await seed(0);await expect(page.locator('#history-tbody')).toContainText('Pending another nine');
 await expect(page.locator('#handicap-index')).toHaveText('—');await capture('pending-first-nine');
 for(let i=1;i<6;i++)await seed(i);
 await expect(page.locator('#handicap-index')).toHaveText('8.0');
 await expect(page.locator('#history-tbody .round-nine-status')).toHaveCount(6);
 await expect(page.locator('#history-tbody')).not.toContainText('Pending another nine');
 await expect(page.locator('#index-explainer')).toContainText('3 completed 18-hole scores');
 await capture('three-completed-pairs');
 await seed(6,36);await expect(page.locator('#history-tbody')).toContainText('Pending another nine');
 await expect(page.locator('#handicap-index')).toHaveText('8.0');await capture('pending-seventh-nine');
 await expect.poll(async()=>(await readDoc(`profiles/${uid}`))?.handicapIndex).toBe('8.0');
 for(const original of originals)expect(await readDoc(original.path)).toEqual(original.data);
 await page.reload();await expect(page.locator('#main-app')).toBeVisible();
 await page.locator('.tab-btn[data-target="tab-whs"]').click();
 await expect(page.locator('#handicap-index')).toHaveText('8.0');
 await expect(page.locator('#history-tbody')).toContainText('Pending another nine');
 for(const original of originals)expect(await readDoc(original.path)).toEqual(original.data);
 await page.locator('.tab-btn[data-target="tab-oncourse"]').click();
 await page.locator('#btn-round-18').click();
 await page.locator('#oc-course-select').selectOption({label:'Synthetic Eighteen'});
 await expect(page.locator('#oc-handicap-category')).toHaveValue('');
 await expect(page.locator('#oc-dh-override')).toHaveValue('');
 await page.locator('#oc-handicap-category').selectOption('men');
 await expect(page.locator('#oc-dh-value')).toHaveText('7');await capture('mens-daily-handicap');
 await page.locator('#oc-handicap-category').selectOption('women');
 await expect(page.locator('#oc-dh-value')).toHaveText('8');await capture('womens-daily-handicap');
 await page.locator('#oc-handicap-category').selectOption('');
 await expect(page.locator('#oc-dh-override')).toHaveValue('');
 await expect(page.locator('#oc-dh-value')).toHaveText('—');
 // Manual conversion uses the index at the start of the played day, not an
 // index first established later that day. Supply that distinct fixture.
 const historyPath=`users/${uid}/private/handicap`;
 const history=await readDoc(historyPath);
 await writeDocFields(historyPath,{indexHistory:[{date:'2026-01-08T00:00:00.000Z',index:'8.0'},...(history?.indexHistory||[])]});
 await page.locator('#btn-oc-log-past-round').click();
 await expect(page.locator('#add-round-container')).toBeVisible();
 await page.locator('#course-select').selectOption('Synthetic Eighteen|Fixture Tee');
 await page.locator('input[name="entry-mode"][value="total-stableford"]').check();
 await page.locator('#total-stableford-pts').fill('36');
 await expect(page.locator('#score')).toHaveValue('');
 await page.locator('#entry-handicap-category').selectOption('men');
 await expect(page.locator('#score')).toHaveValue('79');
 await page.locator('#entry-handicap-category').selectOption('women');
 await expect(page.locator('#score')).toHaveValue('80');
 await page.locator('#entry-handicap-category').scrollIntoViewIfNeeded();
 await capture('manual-conversion-category');
 await page.locator('#entry-handicap-category').selectOption('');
 await expect(page.locator('#score')).toHaveValue('');
 for(const original of originals)expect(await readDoc(original.path)).toEqual(original.data);
 expect(evidence.every(x=>x.width<=x.viewport.width)).toBe(true);
});
