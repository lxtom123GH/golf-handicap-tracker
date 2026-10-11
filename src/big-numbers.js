import { AppState } from './state.js';
import { GPS_POLICY } from './gps-capture.js';
import { createOverlayWakeLock } from './overlay-wake-lock.js';

// Pixel 7 needs ~0.77 at full height; 0.8 keeps it ≥ 30% of the viewport tall.
const MIN_SCALE_X = 0.8;

/** DOM controller; distances stay out of persisted round state. */
export function createBigNumbersView(onOpen = () => {}) {
    const root = document.getElementById('big-numbers-view');
    const openers = ['btn-big-numbers', 'oc-gps-widget'].map(id => document.getElementById(id)).filter(Boolean);
    let data = {}, previousFocus = null;
    // A close's history.back() lands asynchronously; its popstate is ours to swallow.
    let pendingBack = false;
    const pushEntry = () => history.pushState({ ...history.state, golfBigNumbers: true }, '');
    const wake = createOverlayWakeLock(() => AppState.bigNumbersOpen);
    const put = (id, text) => { const el = document.getElementById(`big-${id}`); if (el) el.textContent = text; };
    function fitMiddle() {
        const middle = document.getElementById('big-middle');
        if (!AppState.bigNumbersOpen || !middle?.offsetWidth) return;
        // Keep the 32%-of-height type while a mild horizontal fit (≥ 80%) suffices;
        // narrower than that, squashed glyphs read worse in sun, so shrink the type.
        root.style.setProperty('--big-middle-size', '1'); // measure at full size
        const fit = Math.max(0.1, Math.min(1, (middle.parentElement.clientWidth - 16) / middle.offsetWidth));
        const scaleX = Math.max(MIN_SCALE_X, fit);
        root.style.setProperty('--big-middle-scale', String(scaleX));
        root.style.setProperty('--big-middle-size', String(fit / scaleX));
    }
    function render() {
        put('hole', `Hole ${data.physicalHole ?? AppState.currentHole} · Par ${data.par ?? AppState.currentCoursePars[AppState.currentHole - 1] ?? '?'}`);
        for (const key of ['front', 'middle', 'back']) {
            put(key, Number.isFinite(data[`${key}M`]) ? String(Math.round(data[`${key}M`])) : '—');
        }
        put('mode', data.mode ?? 'fixed');
        put('accuracy', !data.warm ? 'GPS warming' : data.accuracyM != null ? `GPS ±${Math.round(data.accuracyM)} m` : 'GPS');
        const accuracy = document.getElementById('big-accuracy');
        accuracy?.classList.remove('gps-acc-good', 'gps-acc-warn', 'gps-acc-bad');
        if (data.warm && Number.isFinite(data.accuracyM)) {
            accuracy?.classList.add(data.accuracyM <= GPS_POLICY.acceptNowM ? 'gps-acc-good'
                : data.accuracyM <= GPS_POLICY.acceptWindowM ? 'gps-acc-warn' : 'gps-acc-bad');
        }
        fitMiddle();
    }
    function sync() {
        const open = AppState.bigNumbersOpen;
        root.classList.toggle('hidden', !open);
        document.body.classList.toggle('big-numbers-open', open);
        wake.sync();
        if (open) {
            previousFocus = document.activeElement;
            if (!pendingBack) pushEntry(); // else re-pushed once the pending back lands
            onOpen();
            render();
            root.focus({ preventScroll: true });
        } else previousFocus?.focus({ preventScroll: true });
    }
    function close() {
        if (!AppState.bigNumbersOpen) return; // cleanup/tab switches close unconditionally
        AppState.bigNumbersOpen = false;
        if (history.state?.golfBigNumbers && !pendingBack) {
            pendingBack = true;
            history.back();
        }
    }
    const open = () => { AppState.bigNumbersOpen = true; };
    const openerKey = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    };
    const keydown = event => {
        if (!AppState.bigNumbersOpen) return;
        if (event.key === 'Escape' || event.key === 'Backspace') {
            // Capture phase on window: no document/window Escape handler beneath the dialog runs.
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        }
        if (event.key === 'Tab') {
            event.preventDefault();
            const stops = [root, root.querySelector('footer button')].filter(Boolean);
            const at = stops.indexOf(document.activeElement);
            stops[(Math.max(at, 0) + (event.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
        }
    };
    const popstate = () => {
        if (pendingBack) {
            pendingBack = false;
            if (AppState.bigNumbersOpen) pushEntry(); // reopened while the back was in flight
            return;
        }
        AppState.bigNumbersOpen = false;
    };
    const cold = () => { data = { ...data, warm: false }; render(); };
    const visibility = () => { if (document.visibilityState === 'visible') cold(); };
    const stateChange = event => {
        if (event.detail.property === 'bigNumbersOpen') sync();
        if (event.detail.property === 'activeTab' && AppState.activeTab !== 'tab-oncourse') close();
    };
    openers.forEach(el => { el.addEventListener('click', open); });
    const widget = document.getElementById('oc-gps-widget');
    widget?.addEventListener('keydown', openerKey);
    root.addEventListener('click', close);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('popstate', popstate);
    window.addEventListener('stateChange', stateChange);
    window.addEventListener('pageshow', cold);
    window.addEventListener('resize', fitMiddle);
    document.addEventListener('visibilitychange', visibility);
    render();
    return {
        update(next) { data = { ...next }; render(); }, close,
        destroy() {
            wake.destroy();
            openers.forEach(el => el.removeEventListener('click', open));
            widget?.removeEventListener('keydown', openerKey);
            root.removeEventListener('click', close);
            window.removeEventListener('keydown', keydown, true);
            window.removeEventListener('popstate', popstate);
            window.removeEventListener('stateChange', stateChange);
            window.removeEventListener('pageshow', cold);
            window.removeEventListener('resize', fitMiddle);
            document.removeEventListener('visibilitychange', visibility);
        }
    };
}

let view;
export function initBigNumbersView(onOpen) {
    if (!view && document.getElementById('big-numbers-view')) view = createBigNumbersView(onOpen);
}
export function updateBigNumbersView(data) { view?.update(data); }
export function closeBigNumbersView() { view?.close(); }
