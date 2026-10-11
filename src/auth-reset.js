/**
 * @file auth-reset.js
 * @description The forgot-password request, split out of auth-v2.js (P-229) so
 * the emulator test in tests/auth/password-reset.test.js drives the same code
 * the login screen runs, instead of a copy of it.
 *
 * Two things this fixes, both found while diagnosing "the reset isn't working"
 * against the live project (golf-handicap-tracker-b677c) on 2026-09-03:
 *
 *  1. Email enumeration protection is ON for this project - a reset request for
 *     an address with no account returns HTTP 200 and sends nothing. The old
 *     handler printed "Reset email sent! Check your inbox." on that 200, so a
 *     typo'd or wrong address looked exactly like success. The message below
 *     says what is actually true and names the things that hide the email
 *     (delivery delay, spam, one-hour expiry).
 *  2. Firebase's own action page ends on "your password has been changed" with
 *     no way back to the app. Passing a continue URL puts a link back to the
 *     login screen there, which is where the owner has to end up. If the
 *     hosting origin is not on the Authentication > Settings > Authorized
 *     domains list, Firebase rejects the continue URL - we fall back to the
 *     plain link rather than failing the whole reset.
 */

import { sendPasswordResetEmail } from "firebase/auth";
import { authErrorMessage } from './auth-messages.js';

/** Continue-URL rejections worth retrying without one. */
const CONTINUE_URL_ERRORS = new Set([
    'auth/unauthorized-continue-uri',
    'auth/invalid-continue-uri',
    'auth/missing-continue-uri'
]);

/**
 * The page the reset link should offer to return to: the app's own login screen.
 * @param {string} [origin] typically window.location.origin
 * @returns {string|undefined} undefined when there is no usable origin
 */
export function resetContinueUrl(origin) {
    if (!origin || origin === 'null') return undefined;
    return origin.endsWith('/') ? origin : origin + '/';
}

/**
 * Request a password reset email.
 * @param {import('firebase/auth').Auth} auth
 * @param {string} rawEmail address as typed
 * @param {{continueUrl?: string}} [options]
 * @returns {Promise<{ok: boolean, code?: string, message: string, usedContinueUrl?: boolean}>}
 */
export async function requestPasswordReset(auth, rawEmail, options = {}) {
    const email = (rawEmail || '').trim();
    if (!email) {
        return { ok: false, code: 'auth/missing-email', message: 'Enter your email address.' };
    }

    const continueUrl = options.continueUrl;
    try {
        if (continueUrl) {
            try {
                await sendPasswordResetEmail(auth, email, { url: continueUrl, handleCodeInApp: false });
                return { ok: true, message: sentMessage(email), usedContinueUrl: true };
            } catch (err) {
                if (!CONTINUE_URL_ERRORS.has(err && err.code)) throw err;
                // This origin is not an authorized domain. The reset itself
                // still works; the owner just lands on Firebase's page.
            }
        }
        await sendPasswordResetEmail(auth, email);
        return { ok: true, message: sentMessage(email), usedContinueUrl: false };
    } catch (err) {
        return { ok: false, code: err && err.code, message: authErrorMessage(err) };
    }
}

/**
 * What we can honestly claim after a 200: the request was accepted. Whether an
 * email goes out depends on an account existing for this address.
 * @param {string} email
 */
export function sentMessage(email) {
    return `If an account exists for ${email}, a reset link is on its way. `
        + `It can take a few minutes - check spam. The link expires in an hour; `
        + `if you asked more than once, open the newest email.`;
}
