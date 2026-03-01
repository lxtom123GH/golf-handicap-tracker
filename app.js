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

// Import db for admin/coach generic calls that don't fit perfectly elsewhere
import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, addDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
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
    bindAiGenerator();
    populatePlayerSelect();
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
// AI Coach Prompt Generator
// ==========================================
function bindAiGenerator() {
    const btnAiPlayer = document.getElementById('btn-ai-player');
    const btnAiCoach = document.getElementById('btn-ai-coach');

    if (btnAiPlayer) {
        btnAiPlayer.addEventListener('click', () => generateAIPrompt(AppState.currentUser.uid, 'player'));
    }
    if (btnAiCoach) {
        btnAiCoach.addEventListener('click', () => {
            const uid = document.getElementById('player-select').value;
            if (!uid) return alert('Select a player first');
            generateAIPrompt(uid, 'coach');
        });
    }
    if (UI.btnCopyAiPrompt) {
        UI.btnCopyAiPrompt.addEventListener('click', () => {
            UI.aiPromptTextarea.select();
            document.execCommand('copy');
            UI.btnCopyAiPrompt.textContent = "Copied!";
            setTimeout(() => UI.btnCopyAiPrompt.textContent = "Copy to Clipboard", 2000);
        });
    }
    if (UI.btnCloseAiModal) {
        UI.btnCloseAiModal.addEventListener('click', () => {
            UI.aiModalOverlay.classList.add('hidden');
        });
    }
    // Wire second close button
    const btnClose2 = document.getElementById('btn-close-ai-modal-2');
    if (btnClose2) {
        btnClose2.addEventListener('click', () => {
            UI.aiModalOverlay.classList.add('hidden');
        });
    }
}

async function generateAIPrompt(uid, role) {
    if (!UI.aiModalTitle) return;
    if (role === 'player') UI.aiModalTitle.textContent = "Your Custom Training AI Prompt";
    else UI.aiModalTitle.textContent = "Lesson Plan AI Generator Prompt";

    UI.aiPromptTextarea.value = "Gathering data...";
    UI.aiModalOverlay.classList.remove('hidden');

    try {
        // Fetch recent WHS rounds for this student
        const qRounds = query(collection(db, "whs_rounds"), where("uid", "==", uid));
        const roundsSnap = await getDocs(qRounds);
        let diffsList = [];
        let puttsList = [];
        let fwyList = [];
        let girList = [];
        let rDate;

        roundsSnap.forEach(d => {
            const r = d.data();
            const diff = ((113 / r.slope) * (r.adjustedGross - r.rating)).toFixed(1);
            diffsList.push(diff);
            if (r.stats) {
                if (r.stats.putts) puttsList.push(r.stats.putts);
                if (r.stats.fwy) fwyList.push(r.stats.fwy);
                if (r.stats.gir) girList.push(r.stats.gir);
            }
        });

        const qPrac = query(collection(db, "practice_rounds"), where("uid", "==", uid));
        const pracSnap = await getDocs(qPrac);
        let pracList = [];
        pracSnap.forEach(d => {
            const p = d.data();
            pracList.push(`${p.drillName}: ${p.score}`);
        });

        const qShots = query(collection(db, "shots"), where("uid", "==", uid));
        const shotsSnap = await getDocs(qShots);
        let misses = {};
        shotsSnap.forEach(d => {
            const s = d.data();
            if (s.curve) {
                if (!misses[s.curve]) misses[s.curve] = 0;
                misses[s.curve]++;
            }
        });

        let promptText = "";

        if (role === 'player') {
            promptText += `Act as a world-class PGA Golf Coach structuring a personalized practice session for me.\n\n`;
            promptText += `Here is my recent data:\n`;
        } else {
            promptText += `Act as a senior Director of Coaching for an elite golf academy. I am one of your junior coaches, and I need you to help me design a 60-minute in-person lesson plan for my student based on their recent scoring data.\n\n`;
            promptText += `Here is my student's recent data:\n`;
        }

        promptText += `- Handicap Index Differentials (Trend): [${diffsList.slice(0, 5).join(', ')}]\n`;
        promptText += `- Putts per round avg: ${puttsList.length ? (puttsList.reduce((a, b) => a + b, 0) / puttsList.length).toFixed(1) : 'Unknown'}\n`;
        promptText += `- Fairways hit avg: ${fwyList.length ? (fwyList.reduce((a, b) => a + b, 0) / fwyList.length).toFixed(1) : 'Unknown'}\n`;
        promptText += `- Greens in Reg avg: ${girList.length ? (girList.reduce((a, b) => a + b, 0) / girList.length).toFixed(1) : 'Unknown'}\n`;

        promptText += `\nRecent Practice Drills Logging:\n`;
        promptText += pracList.length ? pracList.slice(0, 5).join(', ') + '\n' : 'No practice data logged recently.\n';

        promptText += `\nShot Shape Tendencies:\n`;
        const missKeys = Object.keys(misses);
        if (missKeys.length) {
            missKeys.forEach(k => { promptText += `- ${k}: ${misses[k]} shots\n` });
        } else {
            promptText += `Not much live ball flight data logged yet.\n`;
        }

        if (role === 'player') {
            promptText += `\nBased on this data, provide a structured 45-minute practice session focused strictly on my weakest area. Include specific drills, exact constraints, and how I should measure success. Do not give generic swing advice, focus on how to practice effectively. Provide the response in clear Markdown.`;
        } else {
            promptText += `\nBased on this data, identify the single largest leak in their scoring. Then, break down a 60-minute lesson plan into 3 distinct blocks (Warmup/Discovery, Skill Acquisition, Pressure Testing) addressing that leak. Include questions I should ask the student during the discovery phase. Format in clear Markdown.`;
        }

        UI.aiPromptTextarea.value = promptText;

    } catch (e) {
        console.error(e);
        UI.aiPromptTextarea.value = "Error generating prompt. Ensure you are connected to the network.";
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

                const gross = parseFloat(row.adjustedGross);
                const cr = parseFloat(row.courseRating);
                const sr = parseFloat(row.slopeRating);
                const holes = parseInt(row.holes) || 18;

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
}
