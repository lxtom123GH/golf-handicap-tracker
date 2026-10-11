// @vitest-environment jsdom
// ==========================================================================
// club-grid.test.js — glass chips (owner-approved mockup 2026-10-04)
// The Club row is 3 likely clubs + "All N"; All opens a non-scrolling grid
// of every club in the bag. Selection keeps the data-val/.active-choice
// contract the wizard relies on.
// ==========================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { UI, AppState } = vi.hoisted(() => ({ UI: { bagButtonsGrid: null }, AppState: {} }));
vi.mock('../../src/ui.js', () => ({ UI }));
vi.mock('../../src/state.js', () => ({ AppState, mutateList: vi.fn() }));
vi.mock('../../src/oncourse.js', () => ({
    getLastGpsFix: vi.fn(() => null), openHoleEditor: vi.fn(), jumpToHole: vi.fn(),
}));
vi.mock('../../src/course-data.js', () => ({ COURSE_DATA: {}, getStrokeIndex: vi.fn() }));
vi.mock('../../src/whs.js', () => ({ calculateHoleStableford: vi.fn(), scoringUnavailableReason: vi.fn() }));
vi.mock('../../src/side-games.js', () => ({
    computeSkins: vi.fn(), computeMatchPlay: vi.fn(), computeNassau: vi.fn(), sideGameUnavailableReason: vi.fn(),
}));

import { renderBagButtons, handleBagGridClick, pickRowClubs } from '../../src/modules/card-render.js';

const BAG = {
    driver: true,
    woods: ['3 Wood', '5 Wood'],
    irons: ['4 Iron', '5 Iron', '6 Iron', '7 Iron', '8 Iron', '9 Iron'],
    wedges: ['PW', '52', '56', '60'],
    putter: true,
}; // 14 clubs

function setup({ club, shotNumber = 1, par = 4, hole = 1, bag = BAG, d = null } = {}) {
    document.body.innerHTML = `
      <div id="section-weapon">
        <div id="bag-buttons-grid"></div>
        <p id="bag-default-hint" class="hidden"></p>
      </div>`;
    UI.bagButtonsGrid = document.getElementById('bag-buttons-grid');
    AppState.playerClubs = bag;
    AppState.currentHole = hole;
    AppState.currentCoursePars = [par, par, par];
    AppState.currentHoleShots = [];
    AppState.currentShotData = { shotNumber, hole, ...(club ? { club } : {}) };
    renderBagButtons(d);
    return UI.bagButtonsGrid;
}

const rowChips = (root) => [...root.querySelectorAll('.club-row .btn-grid-compact[data-val]')];
const gridBtns = (root) => [...root.querySelectorAll('.club-grid-panel .btn-grid-compact[data-val]')];
const panel = (root) => root.querySelector('.club-grid-panel');
const allBtn = (root) => root.querySelector('.club-all-btn');

describe('glass chips: Club row', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('shows exactly 3 clubs (the first 3 by likelihood) plus All N', () => {
        const root = setup(); // par-4 tee shot → driver, woods, irons…
        expect(rowChips(root).map(b => b.getAttribute('data-val'))).toEqual(['Driver', '3 Wood', '5 Wood']);
        expect(rowChips(root).map(b => b.textContent)).toEqual(['Dr', '3W', '5W']);
        expect(allBtn(root).textContent).toContain('All 14');
        expect(root.querySelectorAll('.club-row > button')).toHaveLength(4);
    });

    it('approach distance leads with the nearest iron', () => {
        const root = setup({ shotNumber: 2, d: 150 });
        // 230-12n: 7i=146, 6i=158, 8i=134 → 7, 6, 8.
        expect(rowChips(root).map(b => b.getAttribute('data-val'))).toEqual(['7 Iron', '6 Iron', '8 Iron']);
    });

    it('the selected club is always visible: it replaces the 3rd chip when outside the top 3', () => {
        const root = setup({ club: 'Putter' });
        const vals = rowChips(root).map(b => b.getAttribute('data-val'));
        expect(vals).toEqual(['Driver', '3 Wood', 'Putter']);
        const active = root.querySelectorAll('.club-row .active-choice');
        expect(active).toHaveLength(1);
        expect(active[0].getAttribute('data-val')).toBe('Putter');
    });

    it('a selected club already in the top 3 does not reshuffle the row', () => {
        const root = setup({ club: '3 Wood' });
        expect(rowChips(root).map(b => b.getAttribute('data-val'))).toEqual(['Driver', '3 Wood', '5 Wood']);
    });

    it('pickRowClubs copes with a bag of fewer than 3 clubs', () => {
        const ordered = [{ label: 'Dr', val: 'Driver' }, { label: 'Putter', val: 'Putter' }];
        expect(pickRowClubs(ordered, null)).toHaveLength(2);
        expect(pickRowClubs(ordered.slice(0, 1), 'Putter').map(c => c.val)).toEqual(['Driver', 'Putter']);
    });

    it('nothing in the row scrolls sideways (no overflow-x / scroll-snap / flex 0 0 auto)', () => {
        const root = setup();
        const els = [root, ...root.querySelectorAll('*')];
        for (const el of els) {
            const st = el.getAttribute('style') || '';
            expect(st, el.outerHTML).not.toMatch(/overflow-x|scroll-snap|flex:\s*0 0 auto|nowrap/);
            expect(el.style.overflowX).toBe('');
            expect(el.style.scrollSnapType || '').toBe('');
            expect(el.style.scrollSnapAlign || '').toBe('');
        }
    });

    it('keeps the bag-default hint: shown with the All grid until a bag is saved (E35)', () => {
        const hint = () => document.getElementById('bag-default-hint').classList.contains('hidden');
        localStorage.removeItem('golfAppClubs');
        // state.js always fills in the starter bag, so the hint must not key
        // off an empty playerClubs (it never was, and the hint never showed).
        setup({ bag: { driver: true, woods: ['3 Wood'], irons: ['Long Irons', 'Mid Irons', 'Short Iron'], wedges: ['56°'], putter: true } });
        // Closed grid: no hint, so it never takes height from the hole map.
        expect(hint()).toBe(true);
        expect(allBtn(UI.bagButtonsGrid).textContent).toContain('All 7');
        handleBagGridClick(allBtn(UI.bagButtonsGrid));
        expect(hint()).toBe(false);
        handleBagGridClick(allBtn(UI.bagButtonsGrid));
        expect(hint()).toBe(true);
        setup({ bag: {} });
        handleBagGridClick(allBtn(UI.bagButtonsGrid));
        expect(hint()).toBe(false);
        localStorage.setItem('golfAppClubs', JSON.stringify(BAG));
        setup();
        expect(hint()).toBe(true);
        handleBagGridClick(allBtn(UI.bagButtonsGrid));
        expect(hint()).toBe(true);
        localStorage.removeItem('golfAppClubs');
    });

    it('the hint is hidden only in the Map-first dock, which has no room for it', async () => {
        const { readFileSync } = await import('node:fs');
        const css = readFileSync('src/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const hides = [...css.matchAll(/([^{}]*#bag-default-hint[^{}]*)\{\s*display:\s*none/g)].map(m => m[1].trim());
        expect(hides).toEqual(['.map-first #bag-default-hint']);
    });
});

describe('glass chips: All grid', () => {
    it('is closed by default; All opens it with every club in bag order', () => {
        const root = setup({ shotNumber: 2, d: 150 });
        expect(panel(root).classList.contains('hidden')).toBe(true);
        expect(handleBagGridClick(allBtn(root))).toBe('toggle');
        expect(panel(root).classList.contains('hidden')).toBe(false);
        expect(allBtn(root).getAttribute('aria-expanded')).toBe('true');
        expect(gridBtns(root).map(b => b.getAttribute('data-val'))).toEqual([
            'Driver', '3 Wood', '5 Wood', '4 Iron', '5 Iron', '6 Iron', '7 Iron', '8 Iron', '9 Iron',
            'PW', '52', '56', '60', 'Putter',
        ]);
        // Suggested club (top of the likelihood order) wears the green ring.
        const sug = root.querySelectorAll('.club-grid-panel .club-suggested');
        expect(sug).toHaveLength(1);
        expect(sug[0].getAttribute('data-val')).toBe('7 Iron');
        // Tapping All again closes it.
        handleBagGridClick(allBtn(root).querySelector('.club-all-icon'));
        expect(panel(root).classList.contains('hidden')).toBe(true);
    });

    it('tapping a grid club sets currentShotData.club and closes the grid', () => {
        const root = setup();
        handleBagGridClick(allBtn(root));
        const sixty = gridBtns(root).find(b => b.getAttribute('data-val') === '60');
        expect(handleBagGridClick(sixty)).toBe('club');
        expect(AppState.currentShotData.club).toBe('60');
        expect(panel(root).classList.contains('hidden')).toBe(true);
        // The wizard re-renders (syncShotWizardUI): 60 is now visible + active
        // in the row, and the grid stays closed.
        renderBagButtons(null);
        const active = UI.bagButtonsGrid.querySelector('.club-row .active-choice');
        expect(active.getAttribute('data-val')).toBe('60');
        expect(panel(UI.bagButtonsGrid).classList.contains('hidden')).toBe(true);
    });

    it('tapping a row chip selects it (same contract as before)', () => {
        const root = setup();
        expect(handleBagGridClick(rowChips(root)[1])).toBe('club');
        expect(AppState.currentShotData.club).toBe('3 Wood');
    });

    it('stays open across a re-render of the same shot, closes on a new shot', () => {
        const root = setup({ shotNumber: 2, d: 150 });
        handleBagGridClick(allBtn(root));
        renderBagButtons(150);
        expect(panel(UI.bagButtonsGrid).classList.contains('hidden')).toBe(false);
        AppState.currentShotData = { shotNumber: 3, hole: 1 };
        renderBagButtons(80);
        expect(panel(UI.bagButtonsGrid).classList.contains('hidden')).toBe(true);
    });

    it('a new round on the same hole and shot number starts closed', () => {
        AppState.activeRoundId = 'round_a';
        const root = setup();
        handleBagGridClick(allBtn(root));
        AppState.activeRoundId = 'round_b';
        renderBagButtons(null);
        expect(panel(UI.bagButtonsGrid).classList.contains('hidden')).toBe(true);
        AppState.activeRoundId = undefined;
    });

    it('dims unlikely groups in the grid, never the selected club', () => {
        // Par-4 tee: wedges/putter unlikely.
        const root = setup({ club: '56' });
        const dim = gridBtns(root).filter(b => b.classList.contains('club-unlikely')).map(b => b.getAttribute('data-val'));
        expect(dim).toEqual(['PW', '52', '60', 'Putter']);
        expect(root.querySelectorAll('.club-row .club-unlikely')).toHaveLength(0);
    });
});
