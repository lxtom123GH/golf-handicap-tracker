export const GOLF_APP_STATE_KEY = 'golf_round_state';

// null means empty. An unreadable value is left in place and requires the
// same replacement confirmation as a live round.
export function readRoundSnapshot() {
    try {
        const raw = localStorage.getItem(GOLF_APP_STATE_KEY);
        if (raw === null) return null;
        const saved = JSON.parse(raw);
        return saved && typeof saved === 'object' ? saved : undefined;
    } catch (e) {
        console.warn('[Persistence] Could not read the saved round.', e);
        return undefined;
    }
}

// Only pre-owner snapshots use group membership. A legacy guest-only group
// can be ambiguous, so a foreign decision must always preserve the disk copy.
export function restoreDecision(snap, uid) {
    if (!snap?.activeRoundId) return 'none';
    if (!uid) return 'foreign';
    if (snap.roundOwnerUid) return snap.roundOwnerUid === uid ? 'present' : 'foreign';
    const listed = Array.isArray(snap.liveRoundGroups) && snap.liveRoundGroups.some(p => p?.uid === uid);
    return listed ? 'present' : 'foreign';
}

// A confirmation covers one new round and the specific slot it will replace.
// Keep it across quota retries, then retire it on the first successful write.
let replacement = null;

export function confirmRoundStart(newId) {
    const saved = readRoundSnapshot();
    if (saved === undefined || saved?.activeRoundId) {
        if (!confirm("Starting a new round will replace the saved round on this device. Continue?")) return false;
        replacement = { newId, oldId: saved?.activeRoundId };
    } else {
        replacement = null;
    }
    return true;
}

export function canSaveRound(roundId) {
    const saved = readRoundSnapshot();
    if (saved !== undefined && (!saved?.activeRoundId || saved.activeRoundId === roundId)) return true;
    return replacement?.newId === roundId && replacement.oldId === saved?.activeRoundId;
}

export function writeRoundSnapshot(roundId, payload) {
    localStorage.setItem(GOLF_APP_STATE_KEY, payload);
    if (replacement?.newId === roundId) replacement = null;
}
