import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence, getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCxmEGkmrfRAmkxyHcni8MWitJSNYxAsEY",
    authDomain: "golf-handicap-tracker-b677c.firebaseapp.com",
    projectId: "golf-handicap-tracker-b677c",
    storageBucket: "golf-handicap-tracker-b677c.firebasestorage.app",
    messagingSenderId: "846253855684",
    appId: "1:846253855684:web:c5a0bc51550086f54d4a91"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const storage = getStorage(app);
export const functions = getFunctions(app);
