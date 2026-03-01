// ==========================================
// notifications.js — Notification Prefs + Browser Permissions
// ==========================================
import { db, auth } from './firebase-config.js';
import { AppState } from './state.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const PREFS_DEFAULTS = {
    hiChange: true,
    friendRound: false,
    coachNote: true,
    drillAssign: true
};

export async function initNotifications() {
    // Check notification permission and show banner if needed
    const banner = document.getElementById('notif-permission-banner');
    if (banner && Notification.permission !== 'granted') {
        banner.classList.remove('hidden');
    }

    const btnEnable = document.getElementById('btn-enable-notifs');
    if (btnEnable) {
        btnEnable.addEventListener('click', async () => {
            const result = await Notification.requestPermission();
            if (result === 'granted') {
                banner.classList.add('hidden');
            }
        });
    }

    // Load saved prefs
    await loadNotifPrefs();

    // Save prefs
    const btnSave = document.getElementById('btn-save-notif-prefs');
    const msgEl = document.getElementById('notif-prefs-msg');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const prefs = {
                hiChange: document.getElementById('notif-hi-change')?.checked ?? true,
                friendRound: document.getElementById('notif-friend-round')?.checked ?? false,
                coachNote: document.getElementById('notif-coach-note')?.checked ?? true,
                drillAssign: document.getElementById('notif-drill-assign')?.checked ?? true
            };
            try {
                await setDoc(doc(db, 'users', AppState.currentUser.uid, 'prefs', 'notifications'), prefs);
                if (msgEl) {
                    msgEl.textContent = '✅ Preferences saved.';
                    msgEl.style.color = '#10b981';
                    msgEl.classList.remove('hidden');
                    setTimeout(() => msgEl.classList.add('hidden'), 3000);
                }
            } catch (e) {
                if (msgEl) {
                    msgEl.textContent = `❌ ${e.message}`;
                    msgEl.style.color = '#ef4444';
                    msgEl.classList.remove('hidden');
                }
            }
        });
    }

    // Populate account info
    const accountInfo = document.getElementById('settings-account-info');
    if (accountInfo && AppState.currentUser) {
        const u = AppState.currentUser;
        accountInfo.innerHTML = `
            <p><strong>Name:</strong> ${u.displayName || 'Not set'}</p>
            <p><strong>Email:</strong> ${u.email}</p>
            <p><strong>UID:</strong> <span style="font-family:monospace;font-size:0.8rem;">${u.uid}</span></p>
        `;
    }

    // Password reset from Settings
    const btnPw = document.getElementById('btn-change-password');
    const pwMsg = document.getElementById('settings-pw-msg');
    if (btnPw && pwMsg) {
        btnPw.addEventListener('click', async () => {
            try {
                await sendPasswordResetEmail(auth, AppState.currentUser.email);
                pwMsg.textContent = '✅ Password reset email sent. Check your inbox.';
                pwMsg.style.color = '#10b981';
            } catch (e) {
                pwMsg.textContent = `❌ ${e.message}`;
                pwMsg.style.color = '#ef4444';
            }
            pwMsg.classList.remove('hidden');
        });
    }
}

async function loadNotifPrefs() {
    try {
        const snap = await getDoc(doc(db, 'users', AppState.currentUser.uid, 'prefs', 'notifications'));
        const prefs = snap.exists() ? { ...PREFS_DEFAULTS, ...snap.data() } : PREFS_DEFAULTS;
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = val;
        };
        set('notif-hi-change', prefs.hiChange);
        set('notif-friend-round', prefs.friendRound);
        set('notif-coach-note', prefs.coachNote);
        set('notif-drill-assign', prefs.drillAssign);
    } catch (e) {
        console.warn('Could not load notification prefs:', e);
    }
}

// Call this after a round is saved to fire an in-app notification
export function triggerLocalNotif(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icons/icon-192x192.png' });
    }
}
