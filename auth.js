// ==========================================
// auth.js
// Centralized Authentication Logic
// ==========================================

import { auth, db } from './firebase-config.js';
import {
    onAuthStateChanged, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { UI } from './ui.js';
import { AppState } from './state.js';

let isRegistering = false;
let initializeAppCallback = null; // Callback supplied by app.js to boot modules

export function setupAuthUI(onAppReady) {
    initializeAppCallback = onAppReady;

    if (UI.btnRegister) {
        UI.btnRegister.addEventListener('click', () => {
            isRegistering = true;
            UI.registerFields.classList.remove('hidden');
            UI.btnLogin.style.display = 'none';
            UI.btnRegister.style.display = 'none';
            UI.authSwitchBack.classList.remove('hidden');
            const submitBtn = document.createElement('button');
            submitBtn.type = 'submit';
            submitBtn.className = 'btn btn-primary';
            submitBtn.textContent = 'Create Account';
            submitBtn.id = 'temp-submit-register';
            UI.authForm.appendChild(submitBtn);
        });
    }

    if (UI.linkBackLogin) {
        UI.linkBackLogin.addEventListener('click', (e) => {
            e.preventDefault();
            isRegistering = false;
            UI.registerFields.classList.add('hidden');
            UI.btnLogin.style.display = 'block';
            UI.btnRegister.style.display = 'block';
            UI.authSwitchBack.classList.add('hidden');
            const tempBtn = document.getElementById('temp-submit-register');
            if (tempBtn) tempBtn.remove();
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
                    if (!name) throw new Error("Please provide a display name.");
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    await updateProfile(userCredential.user, { displayName: name });

                    // Check if email is in preapproved list
                    const preapprovedRef = doc(db, "preapproved_emails", email.toLowerCase());
                    const preapprovedSnap = await getDoc(preapprovedRef);
                    const isApproved = preapprovedSnap.exists();

                    await setDoc(doc(db, "users", userCredential.user.uid), {
                        uid: userCredential.user.uid,
                        email: email,
                        displayName: name,
                        isApproved: isApproved,
                        isAdmin: false,
                        isCoach: false,
                        coaches: [],
                        createdAt: serverTimestamp()
                    });
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                }
            } catch (error) {
                UI.authError.textContent = error.message;
                UI.authError.classList.remove('hidden');
            }
        });
    }

    if (UI.btnLogout) UI.btnLogout.addEventListener('click', () => signOut(auth));
    if (UI.btnPendingLogout) UI.btnPendingLogout.addEventListener('click', () => signOut(auth));

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
            const email = document.getElementById('forgot-email').value.trim();
            if (!email) return;
            try {
                await sendPasswordResetEmail(auth, email);
                forgotPasswordMsg.textContent = '✅ Reset email sent! Check your inbox.';
                forgotPasswordMsg.style.color = '#10b981';
            } catch (err) {
                forgotPasswordMsg.textContent = '❌ ' + err.message;
                forgotPasswordMsg.style.color = '#ef4444';
            }
            forgotPasswordMsg.classList.remove('hidden');
        });
    }

    // Listen for state changes
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            AppState.currentUser = user;
            try {
                let currentDocRef = doc(db, "users", user.uid);
                let userDoc = await getDocFromServer(currentDocRef);

                let retries = 0;
                while (!userDoc.exists() && retries < 3) {
                    await new Promise(r => setTimeout(r, 500));
                    userDoc = await getDocFromServer(currentDocRef);
                    retries++;
                }

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.isApproved === true) {
                        // Allowed
                        UI.authOverlay.classList.add('hidden');
                        UI.authPending.classList.add('hidden');
                        UI.mainApp.classList.remove('hidden');
                        UI.loggedInUserNameEl.textContent = user.displayName || user.email;
                        AppState.viewingPlayerId = user.uid;
                        window.currentUserIsAdmin = userData.isAdmin === true;

                        if (userData.isAdmin) {
                            UI.tabBtnAdmin.classList.remove('hidden');
                        } else {
                            UI.tabBtnAdmin.classList.add('hidden');
                        }

                        if (userData.isAdmin || userData.isCoach) {
                            document.getElementById('tab-btn-coach').classList.remove('hidden');
                        } else {
                            document.getElementById('tab-btn-coach').classList.add('hidden');
                        }

                        // Bootstrap the rest of the app logic
                        if (initializeAppCallback) initializeAppCallback();
                    } else {
                        // Blocked
                        UI.authOverlay.classList.add('hidden');
                        UI.mainApp.classList.add('hidden');
                        UI.authPending.classList.remove('hidden');
                    }
                } else {
                    UI.authOverlay.classList.add('hidden');
                    UI.mainApp.classList.add('hidden');
                    UI.authPending.classList.remove('hidden');
                }
            } catch (e) {
                console.error("Auth read explicitly failed", e);
                UI.authOverlay.classList.add('hidden');
                UI.mainApp.classList.add('hidden');
                UI.authPending.classList.remove('hidden');
            }
        } else {
            // Not logged in
            AppState.currentUser = null;
            AppState.viewingPlayerId = null;
            UI.authOverlay.classList.remove('hidden');
            UI.mainApp.classList.add('hidden');
            UI.authPending.classList.add('hidden');
        }
    });

}
