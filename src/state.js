// ==========================================
// state.js
// Centralized, Reactive Application State
// ==========================================

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
    activeTab: 'tab-oncourse',

    // On-Course Tracker State
    currentTrackingMode: 'simple',
    currentRoundHoles: 9,
    currentRoundCourseName: '',
    currentCoursePars: [],
    liveRoundGroups: [], // Array of { uid, name, scores:{}, compStats:{}, simpleStats:{} }
    currentHole: 1,
    currentShotData: {},
    currentLiveCompId: null,
    currentLiveCompRules: [],
    currentHoleShots: [],
    activeRoundId: null,
    currentRoundDate: null,
    playerClubs: null
};

try {
    const savedClubs = localStorage.getItem('golfAppClubs');
    if (savedClubs) {
        initialState.playerClubs = JSON.parse(savedClubs);
    } else {
        initialState.playerClubs = {
            driver: true,
            woods: ['3 Wood'],
            irons: ['Long Irons', 'Mid Irons', 'Short Iron'],
            wedges: ['56°'],
            putter: true
        };
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
