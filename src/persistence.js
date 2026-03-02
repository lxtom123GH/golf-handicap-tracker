// ==========================================
// persistence.js
// LocalStorage Persistence for AppState
// ==========================================
import { AppState } from './state.js';
import { loadHole } from './oncourse.js';

const GOLF_APP_STATE_KEY = 'golf_round_state';

// Fields we want to persist (Round specific)
const PERSIST_FIELDS = [
    'currentTrackingMode',
    'currentRoundHoles',
    'currentRoundCourseName',
    'currentCoursePars',
    'liveRoundGroups',
    'currentHole',
    'currentShotData',
    'currentLiveCompId',
    'currentLiveCompRules',
    'currentHoleShots',
    'activeRoundId',
    'currentRoundDate',
    'myBag'
];

/**
 * Save current round state to localStorage
 */
export function saveRoundState() {
    if (!AppState.activeRoundId) {
        // If no round is active, we might want to clear it? 
        // User says "Clear ONLY when End Round / Save Options is clicked"
        // But if they just reloaded and it was null, we shouldn't overwrite a previous session?
        // Actually, if activeRoundId is null, it means there's NO active round IN MEMORY.
        // We should only save if activeRoundId is NOT null.
        return;
    }

    const stateToSave = {};
    PERSIST_FIELDS.forEach(field => {
        stateToSave[field] = AppState[field];
    });

    localStorage.setItem(GOLF_APP_STATE_KEY, JSON.stringify(stateToSave));
    console.log("[Persistence] Round state saved to localStorage.");
}

/**
 * Load round state from localStorage into AppState
 */
export function loadRoundState() {
    const saved = localStorage.getItem(GOLF_APP_STATE_KEY);
    if (!saved) return false;

    try {
        const parsed = JSON.parse(saved);
        if (!parsed.activeRoundId) return false;

        // Apply fields to AppState
        PERSIST_FIELDS.forEach(field => {
            if (parsed[field] !== undefined) {
                AppState[field] = parsed[field];
            }
        });

        console.log("[Persistence] Round state restored from localStorage.");
        return true;
    } catch (e) {
        console.error("[Persistence] Error loading state:", e);
        return false;
    }
}

/**
 * Clear round state from localStorage
 */
export function clearRoundState() {
    localStorage.removeItem(GOLF_APP_STATE_KEY);
    console.log("[Persistence] Round state cleared from localStorage.");
}

/**
 * Initialization function for app-load routing and local storage check.
 * This overrides default redirects.
 */
export function initializeAppRouting() {
    const hasActiveRound = loadRoundState();

    if (hasActiveRound) {
        console.log("[Persistence] Active round found, routing to On-Course Hub.");

        // Ensure UI is in round mode
        document.body.classList.add('round-active');
        const setupScreen = document.getElementById('oncourse-setup');
        const hubScreen = document.getElementById('oncourse-hub');
        const ocProgressBar = document.getElementById('oc-progress-bar');
        const ocExitBar = document.getElementById('oc-exit-bar');

        if (setupScreen) setupScreen.classList.add('hidden');
        if (hubScreen) hubScreen.classList.remove('hidden');
        if (ocProgressBar) ocProgressBar.classList.remove('hidden');
        if (ocExitBar) ocExitBar.classList.remove('hidden');

        // Trigger tab switch to on-course
        const ocTabBtn = document.getElementById('tab-btn-oncourse');
        if (ocTabBtn) {
            ocTabBtn.click();
        }

        // Initialize display for the current hole
        loadHole();

        // Global override for AI Coach redirects
        window.isRestoringRound = true;
    }
}

// Global listener for state changes
window.addEventListener('stateChange', (e) => {
    const { property, newValue } = e.detail;

    // Auto-save when round fields change
    if (PERSIST_FIELDS.includes(property)) {
        if (property === 'activeRoundId' && !newValue) {
            // Round ended
            clearRoundState();
        } else if (AppState.activeRoundId) {
            // Only save if an active round is ongoing
            saveRoundState();
        }
    }
});
