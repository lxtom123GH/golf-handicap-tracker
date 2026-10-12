// ==========================================================================
// registration.spec.js — the signup contract, both halves
// ==========================================================================
//
// This file exists because tightening the users CREATE clause for F-19
// (product sweep 2026-09-10) broke registration, and nothing named
// "registration" was watching: the only coverage was an unnamed helper step
// inside the round journey, so five unrelated specs went red and the cause had
// to be read out of a screenshot.
//
// The clause has to satisfy two things at once, and they pull against each
// other. Either one alone is easy and wrong:
//
//   1. An INVITED registrant must reach the app. Tighten too far — deny the
//      create, or refuse isApproved even for a genuine invite — and signup is
//      broken for everyone.
//   2. An UNINVITED registrant must still be able to create their own users
//      document, and must land on the pending screen rather than in the app.
//      Registration itself is never denied; only self-approval is.
//
// Both run against the real emulators with the real rules loaded, through the
// real UI. Anything that breaks either half fails here, by name.

import { test, expect } from '@playwright/test';
import { seedPreapprovedEmail, throwawayEmail, verifyEmulatorEmail, findDocs, readDoc } from './helpers/emulator.js';

const PASSWORD = 'e2e-password-1';

/** Drive the register form. Returns the address used. */
async function register(page, email) {
    await page.goto('/');
    await page.locator('#btn-register').click();
    await page.locator('#auth-name').fill('E2E Registrant');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    return email;
}

/**
 * Collect anything the page says that looks like a rules rejection, so a denied
 * write is an explicit assertion rather than something inferred from which
 * screen happened to show. Both branches of the auth gate render the pending
 * screen — the approved-but-unapproved one AND the doc-missing one — so screen
 * state alone cannot tell "created, awaiting approval" from "create denied".
 */
function watchForPermissionDenied(page) {
    const hits = [];
    const scan = (text) => {
        if (/permission[- ]denied|insufficient permissions/i.test(text)) hits.push(text);
    };
    page.on('console', (msg) => scan(msg.text()));
    page.on('pageerror', (err) => scan(String(err)));
    return hits;
}

async function verifyInvitedSignup(page, email) {
    const gateEvents = [];
    page.on('console', message => {
        const text = message.text();
        if (text.startsWith('[Auth] User doc not found')) gateEvents.push('user-document-not-found');
        else if (text.startsWith('[Auth] User approved')) gateEvents.push('user-approved');
        else if (text.startsWith('[Auth] User not approved')) gateEvents.push('user-not-approved');
        else if (text.startsWith('Auth read failed')) gateEvents.push('auth-read-failed');
        else if (text.startsWith('[Auth] Email verification refresh failed')) gateEvents.push('verification-refresh-failed');
    });
    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#auth-pending-heading')).toHaveText('Check your inbox to finish joining');
    let userDoc;
    await expect.poll(async () => {
        [userDoc] = await findDocs('users', 'email', email);
        return userDoc?._id || null;
    }, { timeout: 10_000, message: 'Signup must finish writing its user document before verification' })
        .toBeTruthy();
    expect(await readDoc(`preapproved_emails/${email}`), 'invited signup must have an invite fixture').toBeTruthy();
    expect(await verifyEmulatorEmail(email), 'verified account must match its Firestore document').toBe(userDoc._id);
    await page.locator('#btn-check-email').click();
    try {
        await expect(page.locator('#main-app')).toBeVisible({ timeout: 20_000 });
    } catch (error) {
        throw new Error(`${error.message}\nAuth gate events: ${gateEvents.join(', ') || 'none'}`);
    }
    await expect(page.locator('#auth-pending')).toBeHidden();
}

test('an invited registrant reaches the app after verifying their email', async ({ page }) => {
    // Invite lookup is denied until the caller proves control of the address.
    // Signup creates a pending account, then the normal verify-and-promote
    // flow admits an invited user.
    const email = throwawayEmail('e2e-invited');
    await seedPreapprovedEmail(email);

    const denials = watchForPermissionDenied(page);
    await register(page, email);
    await verifyInvitedSignup(page, email);
    expect(denials, 'an invited signup must not be refused by the rules').toEqual([]);
});

test('an UNINVITED registrant is created, not denied, and is held at the pending screen', async ({ page }) => {
    // The half F-19 was closing: the account is created (registration is never
    // denied outright — that would lock every new user out at the door) but it
    // cannot approve itself, so it stops at the pending screen.
    const email = throwawayEmail('e2e-uninvited');

    const denials = watchForPermissionDenied(page);
    await register(page, email);

    await expect(page.locator('#auth-pending')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#main-app')).toBeHidden();
    await expect(page.locator('#auth-pending-heading')).toHaveText('Check your inbox to finish joining');
    await expect(page.locator('#auth-pending-message')).toContainText('verification email is required');
    await expect(page.locator('#tab-btn-feed')).toBeHidden();
    // If the create had been denied, the users doc would be missing and the
    // client would log the rejection on its way to the very same screen. It
    // must not have been.
    expect(denials, 'creating an ordinary unapproved users doc must be allowed').toEqual([]);
});

test('an invited registrant can verify after a slow profile update', async ({ page }) => {
    // CI flake 2026-10-04 (5 runs, "#main-app hidden" right after Create
    // Account) was a real bug: onAuthStateChanged fires the moment the auth
    // account exists, looks for users/{uid} for ~1.5 s, and if the create has
    // not landed yet it shows Account Pending — permanently, until a reload.
    // On course signal that is an invited golfer locked out of their first
    // round. The users doc is written only after updateProfile and the
    // invite-list read, so hold updateProfile (the auth emulator's
    // accounts:update) for 3 s to reproduce the slow box on demand.
    const email = throwawayEmail('e2e-slow-invite');
    await seedPreapprovedEmail(email);
    await page.route(/accounts:update/, async (route) => {
        await new Promise((r) => setTimeout(r, 3000));
        await route.continue();
    });

    await register(page, email);
    await verifyInvitedSignup(page, email);
});

test('stays signed in: reload and a fresh tab open straight into the app (no login)', async ({ page, context }) => {
    // Owner 2026-10-05: "remember me so I never have to type the password".
    const email = throwawayEmail('e2e-remember');
    await seedPreapprovedEmail(email);
    await register(page, email);
    await verifyInvitedSignup(page, email);

    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('#auth-overlay')).toBeHidden();

    const again = await context.newPage();
    await again.goto('/');
    await expect(again.locator('#main-app')).toBeVisible({ timeout: 25_000 });
    await expect(again.locator('#auth-overlay')).toBeHidden();
});

test('the login form is password-manager friendly (Keychain / Face ID fill)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#auth-email')).toHaveAttribute('autocomplete', 'username');
    await expect(page.locator('#auth-password')).toHaveAttribute('autocomplete', 'current-password');
    // Registering offers a NEW password; going back restores sign-in.
    await page.evaluate(() => document.querySelector('.firebase-emulator-warning')?.remove());
    await page.locator('#btn-register').click();
    await expect(page.locator('#auth-password')).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.locator('#auth-name')).toHaveAttribute('autocomplete', 'name');
    await page.locator('#link-back-login').click();
    await expect(page.locator('#auth-password')).toHaveAttribute('autocomplete', 'current-password');
});
