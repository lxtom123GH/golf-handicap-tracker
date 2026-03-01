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

    activeCompId: null,
    currentCompData: null, // rules, name, etc.
    currentCompRounds: [], // Array of rounds for active competition

    currentPracticeRounds: [], // Practice instances for logged-in user

    // On-Course Tracker State
    currentTrackingMode: 'simple',
    currentRoundHoles: 9,
    currentRoundCourseName: '',
    currentCoursePars: [],
    liveRoundGroups: [], // Array of { uid, name, scores:{}, compStats:{}, simpleStats:{} }
    currentHole: 1,
    currentShotData: {},
    currentLiveCompId: null,
    currentLiveCompRules: []
};

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
