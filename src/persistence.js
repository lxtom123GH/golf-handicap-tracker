// ==========================================
// persistence.js
// LocalStorage Persistence for AppState
// ==========================================
import { AppState } from './state.js';
import { loadHole, resumeGpsIfWasOn } from './oncourse.js';
import { releaseRecorderStorage } from './diagnostics/recorder.js';
import { GOLF_APP_STATE_KEY, readRoundSnapshot, restoreDecision, canSaveRound, writeRoundSnapshot } from './round-snapshot.js';

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
    'currentRoundStartHole',
    'currentShotData',
    'currentLiveCompId',
    'currentLiveCompRules',
    'currentHoleShots',
    'roundOwnerUid',
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
    let json;
    try {
        json = JSON.stringify(backup);
        localStorage.setItem(key, json);
        return key;
    } catch (e) {
        // A backup outranks diagnostics: give back the flight recorder's
        // fallback copy (if any) and retry once.
        if (json !== undefined && releaseRecorderStorage()) {
            try { localStorage.setItem(key, json); return key; } catch { /* still full */ }
        }
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
    const roundId = AppState.activeRoundId;
    // A background tab can still receive stateChange or pagehide after the
    // golfer confirmed a replacement elsewhere.
    if (!roundId || !canSaveRound(roundId)) return;

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
        writeRoundSnapshot(roundId, payload);
    } catch (e) {
        console.warn("[Persistence] Round state write failed; pruning backups and retrying.", e);
        // The flight recorder's small fallback copy is given up first, before
        // any round backup is pruned. It only exists when IndexedDB failed.
        if (releaseRecorderStorage()) {
            try {
                writeRoundSnapshot(roundId, payload);
                console.log("[Persistence] Round state saved after releasing diagnostics storage.");
                return;
            } catch { /* still full: prune backups below */ }
        }
        pruneRoundBackups(0);
        try {
            writeRoundSnapshot(roundId, payload);
        } catch (e2) {
            console.error("[Persistence] Round state STILL not saved — device storage is full.", e2);
            alert("Your phone's storage is full, so this round can no longer be saved automatically. Finish and save the round, or free up space.");
            return;
        }
    }
    console.log("[Persistence] Round state saved to localStorage.");
}

// Hydration and memory-only teardown both trigger the stateChange listener.
// Neither operation should write a partial round or erase the snapshot.
let applyingSnapshot = false;
const roundDefaults = PERSIST_FIELDS.map(field => [field, structuredClone(AppState[field])]);

export function loadRoundState(uid = AppState.currentUser?.uid) {
    const saved = readRoundSnapshot();
    if (restoreDecision(saved, uid) !== 'present') return false;

    applyingSnapshot = true;
    try {
        for (const field of PERSIST_FIELDS) {
            if (Object.hasOwn(saved, field)) AppState[field] = saved[field];
        }
    } finally {
        applyingSnapshot = false;
    }
    return true;
}

/**
 * Clear round state from localStorage
 */
export function clearRoundState() {
    localStorage.removeItem(GOLF_APP_STATE_KEY);
    console.log("[Persistence] Round state cleared from localStorage.");
}

// F-15: preserve the disk copy if presentation rejects a round in memory.
export function forgetRoundInMemory() {
    applyingSnapshot = true;
    try {
        for (const [field, value] of roundDefaults) AppState[field] = structuredClone(value);
    } finally {
        applyingSnapshot = false;
    }
}

/**
 * The approved auth callback bootstraps routing before round listeners and
 * tab selection. Presentation runs after the navigation handlers are bound.
 */
export function initializeAppRouting() {
    const hasActiveRound = loadRoundState();
    if (hasActiveRound) {
        console.log("[Persistence] Active round hydrated; presentation deferred until the approved session is confirmed (BL-UX-11).");
    }
}

/**
 * Present the restored round — invoked only once auth has confirmed an
 * APPROVED session. loadRoundState() already hydrates nothing for another
 * uid; this checks again rather than rely on that, and a round in memory
 * that is not this uid's is dropped from memory, never from disk.
 * @param {string} uid - The authenticated, approved user's uid.
 */
export function presentRestoredRound(uid) {
    if (!AppState.activeRoundId) return;

    if (restoreDecision(AppState, uid) !== 'present') {
        forgetRoundInMemory();
        return;
    }

    console.log("[Persistence] Scorer confirmed — routing to On-Course Hub.");
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
        if (applyingSnapshot) return;
        if (property === 'activeRoundId' && !newValue) {
            // Round ended
            if (readRoundSnapshot()?.activeRoundId === e.detail.oldValue) clearRoundState();
        } else if (AppState.activeRoundId) {
            // Only save if an active round is ongoing
            saveRoundState();
        }
    }
});
