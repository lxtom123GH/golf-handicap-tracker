/**
 * scripts/strip-identity.mjs - remove user-identifying keys from course data
 * before it is written to public/courses/. Course files ship publicly, so a
 * hand trace keeps only non-identifying provenance (provider, imagery,
 * tracedAt). Also cleans files written by older exports that still carry
 * an authorUid on holes the current run does not touch.
 */

export const IDENTITY_KEYS = ['authorUid', 'uid', 'userId', 'email'];

/** Delete every IDENTITY_KEYS key, at any depth, in place. Returns the input. */
export function stripIdentity(node) {
    if (Array.isArray(node)) {
        for (const item of node) stripIdentity(item);
    } else if (node && typeof node === 'object') {
        for (const key of IDENTITY_KEYS) delete node[key];
        for (const value of Object.values(node)) stripIdentity(value);
    }
    return node;
}
