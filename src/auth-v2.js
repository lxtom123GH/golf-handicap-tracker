// ==========================================
// auth.js
// Centralized Authentication Logic
// ==========================================

import { auth, db } from './firebase-config.js';
import {
    onAuthStateChanged, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut, updateProfile,
    sendEmailVerification, reload
} from "firebase/auth";
import { requestPasswordReset, resetContinueUrl } from './auth-reset.js';
import { authErrorMessage } from './auth-messages.js';
import { logOutAndReload, needsFreshPage, reloadPage } from './auth-logout.js';
import {
    signInWithGoogle, completeGoogleRedirect, linkPendingGoogleCredential,
    chooseGoogleSignInMode, isStandaloneDisplay, GOOGLE_PROVIDER_ID
} from './auth-google.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { UI, switchTab } from './ui.js';
import { AppState } from './state.js';
import { presentRestoredRound } from './persistence.js';
import { bindAdminTools, bindAdminInvite } from './admin.js';
import { renderAccountInfo, bindSettingsPasswordReset, syncPasswordResetButton } from './settings-account.js';
import { isAdmittedUser } from './approval.js';
import {
    canApproveFromInviteLookup, pendingAuthState, promoteVerifiedInvite,
    registerPasswordAccount, refreshEmailVerification
} from './auth-approval.js';

let isRegistering = false;
let registerSubmitButton = null;
let initializeAppCallback = null; // Callback supplied by app.js to boot modules
/** Google credential held from auth/account-exists-with-different-credential until the password sign-in that links it. */
let pendingGoogleCredential = null;

/** runAuthGate bookkeeping: the latest run wins; the app boots once per uid. */
let gateGeneration = 0;
let admittedUid = null;


/**
 * The users/{uid} document a first sign-in creates - the same shape for the
 * register form and for a first "Continue with Google" (P-247), plus which
 * provider created it. An invite auto-approves only after Firebase verifies
 * the email; password registrations start pending and verify through email.
 * @param {import('firebase/auth').User} user
 * @param {{displayName: string, email: string, authProvider: 'password'|'google.com'}} fields
 */
async function createUserDoc(user, { displayName, email, authProvider }) {
    // The invite read itself requires a verified email. Password signups are
    // written as pending and checked again after the user follows the link.
    const isApproved = await canApproveFromInviteLookup(user, email,
        async normalizedEmail => (await getDoc(doc(db, "preapproved_emails", normalizedEmail))).exists()
    );

    // F-19 (product sweep 2026-09-10): the three privilege fields are now
    // guarded on CREATE as well as UPDATE (firestore.rules users/{userId}) —
    // isApproved may only arrive true for a verified address on the invite
    // list, which is exactly what these checks mean. The old
    // localhost shortcuts (an email containing "admin"/"coach" self-granted the
    // role, and any localhost signup self-approved) are gone: the isAdmin half
    // was already denied by the rule shipped with SEC-HIGH-2, so that shortcut
    // has been dead since 2026-08 anyway. To exercise an admin or coach account
    // against the emulator, seed the address into preapproved_emails and flip
    // the role with the admin.js toggles, which is the production path.
    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: email,
        displayName: displayName,
        isApproved: isApproved,
        isAdmin: false,
        isCoach: false,
        coaches: [],
        authProvider: authProvider,
        createdAt: serverTimestamp()
    });
}

/**
 * A Google sign-in that landed on an existing account (same uid - Firebase's
 * one-account-per-email rule, see auth-google.js) already has its document;
 * a brand-new Google user gets one now, exactly as the register form would.
 * onAuthStateChanged is fetching users/{uid} concurrently with its 3-retry
 * loop - the same race the register form has always run.
 * @param {import('firebase/auth').User} user
 */
async function ensureGoogleUserDoc(user) {
    const existing = await getDoc(doc(db, "users", user.uid));
    if (existing.exists()) return;
    const email = user.email || '';
    await createUserDoc(user, {
        displayName: user.displayName || email.split('@')[0] || 'Golfer',
        email,
        authProvider: GOOGLE_PROVIDER_ID
    });
}

function showPendingAuth(user) {
    const state = pendingAuthState(user);
    const heading = document.getElementById('auth-pending-heading');
    const message = document.getElementById('auth-pending-message');
    const checkButton = document.getElementById('btn-check-email');
    const resendButton = document.getElementById('btn-resend-verification');
    const feedback = document.getElementById('auth-pending-feedback');
    if (heading) heading.textContent = state.title;
    if (message) message.textContent = state.message;
    if (checkButton) checkButton.classList.toggle('hidden', !state.needsEmailVerification);
    if (resendButton) resendButton.classList.toggle('hidden', !state.needsEmailVerification);
    if (feedback) { feedback.textContent = ''; feedback.classList.add('hidden'); }
}

function showGoogleMessage(text) {
    const el = document.getElementById('google-signin-msg');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
}

function hideGoogleMessage() {
    const el = document.getElementById('google-signin-msg');
    if (el) el.classList.add('hidden');
}

/**
 * One handler for both legs (popup result now, redirect result on the next
 * load). Failure never blocks the email+password form beneath it.
 * @param {Awaited<ReturnType<typeof signInWithGoogle>>} result
 */
async function handleGoogleResult(result) {
    if (result.ok) {
        if (result.user) {
            try {
                await ensureGoogleUserDoc(result.user);
                if (auth.currentUser?.uid === result.user.uid) runAuthGate(result.user);
            }
            catch (e) { console.error('[Auth] Google user doc failed:', e); }
        }
        return;
    }
    if (result.pendingCredential) {
        pendingGoogleCredential = result.pendingCredential;
        const emailInput = document.getElementById('auth-email');
        if (emailInput && result.email && !emailInput.value) emailInput.value = result.email;
    }
    console.warn('[Auth] Google sign-in:', result.code);
    showGoogleMessage(result.message);
}

export function setupAuthUI(onAppReady) {
    initializeAppCallback = onAppReady;

    // P-247: Continue with Google. Redirect when installed as a PWA, popup
    // otherwise (auth-google.js says why). The redirect's return leg is
    // collected below on every load.
    const btnGoogle = document.getElementById('btn-google-signin');
    if (btnGoogle) {
        btnGoogle.addEventListener('click', async () => {
            UI.authError.classList.add('hidden');
            hideGoogleMessage();
            btnGoogle.disabled = true;
            try {
                const mode = chooseGoogleSignInMode({
                    standalone: isStandaloneDisplay(window),
                    userAgent: navigator.userAgent
                });
                const result = await signInWithGoogle(auth, { mode, storage: window.sessionStorage });
                await handleGoogleResult(result);
            } finally {
                btnGoogle.disabled = false;
            }
        });
    }
    completeGoogleRedirect(auth, { storage: window.sessionStorage })
        .then(handleGoogleResult)
        .catch(e => console.error('[Auth] Google redirect result failed:', e));

    if (UI.btnRegister) {
        UI.btnRegister.addEventListener('click', () => {
            isRegistering = true;
            // A new account: let the password manager offer to generate and
            // save a password instead of filling the old one.
            document.getElementById('auth-password')?.setAttribute('autocomplete', 'new-password');
            UI.registerFields.classList.remove('hidden');
            UI.btnLogin.style.display = 'none';
            UI.btnRegister.style.display = 'none';
            UI.authSwitchBack.classList.remove('hidden');
            registerSubmitButton = document.createElement('button');
            registerSubmitButton.type = 'submit';
            registerSubmitButton.className = 'btn btn-primary';
            registerSubmitButton.textContent = 'Create Account';
            UI.authForm.appendChild(registerSubmitButton);
        });
    }

    if (UI.linkBackLogin) {
        UI.linkBackLogin.addEventListener('click', (e) => {
            e.preventDefault();
            isRegistering = false;
            document.getElementById('auth-password')?.setAttribute('autocomplete', 'current-password');
            UI.registerFields.classList.add('hidden');
            UI.btnLogin.style.display = 'block';
            UI.btnRegister.style.display = 'block';
            UI.authSwitchBack.classList.add('hidden');
            if (registerSubmitButton) {
                registerSubmitButton.remove();
                registerSubmitButton = null;
            }
        });
    }

    if (UI.authForm) {
        UI.authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            UI.authError.classList.add('hidden');
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            try {
                if (isRegistering) {
                    const name = document.getElementById('auth-name').value;
                    if (!name) throw Object.assign(new Error('Display name required'), { code: 'app/missing-display-name' });
                    const user = await registerPasswordAccount({
                        auth, email, password, displayName: name,
                        createAccount: createUserWithEmailAndPassword,
                        updateProfile,
                        createUserDoc,
                        sendVerification: sendEmailVerification,
                    });
                    // The gate may already have given up on the missing doc.
                    if (auth.currentUser?.uid === user.uid) runAuthGate(user);
                } else {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    if (pendingGoogleCredential) {
                        // P-247: the Google credential held from
                        // auth/account-exists-with-different-credential joins
                        // this account now - same uid, either way in next time.
                        const held = pendingGoogleCredential;
                        pendingGoogleCredential = null;
                        const linked = await linkPendingGoogleCredential(userCredential.user, held);
                        if (!linked.ok) console.warn('[Auth] Google link after password sign-in:', linked.code);
                    }
                }
            } catch (error) {
                UI.authError.textContent = authErrorMessage(error);
                UI.authError.classList.remove('hidden');
            }
        });
    }

    const checkEmailButton = document.getElementById('btn-check-email');
    if (checkEmailButton) {
        checkEmailButton.addEventListener('click', async () => {
            const user = auth.currentUser;
            const feedback = document.getElementById('auth-pending-feedback');
            if (!user) return;
            checkEmailButton.disabled = true;
            try {
                const verified = await refreshEmailVerification(user, {
                    reloadUser: reload,
                    getIdToken: (target, force) => target.getIdToken(force),
                });
                if (verified) await runAuthGate(user);
                else if (feedback) {
                    feedback.textContent = 'We have not seen a verified email yet. Open the link in your inbox, then try again.';
                    feedback.classList.remove('hidden');
                }
            } catch (error) {
                console.warn('[Auth] Email verification refresh failed:', error?.code);
                if (feedback) {
                    feedback.textContent = 'Could not check your email status. Check your connection and try again.';
                    feedback.classList.remove('hidden');
                }
            } finally {
                checkEmailButton.disabled = false;
            }
        });
    }

    const resendVerificationButton = document.getElementById('btn-resend-verification');
    if (resendVerificationButton) {
        resendVerificationButton.addEventListener('click', async () => {
            const user = auth.currentUser;
            const feedback = document.getElementById('auth-pending-feedback');
            if (!user || user.emailVerified === true) return;
            resendVerificationButton.disabled = true;
            try {
                await sendEmailVerification(user);
                if (feedback) {
                    feedback.textContent = 'Verification email sent. Check your inbox and spam folder.';
                    feedback.classList.remove('hidden');
                }
            } catch (error) {
                console.warn('[Auth] Verification email resend failed:', error?.code);
                if (feedback) {
                    feedback.textContent = 'Could not send the verification email. Check your connection and try again.';
                    feedback.classList.remove('hidden');
                }
            } finally {
                resendVerificationButton.disabled = false;
            }
        });
    }

    // Logout loads a fresh page so the next sign-in sets the app up once
    // (a second setup double-saved past rounds). See auth-logout.js.
    if (UI.btnLogout) UI.btnLogout.addEventListener('click', () => logOutAndReload(signOut, auth));
    if (UI.btnPendingLogout) UI.btnPendingLogout.addEventListener('click', () => logOutAndReload(signOut, auth));

    // Forgot Password
    const linkForgotPassword = document.getElementById('link-forgot-password');
    const forgotPasswordSection = document.getElementById('forgot-password-section');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const forgotPasswordMsg = document.getElementById('forgot-password-msg');

    if (linkForgotPassword && forgotPasswordSection) {
        linkForgotPassword.addEventListener('click', (e) => {
            e.preventDefault();
            forgotPasswordSection.classList.toggle('hidden');
        });
    }

    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgot-email').value;
            const result = await requestPasswordReset(auth, email, {
                continueUrl: resetContinueUrl(window.location.origin)
            });
            forgotPasswordMsg.textContent = result.message;
            forgotPasswordMsg.style.color = result.ok ? '#10b981' : '#ef4444';
            forgotPasswordMsg.classList.remove('hidden');
        });
    }

    // Settings > Account: the signed-in golfer's own reset (E34).
    bindSettingsPasswordReset({
        button: document.getElementById('btn-change-password'),
        msg: document.getElementById('settings-pw-msg'),
        auth,
        origin: window.location.origin
    });

    // Listen for state changes
    onAuthStateChanged(auth, runAuthGate);
}

/**
 * Route a signed-in (or signed-out) user to the app, the pending screen or the
 * login form.
 *
 * Runs on every auth state change AND again once a new account's users/{uid}
 * document has been written (owner CI flakes 2026-10-04): onAuthStateChanged
 * fires as soon as the auth account exists, before updateProfile, the invite
 * read and the document write have landed. On a slow connection the ~1.5 s
 * retry below runs out first and an INVITED golfer was left on "Account
 * Pending" until they reloaded. The re-run after the write fixes that; the
 * generation token makes an older, still-retrying run stand down, and
 * `admittedUid` keeps the app bootstrap to once per signed-in user.
 * @param {import('firebase/auth').User|null} user
 */
async function runAuthGate(user) {
        const gen = ++gateGeneration;
        const superseded = () => gen !== gateGeneration;
        // The app was set up for someone who is now signed out (another tab,
        // a revoked session) or replaced: start a fresh page instead of
        // setting the app up a second time. See auth-logout.js.
        if (needsFreshPage(admittedUid, user ? user.uid : null)) {
            reloadPage();
            return;
        }
        if (user) {
            AppState.currentUser = user;
            if (admittedUid === user.uid) return; // already in the app
            try {
                console.log("[Auth] User detected:", user.uid, "Fetching doc...");
                let currentDocRef = doc(db, "users", user.uid);
                let userDoc = await getDoc(currentDocRef);

                let retries = 0;
                while (!userDoc.exists() && retries < 3) {
                    if (superseded()) return;
                    console.log("[Auth] User doc not found, retry", retries);
                    await new Promise(r => setTimeout(r, 500));
                    userDoc = await getDoc(currentDocRef);
                    retries++;
                }
                if (superseded() || admittedUid === user.uid) return;

                if (userDoc.exists()) {
                    let userData = userDoc.data();
                    if (userData.isApproved !== true && userData.isAdmin !== true
                        && user.emailVerified === true) {
                        userData = await promoteVerifiedInvite(user, userData, {
                            refreshToken: (target, force) => target.getIdToken(force),
                            getInvite: async email => (await getDoc(doc(db, 'preapproved_emails', email))).exists(),
                            approve: () => updateDoc(doc(db, 'users', user.uid), { isApproved: true }),
                        });
                    }
                    // Password accounts must verify before entering, including
                    // accounts that an admin has approved while verification
                    // is still outstanding. Admin role access remains intact.
                    const needsEmailVerification = userData.isAdmin !== true
                        && userData.authProvider === 'password'
                        && user.emailVerified !== true;
                    // Approved or admin. A missing isApproved is pending (see
                    // approval.js): it used to count as a legacy approval, which
                    // let a sign-up that left the field out skip this screen.
                    if (!needsEmailVerification && isAdmittedUser(userData)) {
                        // Allowed
                        // Force allowed for verification
                        console.log("[Auth] User approved, hiding overlay...");
                        admittedUid = user.uid;
                        UI.authOverlay.classList.add('hidden');
                        UI.mainApp.classList.remove('hidden');
                        UI.authPending.classList.add('hidden');
                        AppState.viewingPlayerId = user.uid;

                        // Correctly set roles from database instead of forcing true
                        window.currentUserIsAdmin = userData.isAdmin || false;
                        window.currentUserIsCoach = userData.isCoach || false;

                        // Attach roles to AppState for easy reactive checks
                        user.isCoach = userData.isCoach || false;
                        user.isAdmin = userData.isAdmin || false;
                        AppState.currentUser = user;
                        try {
                            renderAccountInfo(document.getElementById('settings-account-info'), {
                                displayName: user.displayName || userData.displayName,
                                email: user.email || userData.email,
                                isAdmin: !!userData.isAdmin,
                                isCoach: !!userData.isCoach
                            });
                            syncPasswordResetButton(document.getElementById('btn-change-password'), user);
                            // A reset message from the previous golfer on this phone must not linger.
                            const pwMsg = document.getElementById('settings-pw-msg');
                            if (pwMsg) { pwMsg.textContent = ''; pwMsg.classList.add('hidden'); }
                        } catch (e) { console.error("[Auth] Account card failed:", e); }

                        if (userData.isAdmin) {
                            if (UI.tabBtnAdmin) UI.tabBtnAdmin.classList.remove('hidden');
                            try {
                                bindAdminTools();
                                bindAdminInvite();
                            } catch (e) { console.error("[Auth] Admin binding failed:", e); }
                        }
                        if (userData.isCoach) {
                            const coachBtn = document.getElementById('tab-btn-coach');
                            if (coachBtn) coachBtn.classList.remove('hidden');
                        }
                        const settingsBtn = document.getElementById('tab-btn-settings');
                        if (settingsBtn) settingsBtn.classList.remove('hidden');

                        // Show Feed tab for all approved users
                        const feedTabBtn = document.getElementById('tab-btn-feed');
                        if (feedTabBtn) feedTabBtn.classList.remove('hidden');
                        // Roles and bootstrapping handled by individual modules
                        if (initializeAppCallback) initializeAppCallback();

                        // Security Heartbeat: Explicitly sync UI state
                        try {
                            let defaultTab = localStorage.getItem('golfAppDefaultTab') || 'tab-whs';
                            // BL-UX-12: golfAppDefaultTab is shared across users on
                            // this browser, so a new/different user can inherit the
                            // previous user's tab — including tab-coach, which a
                            // non-coach can't use ("new user lands on Coach
                            // Dashboard"). Only role-gated tabs (coach/admin) have a
                            // tab-btn-* id and get hidden per role (gating above has
                            // run); if such a button EXISTS but is hidden, this user
                            // can't use that tab → fall back to the handicap home.
                            // Core tabs (whs/comp/oncourse/practice) have no such
                            // button id, so they're left untouched (no regression).
                            const navBtn = document.getElementById(defaultTab.replace('tab-', 'tab-btn-'));
                            if (navBtn && navBtn.classList.contains('hidden')) {
                                defaultTab = 'tab-whs';
                            }
                            switchTab(defaultTab);
                        } catch (e) { console.error("[Auth] UI Sync failed:", e); }

                        // BL-UX-11: only NOW (approved session) may a hydrated
                        // in-flight round take over the screen — and only if
                        // this uid owns it; otherwise the stale state is cleared.
                        try { presentRestoredRound(user.uid); } catch (e) { console.error("[Auth] Round restore failed:", e); }

                        console.log("[Auth] Bootstrap complete, removing cloak.");
                        const cloak = document.getElementById('app-loading-cloak');
                        if (cloak) cloak.classList.add('cloak-hidden');
                    } else {
                        // Blocked: the account exists but isApproved isn't true. Show the
                        // "Account Pending" screen — NOT the app shell. (Previously this
                        // branch revealed the main app with navigation never initialised,
                        // so every unapproved registrant landed on a dead blank screen.)
                        console.log("[Auth] User not approved — showing pending screen.");
                        UI.authOverlay.classList.add('hidden');
                        UI.mainApp.classList.add('hidden');
                        showPendingAuth(user);
                        UI.authPending.classList.remove('hidden');
                        const cloak = document.getElementById('app-loading-cloak');
                        if (cloak) cloak.classList.add('cloak-hidden');
                    }
                } else {
                    UI.authOverlay.classList.add('hidden');
                    UI.mainApp.classList.add('hidden');
                    showPendingAuth(user);
                    UI.authPending.classList.remove('hidden');
                    const cloak = document.getElementById('app-loading-cloak');
                    if (cloak) cloak.classList.add('cloak-hidden');
                }
            } catch (e) {
                if (superseded()) return;
                // A read failure must NOT grant access or admin. Hold the user
                // on the auth overlay with a retry message rather than silently
                // admitting them (the 3-retry loop above already absorbs
                // transient blips before we reach here).
                console.error("Auth read failed; not granting access", e);
                UI.mainApp.classList.add('hidden');
                UI.authPending.classList.add('hidden');
                UI.authOverlay.classList.remove('hidden');
                UI.authError.textContent = "Couldn't verify your account. Please retry.";
                UI.authError.classList.remove('hidden');

                const cloak = document.getElementById('app-loading-cloak');
                if (cloak) cloak.classList.add('cloak-hidden');
            }
        } else {
            // Not logged in
            admittedUid = null;
            AppState.currentUser = null;
            AppState.viewingPlayerId = null;
            UI.authOverlay.classList.remove('hidden');
            UI.mainApp.classList.add('hidden');
            UI.authPending.classList.add('hidden');

            const cloak = document.getElementById('app-loading-cloak');
            if (cloak) cloak.classList.add('cloak-hidden');
        }
}
