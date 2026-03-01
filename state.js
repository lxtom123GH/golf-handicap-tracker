// ==========================================
// state.js
// Centralized Application State
// ==========================================

export const AppState = {
    currentUser: null,
    profileUsersMap: {}, // Maps uid to displayName
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
