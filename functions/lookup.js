/**
 * Directory lookup helpers. Only approved callers can resolve coach accounts;
 * ordinary player membership remains private.
 */

const { isApprovedMember } = require('./approval');

/** Directory lookups a single caller may perform per Brisbane day. */
const LOOKUP_DAILY_LIMIT = 20;

/**
 * Normalize the requested email for an exact match.
 *
 * Preserve case because users.email stores the signup value and the Admin SDK
 * query uses exact equality.
 * @param {unknown} raw
 * @returns {string} the address to query
 * @throws {Error & {code: 'invalid-argument'}}
 */
function normaliseLookupEmail(raw) {
    const email = (typeof raw === 'string' ? raw : '').trim();
    if (!email || email.length > 254 || !email.includes('@') || email.endsWith('@')) {
        const e = new Error('A valid email is required.');
        e.code = 'invalid-argument';
        throw e;
    }
    return email;
}

/**
 * May this caller use the directory at all? Approved users only — the same
 * predicate that gates the AI callables (./approval.js).
 * @param {{isApproved?: boolean, isAdmin?: boolean}|null|undefined} callerData users/{callerUid}
 */
function callerMayLookUp(callerData) {
    return isApprovedMember(callerData);
}

/**
 * The uid to hand back, or null. Only a coach is resolvable; everything else —
 * an ordinary player, no match at all — returns the same null, so the caller
 * cannot tell "not a coach" from "not a user".
 * @param {{id: string, data: {isCoach?: boolean}}|null|undefined} match
 */
function resolvableUidFrom(match) {
    if (!match || !match.data) return null;
    return match.data.isCoach === true ? match.id : null;
}

module.exports = {
    LOOKUP_DAILY_LIMIT,
    normaliseLookupEmail,
    callerMayLookUp,
    resolvableUidFrom,
};
