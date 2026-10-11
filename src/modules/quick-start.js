// ==========================================
// quick-start.js — Play again card, remembered defaults, GPS course pick
// ==========================================
//
// Owner 2026-10-05: "it would be good to make it easier and faster to start a
// new round" — and he chose all of it:
//   1. a one-tap Play again card at the top of Start New Round (last course,
//      tee, 9/18, Simple/Detailed and the same players, saved guests too);
//   2. the form opening on your last choices instead of the factory defaults;
//   3. the course you are standing at picked for you, when the phone ALREADY
//      knows where you are (permission granted earlier). Opening this screen
//      never asks for location.
//
// Rules kept here:
//   - Never undo a choice the player made on this screen (any tap on the
//     toggles or Add buttons, any course/tee change we didn't make).
//   - A remembered course/tee that no longer exists falls back silently to
//     the normal form.
//   - The daily handicap is never remembered; it is worked out from the
//     handicap index each round. The date is always today.
//
// The pure parts live in src/last-setup.js (unit-tested).

import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { COURSE_DATA, holesForCourse, isRatableTee } from '../course-data.js';
import { courseSlugFor, loadCourseOverlay } from '../hole-overlay.js';
import { localToday } from '../dates.js';
import {
    readSetups, validateSetup, describeSetup, overlayPoints, teePoint,
    nearestCourse, pickCourseOption, pickSetupForSlug,
} from '../last-setup.js';

// Declared up front (minified-bundle TDZ pitfall): every guard reads these.
let _bound = false;
let _userChose = false;   // the player changed something on this screen
let _applying = false;    // we are changing the form ourselves
let _gps = null;          // { slug, name } when the GPS pick found a club
let _gpsRun = 0;          // newer screen-open wins over a slow older fix
let _cardSetup = null;    // what the Play again button will start
let _defaultsApplied = false; // the remembered setup is in the form already

const el = (id) => document.getElementById(id);
const uid = () => AppState.currentUser?.uid || null;
const roundActive = () => !!AppState.activeRoundId || document.body.classList.contains('round-active');
const playersReady = () => UI.ocPlayerSelect?.dataset.ready === '1';

function courseOptionValues() {
    const sel = UI.ocCourseSelect;
    if (!sel) return [];
    return Array.from(sel.options).map(o => o.value).filter(v => v && v !== 'Custom Course');
}

function courseLabel(value) {
    const opt = UI.ocCourseSelect && Array.from(UI.ocCourseSelect.options).find(o => o.value === value);
    return opt ? opt.textContent.trim() : value;
}

/** uid → { name, hc } for everyone the player picker offers right now. */
function playerOptions() {
    const map = new Map();
    for (const o of Array.from(UI.ocPlayerSelect?.options || [])) {
        if (!o.value) continue;
        const guest = !!o.closest?.('optgroup[data-guests]');
        const hc = o.dataset?.hc !== undefined ? Number(o.dataset.hc) : undefined;
        map.set(o.value, {
            name: guest ? o.textContent.replace(/\s*\(guest\)\s*$/, '') : o.textContent,
            ...(Number.isFinite(hc) ? { hc } : {}),
        });
    }
    return map;
}

function validSetups() {
    let storage = null;
    try { storage = window.localStorage; } catch { return []; }
    const ctx = {
        courseData: COURSE_DATA, holesForCourse, isRatableTee,
        courseOptions: courseOptionValues(), playerOptions: playerOptions(),
    };
    return readSetups(storage, uid()).map(s => validateSetup(s, ctx)).filter(Boolean);
}

/** The card's setup: the last one played, or the last one at the club GPS found. */
function chooseSetup() {
    const list = validSetups();
    if (_gps) return pickSetupForSlug(list, _gps.slug, courseSlugFor);
    return list[0] || null;
}

function renderCard(setup) {
    const card = el('oc-quick-start');
    if (!card) return;
    _cardSetup = setup || null;
    if (!setup) { card.classList.add('hidden'); return; }
    const d = describeSetup(setup, courseLabel(setup.course));
    el('oc-quick-start-course').textContent = d.title;
    el('oc-quick-start-details').textContent = d.details;
    el('oc-quick-start-players').textContent = `Players: ${d.players}`;
    el('oc-quick-start-here')?.classList.toggle('hidden', !(_gps && _gps.slug === courseSlugFor(setup.course)));
    card.classList.remove('hidden');
}

// ---- driving the form (programmatic taps never count as the player's) ----
function setMode(mode) {
    (mode === 'detailed' ? UI.btnModeDetailed : UI.btnModeSimple)?.click();
}
function setHoles(holes) {
    (holes === 18 ? UI.btnRound18 : UI.btnRound9)?.click();
}
function setCourseAndTee(course, tee) {
    const sel = UI.ocCourseSelect;
    if (!sel) return;
    sel.value = course;
    sel.dispatchEvent(new Event('change')); // fills the tees synchronously
    const teeSel = UI.ocTeeSelect;
    if (tee && teeSel && Array.from(teeSel.options).some(o => o.value === tee)) {
        teeSel.value = tee;
        teeSel.dispatchEvent(new Event('change'));
    }
}
function withApplying(fn) {
    _applying = true;
    try { fn(); } finally { _applying = false; }
}
function applyToForm(setup) {
    _defaultsApplied = true;
    withApplying(() => {
        setMode(setup.mode);
        setHoles(setup.holes);
        setCourseAndTee(setup.course, setup.tee);
    });
}

function showGpsNote(name) {
    const note = el('oc-course-gps-note');
    if (!note) return;
    note.textContent = name ? `📍 You're at ${name}, so we picked it. Change it below if that's wrong.` : '';
    note.classList.toggle('hidden', !name);
}

/** Re-draw the card and (when asked) put the remembered choices in the form. */
export function refreshQuickStart({ applyDefaults = false } = {}) {
    if (!uid() || roundActive()) { renderCard(null); return; }
    const setup = chooseSetup();
    renderCard(playersReady() ? setup : null);
    if (applyDefaults && setup && !_userChose) applyToForm(setup);
}

/** Where the phone is, ONLY if the player already allowed location. */
async function locationIfAllowed() {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return null;
    try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state !== 'granted') return null; // never prompt from here
    } catch { return null; }
    return new Promise((resolve) => {
        try {
            navigator.geolocation.getCurrentPosition(
                (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy }),
                () => resolve(null),
                { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 10000 }
            );
        } catch { resolve(null); }
    });
}

/** Pick the course the player is standing at (known courses only). */
export async function gpsPickCourse() {
    const run = ++_gpsRun;
    const fix = await locationIfAllowed();
    if (!fix || run !== _gpsRun || roundActive()) return;
    const values = courseOptionValues();
    const slugs = [...new Set(values.map(courseSlugFor).filter(Boolean))];
    const overlays = {};
    for (const s of slugs) overlays[s] = await loadCourseOverlay(s);
    const near = nearestCourse(fix, slugs.map(s => ({ slug: s, points: overlayPoints(overlays[s]) })));
    if (!near || run !== _gpsRun || roundActive()) return;

    const overlay = overlays[near.slug];
    _gps = { slug: near.slug, name: overlay?.name || courseLabel(values.find(v => courseSlugFor(v) === near.slug)) };
    const remembered = chooseSetup();
    renderCard(playersReady() ? remembered : null);
    if (_userChose) return; // the player already chose: leave the form alone

    if (remembered) {
        applyToForm(remembered);
    } else {
        const candidates = values.filter(v => courseSlugFor(v) === near.slug).map(v => {
            const firstTee = Object.values(COURSE_DATA[v] || {})[0];
            return { value: v, holes: holesForCourse(v), firstTee: teePoint(overlay, firstTee?.physicalHoles?.[0] ?? 1) };
        });
        const pick = pickCourseOption(candidates, fix, AppState.currentRoundHoles === 18 ? 18 : 9);
        if (!pick) return;
        withApplying(() => {
            const h = holesForCourse(pick);
            if (h && h !== (AppState.currentRoundHoles === 18 ? 18 : 9)) setHoles(h);
            setCourseAndTee(pick, null);
        });
    }
    showGpsNote(_gps.name);
}

async function playAgain() {
    const setup = _cardSetup;
    const btn = el('btn-oc-play-again');
    if (!setup || roundActive() || !UI.btnOcStart || btn?.disabled) return;
    // Codex P2: if a Start Round is already resolving, leave the form and the
    // group alone — that start has captured its course and would finish with
    // a mixed roster.
    const binders = await import('./event-binders.js');
    if (binders.isStartRoundInFlight?.()) return;
    if (btn) btn.disabled = true;
    try {
        applyToForm(setup);
        const me = uid();
        const selfOpt = Array.from(UI.ocPlayerSelect?.options || []).find(o => o.value === me);
        const fresh = { scores: {}, compStats: {}, simpleStats: {} };
        const others = setup.players.map(p => ({
            uid: p.uid, name: p.name,
            ...(p.isGuest ? { isGuest: true } : {}),
            // A saved guest's remembered handicap, exactly as picking them does.
            ...(Number.isFinite(p.hc) ? { dailyHandicapOverride: p.hc } : {}),
            ...fresh,
        }));
        AppState.roundSelfOptOut = !setup.selfIncluded;
        AppState.liveRoundGroups = setup.selfIncluded
            ? [{ uid: me, name: selfOpt?.textContent || AppState.currentUser?.displayName || 'Me', ...fresh }, ...others]
            : others;
        // Today's round: today's date, today's handicap, no leftover side
        // game or competition from whatever the form was showing.
        const date = el('oc-round-date');
        if (date) date.value = localToday();
        const dh = el('oc-dh-override');
        if (dh) dh.value = '';
        const side = el('oc-side-game');
        if (side) side.value = '';
        if (UI.ocLinkComp) UI.ocLinkComp.value = '';
        // Awaited, so the button stays locked until the start has settled
        // (Codex P2: a fast second tap used to start a second round).
        await binders.runStartRound();
    } catch (e) {
        console.error('[QuickStart] Play again failed:', e);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/** A fresh setup screen (boot, or a round just ended). */
function onSetupOpened() {
    _userChose = false;
    _gps = null;
    _defaultsApplied = false;
    showGpsNote(null);
    if (!roundActive()) {
        const date = el('oc-round-date');
        if (date) date.value = localToday();
        // endRoundCleanup resets the round's mode and length in state; make
        // the toggles say the same before any remembered setup is applied.
        withApplying(() => {
            setMode(AppState.currentTrackingMode);
            setHoles(AppState.currentRoundHoles === 18 ? 18 : 9);
        });
    }
    refreshQuickStart({ applyDefaults: true });
    gpsPickCourse().catch(e => console.warn('[QuickStart] GPS pick skipped:', e));
}

export function initQuickStart() {
    if (_bound) return;
    _bound = true;
    const setup = el('oncourse-setup');
    // A real tap on any setup button is the player's choice.
    setup?.addEventListener('click', (e) => {
        if (e.isTrusted && e.target.closest?.('button') && !e.target.closest('#oc-quick-start')) _userChose = true;
    }, true);
    for (const sel of [UI.ocCourseSelect, UI.ocTeeSelect]) {
        sel?.addEventListener('change', () => {
            if (_applying) return;
            _userChose = true;
            if (sel === UI.ocCourseSelect) showGpsNote(null);
        });
    }
    el('btn-oc-play-again')?.addEventListener('click', () => { playAgain(); });
    // Codex P2: a setup that needs the player list to validate (e.g. you sat
    // out and only friends played) can only reach the form once it's loaded.
    document.addEventListener('oc-players-ready', () => refreshQuickStart({ applyDefaults: !_defaultsApplied }));
    document.addEventListener('oc-setup-reset', onSetupOpened);
    onSetupOpened();
}
