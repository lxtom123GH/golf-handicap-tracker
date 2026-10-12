/**
 * @file firebase-config.js
 * @description Centralized Firebase SDK initialization and emulator routing.
 * v6.19.0: Added australia-southeast1 (Sydney) regional support for Cloud Functions.
 */

import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { initializeAuth, browserLocalPersistence, getAuth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { assertDemoHarnessTarget } from './ux-harness-safety.js';
import { EMULATOR_PROJECT_ID } from "./emulator-project.js";

const isLocalHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
const isLocal = isLocalHost;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || (isLocalHost ? EMULATOR_PROJECT_ID : "golf-handicap-tracker-b677c");
if (import.meta.env.VITE_UX_HARNESS === 'true') {
    assertDemoHarnessTarget({
        projectId,
        appHost: window.location.hostname,
        authHost: `127.0.0.1:${import.meta.env.VITE_EMU_AUTH_PORT || 9099}`,
        firestoreHost: `127.0.0.1:${import.meta.env.VITE_EMU_FS_PORT || 8080}`,
    });
}

// P-247: authDomain is the site the Google sign-in popup/redirect bounces
// through. The default (firebaseapp.com) is a different site from the app
// (web.app), which is fine for the popup but makes signInWithRedirect fail
// silently on browsers that partition third-party storage. Firebase's fix is
// to serve the auth handler from the app's own domain; that needs the owner to
// register https://golf-handicap-tracker-b677c.web.app/__/auth/handler on the
// Google OAuth client first (see docs/GOOGLE-SIGNIN.md), then set the build
// variable VITE_AUTH_DOMAIN. Unset = today's behaviour, unchanged.
const authDomain = import.meta.env.VITE_AUTH_DOMAIN || "golf-handicap-tracker-b677c.firebaseapp.com";

// On localhost/127.0.0.1 the app only talks to the emulator suite (see the
// sniffer at the bottom), and it does so under the offline demo- project
// (src/emulator-project.js): start local emulators with
// `--project demo-golf-tracker`. Production hostnames are unchanged.

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCxmEGkmrfRAmkxyHcni8MWitJSNYxAsEY",
    authDomain,
    projectId,
    storageBucket: "golf-handicap-tracker-b677c.firebasestorage.app",
    messagingSenderId: "846253855684",
    appId: "1:846253855684:web:c5a0bc51550086f54d4a91"
};

/** @type {import('firebase/app').FirebaseApp} */
const app = initializeApp(firebaseConfig);

/**
 * App Check (BL-DD-01 chunk a) — attest that AI-callable requests come from THIS
 * app, so the quota-capped Gemini callables can't be scripted from outside. The
 * callables enforce it (`enforceAppCheck: true`); the client must attach a
 * reCAPTCHA Enterprise token here or those calls are rejected in production.
 * (Uses the reCAPTCHA *Enterprise* provider — the key is a Cloud Console
 * reCAPTCHA Enterprise key ID, and App Check must be registered as Enterprise.)
 *
 * The site key is build-time public (safe to ship). It's read from
 * VITE_RECAPTCHA_SITE_KEY; if unset, App Check is skipped and the AI features
 * degrade to their non-AI fallbacks rather than hard-failing at init. Not
 * initialised on localhost. NOTE (verified 2026-07-05, BL-VID-03 smoke): the
 * Functions emulator DOES enforce enforceAppCheck — callables reject with
 * "Unauthenticated" and log verifications:{app:"MISSING"}. To smoke an AI
 * callable locally, temporarily set its enforceAppCheck to false, or set
 *   self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;   // prints a token to register
 */
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (!isLocal && recaptchaSiteKey) {
    initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
    });
} else if (!isLocal) {
    console.warn(
        '[AppCheck] VITE_RECAPTCHA_SITE_KEY not set — App Check disabled. The AI ' +
        'callables enforce App Check, so they will reject requests until the key is ' +
        'set and App Check is registered in the Firebase console.'
    );
}

/**
 * getAuth() on the web persists the session in IndexedDB (falling back to
 * localStorage): a signed-in user stays signed in across reloads, app
 * restarts and phone reboots until they tap Log out. Nothing in the app
 * signs out on its own. tests/e2e/registration.spec.js pins this.
 * @type {import('firebase/auth').Auth}
 */
export const auth = getAuth(app);

/** @type {import('firebase/firestore').Firestore} */
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Windows WebKit buffers emulator streams; polling keeps real SDK tests moving.
    experimentalForceLongPolling: isLocal
});

/** @type {import('firebase/storage').FirebaseStorage} */
export const storage = getStorage(app);

/** 
 * Sydney-based Cloud Functions interface.
 * @type {import('firebase/functions').Functions} 
 */
export const functions = getFunctions(app, 'australia-southeast1');

/**
 * Environment Sniffer: Automatically routes traffic to Firebase Emulators
 * when running on localhost or 127.0.0.1.
 */
if (isLocal) {
    console.log('[Dev] Connecting to Firebase Local Emulators...');
    // S3c: emulator ports are overridable at build time so CI runs on the
    // self-hosted runner can use their own high ports (firebase.ci.json) and
    // never collide with a developer's manually-started emulator. Defaults are
    // the firebase.json ports, unchanged for local dev.
    const emuAuthPort = import.meta.env.VITE_EMU_AUTH_PORT || 9099;
    const emuFsPort = import.meta.env.VITE_EMU_FS_PORT || 8080;
    connectAuthEmulator(auth, `http://127.0.0.1:${emuAuthPort}`);
    connectFirestoreEmulator(db, '127.0.0.1', Number(emuFsPort));
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
}

