/**
 * Simplify 2026-10-07 E35: My Bag sits first in Settings, saves on every tick
 * (no Update button), and there is one starter bag. Runs the real
 * bindBagSettings over the shipped Settings markup.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/modules/card-render.js', () => ({ updateLiveLeaderboard: vi.fn(), renderDetailedReview: vi.fn(), renderBagButtons: vi.fn(), renderHoleJumper: vi.fn() }));
vi.mock('../../src/modules/score-input.js', () => ({ startNewShotInput: vi.fn(), loadExistingShotData: vi.fn(), syncShotWizardUI: vi.fn(), setWizardActive: vi.fn(), saveShotData: vi.fn(), deleteShotData: vi.fn(), showToast: vi.fn(), refreshTrackButtonLabel: vi.fn() }));
vi.mock('../../src/modules/event-binders.js', () => ({ bindAddPlayer: vi.fn(), bindCompQuickAdd: vi.fn(), bindSetupToggles: vi.fn(), bindCourseSelect: vi.fn(), bindStartRound: vi.fn(), bindGlobalRoundActions: vi.fn(), bindOcSubNav: vi.fn(), bindShotWizard: vi.fn() }));

const repo = resolve(import.meta.dirname, '../..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');
const settingsHtml = () => new DOMParser().parseFromString(html, 'text/html').getElementById('tab-settings').outerHTML;

let AppState, bindBagSettings, bag;

beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    document.body.innerHTML = settingsHtml();
    ({ AppState } = await import('../../src/state.js'));
    ({ bindBagSettings } = await import('../../src/bag-settings.js'));
    bag = await import('../../src/bag.js');
});

const tick = (val, on) => {
    const chk = document.querySelector(`#my-bag-card .bag-check[data-val="${val}"]`);
    chk.checked = on;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('My Bag in Settings', () => {
    it('is the first card in Settings, called "My Bag", with no Update button', () => {
        const first = document.querySelector('#tab-settings .card');
        expect(first.id).toBe('my-bag-card');
        expect(first.querySelector('h2').textContent.trim()).toBe('My Bag');
        expect(document.getElementById('btn-save-bag')).toBeNull();
        const labels = [...first.querySelectorAll('label')].map(l => l.textContent.replace(/\s+/g, ' ').trim());
        expect(labels).toContain('Putter');
        expect(labels).toContain('3 Wood');
        // Labels no longer split across lines ("3 / Wood").
        expect(first.innerHTML).toContain('3&nbsp;Wood');
    });

    it('a single tick saves the bag to the device and to AppState', () => {
        bindBagSettings();
        expect(bag.hasSavedBag()).toBe(false);
        tick('60°', true);
        const saved = JSON.parse(localStorage.getItem('golfAppClubs'));
        expect(saved.wedges).toEqual(['56°', '60°']);
        expect(AppState.playerClubs.wedges).toEqual(['56°', '60°']);
        expect(bag.hasSavedBag()).toBe(true);
        expect(document.getElementById('bag-msg').classList.contains('hidden')).toBe(false);

        tick('Driver', false);
        expect(JSON.parse(localStorage.getItem('golfAppClubs')).driver).toBe(false);
    });

    it('binding twice saves once per tick', () => {
        bindBagSettings();
        bindBagSettings();
        const spy = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem');
        tick('45°', true);
        expect(spy.mock.calls.filter(c => c[0] === 'golfAppClubs')).toHaveLength(1);
        spy.mockRestore();
    });

    it('a failed device write says so instead of "Saved"', () => {
        bindBagSettings();
        const spy = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
            .mockImplementation(() => { throw new Error('QuotaExceededError'); });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        tick('60°', true);
        expect(spy.mock.calls.filter(c => c[0] === 'golfAppClubs')).toHaveLength(1);
        spy.mockRestore();
        warn.mockRestore();
        const msg = document.getElementById('bag-msg');
        expect(msg.classList.contains('hidden')).toBe(false);
        expect(msg.textContent).not.toContain('Saved');
        expect(msg.textContent).toMatch(/Couldn't save/);
        expect(msg.classList.contains('bag-msg-error')).toBe(true);
        expect(bag.hasSavedBag()).toBe(false);

        // The next good write clears the warning.
        tick('Driver', false);
        expect(msg.textContent).toContain('Saved');
        expect(msg.classList.contains('bag-msg-error')).toBe(false);
    });

    it('one starter bag: state.js fills it in, and it is the shipped default ticks', () => {
        expect(AppState.playerClubs).toEqual(bag.starterBag());
        expect(bag.bagFromChecks(document.getElementById('my-bag-card'))).toEqual(bag.starterBag());
        const cr = readFileSync(resolve(repo, 'src/modules/card-render.js'), 'utf8');
        expect(cr).not.toMatch(/DEFAULT_BAG\s*=/);
    });
});
