// ==========================================================================
// tests/e2e/helpers/emulator.js — seed fixtures straight into the emulator
// ==========================================================================
//
// F-19 (product sweep 2026-09-10) removed the localhost auto-approval that
// `createUserDoc` used to apply (any signup on localhost landed approved). It
// had to go: a security rule cannot tell localhost from production, so the
// approval decision could not be verified server-side while the client was
// free to grant it. The E2E suite had been leaning on that shortcut to get a
// throwaway user into the app.
//
// Feature specs create accounts through the real UI, complete verification
// through the Auth emulator, then approve the throwaway account as an admin
// fixture. The registration spec separately exercises invite-based approval.
//
// The Firestore emulator's REST API accepts `Authorization: Bearer owner` and
// bypasses security rules, which is what an admin write is. Nothing here can
// reach production: the host is pinned to 127.0.0.1 and the project is the
// offline demo- project (e2e-safety.js).

import { expect } from '@playwright/test';
import { E2E_PROJECT_ID, assertLoopbackHost } from './e2e-safety.js';

/**
 * Keep legacy round-flow specs on the wizard UI. Map-first behavior has its
 * own E2E coverage; run this before the first navigation so AppState reads
 * the intended per-device preference at boot.
 */
export async function pinLegacyShotEntry(page) {
    await page.addInitScript(() => localStorage.setItem('golf.shotEntry', 'both'));
}

// The offline demo project (src/emulator-project.js), never the real one.
export const PROJECT_ID = E2E_PROJECT_ID;
export function firestorePort(env = process.env) {
    return Number(env.EMU_FIRESTORE_PORT || env.EMU_FS_PORT || 8080);
}

export const FIRESTORE_PORT = firestorePort();
const FIRESTORE_HOST = assertLoopbackHost(`127.0.0.1:${FIRESTORE_PORT}`); // allocated or CI runner port, else firebase.json
const DOCS = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_HOST = `127.0.0.1:${Number(process.env.EMU_AUTH_PORT || 9099)}`;
let emulatorReadiness = null;

async function fetchEmulator(url, options) {
    return fetch(url, { ...options, signal: AbortSignal.timeout(5_000) });
}

async function emulatorResponds(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        return response.ok;
    } catch {
        return false;
    }
}

/** Wait until both emulator services answer before seeding signup fixtures. */
export function waitForEmulators() {
    if (!emulatorReadiness) {
        emulatorReadiness = Promise.all([
            expect.poll(() => emulatorResponds(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/config`), {
                timeout: 30_000,
                message: 'Auth emulator must respond before signup fixtures run',
            }).toBe(true),
            expect.poll(() => emulatorResponds(`http://${FIRESTORE_HOST}/`), {
                timeout: 30_000,
                message: 'Firestore emulator must respond before signup fixtures run',
            }).toBe(true),
        ]).catch(error => {
            emulatorReadiness = null;
            throw error;
        });
    }
    return emulatorReadiness;
}

export const UX_HARNESS_PASSWORD = 'demo-only-password';
export const UX_HARNESS_PERSONAS = {
    player: { email: 'player@ux-harness.example.test', name: 'Taylor Fairway', approved: true },
    pending: { email: 'pending@ux-harness.example.test', name: 'Jordan Awaiting', approved: false },
    coach: { email: 'coach@ux-harness.example.test', name: 'Casey Coach', approved: true, isCoach: true },
    admin: { email: 'admin@ux-harness.example.test', name: 'Riley Admin', approved: true, isAdmin: true },
};

/** Create deterministic synthetic identities and roles in the local emulators. */
export async function seedUxHarnessFixtures() {
    await waitForEmulators();
    const authBase = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
    for (const persona of Object.values(UX_HARNESS_PERSONAS)) {
        const payload = { email: persona.email, password: UX_HARNESS_PASSWORD, returnSecureToken: true };
        let response = await fetchEmulator(`${authBase}/accounts:signUp?key=fake-api-key`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        let result = await response.json();
        if (!response.ok && result.error?.message === 'EMAIL_EXISTS') {
            response = await fetchEmulator(`${authBase}/accounts:signInWithPassword?key=fake-api-key`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            result = await response.json();
        }
        if (!response.ok) throw new Error(`Failed to seed demo auth account: ${response.status}`);

        // Pending means awaiting admin approval, not awaiting email verification.
        const verified = await fetchEmulator(`${authBase}/accounts:update?key=fake-api-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
            body: JSON.stringify({ localId: result.localId, emailVerified: true }),
        });
        if (!verified.ok) throw new Error(`Failed to verify demo auth account: ${verified.status}`);

        await writeDocFields(`users/${result.localId}`, {
            uid: result.localId,
            email: persona.email,
            displayName: persona.name,
            isApproved: persona.approved,
            isAdmin: !!persona.isAdmin,
            isCoach: !!persona.isCoach,
            coaches: [],
            authProvider: 'password',
        });
    }
}

/**
 * Put `email` on the invite list, exactly as admin.js does (lowercased doc id).
 * Must run BEFORE registration: the verified signup flow reads this document
 * when promoting the account.
 * @param {string} email
 */
export async function seedPreapprovedEmail(email) {
    await waitForEmulators();
    const id = encodeURIComponent(email.toLowerCase());
    const res = await fetchEmulator(`${DOCS}/preapproved_emails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ fields: { addedAt: { stringValue: new Date().toISOString() } } }),
    });
    if (!res.ok) {
        throw new Error(`Failed to seed preapproved_emails/${email}: ${res.status} ${await res.text()}`);
    }
}

/** Apply the verification action code sent by the Auth emulator. */
export async function verifyEmulatorEmail(email) {
    await waitForEmulators();
    const host = AUTH_HOST;
    const api = `http://${host}/identitytoolkit.googleapis.com/v1`;
    const emulatorApi = `http://${host}/emulator/v1/projects/${PROJECT_ID}`;
    const lookup = await fetchEmulator(`${api}/accounts:lookup?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ email: [email] }),
    });
    if (!lookup.ok) throw new Error(`Failed to find Auth emulator signup: ${lookup.status}`);
    const user = (await lookup.json()).users?.[0];
    if (!user?.localId) throw new Error('Auth emulator has no account for the signup');
    let verificationCode;
    await expect.poll(async () => {
        const response = await fetchEmulator(`${emulatorApi}/oobCodes`, {});
        if (!response.ok) throw new Error(`Failed to read Auth emulator verification codes: ${response.status}`);
        const { oobCodes = [] } = await response.json();
        verificationCode = oobCodes.find(code =>
            code.requestType === 'VERIFY_EMAIL' && code.email?.toLowerCase() === email.toLowerCase()
        );
        return verificationCode?.oobCode || null;
    }, { timeout: 10_000, message: 'Auth emulator must issue a verification code for the signup' })
        .toBeTruthy();

    const update = await fetchEmulator(`${api}/accounts:update?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId: user.localId, oobCode: verificationCode.oobCode }),
    });
    if (!update.ok) throw new Error(`Failed to apply Auth emulator verification code: ${update.status} ${await update.text()}`);
    const verifiedUser = await update.json();
    if (verifiedUser.emailVerified !== true || !verifiedUser.localId) {
        throw new Error('Auth emulator did not confirm the signup email verification');
    }
    if (verifiedUser.localId !== user.localId) throw new Error('Auth emulator verified a different signup account');
    return user.localId;
}

/** Complete the real signup verification flow against the Auth emulator. */
export async function registerAndVerifySignup(page, email) {
    await waitForEmulators();
    const verificationEmailSent = page.waitForResponse(
        response => response.url().includes('/accounts:sendOobCode'),
        { timeout: 15_000 },
    );
    const [response] = await Promise.all([
        verificationEmailSent,
        page.getByRole('button', { name: 'Create Account' }).click({ timeout: 10_000 }),
    ]);
    expect(response.ok(), 'Auth emulator accepted the verification email request').toBe(true);
    let userDoc;
    await expect.poll(async () => {
        [userDoc] = await findDocs('users', 'email', email);
        return userDoc?._id || null;
    }, { timeout: 10_000, message: 'Signup must finish writing its user document before verification' })
        .toBeTruthy();
    await expect(page.locator('#auth-pending-heading'))
        .toHaveText('Check your inbox to finish joining', { timeout: 15_000 });
    const authUid = await verifyEmulatorEmail(email);
    expect(authUid, 'Firestore user document must belong to the signed-up Auth account').toBe(userDoc._id);
    // Feature journeys need an admitted golfer; registration.spec.js owns the
    // invite-promotion contract. Keep this fixture approval on the emulator.
    await patchDocFields(`users/${authUid}`, { isApproved: true });
    const appBooted = page.waitForEvent('console', {
        predicate: message => message.text().includes('[Auth] Bootstrap complete, removing cloak.'),
        timeout: 15_000,
    });
    // Refresh the signed-in SDK user just as the real Check Email control does;
    // a page reload can restore a cached, still-unverified Auth user.
    await page.locator('#btn-check-email').click({ timeout: 10_000 });
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#auth-pending')).toBeHidden();
    await appBooted;
}

/** Seed strategy periods onto a registered E2E user's user document. */
export async function seedStrategyPeriodsByEmail(email, strategyPeriods) {
    let userDoc;
    for (let attempt = 0; attempt < 10 && !userDoc; attempt++) {
        const res = await fetchEmulator(`${DOCS}:runQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: 'users' }],
                    where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email } } },
                    limit: 1,
                },
            }),
        });
        if (!res.ok) throw new Error(`Failed to find E2E user ${email}: ${res.status} ${await res.text()}`);
        const rows = await res.json();
        userDoc = rows.find(row => row.document)?.document;
        if (!userDoc) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!userDoc) throw new Error(`No Firestore user document found for ${email}`);

    const fields = Object.fromEntries(strategyPeriods.map((period, index) => [
        `period-${index}`,
        { mapValue: { fields: {
            name: { stringValue: period.name },
            start: { stringValue: period.start },
            end: period.end == null ? { nullValue: null } : { stringValue: period.end },
        } } },
    ]));
    const update = await fetchEmulator(`${DOCS}/${userDoc.name.split('/documents/')[1]}?updateMask.fieldPaths=strategyPeriods`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ fields: {
            strategyPeriods: { arrayValue: { values: Object.values(fields) } },
        } }),
    });
    if (!update.ok) throw new Error(`Failed to seed strategy periods: ${update.status} ${await update.text()}`);
}

/**
 * Read back every document in `collection` whose `field` equals `value`, as
 * plain JS objects (strings/numbers/booleans/arrays/maps decoded) with `_id`.
 * Admin read (Bearer owner), so it sees exactly what the app wrote.
 */
export async function findDocs(collection, field, value) {
    const res = await fetchEmulator(`${DOCS}:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: collection }],
                where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
            },
        }),
    });
    if (!res.ok) throw new Error(`Query ${collection}.${field} failed: ${res.status} ${await res.text()}`);
    const decode = (v) => {
        if ('stringValue' in v) return v.stringValue;
        if ('integerValue' in v) return Number(v.integerValue);
        if ('doubleValue' in v) return v.doubleValue;
        if ('booleanValue' in v) return v.booleanValue;
        if ('nullValue' in v) return null;
        if ('timestampValue' in v) return v.timestampValue;
        if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
        if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
        return v;
    };
    return (await res.json()).filter((row) => row.document).map((row) => ({
        _id: row.document.name.split('/').pop(),
        ...Object.fromEntries(Object.entries(row.document.fields || {}).map(([k, x]) => [k, decode(x)])),
    }));
}

/** Seed an established index for the real profile -> Daily Handicap path. */
export async function seedHandicapByEmail(email, handicapIndex) {
    let user;
    // The UI can open from the SDK's local snapshot before signup is acked.
    for (let attempt = 0; attempt < 50 && !user; attempt++) {
        [user] = await findDocs('users', 'email', email);
        if (!user) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!user) throw new Error(`No registered user found for ${email}`);
    const res = await fetchEmulator(`${DOCS}/profiles/${user._id}?updateMask.fieldPaths=handicapIndex`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ fields: { handicapIndex: { doubleValue: handicapIndex } } }),
    });
    if (!res.ok) throw new Error(`Failed to seed Handicap Index: ${res.status} ${await res.text()}`);
}

/**
 * Admin-patch plain fields (string / number / boolean) onto one document,
 * e.g. `patchDocFields('whs_rounds/<id>', { audioUrl: '...' })`. Only the
 * named fields change.
 */
export async function patchDocFields(docPath, fields) {
    const encode = (v) => (typeof v === 'boolean' ? { booleanValue: v }
        : typeof v === 'number' ? { doubleValue: v } : { stringValue: String(v) });
    const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const res = await fetchEmulator(`${DOCS}/${docPath}?${mask}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encode(v)])) }),
    });
    if (!res.ok) throw new Error(`Failed to patch ${docPath}: ${res.status} ${await res.text()}`);
}

/** Firestore REST value -> plain JS (strings, numbers, booleans, arrays, maps). */
function decodeValue(v) {
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decodeValue(x)]));
    return v;
}

/** Plain JS -> Firestore REST value (Date -> timestamp, arrays, maps). */
function encodeValue(v) {
    if (v === null) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
    if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeValue(x)])) } };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return { doubleValue: v };
    return { stringValue: String(v) };
}

/**
 * Admin-read one document: its fields as plain JS, or null when it doesn't
 * exist. Lets a spec check what the app actually stored.
 * @param {string} docPath - e.g. 'users/<uid>/private/handicap'
 */
export async function readDoc(docPath) {
    const res = await fetchEmulator(`${DOCS}/${docPath}`, { headers: { Authorization: 'Bearer owner' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to read ${docPath}: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return Object.fromEntries(Object.entries(json.fields || {}).map(([k, x]) => [k, decodeValue(x)]));
}

/**
 * Admin-write whole fields (any shape encodeValue takes) onto one document,
 * creating it if needed; only the named fields change.
 * @param {string} docPath
 * @param {Object} fields
 */
export async function writeDocFields(docPath, fields) {
    const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const res = await fetchEmulator(`${DOCS}/${docPath}?${mask}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])) }),
    });
    if (!res.ok) throw new Error(`Failed to write ${docPath}: ${res.status} ${await res.text()}`);
}

/** A fresh throwaway address, unique per call. */
export function throwawayEmail(prefix = 'e2e') {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}
