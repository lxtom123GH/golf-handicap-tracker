// ==========================================
// app.js
// Main Entry Point & Global Event Bindings
// ==========================================

import { UI, setupTabs } from './ui.js';
import { setupAuthUI } from './auth.js';
import { listenToWHSRounds, addRound } from './whs.js';
import { initCompetitions } from './competitions.js';
import { initPractice } from './practice.js';
import { initOnCourse } from './oncourse.js';
import { AppState } from './state.js';
import { initSocialFeed } from './social.js';
import { initNotifications } from './notifications.js';

// New Sub-Modules
import { bindAdminTools, bindAdminInvite } from './admin.js';
import { bindAiGenerator } from './ai.js';
import { bindCoachTools, bindCoachDashboard } from './coach.js';

import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

function bootstrapApplication() {
    console.log("App Ready: Bootstrapping modules...");
    setupTabs();
    listenToWHSRounds();
    initCompetitions();
    initPractice();
    initOnCourse();

    bindWHSForm();
    bindAdminTools();
    bindAdminInvite();
    bindCoachTools();
    bindCoachDashboard();
    bindAiGenerator();
    populatePlayerSelect();
    initNotifications();

    // Feed tab — init when first opened
    const feedBtn = document.getElementById('tab-btn-feed');
    if (feedBtn) feedBtn.addEventListener('click', () => initSocialFeed(), { once: true });
}

// Kickoff Authentication Flow
setupAuthUI(bootstrapApplication);

// ==========================================
// WHS Manual Round Logging
// ==========================================
function bindWHSForm() {
    if (UI.addRoundForm) {
        UI.addRoundForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Only allow logging rounds for yourself
            if (AppState.viewingPlayerId !== AppState.currentUser.uid) {
                alert("You can only log rounds for your own account.");
                return;
            }

            const course = document.getElementById('course-name').value;
            const rating = parseFloat(document.getElementById('course-rating').value);
            const slope = parseFloat(document.getElementById('slope-rating').value);
            const score = parseInt(document.getElementById('score').value);

            // Collect optional stats
            const putts = parseInt(document.getElementById('stat-putts').value) || null;
            const fwy = parseInt(document.getElementById('stat-fwy').value) || null;
            const gir = parseInt(document.getElementById('stat-gir').value) || null;
            const stats = (putts || fwy || gir) ? { putts, fwy, gir } : null;

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            const success = await addRound(course, rating, slope, score, stats);

            btn.disabled = false;
            btn.textContent = 'Save Round';

            if (success) UI.addRoundForm.reset();
            else alert("Failed to log round");
        });
    }

    if (UI.playerSelect) {
        UI.playerSelect.addEventListener('change', (e) => {
            const selectedUid = e.target.value;
            AppState.viewingPlayerId = selectedUid;

            if (selectedUid === AppState.currentUser.uid) {
                UI.addRoundContainer.style.display = 'block';
                UI.recordPlayerNameEl.textContent = "Your";
                UI.readonlyWarningContainer.classList.add('hidden');
            } else {
                UI.addRoundContainer.style.display = 'none';
                UI.recordPlayerNameEl.textContent = e.target.options[e.target.selectedIndex].text + "'s";
                UI.readonlyWarningContainer.classList.remove('hidden');
            }

            // Auto Calculate Daily Handicap
            if (UI.btnCalculateDaily) UI.btnCalculateDaily.click();

            listenToWHSRounds(); // Re-trigger the WHSRounds snapshot listener for the new UID
        });
    }

    if (UI.btnCalculateDaily) {
        UI.btnCalculateDaily.addEventListener('click', () => {
            const sr = parseFloat(document.getElementById('calc-slope').value);
            const par = parseFloat(document.getElementById('calc-par').value);
            const cr = parseFloat(document.getElementById('calc-scratch').value);

            if (isNaN(sr) || isNaN(par) || isNaN(cr)) {
                alert("Please fill in valid numbers for all fields");
                return;
            }

            // Grab whatever index is displaying for the actively viewed player
            const idxStr = UI.handicapIndexEl.textContent;
            const hi = parseFloat(idxStr);

            if (isNaN(hi)) {
                alert("Player does not have a valid handicap index yet.");
                return;
            }

            const dh = Math.round(hi * (sr / 113) + (cr - par));
            UI.dailyHandicapResult.classList.remove('hidden');
            UI.dhValue.textContent = dh;
            UI.dhPlayerName.textContent = UI.playerSelect.options[UI.playerSelect.selectedIndex]?.text || "Player";
        });
    }
}

// ==========================================
// Multi-Player / Coach Mapping Logic
// ==========================================
async function populatePlayerSelect() {
    if (!UI.playerSelect) return;
    UI.playerSelect.innerHTML = '';

    // Add Self
    const optSelf = document.createElement('option');
    optSelf.value = AppState.currentUser.uid;
    optSelf.textContent = AppState.currentUser.displayName || AppState.currentUser.email;
    optSelf.selected = true;
    UI.playerSelect.appendChild(optSelf);
    AppState.profileUsersMap[AppState.currentUser.uid] = optSelf.textContent;

    // Fetch others if Admin or Coach
    if (window.currentUserIsAdmin || AppState.currentUser.isCoach) {
        try {
            let q;
            const usersRef = collection(db, "users");
            if (window.currentUserIsAdmin) {
                q = query(usersRef, where("isApproved", "==", true)); // Admin gets all approved
            } else {
                q = query(usersRef, where("coaches", "array-contains", AppState.currentUser.uid)); // Coaches get students
            }
            const snap = await getDocs(q);
            snap.forEach(d => {
                if (d.id !== AppState.currentUser.uid) { // Don't duplicate self
                    const data = d.data();
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = data.displayName || data.email;
                    UI.playerSelect.appendChild(opt);
                    AppState.profileUsersMap[d.id] = opt.textContent;
                }
            });
        } catch (e) { console.error("Error fetching player list: ", e); }
    }

    if (UI.ocPlayerSelect) {
        UI.ocPlayerSelect.innerHTML = UI.playerSelect.innerHTML;
    }
}
