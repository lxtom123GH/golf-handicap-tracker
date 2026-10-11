// @vitest-environment node
/**
 * P-247: "Continue with Google" against the Auth emulator.
 *
 * Drives src/auth-google.js - the same functions the sign-in screen calls.
 * The emulator cannot open a Google popup, so the popup step is injected as
 * signInWithCredential with a fake Google ID token: the emulator accepts an
 * UNSIGNED JSON object {sub, email, email_verified, name} in place of a real
 * Google token (documented emulator behaviour), and runs the same
 * one-account-per-email linking rule as production.
 *
 * Run: npm run test:auth
 *   (npx firebase emulators:exec --only auth --project demo-golf-tracker
 *    "vitest run tests/auth")
 *
 * What this suite CANNOT show: whether the Google provider is enabled in the
 * live project (the emulator never returns auth/operation-not-allowed - that
 * path is covered with a mocked popup below), and the popup/redirect browser
 * mechanics themselves.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
    getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signInWithCredential, GoogleAuthProvider, signOut
} from 'firebase/auth';
import {
    signInWithGoogle, completeGoogleRedirect, linkPendingGoogleCredential,
    providerIds, GOOGLE_PROVIDER_ID, REDIRECT_PENDING_KEY
} from '../../src/auth-google.js';

const PROJECT_ID = 'demo-golf-tracker';
const EMULATOR_HOST = `127.0.0.1:${process.env.EMU_AUTH_PORT || 9099}`;
const PASSWORD = 'password123';

let app;
let auth;

/** A fake Google ID token the emulator accepts in place of a signed one. */
function googleToken({ sub, email, name = 'Family Tester', verified = true }) {
    return JSON.stringify({ sub, email, email_verified: verified, name });
}

/** The popup step, replaced by a credential sign-in the emulator can run. */
function popupAs(token) {
    return (a) => signInWithCredential(a, GoogleAuthProvider.credential(token));
}

async function emulatorAccount(email) {
    const res = await fetch(`http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ email: [email] })
    });
    const body = await res.json();
    return (body.users || [])[0];
}

async function clearAccounts() {
    await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
}

/** A minimal Storage stand-in for the redirect-pending flag. */
function memoryStorage() {
    const m = new Map();
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k)
    };
}

beforeAll(async () => {
    app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT_ID }, `p247-${Date.now()}`);
    auth = getAuth(app);
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}`, { disableWarnings: true });
});

afterAll(async () => {
    await deleteApp(app);
});

beforeEach(async () => {
    await signOut(auth);
    await clearAccounts();
});

describe('Google sign-in (Auth emulator)', () => {
    it('creates a session whose user carries the google.com provider', async () => {
        const email = 'tester@example.com';
        const result = await signInWithGoogle(auth, {
            mode: 'popup',
            popup: popupAs(googleToken({ sub: 'google-sub-1', email }))
        });
        expect(result.ok).toBe(true);
        expect(result.user.email).toBe(email);
        expect(result.user.displayName).toBe('Family Tester');
        expect(providerIds(result.user)).toContain(GOOGLE_PROVIDER_ID);
        expect(auth.currentUser.uid).toBe(result.user.uid);
    });

    it('same address, existing email+password account: Google lands on the SAME uid (one account per email)', async () => {
        const email = 'linked@example.com';
        const password = await createUserWithEmailAndPassword(auth, email, PASSWORD);
        const originalUid = password.user.uid;
        expect(providerIds(password.user)).toEqual(['password']);
        await signOut(auth);

        const result = await signInWithGoogle(auth, {
            mode: 'popup',
            popup: popupAs(googleToken({ sub: 'google-sub-2', email }))
        });
        expect(result.ok).toBe(true);
        // The uid is what users/{uid} and every round doc are keyed on.
        expect(result.user.uid).toBe(originalUid);
        expect(providerIds(result.user)).toContain(GOOGLE_PROVIDER_ID);

        // Record what the rule did to the password provider on an UNVERIFIED
        // email+password account (every golf account - the app sends no
        // verification mail). This assertion is the documented behaviour; if
        // it flips, update the PR-body wording, not just the test.
        const account = await emulatorAccount(email);
        const providersNow = (account.providerUserInfo || []).map(p => p.providerId);
        expect(providersNow).toContain(GOOGLE_PROVIDER_ID);
        expect(providersNow).not.toContain('password');
        await expect(signInWithEmailAndPassword(auth, email, PASSWORD)).rejects.toThrow();
    });

    it('same address, VERIFIED email+password account: both providers stay on the same uid', async () => {
        const email = 'verified@example.com';
        const password = await createUserWithEmailAndPassword(auth, email, PASSWORD);
        const originalUid = password.user.uid;
        // Mark the address verified the way a verification link would.
        await fetch(`http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
            body: JSON.stringify({ localId: originalUid, emailVerified: true })
        });
        await signOut(auth);

        const result = await signInWithGoogle(auth, {
            mode: 'popup',
            popup: popupAs(googleToken({ sub: 'google-sub-3', email }))
        });
        expect(result.ok).toBe(true);
        expect(result.user.uid).toBe(originalUid);
        const providersNow = providerIds(result.user);
        expect(providersNow).toContain(GOOGLE_PROVIDER_ID);
        expect(providersNow).toContain('password');
        await signOut(auth);
        const again = await signInWithEmailAndPassword(auth, email, PASSWORD);
        expect(again.user.uid).toBe(originalUid);
    });

    it('links a held Google credential onto the password account after a password sign-in', async () => {
        // The auth/account-exists-with-different-credential path: the screen
        // keeps the Google credential, the person signs in with their
        // password, and the credential is linked - same uid, two providers.
        const email = 'pending@example.com';
        const created = await createUserWithEmailAndPassword(auth, email, PASSWORD);
        const originalUid = created.user.uid;
        await signOut(auth);

        const pending = GoogleAuthProvider.credential(googleToken({ sub: 'google-sub-4', email }));
        const signedIn = await signInWithEmailAndPassword(auth, email, PASSWORD);
        const linked = await linkPendingGoogleCredential(signedIn.user, pending);
        expect(linked.ok).toBe(true);
        expect(linked.user.uid).toBe(originalUid);
        expect(providerIds(linked.user)).toEqual(expect.arrayContaining(['password', GOOGLE_PROVIDER_ID]));

        // Either way in from now on.
        await signOut(auth);
        const viaGoogle = await signInWithGoogle(auth, {
            mode: 'popup', popup: popupAs(googleToken({ sub: 'google-sub-4', email }))
        });
        expect(viaGoogle.user.uid).toBe(originalUid);
    });

    it('refuses to link when nothing is pending', async () => {
        const result = await linkPendingGoogleCredential({ uid: 'x' }, null);
        expect(result.ok).toBe(false);
        expect(result.code).toBe('auth/no-pending-credential');
    });
});

describe('redirect leg (getRedirectResult injected - node has no window to redirect)', () => {
    it('resolves user:null on an ordinary load', async () => {
        const result = await completeGoogleRedirect(auth, { storage: memoryStorage(), getRedirectResult: async () => null });
        expect(result).toEqual({ ok: true, user: null });
    });

    it('sets the pending flag, calls signInWithRedirect with a Google provider, and reports the redirect', async () => {
        const storage = memoryStorage();
        const redirect = vi.fn(async () => undefined);
        const result = await signInWithGoogle(auth, { mode: 'redirect', redirect, storage });
        expect(result).toEqual({ ok: true, pendingRedirect: true });
        expect(redirect).toHaveBeenCalledTimes(1);
        expect(redirect.mock.calls[0][1].providerId).toBe(GOOGLE_PROVIDER_ID);
        expect(storage.getItem(REDIRECT_PENDING_KEY)).toBe('1');
    });

    it('says so when a redirect was pending but never came back', async () => {
        const storage = memoryStorage();
        storage.setItem(REDIRECT_PENDING_KEY, '1');
        const result = await completeGoogleRedirect(auth, { storage, getRedirectResult: async () => null });
        expect(result.ok).toBe(false);
        expect(result.code).toBe('auth/redirect-did-not-return');
        expect(result.message).toMatch(/email and password/i);
        expect(storage.getItem(REDIRECT_PENDING_KEY)).toBeNull();
    });
});

describe('provider not switched on yet (mocked - the emulator never refuses a provider)', () => {
    it('auth/operation-not-allowed becomes a plain message that names email+password', async () => {
        const popup = async () => {
            throw Object.assign(new Error('Firebase: Error (auth/operation-not-allowed).'),
                { code: 'auth/operation-not-allowed' });
        };
        const result = await signInWithGoogle(auth, { mode: 'popup', popup });
        expect(result.ok).toBe(false);
        expect(result.code).toBe('auth/operation-not-allowed');
        expect(result.message).toMatch(/not switched on/i);
        expect(result.message).toMatch(/email and password still work/i);
        expect(auth.currentUser).toBeNull();
    });

    it('auth/account-exists-with-different-credential keeps the credential and the email for the link step', async () => {
        const err = Object.assign(new Error('Firebase: Error (auth/account-exists-with-different-credential).'), {
            code: 'auth/account-exists-with-different-credential',
            customData: { email: 'clash@example.com', _tokenResponse: { oauthIdToken: 'fake-id-token', providerId: 'google.com' } }
        });
        const result = await signInWithGoogle(auth, { mode: 'popup', popup: async () => { throw err; } });
        expect(result.ok).toBe(false);
        expect(result.email).toBe('clash@example.com');
        expect(result.pendingCredential).toBeTruthy();
        expect(result.pendingCredential.providerId).toBe(GOOGLE_PROVIDER_ID);
        expect(result.message).toMatch(/email and password once/i);
    });
});
