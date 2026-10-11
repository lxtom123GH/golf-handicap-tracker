/**
 * @file auth-google.js
 * @description "Continue with Google" (P-247), split out of auth-v2.js the way
 * auth-reset.js was for P-229: everything here takes the Firebase call it
 * needs as an injectable so tests/auth (Auth emulator, no browser) and
 * tests/unit (no Firebase at all) drive the same code the sign-in screen runs.
 *
 * Popup or redirect
 * -----------------
 * Redirect ONLY when the app is running installed (display-mode: standalone /
 * navigator.standalone): a popup opened from an installed PWA lands in the
 * system browser with no opener, so it can never hand the result back. Every
 * other case - desktop and phone browsers alike - uses the popup, because
 * signInWithRedirect bounces through authDomain
 * (golf-handicap-tracker-b677c.firebaseapp.com), a different site from the app
 * (…web.app), and browsers that partition third-party storage (Safari 16.1+,
 * Firefox 109+, Chrome 115+) then drop the result: getRedirectResult() resolves
 * null and the user is silently not signed in. The popup keeps the page and its
 * state, and does not depend on cross-site storage. Firebase's own fix for the
 * redirect case is to serve the auth handler from the app's domain
 * (VITE_AUTH_DOMAIN in firebase-config.js), which needs a Google Cloud console
 * change by the owner - see the PR body. Until then the standalone path tells
 * the user when the redirect did not come back instead of showing nothing.
 *
 * Linking rule (one account per email, the project default)
 * ---------------------------------------------------------
 * Google is a trusted provider for the address it asserts, so when the same
 * address already has an email+password account Firebase does NOT throw
 * auth/account-exists-with-different-credential: it signs the user into the
 * EXISTING account (same uid, so users/{uid} and every round keyed on it are
 * untouched) and links google.com to it. If that account's email was never
 * verified - which is every golf account, the app sends no verification mail -
 * Firebase also drops the password provider, because an unverified password
 * account with the address could be someone else's; the person can then sign in
 * with Google or run "Forgot password" to set a password again. Verified in
 * tests/auth/google-signin.test.js against the emulator, which implements the
 * same rule. The error path IS still reachable in the other direction
 * (an untrusted provider hitting an existing account), and for completeness on
 * either path the code keeps the pending Google credential, asks for the
 * password once, and links after the password sign-in - the emulator covers
 * that linkWithCredential step too.
 */

import {
    GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
    linkWithCredential
} from "firebase/auth";

export const GOOGLE_PROVIDER_ID = 'google.com';

/** sessionStorage key set just before a redirect, so the return leg can tell "nothing pending" from "the redirect never came back". */
export const REDIRECT_PENDING_KEY = 'golfGoogleRedirectPending';

/**
 * Is the page running as an installed app (home-screen PWA)?
 * @param {Window} [win]
 */
export function isStandaloneDisplay(win) {
    if (!win) return false;
    try {
        if (win.navigator && win.navigator.standalone === true) return true; // iOS Safari
        if (typeof win.matchMedia === 'function'
            && win.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (_) { /* matchMedia missing or throwing - treat as a browser tab */ }
    return false;
}

/**
 * @param {string} [ua]
 */
export function isMobileUserAgent(ua) {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua || '');
}

/**
 * 'redirect' when installed as a PWA, 'popup' otherwise (see the file header
 * for why a phone browser still gets the popup).
 * @param {{standalone?: boolean, userAgent?: string}} [env]
 * @returns {'popup'|'redirect'}
 */
export function chooseGoogleSignInMode(env = {}) {
    return env.standalone ? 'redirect' : 'popup';
}

/** The provider the button uses; always offer the account chooser. */
export function buildGoogleProvider() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
}

/**
 * Plain-language messages for what the button can run into. Every one of them
 * names email+password as the way in that still works.
 * @param {string} [code] Firebase error code
 */
export function googleSignInMessage(code) {
    switch (code) {
        case 'auth/operation-not-allowed':
            return 'Google sign-in is not switched on for this app yet. '
                + 'Email and password still work - use those for now.';
        case 'auth/account-exists-with-different-credential':
            return 'An account already exists for that email address. '
                + 'Sign in with your email and password once and Google will be connected to it.';
        case 'auth/popup-blocked':
            return 'Your browser blocked the Google sign-in window. '
                + 'Allow pop-ups for this site, or sign in with email and password.';
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return 'The Google sign-in window was closed before it finished. Try again when ready.';
        case 'auth/unauthorized-domain':
            return 'This web address is not authorised for Google sign-in yet. '
                + 'Sign in with email and password.';
        case 'auth/network-request-failed':
            return 'No connection. Check your network and try again.';
        case 'auth/redirect-did-not-return':
            return 'Google sign-in did not come back to the app. '
                + 'Open the app in your phone\'s browser and try Google there, or sign in with email and password.';
        case 'auth/credential-already-in-use':
            return 'That Google account is already connected to a different login. '
                + 'Sign in with Google directly, or with the email and password you used before.';
        default:
            return 'Google sign-in did not finish. Sign in with email and password, or try again.';
    }
}

/**
 * Turn a Firebase error into the result shape the UI consumes.
 * @param {any} err
 */
function failure(err) {
    const code = (err && err.code) || 'auth/unknown';
    const result = { ok: false, code, message: googleSignInMessage(code) };
    if (code === 'auth/account-exists-with-different-credential') {
        let pending = null;
        try { pending = GoogleAuthProvider.credentialFromError(err); } catch (_) { pending = null; }
        result.pendingCredential = pending;
        result.email = (err.customData && err.customData.email) || null;
    }
    return result;
}

/**
 * Start a Google sign-in.
 * @param {import('firebase/auth').Auth} auth
 * @param {{
 *   mode?: 'popup'|'redirect',
 *   provider?: import('firebase/auth').AuthProvider,
 *   popup?: typeof signInWithPopup,
 *   redirect?: typeof signInWithRedirect,
 *   storage?: Storage
 * }} [options] the Firebase calls are injectable for the emulator and unit tests
 * @returns {Promise<{ok: true, user: import('firebase/auth').User}
 *   | {ok: true, pendingRedirect: true}
 *   | {ok: false, code: string, message: string, pendingCredential?: any, email?: string|null}>}
 */
export async function signInWithGoogle(auth, options = {}) {
    const mode = options.mode || 'popup';
    const provider = options.provider || buildGoogleProvider();
    const popup = options.popup || signInWithPopup;
    const redirect = options.redirect || signInWithRedirect;
    try {
        if (mode === 'redirect') {
            markRedirectPending(options.storage, true);
            await redirect(auth, provider);
            return { ok: true, pendingRedirect: true };
        }
        const credential = await popup(auth, provider);
        return { ok: true, user: credential.user };
    } catch (err) {
        if (mode === 'redirect') markRedirectPending(options.storage, false);
        return failure(err);
    }
}

/**
 * The return leg of a redirect sign-in, called once on every load. Resolves
 * {ok:true, user:null} when nothing was pending, so callers can fire and forget.
 * @param {import('firebase/auth').Auth} auth
 * @param {{getRedirectResult?: typeof getRedirectResult, storage?: Storage}} [options]
 */
export async function completeGoogleRedirect(auth, options = {}) {
    const getResult = options.getRedirectResult || getRedirectResult;
    const wasPending = markRedirectPending(options.storage, false);
    try {
        const credential = await getResult(auth);
        if (credential && credential.user) return { ok: true, user: credential.user };
        if (wasPending && !(auth && auth.currentUser)) {
            return { ok: false, code: 'auth/redirect-did-not-return',
                message: googleSignInMessage('auth/redirect-did-not-return') };
        }
        return { ok: true, user: null };
    } catch (err) {
        return failure(err);
    }
}

/**
 * After a password sign-in, attach the Google credential we were holding from
 * an auth/account-exists-with-different-credential error. Same uid, one more
 * provider; the next visit can use either.
 * @param {import('firebase/auth').User} user
 * @param {any} pendingCredential
 * @param {{link?: typeof linkWithCredential}} [options]
 */
export async function linkPendingGoogleCredential(user, pendingCredential, options = {}) {
    if (!user || !pendingCredential) {
        return { ok: false, code: 'auth/no-pending-credential', message: 'Nothing to link.' };
    }
    const link = options.link || linkWithCredential;
    try {
        const credential = await link(user, pendingCredential);
        return { ok: true, user: credential.user };
    } catch (err) {
        return failure(err);
    }
}

/**
 * Provider ids on a signed-in user, e.g. ['password', 'google.com'].
 * @param {import('firebase/auth').User} user
 */
export function providerIds(user) {
    return ((user && user.providerData) || []).map(p => p.providerId);
}

/**
 * Set or clear the "a redirect is in flight" flag. Returns whether it WAS set.
 * @param {Storage} [storage]
 * @param {boolean} pending
 */
function markRedirectPending(storage, pending) {
    if (!storage) return false;
    try {
        const was = storage.getItem(REDIRECT_PENDING_KEY) === '1';
        if (pending) storage.setItem(REDIRECT_PENDING_KEY, '1');
        else storage.removeItem(REDIRECT_PENDING_KEY);
        return was;
    } catch (_) {
        return false;
    }
}
