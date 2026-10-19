// Flight recorder hooks: structured call-site events from existing app
// signals. Nothing here starts a GPS watch, requests a permission, patches
// console, or calls preventDefault on an app error. Every listener body is
// wrapped so a recorder fault can never reach the code that fired the event.

import { AppState } from '../state.js';
import { onGpsFix } from '../oncourse.js';
import { courseSlugFor } from '../hole-overlay.js';
import { COURSE_DATA } from '../course-data.js';
import { recorder, fr, setIsolation, getIsolation } from './recorder.js';

/** 'pending' | 'confirmed' | 'failed' (see recorder.js). */
export const accountIsolation = () => getIsolation();
import { errorFields, fileOf } from './sanitize.js';

export const GPS_MIN_MS = 3000;      // hard floor between GPS events
export const GPS_EVERY_MS = 10000;   // normal cadence
export const GPS_SESSION_MAX = 3000; // hard per-session GPS event cap
const OWNER_KEY = 'golf.flightrec.acct';
const UNOWNED = 'unowned';

const guard = fn => (...a) => { try { fn(...a); } catch { /* never reaches the app */ } };

function platform() {
    try {
        const ua = navigator.userAgent || '';
        if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
        if (/Android/i.test(ua)) return 'android';
    } catch { /* ignore */ }
    return 'other';
}
function standalone() {
    try { return !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone); } catch { return false; }
}
function distText(id) {
    try {
        const t = document.getElementById(id)?.textContent || '';
        const m = /^(\d{1,4})m$/.exec(t.trim());
        return m ? Number(m[1]) : null;
    } catch { return null; }
}
function physicalHole() {
    try {
        const tee = COURSE_DATA[AppState.currentRoundCourseName]?.[AppState.currentRoundTee];
        const ph = tee?.physicalHoles?.[AppState.currentHole - 1];
        return typeof ph === 'number' ? ph : undefined;
    } catch { return undefined; }
}
const accClass = a => (a == null ? 9 : a <= 5 ? 0 : a <= 15 ? 1 : a <= 30 ? 2 : 3);

/** GPS fix -> 'gps' events, throttled with a hard floor and a session cap. */
export function makeGpsTap(record = fr, now = () => Date.now()) {
    let last = 0, lastClass = -1, count = 0;
    return function onFix(fix) {
        try {
            if (!AppState.activeRoundId) return;          // active rounds only
            if (count >= GPS_SESSION_MAX) return;
            const t = now();
            const cls = accClass(fix?.accuracyM);
            const due = t - last >= GPS_EVERY_MS || (cls !== lastClass && t - last >= GPS_MIN_MS);
            if (!due) return;
            last = t; lastClass = cls; count++;
            record('gps', {
                hole: AppState.currentHole, phys: physicalHole(),
                acc: fix?.accuracyM, spd: fix?.speedMps,
                age: typeof fix?.at === 'number' ? Math.max(0, t - fix.at) : undefined,
                // Distances as DISPLAYED (updateGPSDistances ran before this listener).
                f: distText('gps-front'), c: distText('gps-middle'), b: distText('gps-back'),
            });
        } catch { /* ignore */ }
    };
}

/** AppState changes -> round/hole/score/tab events. No values beyond ids/counts. */
export function makeStateTap(record = fr) {
    return function onState(e) {
        try {
            const p = e?.detail?.property;
            if (p === 'activeRoundId') {
                const nv = e.detail.newValue;
                if (nv) {
                    record('round_start', {
                        round: typeof nv === 'string' ? nv : undefined,
                        course: courseSlugFor(AppState.currentRoundCourseName) || undefined,
                        holes: AppState.currentRoundHoles,
                        hole: AppState.currentHole,
                    });
                } else {
                    record('round_end', { round: typeof e.detail.oldValue === 'string' ? e.detail.oldValue : undefined });
                }
            } else if (p === 'currentHole' && AppState.activeRoundId) {
                record('hole', { hole: e.detail.newValue, phys: physicalHole() });
            } else if (p === 'liveRoundGroups' && AppState.activeRoundId) {
                record('score', { hole: AppState.currentHole });
            } else if (p === 'activeTab') {
                record('tab', { tab: typeof e.detail.newValue === 'string' ? e.detail.newValue : undefined });
            }
        } catch { /* ignore */ }
    };
}

async function acctTag(uid) {
    const data = new TextEncoder().encode(`golf-flightrec:${uid}`);
    const h = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(h).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Shared phone: a different account signing in clears the previous
 * account's journal so it cannot be exported or uploaded as this one's.
 * Only a local hash tag is kept, never the UID itself.
 */
// Returns true ONLY when the stored journal is confirmed to belong to this
// account (tag matched, or a switch was cleared successfully and the new tag
// saved). The cloud uploader starts only after a true result.
export async function noteAccount(uid, rec = recorder(), storage = globalThis.localStorage) {
    try { rec?.setOwner?.(null); } catch { /* ignore */ }
    const tag = await noteAccountInner(uid, rec, storage);
    const ok = typeof tag === 'string';
    try { if (ok) rec?.setOwner?.(tag); } catch { /* ignore */ }
    setIsolation(ok ? 'confirmed' : (uid ? 'failed' : 'pending'));
    return ok;
}

async function noteAccountInner(uid, rec, storage) {
    setIsolation('pending');
    try {
        if (!uid || !rec) { fr('auth', { state: 'out' }); return false; }
        if (!globalThis.crypto?.subtle || !storage) return false;
        const tag = await acctTag(uid);
        const prev = storage.getItem(OWNER_KEY);
        if (prev !== tag) {
            // A missing tag, a different account's tag, or the UNOWNED marker
            // left by a failed switch: the stored journal is not provably this
            // account's, so it must be cleared before ownership is confirmed.
            // Invalidate first, so a failed clear can never be approved later
            // by the old owner's tag matching again (Codex review 2).
            storage.setItem(OWNER_KEY, UNOWNED);
            const cleared = await rec.clearAll({ keepSession: true });
            fr('auth', { state: prev ? 'switch' : 'in' });
            if (cleared !== true) return false;
        } else {
            fr('auth', { state: 'in' });
        }
        storage.setItem(OWNER_KEY, tag);
        return storage.getItem(OWNER_KEY) === tag ? tag : false;
    } catch { return false; }
}

let _started = false;
export function startFlightRecorder() {
    if (_started) return;
    _started = true;
    try {
        const rec = recorder();
        if (!rec) return;
        fr('boot', {
            build: rec.build, plat: platform(), standalone: standalone(),
            online: navigator.onLine, vw: window.innerWidth, vh: window.innerHeight,
            dpr: window.devicePixelRatio, ms: Math.round(performance?.now?.() || 0),
            sw: navigator.serviceWorker?.controller ? 'controlled' : 'none',
        });
        window.addEventListener('stateChange', makeStateTap());
        try { onGpsFix(makeGpsTap()); } catch { /* ignore */ }
        document.addEventListener('gps-watch-stopped', guard(() => fr('gps_stop', { hole: AppState.currentHole })));
        // Global error hooks observe only: no preventDefault, no message text.
        window.addEventListener('error', guard(ev => {
            // A cross-origin "Script error." has no error object: keep the
            // event's file basename and line only.
            const f = ev?.error ? errorFields(ev.error) : { name: 'NoErrorObject', src: fileOf(ev?.filename), line: ev?.lineno, col: ev?.colno };
            fr('error', f);
        }));
        window.addEventListener('unhandledrejection', guard(ev => fr('rejection', errorFields(ev?.reason))));
        window.addEventListener('online', guard(() => fr('net', { online: true })));
        window.addEventListener('offline', guard(() => fr('net', { online: false })));
        document.addEventListener('visibilitychange', guard(() => {
            fr('vis', { vis: document.visibilityState });
            // Best effort: mobile browsers may never run this.
            if (document.visibilityState === 'hidden') rec.flush().catch(() => {});
        }));
        window.addEventListener('pagehide', guard(ev => { fr('page', { persisted: !!ev?.persisted, status: 'off' }); rec.flush().catch(() => {}); }));
        window.addEventListener('pageshow', guard(ev => fr('page', { persisted: !!ev?.persisted, status: 'on' })));
        try { navigator.serviceWorker?.addEventListener('controllerchange', guard(() => fr('sw', { sw: 'controllerchange' }))); } catch { /* ignore */ }
        try {
            if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
                new PerformanceObserver(guard(list => {
                    for (const en of list.getEntries()) if (en.duration >= 500) fr('slow', { ms: en.duration });
                })).observe({ type: 'longtask', buffered: false });
            }
        } catch { /* ignore */ }
    } catch { /* the app keeps running without a recorder */ }
}
