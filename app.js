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

// Import db for admin/coach generic calls that don't fit perfectly elsewhere
import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, addDoc, serverTimestamp, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

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
// We pass the bootstrap function as a callback so auth.js controls exactly *when* the app boots
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

// ==========================================
// Admin Sandbox
// ==========================================
function bindAdminTools() {
    const tabBtnAdmin = document.getElementById('tab-btn-admin');
    if (!tabBtnAdmin) return;

    tabBtnAdmin.addEventListener('click', async () => {
        if (!window.currentUserIsAdmin) return;

        UI.adminUsersList.innerHTML = 'Loading...';
        try {
            const snap = await getDocs(collection(db, "users"));
            UI.adminUsersList.innerHTML = '';
            snap.forEach(d => {
                const data = d.data();
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${data.displayName || 'N/A'}</td>
                    <td>${data.email}</td>
                    <td>${data.isAdmin ? 'Admin' : (data.isCoach ? 'Coach' : 'Player')}</td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" ${data.isApproved ? 'checked' : ''} onchange="toggleUserApproval('${d.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" ${data.isCoach ? 'checked' : ''} onchange="toggleCoachRole('${d.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                `;
                UI.adminUsersList.appendChild(tr);
            });
        } catch (e) { console.error("Admin error:", e); }

        loadPreapprovedEmails();
    });

    if (UI.adminPreapproveForm) {
        UI.adminPreapproveForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!window.currentUserIsAdmin) return;
            const em = UI.adminNewEmail.value.toLowerCase().trim();
            if (!em) return;
            await setDoc(doc(db, "preapproved_emails", em), { addedAt: new Date().toISOString() });
            UI.adminNewEmail.value = '';
            loadPreapprovedEmails();
        });
    }
}

async function loadPreapprovedEmails() {
    if (!UI.adminEmailsList) return;
    UI.adminEmailsList.innerHTML = 'Loading...';
    try {
        const snap = await getDocs(collection(db, "preapproved_emails"));
        UI.adminEmailsList.innerHTML = '';
        snap.forEach(d => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.padding = '8px';
            li.style.borderBottom = '1px solid #e2e8f0';
            li.innerHTML = `
                <span>${d.id}</span>
                <button class="btn btn-danger btn-sm" onclick="removePreapprovedEmail('${d.id}')">Remove</button>
            `;
            UI.adminEmailsList.appendChild(li);
        });
    } catch (e) { }
}

window.toggleUserApproval = async function (uid, isApproved) {
    if (!window.currentUserIsAdmin) return;
    try {
        await updateDoc(doc(db, "users", uid), { isApproved: isApproved });
    } catch (e) {
        alert("Failed to update approval status.");
        console.error(e);
    }
};
window.toggleCoachRole = async function (uid, isCoach) {
    if (!window.currentUserIsAdmin) return;
    try {
        await updateDoc(doc(db, "users", uid), { isCoach: isCoach });
    } catch (e) {
        alert("Failed to update coach role.");
        console.error(e);
    }
};

window.removePreapprovedEmail = async function (email) {
    if (!window.currentUserIsAdmin) return;
    try {
        await deleteDoc(doc(db, "preapproved_emails", email));
        loadPreapprovedEmails();
    } catch (e) { }
};

// ==========================================
// Coach Portal Functions
// ==========================================
function bindCoachTools() {
    const btnManageCoaches = document.getElementById('btn-manage-coaches');
    const manageContainer = document.getElementById('manage-coaches-container');
    const btnCloseCoaches = document.getElementById('btn-close-coaches');

    if (btnManageCoaches && manageContainer) {
        btnManageCoaches.addEventListener('click', () => {
            manageContainer.classList.remove('hidden');
            loadMyCoaches();
        });
    }
    if (btnCloseCoaches && manageContainer) {
        btnCloseCoaches.addEventListener('click', () => {
            manageContainer.classList.add('hidden');
        });
    }

    const form = document.getElementById('add-coach-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const coachUid = document.getElementById('coach-uid-input').value.trim();
            if (!coachUid || !AppState.currentUser) return;
            try {
                const userRef = doc(db, "users", AppState.currentUser.uid);
                const userDoc = await getDoc(userRef);
                let currentCoaches = userDoc.exists() ? (userDoc.data().coaches || []) : [];
                if (!currentCoaches.includes(coachUid)) {
                    currentCoaches.push(coachUid);
                    await updateDoc(userRef, { coaches: currentCoaches });
                }
                document.getElementById('coach-uid-input').value = '';
                loadMyCoaches();
            } catch (e) { console.error("Add coach error", e); }
        });
    }
}

async function loadMyCoaches() {
    const list = document.getElementById('my-coaches-list');
    if (!list || !AppState.currentUser) return;
    list.innerHTML = 'Loading...';
    try {
        const userRef = doc(db, "users", AppState.currentUser.uid);
        const userDoc = await getDoc(userRef);
        const coaches = userDoc.exists() ? (userDoc.data().coaches || []) : [];
        if (coaches.length === 0) {
            list.innerHTML = '<li>No coaches added yet.</li>';
            return;
        }
        list.innerHTML = '';
        for (const cid of coaches) {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.innerHTML = `<span>Coach UID: ${cid}</span> <button class="btn btn-danger btn-sm" onclick="removeCoach('${cid}')">Remove</button>`;
            list.appendChild(li);
        }
    } catch (e) { }
}

window.removeCoach = async function (cid) {
    if (!AppState.currentUser) return;
    try {
        const userRef = doc(db, "users", AppState.currentUser.uid);
        const userDoc = await getDoc(userRef);
        let coaches = userDoc.exists() ? (userDoc.data().coaches || []) : [];
        coaches = coaches.filter(c => c !== cid);
        await updateDoc(userRef, { coaches: coaches });
        loadMyCoaches();
    } catch (e) { }
};

// ==========================================
// Coach Dashboard (Redesigned)
// ==========================================
let _coachViewUid = null;

function bindCoachDashboard() {
    if (!window.currentUserIsCoach && !window.currentUserIsAdmin) return;

    const rosterEl = document.getElementById('coach-roster-list');
    const rosterCount = document.getElementById('coach-roster-count');
    const playerView = document.getElementById('coach-player-view');
    const rosterSection = rosterEl?.parentElement;

    // Back button
    const btnBack = document.getElementById('btn-coach-back');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            playerView?.classList.add('hidden');
            rosterSection?.classList.remove('hidden');
            _coachViewUid = null;
        });
    }

    // AI Lesson Plan from Coach View
    const btnAiPlan = document.getElementById('btn-coach-ai-plan');
    if (btnAiPlan) {
        btnAiPlan.addEventListener('click', () => {
            if (_coachViewUid) generateAIResponse(_coachViewUid, 'coach');
        });
    }

    // Coach Notes
    const btnSaveNote = document.getElementById('btn-save-coach-note');
    if (btnSaveNote) {
        btnSaveNote.addEventListener('click', async () => {
            if (!_coachViewUid) return;
            const text = document.getElementById('coach-note-input')?.value.trim();
            if (!text) return;
            await addDoc(collection(db, 'users', _coachViewUid, 'coachNotes'), {
                coachUid: AppState.currentUser.uid,
                text,
                createdAt: serverTimestamp()
            });
            document.getElementById('coach-note-input').value = '';
            loadCoachNotes(_coachViewUid);
        });
    }

    // Drill Assignment
    const btnAssign = document.getElementById('btn-assign-drill');
    if (btnAssign) {
        btnAssign.addEventListener('click', async () => {
            if (!_coachViewUid) return;
            const name = document.getElementById('coach-drill-assign-name')?.value.trim();
            const notes = document.getElementById('coach-drill-assign-notes')?.value.trim();
            if (!name) return;
            const msgEl = document.getElementById('assign-drill-msg');
            try {
                await addDoc(collection(db, 'users', _coachViewUid, 'assignedDrills'), {
                    drillName: name,
                    notes: notes || '',
                    assignedBy: AppState.currentUser.uid,
                    assignedAt: serverTimestamp(),
                    completed: false
                });
                if (msgEl) { msgEl.textContent = '📌 Drill assigned!'; msgEl.style.color = '#10b981'; }
                document.getElementById('coach-drill-assign-name').value = '';
                document.getElementById('coach-drill-assign-notes').value = '';
            } catch (e) {
                if (msgEl) { msgEl.textContent = `❌ ${e.message}`; msgEl.style.color = '#ef4444'; }
            }
        });
    }

    // Load the roster
    loadCoachRoster();

    async function loadCoachRoster() {
        if (!rosterEl) return;
        const myUid = AppState.currentUser.uid;

        // Find all users that have granted this coach access
        const allUsersSnap = await getDocs(collection(db, 'users'));
        const athletes = [];
        allUsersSnap.forEach(d => {
            const data = d.data();
            if (!data.isApproved || d.id === myUid) return;
            const coaches = data.coaches || [];
            if (window.currentUserIsAdmin || coaches.includes(myUid)) {
                athletes.push({ uid: d.id, ...data });
            }
        });

        if (rosterCount) rosterCount.textContent = `${athletes.length} athlete${athletes.length !== 1 ? 's' : ''}`;

        if (!athletes.length) {
            rosterEl.innerHTML = '<p style="color:#94a3b8;">No athletes have granted you access yet. Share your email with players so they can add you as a coach from the WHS tab.</p>';
            return;
        }

        rosterEl.innerHTML = '';
        for (const athlete of athletes) {
            const hiSnap = await getDocs(query(collection(db, 'whs_rounds'), where('uid', '==', athlete.uid)));
            let rounds = [];
            hiSnap.forEach(d => {
                const r = d.data();
                rounds.push({ diff: (113 / r.slope) * (r.adjustedGross - r.rating), date: r.date?.toDate?.() || new Date() });
            });
            rounds.sort((a, b) => b.date - a.date);

            // Trend badge
            let trendBadge = '';
            if (rounds.length >= 4) {
                const half = Math.floor(Math.min(rounds.length, 10) / 2);
                const recent = rounds.slice(0, half).reduce((a, b) => a + b.diff, 0) / half;
                const older = rounds.slice(half, half * 2).reduce((a, b) => a + b.diff, 0) / half;
                const delta = recent - older;
                if (delta < -0.5) trendBadge = '<span style="background:#d1fae5;color:#059669;padding:2px 8px;border-radius:12px;font-size:0.75rem;">📉 Improving</span>';
                else if (delta > 0.5) trendBadge = '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:0.75rem;">📈 Declining</span>';
                else trendBadge = '<span style="background:#f0f9ff;color:#0284c7;padding:2px 8px;border-radius:12px;font-size:0.75rem;">→ Stable</span>';
            }

            // Flag if HI increased >2 in last round
            let flagBadge = '';
            if (rounds.length >= 2) {
                const hiChange = rounds[0].diff - rounds[1].diff;
                if (hiChange > 2) flagBadge = '<span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-left:4px;">⚠️ HI spike</span>';
            }

            const lastRoundDate = rounds.length ? rounds[0].date.toLocaleDateString('en-AU') : 'No rounds';
            const card = document.createElement('div');
            card.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:box-shadow 0.2s;';
            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#3867d6,#4b7bec);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;">
                        ${(athlete.displayName || '?')[0].toUpperCase()}
                    </div>
                    <div>
                        <div style="font-weight:700;">${athlete.displayName || athlete.email}</div>
                        <div style="font-size:0.8rem;color:#64748b;">Last round: ${lastRoundDate} ${trendBadge}${flagBadge}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.6rem;font-weight:800;color:#3867d6;">${athlete.handicapIndex ?? '--'}</div>
                    <div style="font-size:0.75rem;color:#64748b;">HI</div>
                </div>
            `;
            card.addEventListener('click', () => loadCoachPlayerView(athlete));
            card.addEventListener('mouseenter', () => card.style.boxShadow = '0 4px 12px rgba(56,103,214,0.15)');
            card.addEventListener('mouseleave', () => card.style.boxShadow = 'none');
            rosterEl.appendChild(card);
        }
    }

    async function loadCoachPlayerView(athlete) {
        _coachViewUid = athlete.uid;
        rosterSection?.classList.add('hidden');
        playerView?.classList.remove('hidden');

        document.getElementById('coach-view-name').textContent = athlete.displayName || athlete.email;

        // Load rounds
        const roundsSnap = await getDocs(query(collection(db, 'whs_rounds'), where('uid', '==', athlete.uid), orderBy('date', 'desc'), limit(10)));
        const tbodyWhs = document.getElementById('coach-whs-tbody');
        if (tbodyWhs) {
            tbodyWhs.innerHTML = '';
            let putts = [], fwy = [], gir = [];
            let diffs = [];
            roundsSnap.forEach(d => {
                const r = d.data();
                const diff = ((113 / r.slope) * (r.adjustedGross - r.rating)).toFixed(1);
                diffs.push(+diff);
                const date = r.date?.toDate ? r.date.toDate().toLocaleDateString('en-AU') : '--';
                if (r.stats?.putts) putts.push(r.stats.putts);
                if (r.stats?.fwy) fwy.push(r.stats.fwy);
                if (r.stats?.gir) gir.push(r.stats.gir);
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${date}</td><td>${r.course}</td><td>${r.adjustedGross}</td><td>${diff}</td><td>${r.stats?.putts ?? '--'}</td><td>${r.stats?.fwy ?? '--'}</td><td>${r.stats?.gir ?? '--'}</td>`;
                tbodyWhs.appendChild(tr);
            });
            // Stats
            const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '--';
            document.getElementById('coach-stat-putts').textContent = avg(putts);
            document.getElementById('coach-stat-fwy').textContent = fwy.length ? avg(fwy) + '/14' : '--';
            document.getElementById('coach-stat-gir').textContent = gir.length ? avg(gir) + '/18' : '--';

            // Trend
            const trendEl = document.getElementById('coach-view-trend');
            if (diffs.length >= 4) {
                const half = Math.floor(diffs.length / 2);
                const recentAvg = diffs.slice(0, half).reduce((a, b) => a + b, 0) / half;
                const olderAvg = diffs.slice(half).reduce((a, b) => a + b, 0) / half;
                const delta = recentAvg - olderAvg;
                if (delta < -0.5) trendEl.innerHTML = '<span style="color:#059669;">📉 Improving trend</span>';
                else if (delta > 0.5) trendEl.innerHTML = '<span style="color:#dc2626;">📈 Declining trend</span>';
                else trendEl.innerHTML = '<span style="color:#0284c7;">→ Stable trend</span>';
            }

            // HI display
            document.getElementById('coach-view-hi').textContent = athlete.handicapIndex ?? '--';
        }

        // Load practice
        const pracSnap = await getDocs(query(collection(db, 'practice_rounds'), where('uid', '==', athlete.uid), orderBy('date', 'desc'), limit(10)));
        const tbodyPrac = document.getElementById('coach-practice-tbody');
        if (tbodyPrac) {
            tbodyPrac.innerHTML = '';
            pracSnap.forEach(d => {
                const p = d.data();
                const date = p.date?.toDate ? p.date.toDate().toLocaleDateString('en-AU') : '--';
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${date}</td><td>${p.drillName}</td><td>${p.score}</td>`;
                tbodyPrac.appendChild(tr);
            });
        }

        loadCoachNotes(athlete.uid);
    }
}

async function loadCoachNotes(athleteUid) {
    const notesEl = document.getElementById('coach-notes-list');
    if (!notesEl) return;
    const snap = await getDocs(query(collection(db, 'users', athleteUid, 'coachNotes'), orderBy('createdAt', 'desc'), limit(10)));
    notesEl.innerHTML = '';
    if (snap.empty) {
        notesEl.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;">No notes yet.</p>';
        return;
    }
    snap.forEach(d => {
        const n = d.data();
        const date = n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('en-AU') : 'Just now';
        const row = document.createElement('div');
        row.style.cssText = 'padding:8px;background:#f8fafc;border-radius:6px;margin-bottom:6px;border-left:3px solid #3867d6;';
        row.innerHTML = `<div style="font-size:0.78rem;color:#64748b;margin-bottom:2px;">${date}</div><div>${n.text}</div>`;
        notesEl.appendChild(row);
    });
}

// ==========================================
// AI Coach — Live Gemini Integration
// ==========================================
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-functions.js";


let _lastAiUid = null;
let _lastAiRole = null;

function bindAiGenerator() {
    const btnAiPlayer = document.getElementById('btn-ai-player');
    const btnAiCoach = document.getElementById('btn-ai-coach');
    const btnRegenerate = document.getElementById('btn-regenerate-ai');

    // Coach users must never see or access the AI Coach feature
    if (window.currentUserIsCoach && !window.currentUserIsAdmin) {
        if (btnAiPlayer) btnAiPlayer.closest('section, div')?.style && (btnAiPlayer.style.display = 'none');
        if (btnAiCoach) btnAiCoach.style.display = 'none';
        // Also hide the AI coach button in the Coach Dashboard per-player view
        const btnCoachAiPlan = document.getElementById('btn-coach-ai-plan');
        if (btnCoachAiPlan) btnCoachAiPlan.style.display = 'none';
        return; // Don't bind any AI event listeners
    }

    if (btnAiPlayer) {
        btnAiPlayer.addEventListener('click', () => {
            _lastAiUid = AppState.currentUser.uid;
            _lastAiRole = 'player';
            generateAIResponse(_lastAiUid, _lastAiRole);
        });
    }
    if (btnAiCoach) {
        btnAiCoach.addEventListener('click', () => {
            const uid = document.getElementById('player-select').value;
            if (!uid) return alert('Select a player first');
            _lastAiUid = uid;
            _lastAiRole = 'coach';
            generateAIResponse(_lastAiUid, _lastAiRole);
        });
    }
    if (btnRegenerate) {
        btnRegenerate.addEventListener('click', () => {
            if (_lastAiUid) generateAIResponse(_lastAiUid, _lastAiRole);
        });
    }
    if (UI.btnCloseAiModal) {
        UI.btnCloseAiModal.addEventListener('click', () => UI.aiModalOverlay.classList.add('hidden'));
    }
    const btnClose2 = document.getElementById('btn-close-ai-modal-2');
    if (btnClose2) {
        btnClose2.addEventListener('click', () => UI.aiModalOverlay.classList.add('hidden'));
    }
}

function markdownToHtml(md) {
    return md
        .replace(/^### (.+)/gm, '<h3 style="margin:16px 0 6px;color:#6d28d9;">$1</h3>')
        .replace(/^## (.+)/gm, '<h2 style="margin:20px 0 8px;color:#4c1d95;border-bottom:2px solid #ede9fe;padding-bottom:6px;">$1</h2>')
        .replace(/^# (.+)/gm, '<h1 style="margin:0 0 16px;color:#3b0764;">$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)/gm, '<li style="margin:4px 0;">$1</li>')
        .replace(/(<li.*<\/li>)/gs, '<ul style="padding-left:20px;margin:8px 0;">$1</ul>')
        .replace(/\n\n/g, '</p><p style="margin:10px 0;">')
        .replace(/^(?!<[hul])/gm, '')
        .trim();
}

async function generateAIResponse(uid, role) {
    if (!UI.aiModalOverlay) return;

    // Show modal with loading state
    UI.aiModalOverlay.classList.remove('hidden');
    document.getElementById('ai-loading').classList.remove('hidden');
    document.getElementById('ai-response-area').classList.add('hidden');
    document.getElementById('ai-error-area').classList.add('hidden');
    document.getElementById('btn-regenerate-ai').disabled = true;

    const titleEl = document.getElementById('ai-modal-title');
    const subtitleEl = document.getElementById('ai-modal-subtitle');
    if (titleEl) titleEl.textContent = role === 'player' ? '✨ Your AI Training Plan' : '✨ Lesson Plan Generator';
    if (subtitleEl) subtitleEl.textContent = 'Powered by Gemini — Analysing your data...';

    try {
        // ── Gather data ──────────────────────────────────────────────
        const [roundsSnap, pracSnap, shotsSnap] = await Promise.all([
            getDocs(query(collection(db, 'whs_rounds'), where('uid', '==', uid))),
            getDocs(query(collection(db, 'practice_rounds'), where('uid', '==', uid))),
            getDocs(query(collection(db, 'shots'), where('uid', '==', uid)))
        ]);

        // Process rounds
        let rounds = [];
        roundsSnap.forEach(d => {
            const r = d.data();
            const diff = ((113 / r.slope) * (r.adjustedGross - r.rating));
            rounds.push({ diff, date: r.date?.toDate?.() || new Date(r.date), stats: r.stats || null });
        });
        rounds.sort((a, b) => b.date - a.date);
        const recent5 = rounds.slice(0, 5).map(r => r.diff.toFixed(1));
        const recent10 = rounds.slice(0, 10).map(r => r.diff);

        // Trend: compare first half vs second half of last 10
        let trend = 'insufficient data to determine trend';
        if (recent10.length >= 4) {
            const half = Math.floor(recent10.length / 2);
            const recentAvg = recent10.slice(0, half).reduce((a, b) => a + b, 0) / half;
            const olderAvg = recent10.slice(half).reduce((a, b) => a + b, 0) / half;
            const delta = recentAvg - olderAvg;
            if (delta < -0.5) trend = `IMPROVING (differential has dropped ${Math.abs(delta).toFixed(1)} strokes recently)`;
            else if (delta > 0.5) trend = `DECLINING (differential has increased ${delta.toFixed(1)} strokes recently — needs attention)`;
            else trend = 'STABLE (no significant change)';
        }

        // Stats averages
        const puttsList = rounds.filter(r => r.stats?.putts).map(r => r.stats.putts);
        const fwyList = rounds.filter(r => r.stats?.fwy).map(r => r.stats.fwy);
        const girList = rounds.filter(r => r.stats?.gir).map(r => r.stats.gir);
        const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;

        // Identify weakest stat
        const statsData = [];
        if (avg(puttsList)) statsData.push({ name: 'Putting', value: +avg(puttsList), benchmark: 32, higherIsBad: true });
        if (avg(fwyList)) statsData.push({ name: 'Fairways Hit', value: +avg(fwyList), benchmark: 7, higherIsBad: false });
        if (avg(girList)) statsData.push({ name: 'Greens in Regulation', value: +avg(girList), benchmark: 9, higherIsBad: false });
        const weakest = statsData.length
            ? statsData.sort((a, b) => {
                const aGap = a.higherIsBad ? a.value - a.benchmark : a.benchmark - a.value;
                const bGap = b.higherIsBad ? b.value - b.benchmark : b.benchmark - b.value;
                return bGap - aGap;
            })[0]
            : null;

        // Practice drills
        let pracSummary = [];
        pracSnap.forEach(d => {
            const p = d.data();
            pracSummary.push(`${p.drillName} (score: ${p.score})`);
        });

        // Shot shapes
        let misses = {};
        shotsSnap.forEach(d => {
            const s = d.data();
            if (s.curve) { misses[s.curve] = (misses[s.curve] || 0) + 1; }
        });
        const topMiss = Object.entries(misses).sort((a, b) => b[1] - a[1])[0];

        // ── Build enriched prompt ────────────────────────────────────
        let prompt = '';
        if (role === 'player') {
            prompt = `You are an elite PGA Tour-level golf coach. Analyse the following player data and generate a highly specific, actionable 45-minute solo practice plan. Focus on their single biggest weakness, not generic advice.\n\n`;
            prompt += `**Player Stats:**\n`;
        } else {
            prompt = `You are a senior Director of Coaching at an elite golf academy. A junior coach needs a detailed 60-minute in-person lesson plan for their student. Base it strictly on the data below and be specific.\n\n`;
            prompt += `**Student Stats:**\n`;
        }

        prompt += `- Recent Differentials (newest first): [${recent5.join(', ')}]\n`;
        prompt += `- Trend: ${trend}\n`;
        prompt += `- Avg Putts/Round: ${avg(puttsList) || 'Not tracked yet'}\n`;
        prompt += `- Avg Fairways Hit: ${avg(fwyList) ? avg(fwyList) + '/14' : 'Not tracked yet'}\n`;
        prompt += `- Avg GIR: ${avg(girList) ? avg(girList) + '/18' : 'Not tracked yet'}\n`;
        if (weakest) prompt += `- **Identified Weakest Area: ${weakest.name}** (avg ${weakest.value} vs benchmark ~${weakest.benchmark})\n`;
        if (topMiss) prompt += `- Most common miss: ${topMiss[0]} (${topMiss[1]} shots)\n`;
        prompt += `\n**Practice Drills Logged (recent):**\n`;
        prompt += pracSummary.length ? pracSummary.slice(0, 6).join(', ') : 'No drills logged yet.';
        prompt += `\n\n`;

        if (role === 'player') {
            prompt += `Generate a 45-minute practice plan with:\n1. Exactly which area to focus on and why (cite the stats)\n2. 3 specific drills with exact reps/constraints\n3. How to measure success before leaving the range\n\nFormat with clear Markdown headers and bullet points.`;
        } else {
            prompt += `Generate a 60-minute lesson plan with:\n1. The single biggest leak identified from the data (cite exactly why)\n2. Three blocks: Warm-up/Discovery (10 min), Skill Acquisition (35 min), Pressure Testing (15 min)\n3. 2–3 discovery questions to ask the student at the start\n4. Specific drills for each block with constraints\n\nFormat with clear Markdown headers. Be concise and practical.`;
        }

        // ── Call Secure Backend Cloud Function ──────────────────────────────
        const functions = getFunctions();
        const askAiCoach = httpsCallable(functions, 'askAiCoach');

        const response = await askAiCoach({ prompt: prompt });
        const rawText = response.data.answer || 'No response received.';
        const html = markdownToHtml(rawText);

        // ── Display response ─────────────────────────────────────────
        document.getElementById('ai-loading').classList.add('hidden');
        document.getElementById('ai-response-area').classList.remove('hidden');
        document.getElementById('ai-response-content').innerHTML = `<p style="margin:10px 0;">${html}</p>`;
        if (subtitleEl) subtitleEl.textContent = 'Powered by Gemini · Tap Regenerate for a fresh plan';

    } catch (e) {
        console.error('Gemini API error:', e);
        document.getElementById('ai-loading').classList.add('hidden');
        document.getElementById('ai-error-area').classList.remove('hidden');
        document.getElementById('ai-error-msg').textContent = `❌ ${e.message}`;
    } finally {
        document.getElementById('btn-regenerate-ai').disabled = false;
    }
}


// ==========================================
// Admin Invite User Flow + CSV Import
// ==========================================
function bindAdminInvite() {
    if (!window.currentUserIsAdmin) return;

    // --- CSV Template Download ---
    const btnTemplate = document.getElementById('btn-download-csv-template');
    if (btnTemplate) {
        const csvContent = 'date,course,holes,adjustedGross,courseRating,slopeRating,isCounting\n2024-01-15,Royal Melbourne,18,82,72.3,135,true\n2024-01-22,Kingston Heath,18,79,73.1,138,true';
        const blob = new Blob([csvContent], { type: 'text/csv' });
        btnTemplate.href = URL.createObjectURL(blob);
    }

    // --- Populate Import Player Dropdown ---
    const importSelect = document.getElementById('import-player-select');
    if (importSelect) {
        getDocs(collection(db, 'users')).then(snap => {
            snap.forEach(d => {
                const data = d.data();
                if (data.isApproved) {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = data.displayName || data.email;
                    importSelect.appendChild(opt);
                }
            });
        });
    }

    // --- Invite Form ---
    const inviteForm = document.getElementById('admin-invite-form');
    const inviteMsg = document.getElementById('invite-msg');
    if (inviteForm && inviteMsg) {
        inviteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!window.currentUserIsAdmin) return;
            const email = document.getElementById('invite-email').value.trim().toLowerCase();
            const name = document.getElementById('invite-name').value.trim();
            const role = document.getElementById('invite-role').value;

            const btn = inviteForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Sending...';

            try {
                // 1. Pre-approve the email
                await setDoc(doc(db, 'preapproved_emails', email), {
                    addedAt: new Date().toISOString(),
                    displayName: name,
                    role: role
                });

                // 2. Send Firebase password reset email as invitation
                await sendPasswordResetEmail(auth, email);

                inviteMsg.textContent = `✅ Invitation sent to ${email}. They'll receive a link to set their password.`;
                inviteMsg.style.color = '#10b981';
                inviteForm.reset();
            } catch (err) {
                // Firebase requires the account to exist first for password reset
                // If user doesn't exist yet, we just pre-approve and tell admin
                if (err.code === 'auth/user-not-found') {
                    inviteMsg.textContent = `✅ ${email} pre-approved. They can now register and will be auto-approved on first login.`;
                    inviteMsg.style.color = '#10b981';
                    inviteForm.reset();
                } else {
                    inviteMsg.textContent = `❌ Error: ${err.message}`;
                    inviteMsg.style.color = '#ef4444';
                }
            }
            inviteMsg.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Send Invitation';
        });
    }

    // --- CSV Import ---
    const btnImport = document.getElementById('btn-import-csv');
    const importMsgEl = document.getElementById('import-msg');
    if (btnImport) {
        btnImport.addEventListener('click', async () => {
            const fileInput = document.getElementById('csv-file-input');
            const targetUid = importSelect ? importSelect.value : null;
            if (!fileInput.files.length || !targetUid) {
                importMsgEl.textContent = '❌ Please select a user and a CSV file.';
                importMsgEl.style.color = '#ef4444';
                return;
            }

            const file = fileInput.files[0];
            const text = await file.text();
            const lines = text.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());

            let imported = 0, errors = 0;
            importMsgEl.textContent = 'Importing...';
            importMsgEl.style.color = '#64748b';

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const row = {};
                headers.forEach((h, idx) => { row[h] = values[idx]; });

                let gross = parseFloat(row.adjustedGross);
                const cr = parseFloat(row.courseRating);
                const sr = parseFloat(row.slopeRating);
                const holes = parseInt(row.holes) || 18;

                // Support new Stableford CSV columns
                if (isNaN(gross) && row.stablefordPoints && row.dailyHandicap) {
                    const stbf = parseInt(row.stablefordPoints);
                    const dh = parseInt(row.dailyHandicap);
                    const par = parseInt(row.par) || 72; // Default to Men's Standard Par
                    if (!isNaN(stbf) && !isNaN(dh)) {
                        gross = par + dh + 36 - stbf;
                    }
                }

                if (!row.date || !row.course || isNaN(gross) || isNaN(cr) || isNaN(sr)) {
                    errors++;
                    continue;
                }

                try {
                    await addDoc(collection(db, 'whs_rounds'), {
                        uid: targetUid,
                        course: row.course,
                        rating: cr,
                        slope: sr,
                        adjustedGross: gross,
                        holes: holes,
                        notCounting: row.isCounting === 'false',
                        date: new Date(row.date),
                        importedAt: serverTimestamp()
                    });
                    imported++;
                } catch (_) { errors++; }
            }

            importMsgEl.textContent = `✅ Import complete: ${imported} rounds added${errors > 0 ? `, ${errors} rows skipped (invalid data)` : ''}.`;
            importMsgEl.style.color = errors > 0 ? '#f59e0b' : '#10b981';
        });
    }

    // --- Automated Excel Bulk Import ---
    const btnExcelImport = document.getElementById('btn-import-excel');
    const excelMsgEl = document.getElementById('excel-import-msg');

    if (btnExcelImport) {
        btnExcelImport.addEventListener('click', async () => {
            const fileInput = document.getElementById('excel-file-input');
            if (!fileInput.files.length) {
                excelMsgEl.textContent = '❌ Please select the myscores.xlsx file.';
                excelMsgEl.style.color = '#ef4444';
                return;
            }

            try {
                const file = fileInput.files[0];
                const data = await file.arrayBuffer();
                const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });

                let totalImported = 0;
                let logMsg = "Import log:\n";
                excelMsgEl.textContent = 'Processing workbook... Please wait...';
                excelMsgEl.style.color = '#64748b';

                for (const sheetName of workbook.SheetNames) {
                    if (sheetName.toLowerCase() === 'legend') continue; // Skip legend tab

                    const emailToMatch = sheetName.toLowerCase().trim();
                    const q = query(collection(db, 'users'), where('email', '==', emailToMatch));
                    const snap = await getDocs(q);

                    if (snap.empty) {
                        logMsg += `⚠️ Skipped tab '${sheetName}': No registered user found with this email.\n`;
                        continue;
                    }
                    const targetUid = snap.docs[0].id;
                    logMsg += `✅ Found user for tab '${sheetName}' (UID: ${targetUid}).\n`;

                    const worksheet = workbook.Sheets[sheetName];
                    const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    let tabImported = 0;
                    let tabErrors = 0;

                    for (let i = 0; i < rows.length; i++) {
                        const r = rows[i];
                        if (!r || r.length < 8) continue;

                        const dateVal = r[0]; // Can be Date object if cellDates:true, or serial number
                        const course = r[1];
                        const scratch = parseFloat(r[3]);
                        const slope = parseFloat(r[4]);
                        const grossDiff = parseFloat(r[7]);

                        // Check if this looks like a valid data row (Gross Diff and Date must exist)
                        if (!course || isNaN(scratch) || isNaN(slope) || isNaN(grossDiff)) {
                            continue;
                        }

                        let parsedDate = null;
                        if (dateVal instanceof Date) {
                            parsedDate = dateVal;
                        } else if (!isNaN(parseInt(dateVal))) { // Excel serial date
                            parsedDate = new Date((parseInt(dateVal) - 25569) * 86400 * 1000);
                        } else {
                            parsedDate = new Date(dateVal); // Try normal date string parsing
                        }

                        if (!parsedDate || isNaN(parsedDate.getTime())) continue; // Invalid date

                        // Reverse calculate Adjusted Gross directly from the WHS Differential formula components
                        // Diff = (AdjustedGross - Rating) * 113 / Slope --> AdjustedGross = (Diff * Slope / 113) + Rating
                        const adjustedGross = Math.round((grossDiff * slope / 113) + scratch);

                        try {
                            await addDoc(collection(db, 'whs_rounds'), {
                                uid: targetUid,
                                course: course,
                                rating: scratch,
                                slope: slope,
                                adjustedGross: adjustedGross,
                                holes: 18, // Assume differentials strictly calculate out to 18-hole normalized stats
                                notCounting: false,
                                date: parsedDate,
                                importedAt: serverTimestamp(),
                                isAutoImported: true,
                                originalGrossDiff: grossDiff
                            });
                            tabImported++;
                            totalImported++;
                        } catch (e) {
                            tabErrors++;
                        }
                    }
                    logMsg += `   -> Imported ${tabImported} rounds (${tabErrors} errors).\n`;
                }

                logMsg += `\n🎉 Finished! Total rounds imported: ${totalImported}`;
                excelMsgEl.textContent = logMsg;
                excelMsgEl.style.color = '#10b981';

            } catch (err) {
                console.error("Excel processing error", err);
                excelMsgEl.textContent = '❌ Failed to process workbook. Ensure SheetJS loaded correctly.';
                excelMsgEl.style.color = '#ef4444';
            }
        });
    }
}
