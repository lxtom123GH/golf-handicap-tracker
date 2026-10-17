// ==========================================
// state.js
// Centralized, Reactive Application State
// ==========================================

import { starterBag } from './bag.js';

const initialState = {
    currentUser: null,
    profileUsersMap: {}, // Maps uid to displayName
    allUsersCache: null, // Used to cache the full list of users to prevent repeated DB reads
    viewingPlayerId: null,
    currentRounds: [], // Array of round objects for the currently viewed WHS player
    handicapIndex: 'N/A',
    usedIds: [], // The IDs of the best 8 of 20 scores

    activeCompId: null,
    currentCompData: null, // rules, name, etc.
    currentCompRounds: [], // Array of rounds for active competition

    currentPracticeRounds: [], // Practice instances for logged-in user
    // MUST start null, never a real tab id: the Proxy only dispatches on
    // CHANGE, and body[data-active-tab] is only written by the stateChange
    // listener. With 'tab-oncourse' here, booting into tab-oncourse (the
    // fresh-user fallback and the most common saved tab) assigned the same
    // value, no event fired, and every screen stayed display:none.
    activeTab: null,

    // On-Course Tracker State
    currentTrackingMode: 'simple',
    currentRoundHoles: 9,
    currentRoundCourseName: '',
    currentRoundTee: null,
    currentSideGame: null, // '' | 'skins' | 'matchplay' | 'nassau' — derived-view side game
    // {rating, slope, par, counting} resolved ONCE at Start Round and persisted
    // with the round — previously the save re-read the tee <select>, which
    // resets on reload, so resumed rounds saved with NaN ratings (BL-UX-08).
    currentRoundRatings: null,
    currentCoursePars: [],
    liveRoundGroups: [], // Array of { uid, name, scores:{}, compStats:{}, simpleStats:{} }
    currentHole: 1,
    currentRoundStartHole: 1,
    bigNumbersOpen: false, // transient UI only; never part of PERSIST_FIELDS
    currentShotData: {},
    currentLiveCompId: null,
    currentLiveCompRules: [],
    currentHoleShots: [],
    activeRoundId: null,
    currentRoundDate: null,
    playerClubs: null,
    // Owner 2026-10-06 (Play mode): { roundId, hole, shotNumber, club,
    // routinePre } from the map's club strip / Routine chip; the next new
    // shot with the same round+hole+number starts from it. Never persisted.
    nextShotDefaults: null,
    // S5: GPS assist — a per-device convenience toggle (NOT round state; it
    // never goes near PERSIST_FIELDS). Default ON since 2026-09-19 (owner's
    // call); with it off, every GPS distance is byte-identical to pre-S5.
    gpsAssist: true,
    // S12 C: auto-rotate the shot map so up = anchor → green. Per-device,
    // default OFF (the big four keep tee-bottom fixed; the owner opts in).
    rotateMap: false,
    // Owner decision 2026-09-20: you are in your own round unless you removed
    // yourself on the setup screen. Setup-only, reset by endRoundCleanup;
    // never persisted.
    roundSelfOptOut: false
};

    // Shot-entry preference defaults to Map first; saved choices are retained.
    // | 'both' | 'draw' | 'buttons'.
    // A per-device UI preference (localStorage golf.shotEntry, try/catch),
    // never round state; the visibility decision itself is pure
    // (src/shot-entry.js) so tests pin it without a DOM.
    initialState.shotEntry = 'map';

try {
    // Owner's call 2026-09-19 ("can the best GPS possible just be on as a
    // default?"): assist is ON unless the golfer switched it off.
    initialState.gpsAssist = localStorage.getItem('golf.gpsAssist') !== 'off';
    // S12 C: auto-rotate is opt-in.
    initialState.rotateMap = localStorage.getItem('golf.rotateMap') === 'on';
} catch (e) {
    console.warn('Failed to read gpsAssist from localStorage', e);
}

try {
    // The shot-entry preference is mirrored into app state at boot. A saved choice is
    // kept; no choice means Map first.
    // normaliseShotEntry rejects anything else, so a corrupted value degrades
    // to the default rather than hiding the wizard.
    initialState.shotEntry = localStorage.getItem('golf.shotEntry') || 'map';
} catch (e) {
    console.warn('Failed to read shotEntry from localStorage', e);
}

try {
    const savedClubs = localStorage.getItem('golfAppClubs');
    if (savedClubs) {
        initialState.playerClubs = JSON.parse(savedClubs);
    } else {
        initialState.playerClubs = starterBag();
    }
} catch (e) {
    console.warn("Failed to parse playerClubs from localStorage", e);
}

/**
 * AppState Proxy
 * Intercepts property assignments and dispatches a 'stateChange' custom event.
 * Listener: window.addEventListener('stateChange', (e) => { ... })
 */
export const AppState = new Proxy(initialState, {
    set(target, prop, value) {
        const oldValue = target[prop];
        target[prop] = value;

        // Only dispatch if the value actually changed
        if (oldValue !== value) {
            const event = new CustomEvent('stateChange', {
                detail: {
                    property: prop,
                    oldValue: oldValue,
                    newValue: value
                }
            });
            window.dispatchEvent(event);

            // Console logging for debugging in development
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log(`[State] ${String(prop)} changed:`, value);
            }
        }
        return true;
    }
});

/**
 * Safely mutate an AppState array or object and re-arm the Proxy set trap.
 *
 * The Proxy trap fires on *reassignment* (AppState.key = newValue) only —
 * it compares old and new references. Mutating in place (.push(), .splice(),
 * obj[k] = v) keeps the same reference, so oldValue === value, stateChange
 * is never dispatched, and dependent UI goes stale silently.
 *
 * This helper creates a shallow copy first, so the final reassignment always
 * produces a new reference, unconditionally triggering stateChange dispatch.
 *
 * @param {string} key - The AppState key to update.
 * @param {function} fn - Receives the shallow copy; mutate it in place.
 * @example
 *   mutateList('currentPracticeRounds', list => list.push(newItem));
 *   mutateList('profileUsersMap', map => { map[id] = value; });
 */
export function mutateList(key, fn) {
    const copy = Array.isArray(AppState[key])
        ? [...AppState[key]]
        : { ...AppState[key] };
    fn(copy);
    AppState[key] = copy;
}

const finiteNumberOrNull = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const objectOrEmpty = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/**
 * Normalise a raw `whs_rounds` document. The writer schema is `uid`, `course`,
 * `rating`, `slope`, `adjustedGross`, `holesPlayed`, `stats`, and `date`;
 * legacy aliases remain available so old imports are not silently discarded.
 *
 * @param {Object} raw - Raw Firestore round doc data.
 * @returns {Object} Normalised WHS round object.
 */
export function normalizeRoundDoc(raw = {}) {
    const uid = raw.uid ?? raw.userId ?? null;
    const course = raw.course ?? raw.courseName ?? '';
    const adjustedGross = finiteNumberOrNull(raw.adjustedGross);
    const holesPlayed = raw.holesPlayed === 9 || raw.holesPlayed === 18
        ? raw.holesPlayed
        : null;

    return {
        ...raw,
        uid,
        course,
        rating: finiteNumberOrNull(raw.rating),
        slope: finiteNumberOrNull(raw.slope),
        adjustedGross,
        holesPlayed,
        date: raw.date || null,
        notCounting: raw.notCounting === true,
        // Compatibility aliases for older callers/imported documents.
        score: finiteNumberOrNull(raw.score),
        courseName: raw.courseName ?? course,
        holes: Array.isArray(raw.holes) ? raw.holes : [],
        userId: raw.userId ?? uid
    };
}

/**
 * Normalise a raw Firestore user document, applying safe defaults for the
 * expected fields. All other fields are preserved via spread — the normaliser
 * adds safety, it never strips unknown fields.
 *
 * @param {Object} raw - Raw Firestore user doc data.
 * @returns {Object} Normalised user object.
 */
export function normalizeUserDoc(raw) {
    return {
        ...raw,
        uid: raw.uid || null,
        displayName: raw.displayName || '',
        email: raw.email || '',
        isCoach: raw.isCoach === true,
        isAdmin: raw.isAdmin === true
    };
}

/**
 * Normalise a raw `practice_rounds` document. Practice history has a distinct
 * schema from WHS rounds, so it must not borrow the WHS round normaliser.
 *
 * @param {Object} raw - Raw Firestore practice-round data.
 * @returns {Object} Normalised practice-round object.
 */
export function normalizePracticeRound(raw = {}) {
    return {
        ...raw,
        uid: raw.uid ?? null,
        drillId: raw.drillId ?? '',
        score: finiteNumberOrNull(raw.score),
        date: raw.date || null,
        data: objectOrEmpty(raw.data)
    };
}

/**
 * Normalise practice plan data into the shape the Practice Caddy renderer
 * consumes. Accepts either the `generatePracticePlan` Cloud Function response
 * (`drillId`/`category`/`targetMetric`/string-array `steps`) or the merged
 * Firestore pair (`users/{uid}/practice_plans/active` + `global_drills/{id}`).
 * The Cloud Function output shape is canonical and must not change — this
 * adapter maps it client-side. All other fields are preserved via spread.
 *
 * @param {Object} raw - Raw plan data (function response or merged docs).
 * @returns {Object} Normalised plan object.
 */
export function normalizePracticePlan(raw) {
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    return {
        ...raw,
        id: raw.drillId || raw.id || null,
        category: raw.category || 'General',
        targetMetric: raw.targetMetric || '',
        // The function emits steps as plain strings ("Step 1: <instruction>");
        // the renderer numbers steps itself, so strip the redundant prefix.
        steps: steps.map(step => typeof step === 'string'
            ? { description: step.replace(/^step\s*\d+\s*[:.\-]\s*/i, '') }
            : step),
        completedSteps: Array.isArray(raw.completedSteps) ? raw.completedSteps : []
    };
}
