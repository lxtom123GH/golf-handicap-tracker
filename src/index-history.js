/**
 * index-history.js — where a player's Handicap Index history lives, and the
 * pure helpers shared by the app (whs.js) and the owner-run migration
 * (scripts/migrate-index-history.mjs). No Firebase imports, so plain Node can
 * load it.
 *
 * The history (up to 50 dated published indexes) is private to the player,
 * their coach(es) and admin: users/{uid}/private/handicap { indexHistory }.
 * profiles/{uid} is readable by every signed-in user and keeps only the
 * CURRENT handicapIndex (competitions, the coach roster and On Course need
 * that). Older profiles still carry a legacy profiles/{uid}.indexHistory until
 * the migration runs or the player's next publish moves it; readers merge it in
 * until then.
 */

/** Firestore keeps the last 50 entries (the rules cap the list at this size). */
export const INDEX_HISTORY_MAX = 50;

/**
 * Path segments of the private history doc, for doc(db, ...segments).
 * @param {string} uid
 * @returns {string[]}
 */
export function privateHandicapPath(uid) {
    return ['users', uid, 'private', 'handicap'];
}

const entryTime = (e) => {
    const t = e && e.date ? new Date(e.date).getTime() : NaN;
    return Number.isFinite(t) ? t : -Infinity;
};

/**
 * Union of history lists: duplicates (same date and index) dropped, oldest
 * first, trimmed to the newest INDEX_HISTORY_MAX. Entries that aren't
 * objects are dropped; entries with an unreadable date sort first (kept, so
 * nothing is lost by merging). Never mutates its inputs.
 * @param {...Array<{date:string, index:string}>|null|undefined} lists
 * @returns {Array<{date:string, index:string}>}
 */
export function mergeIndexHistories(...lists) {
    const seen = new Set();
    const out = [];
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const e of list) {
            if (!e || typeof e !== 'object') continue;
            const key = `${e.date}|${e.index}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(e);
        }
    }
    // Stable sort: equal times keep their input order.
    const sorted = out.map((e, i) => ({ e, i, t: entryTime(e) }))
        .sort((a, b) => (a.t - b.t) || (a.i - b.i))
        .map(x => x.e);
    return sorted.length > INDEX_HISTORY_MAX ? sorted.slice(sorted.length - INDEX_HISTORY_MAX) : sorted;
}

/**
 * JSON with object keys sorted, so equal Firestore maps compare equal
 * (Timestamps compare by instant).
 * @param {*} v
 * @returns {string}
 */
export function stableJson(v) {
    if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
    if (v && typeof v === 'object') {
        if (typeof v.toDate === 'function') return JSON.stringify(v.toDate().toISOString());
        return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
    }
    return JSON.stringify(v ?? null);
}

/**
 * What the migration does for one player, from the two documents as they are.
 * Idempotent: once the legacy field is gone the plan is 'none'.
 * @param {Object|null} profileData - profiles/{uid} data (null if no doc).
 * @param {Object|null} privateData - users/{uid}/private/handicap data (null if no doc).
 * @returns {{action: 'none'|'copy-and-strip'|'merge-and-strip'|'strip',
 *   history: Array|null, legacyCount: number, privateCount: number}}
 *   history is what users/{uid}/private/handicap.indexHistory should hold
 *   (null when it needs no write).
 */
export function planIndexHistoryMigration(profileData, privateData) {
    const hasLegacyField = !!profileData && Object.prototype.hasOwnProperty.call(profileData, 'indexHistory');
    const legacy = hasLegacyField && Array.isArray(profileData.indexHistory) ? profileData.indexHistory : [];
    const stored = privateData && Array.isArray(privateData.indexHistory) ? privateData.indexHistory : null;
    const base = { legacyCount: legacy.length, privateCount: stored ? stored.length : 0 };
    if (!hasLegacyField) return { action: 'none', history: null, ...base };
    if (legacy.length === 0) return { action: 'strip', history: null, ...base };
    const merged = mergeIndexHistories(stored || [], legacy);
    if (!stored) return { action: 'copy-and-strip', history: merged, ...base };
    const same = merged.length === stored.length
        && merged.every((e, i) => e.date === stored[i].date && e.index === stored[i].index);
    return same ? { action: 'strip', history: null, ...base } : { action: 'merge-and-strip', history: merged, ...base };
}
