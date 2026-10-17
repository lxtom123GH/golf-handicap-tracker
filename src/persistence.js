// ==========================================
// persistence.js
// LocalStorage Persistence for AppState
// ==========================================
import { AppState } from './state.js';
import { loadHole, resumeGpsIfWasOn } from './oncourse.js';
import { releaseRecorderStorage } from './diagnostics/recorder.js';

const GOLF_APP_STATE_KEY = 'golf_round_state';

// Fields we want to persist (Round specific)
const PERSIST_FIELDS = [
    'currentTrackingMode',
    'currentRoundHoles',
    'currentRoundCourseName',
    'currentRoundTee',
    'currentRoundRatings', // BL-UX-08: resumed rounds must keep their resolved CR/SR/par
    'currentSideGame',
    'currentCoursePars',
    'liveRoundGroups',
    'currentHole',
    'currentShotData',
    'currentLiveCompId',
    'currentLiveCompRules',
    'currentHoleShots',
    'activeRoundId',
    'currentRoundDate',
    'myBag',
    // S5: the per-round GPS bias and its truth pairs — plain JSON, reset in
    // endRoundCleanup. Only meaningful while the assist toggle is on.
    'gpsBias',
    'gpsBiasSamples'
];

// F-14: end-of-round backups were written under a fresh timestamped key every
// round and never pruned, inside the same ~5 MB origin quota as the in-flight
// round. Keep the most recent few; they are the only copy of a round whose
// cloud write hasn't landed yet.
const BACKUP_PREFIX = 'round_backup_';
// The id of the last round handed to the save (simplify C21): Abandon must
// not delete a saved round, even after the backups were pruned for space.
const LAST_SAVED_KEY = 'golf_last_saved_round';

/** Remember that this round was saved. Never throws. */
export function markRoundSaved(roundId) {
    if (!roundId) return;
    try { localStorage.setItem(LAST_SAVED_KEY, roundId); } catch { /* full or off: the backup check remains */ }
}
const MAX_ROUND_BACKUPS = 5;

/**
 * List the end-of-round backup keys, oldest first (the suffix is Date.now()).
 * @returns {string[]}
 */
function listRoundBackups() {
    return Object.keys(localStorage)
        .filter(k => k.startsWith(BACKUP_PREFIX))
        .sort((a, b) => Number(a.slice(BACKUP_PREFIX.length)) - Number(b.slice(BACKUP_PREFIX.length)));
}

/**
 * Drop the oldest end-of-round backups until at most `keep` remain.
 * @param {number} keep - How many backups to leave behind.
 * @returns {number} How many keys were removed.
 */
export function pruneRoundBackups(keep = MAX_ROUND_BACKUPS) {
    const keys = listRoundBackups();
    const doomed = keys.slice(0, Math.max(0, keys.length - keep));
    doomed.forEach(k => localStorage.removeItem(k));
    return doomed.length;
}

/**
 * Write the end-of-round backup, capped at MAX_ROUND_BACKUPS.
 * @param {Object} backup - Serialisable round summary.
 * @returns {string|null} The key written, so a later cloud rejection can
 *   correct the `synced` flag it was optimistically stamped with (F-5).
 */
export function writeRoundBackup(backup) {
    pruneRoundBackups(MAX_ROUND_BACKUPS - 1);
    const key = `${BACKUP_PREFIX}${Date.now()}`;
    try {
        localStorage.setItem(key, JSON.stringify(backup));
        return key;
    } catch (e) {
        // A backup that cannot be written must never break the save it backs up.
        console.warn("[Persistence] Round backup not written:", e);
        return null;
    }
}

/**
 * True when an end-of-round backup exists for this round id, i.e. the round
 * was saved (simplify C21: Abandon must not delete a saved round).
 * @param {string} roundId
 * @returns {boolean}
 */
export function hasRoundBackup(roundId) {
    if (!roundId) return false;
    // A one-line marker too: backups can be pruned when storage is full.
    try { if (localStorage.getItem(LAST_SAVED_KEY) === roundId) return true; } catch { /* storage off */ }
    // Review P2 (Codex): backups written before this change carry no roundId.
    // Round ids are `round_<start ms>` and backup keys `round_backup_<save ms>`,
    // and only one round is live at a time, so an id-less backup saved AFTER
    // this round started is this round's save. Errs toward keeping the data.
    const started = Number(/^round_(\d+)/.exec(roundId)?.[1]);
    return listRoundBackups().some(key => {
        try {
            const backup = JSON.parse(localStorage.getItem(key) || 'null');
            if (backup?.roundId) return backup.roundId === roundId;
            const savedAt = Number(key.slice(BACKUP_PREFIX.length));
            return Number.isFinite(started) && savedAt >= started;
        } catch {
            return false;
        }
    });
}

/**
 * Correct a backup's `synced` flag after the fact.
 *
 * PRODUCT SWEEP 2026-09-10 SECOND PASS F-5: the backup is stamped
 * `synced: true` the moment the writes are issued, because a fire-and-forget
 * write has no answer yet. A refusal arrives one network round trip later, and
 * a backup that still claims it synced is exactly the record a player would
 * trust when trying to work out what happened to their round.
 *
 * @param {string|null} key - From writeRoundBackup().
 * @returns {void}
 */
export function markRoundBackupUnsynced(key) {
    if (!key) return;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const backup = JSON.parse(raw);
        backup.synced = false;
        localStorage.setItem(key, JSON.stringify(backup));
    } catch (e) {
        console.warn("[Persistence] Could not mark backup unsynced:", e);
    }
}

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

    // F-14: this write was bare, and it runs inside a stateChange listener —
    // a QuotaExceededError here is swallowed by dispatchEvent, so the round
    // silently stopped being saved with no error and no UI change. Prune the
    // stale end-of-round backups (the things filling the quota) and retry once.
    const payload = JSON.stringify(stateToSave);
    try {
        localStorage.setItem(GOLF_APP_STATE_KEY, payload);
    } catch (e) {
        console.warn("[Persistence] Round state write failed; pruning backups and retrying.", e);
        // The flight recorder's small fallback copy is given up first, before
        // any round backup is pruned. It only exists when IndexedDB failed.
        if (releaseRecorderStorage()) {
            try {
                localStorage.setItem(GOLF_APP_STATE_KEY, payload);
                console.log("[Persistence] Round state saved after releasing diagnostics storage.");
                return;
            } catch { /* still full: prune backups below */ }
        }
        pruneRoundBackups(0);
        try {
            localStorage.setItem(GOLF_APP_STATE_KEY, payload);
        } catch (e2) {
            console.error("[Persistence] Round state STILL not saved — device storage is full.", e2);
            alert("Your phone's storage is full, so this round can no longer be saved automatically. Finish and save the round, or free up space.");
            return;
        }
    }
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

// F-15: set while a hydrated round is being dropped from MEMORY only. The
// stateChange listener treats a null activeRoundId as "round ended" and wipes
// localStorage, which is right when the player ended the round and wrong when
// we are merely declining to show someone else's.
let _forgettingInMemory = false;

/**
 * Drop a hydrated round from AppState without touching the localStorage
 * snapshot, so the signed-in user sees no round and cannot start one on top of
 * it, while the rightful owner's copy survives on disk.
 * @returns {void}
 */
export function forgetRoundInMemory() {
    _forgettingInMemory = true;
    try {
        AppState.activeRoundId = null;
        AppState.liveRoundGroups = [];
        AppState.currentHoleShots = [];
        AppState.currentHole = 1;
    } finally {
        _forgettingInMemory = false;
    }
}

/**
 * Boot-time hydration ONLY (BL-UX-11). Round state is restored into AppState
 * before Firestore listeners attach (FP-04 semantics unchanged), but the
 * full-screen round-active PRESENTATION is deferred to presentRestoredRound(),
 * called from the auth callback's approved path — previously the round UI
 * (z-index 500) rendered over the auth/pending gate, so an unapproved or
 * different user landed inside the previous player's round.
 */
export function initializeAppRouting() {
    const hasActiveRound = loadRoundState();
    if (hasActiveRound) {
        console.log("[Persistence] Active round hydrated; presentation deferred until an approved session confirms ownership (BL-UX-11).");
    }
}

/**
 * Present the restored round — invoked only once auth has confirmed an
 * APPROVED session. If the persisted round doesn't belong to this uid
 * (shared device), the stale state is cleared instead of being shown.
 * @param {string} uid - The authenticated, approved user's uid.
 */
export function presentRestoredRound(uid) {
    if (!AppState.activeRoundId) return;

    const owns = Array.isArray(AppState.liveRoundGroups)
        && AppState.liveRoundGroups.some(p => p && p.uid === uid);
    if (!owns) {
        // F-15: DECLINE to present, never erase. This used to clear
        // liveRoundGroups and null activeRoundId, which the stateChange
        // listener turned into localStorage.removeItem — an unrecoverable
        // delete of a round in progress. "I'm not sure this round is yours"
        // is an ambiguous answer (a guest-built group, or an anonymous→Google
        // uid change, both produce it) and the safe reading of an ambiguous
        // answer is to hide the round, so the rightful owner's next sign-in
        // still finds it on disk.
        console.warn("[Persistence] Persisted round does not list this uid — hiding it, leaving the snapshot intact (BL-UX-11, F-15).");
        forgetRoundInMemory();
        return;
    }

    console.log("[Persistence] Ownership confirmed — routing to On-Course Hub.");
    document.body.classList.add('round-active');
    const setupScreen = document.getElementById('oncourse-setup');
    const hubScreen = document.getElementById('oncourse-hub');
    const ocExitBar = document.getElementById('oc-exit-bar');

    if (setupScreen) setupScreen.classList.add('hidden');
    if (hubScreen) hubScreen.classList.remove('hidden');
    if (ocExitBar) ocExitBar.classList.remove('hidden');

    // Switch to the On Course tab (state-driven; nav listeners are bound by
    // now since this runs after initializeAppCallback). The old code clicked
    // #tab-btn-oncourse, an id that has never existed.
    const ocTabBtn = document.querySelector('.tab-btn[data-target="tab-oncourse"]');
    if (ocTabBtn) ocTabBtn.click();

    // Initialize display for the current hole
    loadHole();
    // GPS distances come back with the card if they were on before the reload.
    resumeGpsIfWasOn();

    // Global override for AI Coach redirects
    window.isRestoringRound = true;
}

// F-13 belt and braces: a phone that backgrounds or kills the tab fires
// pagehide/visibilitychange and nothing else — no unload, no stateChange. A
// localStorage write is synchronous, so it completes inside the handler.
function saveOnHide() {
    if (AppState.activeRoundId) saveRoundState();
}
window.addEventListener('pagehide', saveOnHide);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveOnHide();
});

// Global listener for state changes
window.addEventListener('stateChange', (e) => {
    const { property, newValue } = e.detail;

    // Auto-save when round fields change
    if (PERSIST_FIELDS.includes(property)) {
        if (_forgettingInMemory) {
            // F-15: memory-only teardown — the snapshot on disk is not ours to delete.
            return;
        }
        if (property === 'activeRoundId' && !newValue) {
            // Round ended
            clearRoundState();
        } else if (AppState.activeRoundId) {
            // Only save if an active round is ongoing
            saveRoundState();
        }
    }
});
