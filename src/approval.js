/**
 * approval.js - who gets past the "awaiting approval" screen.
 *
 * Approved means users/{uid}.isApproved === true, or isAdmin === true (only an
 * admin can grant isAdmin). A doc with NO isApproved field is pending, like
 * isApproved:false: sign-up always writes the field, and the rules refuse a
 * self-created users doc without it, so a missing field is either an account
 * from before approvals existed (run scripts/backfill-is-approved.mjs) or one
 * trying to skip the approval screen. Mirrors functions/approval.js
 * isApprovedMember and storage.rules isApprovedMember.
 *
 * @param {{isApproved?: boolean, isAdmin?: boolean}|null|undefined} userData
 * @returns {boolean}
 */
export function isAdmittedUser(userData) {
    return !!userData && (userData.isApproved === true || userData.isAdmin === true);
}
