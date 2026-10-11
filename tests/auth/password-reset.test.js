// @vitest-environment node
/**
 * P-229: prove the forgot-password flow end to end against the Auth emulator.
 *
 * Drives src/auth-reset.js - the same function the login screen calls - then
 * walks the rest of the flow the owner walks: pull the reset link the emulator
 * "sent", set a new password with it, and log in with the new password.
 *
 * Run: npm run test:auth
 *   (npx firebase emulators:exec --only auth --project demo-golf-tracker
 *    "vitest run tests/auth")
 *
 * Emulator vs prod divergence this suite CANNOT cover, and why the row still
 * needs the owner's own inbox check: the emulator never sends real mail, and it
 * does not implement email enumeration protection, which IS on in
 * golf-handicap-tracker-b677c (verified 2026-09-03: accounts:sendOobCode
 * returns 200 for an address with no account).
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
    getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, confirmPasswordReset, verifyPasswordResetCode, signOut
} from 'firebase/auth';
import { requestPasswordReset, resetContinueUrl } from '../../src/auth-reset.js';

const PROJECT_ID = 'demo-golf-tracker';
const EMULATOR_HOST = `127.0.0.1:${process.env.EMU_AUTH_PORT || 9099}`;
const OLD_PASSWORD = 'oldpassword123';
const NEW_PASSWORD = 'newpassword456';

let app;
let auth;

/** Every oob code the emulator has generated (its stand-in for an inbox). */
async function emulatorOobCodes() {
    const res = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
    if (!res.ok) throw new Error(`oobCodes endpoint returned ${res.status}`);
    const body = await res.json();
    return body.oobCodes || [];
}

async function clearAccounts() {
    await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
}

beforeAll(async () => {
    app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT_ID }, `p229-${Date.now()}`);
    auth = getAuth(app);
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}`, { disableWarnings: true });
});

afterAll(async () => {
    await deleteApp(app);
});

beforeEach(async () => {
    await clearAccounts();
});

describe('password reset (Auth emulator)', () => {
    it('sends a reset link that sets a new password and logs the user back in', async () => {
        const email = 'owner@example.com';
        await createUserWithEmailAndPassword(auth, email, OLD_PASSWORD);
        await signOut(auth);

        const result = await requestPasswordReset(auth, `  ${email}  `, {
            continueUrl: resetContinueUrl('https://golf-handicap-tracker-b677c.web.app')
        });
        expect(result.ok).toBe(true);

        const codes = (await emulatorOobCodes()).filter(
            c => c.email === email && c.requestType === 'PASSWORD_RESET'
        );
        expect(codes).toHaveLength(1);

        // The link Firebase mails: it must carry a usable code, and the way
        // back into the app (P-229's "and is logged back in").
        const link = new URL(codes[0].oobLink);
        expect(link.searchParams.get('mode')).toBe('resetPassword');
        expect(link.searchParams.get('continueUrl'))
            .toBe('https://golf-handicap-tracker-b677c.web.app/');

        const code = codes[0].oobCode;
        await expect(verifyPasswordResetCode(auth, code)).resolves.toBe(email);
        await confirmPasswordReset(auth, code, NEW_PASSWORD);

        const credential = await signInWithEmailAndPassword(auth, email, NEW_PASSWORD);
        expect(credential.user.email).toBe(email);
        await signOut(auth);
    });

    it('leaves the old password dead after the reset', async () => {
        const email = 'owner2@example.com';
        await createUserWithEmailAndPassword(auth, email, OLD_PASSWORD);
        await signOut(auth);

        await requestPasswordReset(auth, email, {});
        const codes = (await emulatorOobCodes()).filter(
            c => c.email === email && c.requestType === 'PASSWORD_RESET'
        );
        await confirmPasswordReset(auth, codes[0].oobCode, NEW_PASSWORD);

        await expect(signInWithEmailAndPassword(auth, email, OLD_PASSWORD)).rejects.toThrow();
    });

    it('still generates a link when no continue URL is supplied', async () => {
        const email = 'owner3@example.com';
        await createUserWithEmailAndPassword(auth, email, OLD_PASSWORD);
        await signOut(auth);

        const result = await requestPasswordReset(auth, email, {});
        expect(result.ok).toBe(true);
        expect(result.usedContinueUrl).toBe(false);

        const codes = (await emulatorOobCodes()).filter(c => c.email === email);
        expect(codes).toHaveLength(1);
        expect(new URL(codes[0].oobLink).searchParams.get('continueUrl')).toBeNull();
    });

    it('refuses an empty address without calling Firebase', async () => {
        // Clearing accounts does not clear the emulator's oob code list, so
        // count the difference rather than the total.
        const before = (await emulatorOobCodes()).length;
        const result = await requestPasswordReset(auth, '   ', {});
        expect(result.ok).toBe(false);
        expect(result.code).toBe('auth/missing-email');
        expect(await emulatorOobCodes()).toHaveLength(before);
    });
});
