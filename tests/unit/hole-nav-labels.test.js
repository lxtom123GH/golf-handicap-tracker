// Simplify C23 (2026-10-07): Next says "Finish ✓" on the last hole (it already
// opens the summary there); Prev is disabled on hole 1 (it does nothing there).
import { beforeEach, expect, it, vi } from 'vitest';
import { AppState } from '../../src/state.js';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
import { syncHoleNavLabels } from '../../src/oncourse.js';

beforeEach(() => {
    document.body.innerHTML = `
        <button id="btn-oc-prev-hole">← Prev</button>
        <button id="btn-oc-next-hole">Next Hole →</button>`;
});

const prev = () => document.getElementById('btn-oc-prev-hole');
const next = () => document.getElementById('btn-oc-next-hole');

it('hole 1 of 18: Prev disabled, Next is Next Hole', () => {
    AppState.currentRoundHoles = 18;
    AppState.currentHole = 1;
    syncHoleNavLabels();
    expect(prev().disabled).toBe(true);
    expect(next().textContent).toBe('Next Hole →');
});

it('the middle of the round: both live', () => {
    AppState.currentRoundHoles = 18;
    AppState.currentHole = 9;
    syncHoleNavLabels();
    expect(prev().disabled).toBe(false);
    expect(next().textContent).toBe('Next Hole →');
});

it('the last hole says Finish ✓, and going back restores Next Hole', () => {
    AppState.currentRoundHoles = 9;
    AppState.currentHole = 9;
    syncHoleNavLabels();
    expect(next().textContent).toBe('Finish ✓');
    expect(next().classList.contains('oc-thumb-finish')).toBe(true);
    AppState.currentHole = 8;
    syncHoleNavLabels();
    expect(next().textContent).toBe('Next Hole →');
    expect(next().classList.contains('oc-thumb-finish')).toBe(false);
});

it('a disabled Prev ignores the swipe\'s synthetic click', () => {
    AppState.currentRoundHoles = 18;
    AppState.currentHole = 1;
    syncHoleNavLabels();
    const spy = vi.fn();
    prev().addEventListener('click', spy);
    prev().click();
    expect(spy).not.toHaveBeenCalled();
});
