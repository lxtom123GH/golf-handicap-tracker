/**
 * Shared approval checks for backend callables and Storage uploads.
 * Restricted features are available to approved users and admins.
 */

const PENDING_APPROVAL_MESSAGE =
    'Your account is awaiting approval. AI features unlock once an admin approves it.';

/**
 * @param {{isApproved?: boolean, isAdmin?: boolean}|null|undefined} userData users/{uid}
 * @returns {boolean}
 */
function isApprovedMember(userData) {
    return !!userData && (userData.isApproved === true || userData.isAdmin === true);
}

/**
 * Read users/{uid} and throw { code: 'permission-denied' } unless approved.
 * @param {*} db Firestore (Admin SDK or a fake with collection().doc().get())
 * @param {string} uid
 * @param {string} [message] the refusal text shown to the user
 * @returns {Promise<object>} the caller's user data
 */
async function assertApprovedMember(db, uid, message = PENDING_APPROVAL_MESSAGE) {
    const snap = uid ? await db.collection('users').doc(uid).get() : null;
    const data = snap && snap.exists ? snap.data() : null;
    if (!isApprovedMember(data)) {
        const e = new Error(message);
        e.code = 'permission-denied';
        throw e;
    }
    return data;
}

module.exports = { PENDING_APPROVAL_MESSAGE, isApprovedMember, assertApprovedMember };
