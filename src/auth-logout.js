// Logout loads a fresh page (simplify review 07 Oct 2026, quick win 1).
//
// Signing out used to leave the page running. Signing back in then ran the
// whole app setup a second time: a second submit listener on "Log a past round"
// (one round saved as two whs_rounds rows, counted twice in the index), every
// course list appended again, a second update watcher, and the Admin/Coach tabs
// left visible for the next person on a shared phone. A reload after sign-out
// means the app sets itself up exactly once per page. The round in progress
// lives in localStorage and is saved on pagehide, so nothing is lost.

export function reloadPage() {
    window.location.reload();
}

/**
 * True when the app was already set up for a signed-in golfer and the auth
 * state now says nobody (signed out in another tab, a revoked session) or a
 * different golfer. Any of those must start a fresh page, not a second setup.
 * False on first load (nobody admitted yet) and for the same golfer again.
 */
export function needsFreshPage(admittedUid, nextUid) {
    return !!admittedUid && admittedUid !== nextUid;
}

/**
 * Sign out, then reload the page. Reloads even when sign-out fails, so a
 * half-torn-down session never carries its listeners into the next sign-in.
 */
export function logOutAndReload(signOutFn, auth, reload = reloadPage) {
    return Promise.resolve()
        .then(() => signOutFn(auth))
        .catch((err) => console.error('[Auth] Sign-out failed; reloading anyway', err))
        .then(() => reload());
}
