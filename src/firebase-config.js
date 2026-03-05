/**
 * @file firebase-config.js
 * @description Centralized Firebase SDK initialization and emulator routing.
 * v6.19.0: Added australia-southeast1 (Sydney) regional support for Cloud Functions.
 */

import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence, getAuth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCxmEGkmrfRAmkxyHcni8MWitJSNYxAsEY",
    authDomain: "golf-handicap-tracker-b677c.firebaseapp.com",
    projectId: "golf-handicap-tracker-b677c",
    storageBucket: "golf-handicap-tracker-b677c.firebasestorage.app",
    messagingSenderId: "846253855684",
    appId: "1:846253855684:web:c5a0bc51550086f54d4a91"
};

/** @type {import('firebase/app').FirebaseApp} */
const app = initializeApp(firebaseConfig);

/** @type {import('firebase/auth').Auth} */
export const auth = getAuth(app);

/** @type {import('firebase/firestore').Firestore} */
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
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
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[Dev] Connecting to Firebase Local Emulators...');
    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

