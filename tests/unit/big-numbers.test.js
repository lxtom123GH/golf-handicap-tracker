import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AppState } from '../../src/state.js';
import { createBigNumbersView } from '../../src/big-numbers.js';

let view, root;
const read = id => document.getElementById(`big-${id}`);
const fix = { physicalHole: 19, par: 4, frontM: 91, middleM: 100, backM: 112, warm: true, accuracyM: 6, mode: 'from you' };
beforeEach(() => {
    AppState.bigNumbersOpen = false;
    AppState.activeTab = 'tab-oncourse';
    document.body.innerHTML = `<button id="btn-big-numbers">Big numbers</button><div id="oc-gps-widget" tabindex="0"></div>
        <div id="big-numbers-view" class="hidden" tabindex="-1">
        ${['hole', 'front', 'middle', 'back', 'accuracy', 'mode'].map(id => `<span id="big-${id}"></span>`).join('')}
        <footer><button type="button">Back</button></footer></div>`;
    root = document.getElementById('big-numbers-view');
    view = createBigNumbersView();
});
afterEach(async () => {
    view.close();
    // Let the real jsdom history traversal finish before the next fixture.
    await new Promise(resolve => setTimeout(resolve, 30));
    view.destroy();
});

it('opens from the obvious button and from a keyboard/tap on the existing widget', async () => {
    document.getElementById('btn-big-numbers').click();
    expect(AppState.bigNumbersOpen).toBe(true);
    expect(root.classList.contains('hidden')).toBe(false);
    expect(document.activeElement).toBe(root);
    root.click();
    document.getElementById('oc-gps-widget').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(AppState.bigNumbersOpen).toBe(true);
});

it('tap anywhere and Escape close; focus returns to the opening control', async () => {
    const button = document.getElementById('btn-big-numbers');
    button.focus();
    button.click();
    read('middle').click();
    expect(root.classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(button);
    button.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(AppState.bigNumbersOpen).toBe(false);
});

it('Back dismisses the view without navigating out of the app', async () => {
    const href = location.href;
    document.getElementById('oc-gps-widget').click();
    expect(history.state.golfBigNumbers).toBe(true);
    const popped = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
    history.back();
    await popped;
    expect(AppState.bigNumbersOpen).toBe(false);
    expect(root.classList.contains('hidden')).toBe(true);
    expect(location.href).toBe(href);
});

it('a reopen before the close\'s popstate lands stays open, with one history entry', async () => {
    const button = document.getElementById('btn-big-numbers');
    const before = history.length;
    button.click();
    const pushed = history.length;
    root.click();
    button.click(); // no wait: the close's history.back() is still in flight
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(AppState.bigNumbersOpen).toBe(true);
    expect(root.classList.contains('hidden')).toBe(false);
    expect(history.state?.golfBigNumbers).toBe(true);
    expect(history.length).toBeLessThanOrEqual(Math.max(pushed, before + 1));
});

it('the popstate from a close does not shut a view reopened before it arrived', () => {
    const button = document.getElementById('btn-big-numbers');
    button.click();
    root.click();
    button.click();
    // The browser delivers the close's traversal late, after the reopen.
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(AppState.bigNumbersOpen).toBe(true);
    expect(root.classList.contains('hidden')).toBe(false);
});

it('end-of-round cleanup closing again mid-back fires exactly one history.back()', async () => {
    const back = vi.spyOn(history, 'back');
    const href = location.href;
    document.getElementById('btn-big-numbers').click();
    view.close();            // player taps to close
    view.close();            // endRoundCleanup → closeBigNumbersView(), back still in flight
    AppState.activeTab = 'tab-whs'; // locker room / tab switch closes too
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(back).toHaveBeenCalledTimes(1);
    expect(location.href).toBe(href);
    back.mockRestore();
});

it('a tab switch while closed leaves focus alone (no stateChange on an unchanged write)', async () => {
    const button = document.getElementById('btn-big-numbers');
    button.focus();
    button.click();
    root.click(); // previousFocus = button, restored once
    await new Promise(resolve => setTimeout(resolve, 50));
    const other = document.getElementById('oc-gps-widget');
    other.focus();
    AppState.activeTab = 'tab-whs';
    AppState.activeTab = 'tab-oncourse';
    AppState.activeTab = 'tab-whs';
    expect(document.activeElement).toBe(other);
});

it('Tab cycles focus between the view and its Back button inside the dialog', () => {
    const back = root.querySelector('footer button');
    const tab = (shiftKey = false) => document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
    document.getElementById('btn-big-numbers').click();
    expect(document.activeElement).toBe(root);
    tab();
    expect(document.activeElement).toBe(back);
    tab();
    expect(document.activeElement).toBe(root);
    tab(true);
    expect(document.activeElement).toBe(back);
});

it('Escape closes the view without reaching other Escape handlers', () => {
    const other = vi.fn();
    document.addEventListener('keydown', other);
    window.addEventListener('keydown', other);
    document.getElementById('btn-big-numbers').click();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.removeEventListener('keydown', other);
    window.removeEventListener('keydown', other);
    expect(AppState.bigNumbersOpen).toBe(false);
    expect(other).not.toHaveBeenCalled();
});

it('narrow screens squash the middle at most to 80% width, then shrink the type instead', () => {
    const middle = read('middle');
    Object.defineProperty(middle, 'offsetWidth', { configurable: true, get: () => 600 });
    Object.defineProperty(root, 'clientWidth', { configurable: true, get: () => 316 }); // 300 px usable
    document.getElementById('btn-big-numbers').click();
    expect(Number(root.style.getPropertyValue('--big-middle-scale'))).toBeCloseTo(0.8, 3);
    expect(Number(root.style.getPropertyValue('--big-middle-size'))).toBeCloseTo(0.5 / 0.8, 3);
    // A mild overflow is still fitted horizontally at full height.
    Object.defineProperty(root, 'clientWidth', { configurable: true, get: () => 556 }); // 540 of 600
    window.dispatchEvent(new Event('resize'));
    expect(Number(root.style.getPropertyValue('--big-middle-scale'))).toBeCloseTo(0.9, 3);
    expect(Number(root.style.getPropertyValue('--big-middle-size'))).toBe(1);
});

it('live updates all numbers, physical hole, par, mode and existing accuracy thresholds', () => {
    view.update(fix);
    document.getElementById('btn-big-numbers').click();
    expect(read('middle').textContent).toBe('100');
    expect(read('hole').textContent).toBe('Hole 19 · Par 4');
    expect(read('mode').textContent).toBe('from you');
    expect(read('accuracy').classList.contains('gps-acc-good')).toBe(true);
    view.update({ ...fix, frontM: 80, middleM: 90, backM: 101, accuracyM: 10 });
    expect([read('front').textContent, read('middle').textContent, read('back').textContent]).toEqual(['80', '90', '101']);
    expect(read('accuracy').textContent).toBe('GPS ±10 m');
    expect(read('accuracy').classList.contains('gps-acc-warn')).toBe(true);
    view.update({ ...fix, accuracyM: 30 });
    expect(read('accuracy').classList.contains('gps-acc-bad')).toBe(true);
});

it('shows GPS warming without a good colour when cold or awaiting the first fix', () => {
    document.getElementById('btn-big-numbers').click();
    expect(read('accuracy').textContent).toBe('GPS warming');
    expect(read('middle').textContent).toBe('—');
    view.update({ ...fix, warm: false });
    expect(read('accuracy').textContent).toBe('GPS warming');
    expect(read('accuracy').classList.contains('gps-acc-good')).toBe(false);
});

it('visibility follows AppState and leaving On Course closes the view', () => {
    AppState.bigNumbersOpen = true;
    expect(root.classList.contains('hidden')).toBe(false);
    AppState.activeTab = 'tab-whs';
    expect(AppState.bigNumbersOpen).toBe(false);
    expect(document.body.classList.contains('big-numbers-open')).toBe(false);
});

it('can start the existing GPS feed when opened, without starting another watcher on updates', () => {
    view.destroy();
    const startGps = vi.fn();
    view = createBigNumbersView(startGps);
    document.getElementById('btn-big-numbers').click();
    view.update(fix);
    document.getElementById('btn-big-numbers').click();
    expect(startGps).toHaveBeenCalledTimes(1);
});

it('marks a resumed receiver cold immediately, before its next fix', () => {
    view.update(fix);
    document.getElementById('btn-big-numbers').click();
    window.dispatchEvent(new Event('pageshow'));
    expect(read('accuracy').textContent).toBe('GPS warming');
    expect(read('accuracy').classList.contains('gps-acc-good')).toBe(false);
});
