/**
 * ai-errors.js — what to tell the player when an AI callable fails.
 *
 * Most AI failures get the caller's own friendly fallback. Two are the
 * player's actual situation and must be shown as-is instead: an account still
 * awaiting approval (permission-denied, from functions/approval.js) and the
 * daily AI limit (resource-exhausted). Both arrive from httpsCallable as
 * FirebaseError with code 'functions/<code>' and the server's message.
 */
const PASS_THROUGH = new Set(['functions/permission-denied', 'functions/resource-exhausted']);

/**
 * @param {unknown} err the rejection from an httpsCallable
 * @param {string} fallback message for every other failure
 * @returns {string}
 */
export function aiErrorMessage(err, fallback) {
    if (err && PASS_THROUGH.has(err.code) && typeof err.message === 'string' && err.message) {
        return err.message;
    }
    return fallback;
}
