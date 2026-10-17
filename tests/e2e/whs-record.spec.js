// Scoring record: four aligned columns, and the differential is on screen at
// iPhone size (the phone rule used to hide the Diff cell).

import { test, expect } from '@playwright/test';
import {
    seedPreapprovedEmail,
    throwawayEmail,
    findDocs,
    patchDocFields,
    registerAndVerifySignup,
} from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

async function registerFreshUser(page) {
    const email = throwawayEmail();
    await seedPreapprovedEmail(email);
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('Record Tester');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await registerAndVerifySignup(page, email);
    return email;
}

async function logManualRound(page, score) {
    await page.locator('#btn-oc-log-past-round').click();
    await page.locator('#course-select').selectOption({ value: 'Keperra - Old (1-18)|Yellow (Men)' });
    await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
    await page.locator('#score').fill(score);
    await page.locator('#add-round-form button[type="submit"]').click();
    await expect(page.locator('#add-round-container')).toBeHidden();
}

/** The golfer's saved rounds, read back as an admin (the write lands async). */
async function roundsOf(email, count) {
    for (let attempt = 0; attempt < 40; attempt++) {
        const [user] = await findDocs('users', 'email', email);
        const rounds = user ? await findDocs('whs_rounds', 'uid', user._id) : [];
        if (rounds.length >= count) return rounds;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`fewer than ${count} rounds saved for ${email}`);
}

/** Every box inside the open ⋯ menu sits on screen and inside the table wrapper. */
async function expectMenuOnScreen(page, row) {
    const vw = page.viewportSize().width;
    const wrap = await page.locator('.whs-record-table').locator('xpath=..').boundingBox();
    const boxes = await row.locator('.round-actions-menu > *').evaluateAll(els => els.map(el => {
        const r = el.getBoundingClientRect();
        return { cls: el.className, x: r.x, y: r.y, w: r.width, h: r.height };
    }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
        expect(b.x, b.cls).toBeGreaterThanOrEqual(Math.max(0, wrap.x) - 1);
        expect(b.x + b.w, b.cls).toBeLessThanOrEqual(Math.min(vw, wrap.x + wrap.width) + 1);
        // A one-row record opens its menu down and the wrapper grows for it
        // (:has rule): nothing is cut by the scroller.
        expect(b.y, b.cls).toBeGreaterThanOrEqual(Math.max(0, wrap.y) - 1);
        expect(b.y + b.h, b.cls).toBeLessThanOrEqual(wrap.y + wrap.height + 1);
    }
    return boxes;
}

test('the scoring record shows Date, Course, Score and Diff, aligned, on a phone', async ({ page }, testInfo) => {
    await registerFreshUser(page);
    await page.locator('#btn-oc-log-past-round').click();
    await page.locator('#course-select').selectOption({ value: 'Keperra - Old (1-18)|Yellow (Men)' });
    await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
    await page.locator('#score').fill('88');
    await page.locator('#add-round-form button[type="submit"]').click();
    await expect(page.locator('#add-round-container')).toBeHidden();

    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    const row = page.locator('#history-tbody tr').first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    const heads = page.locator('.whs-record-table thead th');
    await expect(heads.nth(3)).toHaveText('Diff');
    const diffCell = row.locator('td').nth(3);
    // (113 / 124) × (88 − 70.5) = 15.9
    await expect(diffCell).toBeVisible();
    await expect(diffCell).toContainText('15.9');

    // Read the header and the cell in ONE browser task, and poll until both
    // have a box. Two separate boundingBox() round-trips raced the record on
    // CI: the Diff cell's box came back null between them (main 0c5a0fc and
    // PRs #1/#12/#17/#27), failing as a TypeError instead of a layout check.
    // The reading carries the screen state so a real disappearance is named.
    const readDiffColumn = () => page.evaluate(() => {
        const box = el => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 ? { x: r.x, width: r.width } : null;
        };
        const firstRow = document.querySelector('#history-tbody tr');
        return {
            h: box(document.querySelectorAll('.whs-record-table thead th')[3]),
            c: box(firstRow ? firstRow.querySelectorAll('td')[3] : null),
            tab: document.body.dataset.activeTab,
            rows: document.querySelectorAll('#history-tbody tr').length,
        };
    });
    let cols = await readDiffColumn();
    await expect.poll(async () => {
        cols = await readDiffColumn();
        return cols.h && cols.c ? 'both boxed' : JSON.stringify(cols);
    }, { timeout: 10_000 }).toBe('both boxed');
    expect(Math.abs(cols.h.x - cols.c.x), JSON.stringify(cols)).toBeLessThan(2);
    expect(Math.abs(cols.h.width - cols.c.width), JSON.stringify(cols)).toBeLessThan(2);

    // The ⋯ opens the row's actions sideways: never clipped by the scrolling
    // table wrapper, never past the screen edge.
    const vw = page.viewportSize().width;
    await row.locator('.round-actions > summary').click();
    await expect(row.locator('.toggle-count-btn')).toBeVisible();
    await row.locator('.toggle-count-btn').click({ trial: true });
    // Read both boxes in one browser task so smooth page scrolling after the
    // click cannot make the wrapper and menu coordinates come from different frames.
    const bounds = await row.evaluate(el => {
        const wrapper = el.closest('.table-responsive').getBoundingClientRect();
        const button = el.querySelector('.toggle-count-btn').getBoundingClientRect();
        return {
            wrapperTop: wrapper.top,
            wrapperBottom: wrapper.bottom,
            button: { left: button.left, right: button.right, top: button.top, bottom: button.bottom, height: button.height },
        };
    });
    expect(bounds.button.top).toBeGreaterThanOrEqual(bounds.wrapperTop - 1);
    expect(bounds.button.bottom).toBeLessThanOrEqual(bounds.wrapperBottom + 1);
    expect(bounds.button.right).toBeLessThanOrEqual(vw);
    expect(bounds.button.left).toBeGreaterThanOrEqual(0);
    expect(bounds.button.height).toBeGreaterThanOrEqual(40);
    await row.screenshot({ path: testInfo.outputPath('whs-record-open.png') });

    const table = await page.locator('.whs-record-table').boundingBox();
    console.log(`[whs-record] ${testInfo.project.name} vw=${vw} table.right=${Math.round(table.x + table.width)}`);
    await page.locator('.whs-record-table').screenshot({ path: testInfo.outputPath('whs-record.png') });
});

test('an app-excluded round says why in a readable note, on screen, behind the ⋯', async ({ page }, testInfo) => {
    const email = await registerFreshUser(page);
    await logManualRound(page, '88');
    const [round] = await roundsOf(email, 1);
    // What On Course stores for a tee without stroke indexes, plus an audio
    // diary so the menu carries its widest set (🔊 💡 note Delete).
    await patchDocFields(`whs_rounds/${round._id}`, {
        notCounting: true,
        notCountingReason: 'This tee has no stroke index.',
        audioUrl: 'https://example.invalid/diary.webm',
    });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    const row = page.locator('#history-tbody tr').first();
    await expect(row.locator('.round-excluded-tag')).toBeVisible({ timeout: 15_000 });

    await row.locator('.round-actions > summary').click();
    const note = row.locator('.round-excluded-why');
    await expect(note).toBeVisible();
    await expect(note).toContainText('no stroke index');
    await expect(row.locator('.toggle-count-btn')).toHaveCount(0);

    const vw = page.viewportSize().width;
    const box = await note.boundingBox();
    // Not squeezed to one word a line.
    expect(box.width).toBeGreaterThan(150);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    const boxes = await expectMenuOnScreen(page, row);
    console.log(`[whs-record] ${testInfo.project.name} vw=${vw} note=${JSON.stringify(box)} menu=${JSON.stringify(boxes)}`);
    await page.locator('.whs-record-table').locator('xpath=..').screenshot({ path: testInfo.outputPath('whs-record-excluded-open.png') });
});

// The worst case for the sideways menu: ONE row in the record, on a short
// course name (the row's least height). Keperra wraps to several lines and
// hides this: an upward-opening menu gets clipped by .table-responsive.
test('a single short-named round keeps its menu on screen', async ({ page }, testInfo) => {
    const email = await registerFreshUser(page);
    await page.locator('#btn-oc-log-past-round').click();
    await page.locator('#course-select').selectOption({ value: 'Custom' });
    await page.locator('#course-name').fill('Ash');
    await page.locator('#course-rating').fill('71.5');
    await page.locator('#slope-rating').fill('124');
    await page.locator('#course-par').fill('72');
    await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
    await page.locator('#score').fill('88');
    await page.locator('#add-round-form button[type="submit"]').click();
    await expect(page.locator('#add-round-container')).toBeHidden();

    const [round] = await roundsOf(email, 1);
    await patchDocFields(`whs_rounds/${round._id}`, {
        notCounting: true,
        notCountingReason: 'played before you had an index established',
        audioUrl: 'https://example.invalid/diary.webm',
    });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    const row = page.locator('#history-tbody tr');
    await expect(row.first().locator('.round-actions > summary')).toBeVisible({ timeout: 15_000 });
    await expect(row.count()).resolves.toBe(1);

    await row.locator('.round-actions > summary').click();
    const note = row.locator('.round-excluded-why');
    await expect(note).toBeVisible();
    const vw = page.viewportSize().width;
    const box = await note.boundingBox();
    expect(box.width).toBeGreaterThan(150);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    await expectMenuOnScreen(page, row);
    // The menu lives in a scroll wrapper; a trial click proves it is reachable.
    await row.locator('.del-round-btn').click({ trial: true });
    console.log(`[whs-record] ${testInfo.project.name} vw=${vw} single-note=${JSON.stringify(box)}`);
    await page.locator('.whs-record-table').locator('xpath=..').screenshot({ path: testInfo.outputPath('whs-record-single-open.png') });
});

// Codex P2: a middle row's wrapped menu (🔊 💡 Delete + a long note) used to
// open centred on its row, so in a short-named record its ends were cut by
// the scrolling wrapper. Every row's menu must sit inside it.
test('every row of a three-round record keeps a tall menu on screen', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const email = await registerFreshUser(page);
    for (const [name, day] of [['Ash', '2026-09-01'], ['Elm', '2026-09-02'], ['Oak', '2026-09-03']]) {
        await page.locator('#btn-oc-log-past-round').click();
        await page.locator('#course-select').selectOption({ value: 'Custom' });
        await page.locator('#course-name').fill(name);
        // A save resets the form, date included: give each round its own day.
        await page.locator('#date').fill(day);
        await page.locator('#course-rating').fill('71.5');
        await page.locator('#slope-rating').fill('124');
        await page.locator('#course-par').fill('72');
        await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
        await page.locator('#score').fill('88');
        await page.locator('#add-round-form button[type="submit"]').click();
        await expect(page.locator('#add-round-container')).toBeHidden();
    }
    const rounds = await roundsOf(email, 3);
    for (const r of rounds) {
        await patchDocFields(`whs_rounds/${r._id}`, {
            notCounting: true,
            notCountingReason: 'the course rating and slope entered for this round do not match a nine or an eighteen, so its differential would be wrong',
            audioUrl: 'https://example.invalid/diary.webm',
        });
    }
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    const rows = page.locator('#history-tbody tr');
    await expect(rows.nth(2).locator('.round-excluded-tag')).toBeVisible({ timeout: 15_000 });
    await expect(rows).toHaveCount(3);

    const vw = page.viewportSize().width;
    for (const i of [1, 2, 0]) {
        const row = rows.nth(i);
        // Closing the last menu shrinks the table and the page can still be
        // settling: wait until nothing is open, then open this row and check
        // it is the one that opened.
        await expect(page.locator('details.round-actions[open]')).toHaveCount(0);
        await row.locator('.round-actions > summary').click();
        await expect(row.locator('details.round-actions')).toHaveAttribute('open', '');
        await expect(row.locator('.round-excluded-why')).toBeVisible();
        const boxes = await expectMenuOnScreen(page, row);
        await row.locator('.del-round-btn').click({ trial: true });
        console.log(`[whs-record] ${testInfo.project.name} vw=${vw} row=${i} menu=${JSON.stringify(boxes)}`);
        if (i === 1) await page.locator('.whs-record-table').locator('xpath=..').screenshot({ path: testInfo.outputPath('whs-record-middle-open.png') });
        await row.locator('details.round-actions').evaluate(d => { d.open = false; });
    }
});

test('a logged round whose ratings fail the check offers no Include', async ({ page }) => {
    await registerFreshUser(page);
    await page.locator('#btn-oc-log-past-round').click();
    await page.locator('#course-select').selectOption({ value: 'Custom' });
    await page.locator('#course-name').fill('Somewhere 9');
    // An 18-hole rating against a nine's par: saved, but kept out of the index.
    await page.locator('#course-rating').fill('70');
    await page.locator('#slope-rating').fill('120');
    await page.locator('#course-par').fill('36');
    await page.locator('input[name="entry-mode"][value="manual-ags"]').check();
    await page.locator('#score').fill('45');
    await page.locator('#add-round-form button[type="submit"]').click();
    await expect(page.locator('#add-round-container')).toBeHidden();

    await page.locator('.tab-btn[data-target="tab-whs"]').click();
    const row = page.locator('#history-tbody tr').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator('.round-excluded-tag')).toBeVisible();
    await row.locator('.round-actions > summary').click();
    await expect(row.locator('.round-excluded-why')).toContainText(/rating/i);
    await expect(row.locator('.toggle-count-btn')).toHaveCount(0);
});
