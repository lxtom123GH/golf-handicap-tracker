// ==========================================
// practice.js
// Practice Drills & Dashboard Logic
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, deleteDoc, updateDoc, getDoc } from "firebase/firestore";
import { AppState } from './state.js';
import { UI } from './ui.js';
import { bindAiGenerator, generateAIResponse } from './ai.js';

let unsubscribePractice = null;
let currentDrillDefinition = null;

const DRILL_TEMPLATES = {
    "bunker_game": {
        name: "Bunker Game (9 Shots)",
        desc: "Hit 9 bunker shots. Reward quality recoveries. Holed: 5pts, Up & Down: 2pts, On Green: 1pt. Aim for the flag!",
        inputs: [
            { id: 'holed', label: 'Holed (5 pts)', type: 'number', multiplier: 5, default: 0 },
            { id: 'up_down', label: 'Up & Down (2 pts)', type: 'number', multiplier: 2, default: 0 },
            { id: 'on_green', label: 'On Green (1 pt)', type: 'number', multiplier: 1, default: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "inside_30": {
        name: "Inside 30 Yards (Proximity)",
        desc: "9 shots from 30 yards. Precision is rewarded. Holed: 10pts, Inside 3ft: 3pts, Inside 6ft: 1pt. Stay aggressive!",
        inputs: [
            { id: 'holed', label: 'Holed (10 pts)', type: 'number', multiplier: 10, default: 0 },
            { id: 'in_3ft', label: 'Inside 3ft (3 pts)', type: 'number', multiplier: 3, default: 0 },
            { id: 'in_6ft', label: 'Inside 6ft (1 pt)', type: 'number', multiplier: 1, default: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "putting_9": {
        name: "Putting (9 Holes)",
        desc: "A 9-hole putting challenge. Avoid the 3-putt! Holed (1-putt): 3pts, 2-putt: 1pt, 3+ putt: 0pts.",
        inputs: [
            { id: 'putts_1', label: '1-Putts (3 pts)', type: 'number', multiplier: 3, default: 0 },
            { id: 'putts_2', label: '2-Putts (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'putts_3', label: '3+ Putts (0 pts)', type: 'number', multiplier: 0, default: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "up_down": {
        name: "Up & Down Challenge",
        desc: "9 shots around the green. Chip-ins are king. Holed: 5pts, Pars (Up & Down): 2pts, Bogeys: 0pts.",
        inputs: [
            { id: 'holed', label: 'Holed (5 pts)', type: 'number', multiplier: 5, default: 0 },
            { id: 'up_down', label: 'Up & Down (2 pts)', type: 'number', multiplier: 2, default: 0 },
            { id: 'missed', label: 'Missed (0 pts)', type: 'number', multiplier: 0, default: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "driving_accuracy": {
        name: "Driving Accuracy",
        desc: "10 Drivers. Focus on the skinny line. Center Stripe: 5pts, Fairway: 2pts, Miss: 0pts.",
        inputs: [
            { id: 'center', label: 'Center Stripe (5 pts)', type: 'number', multiplier: 5, default: 0 },
            { id: 'fairway', label: 'Fairway (2 pts)', type: 'number', multiplier: 2, default: 0 },
            { id: 'miss', label: 'Miss (0 pts)', type: 'number', multiplier: 0, default: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "iron_proximity": {
        name: "Iron Proximity (50-150y)",
        desc: "10 shots to alternating targets. Holed: 20pts, Inside 5ft: 5pts, Inside 15ft: 2pts, Green Hit: 1pt.",
        inputs: [
            { id: 'holed', label: 'Holed (20 pts)', type: 'number', multiplier: 20, default: 0 },
            { id: 'in_5ft', label: 'Inside 5ft (5 pts)', type: 'number', multiplier: 5, default: 0 },
            { id: 'in_15ft', label: 'Inside 15ft (2 pts)', type: 'number', multiplier: 2, default: 0 },
            { id: 'green', label: 'Green Hit (1 pt)', type: 'number', multiplier: 1, default: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "putting_369": {
        name: "3-6-9 Putting Ladder",
        desc: "Hit 3 balls from 3ft, 6ft, and 9ft. 1 pt for 3ft, 3 pts for 6ft, 5 pts for 9ft makes. Reward the deep ones!",
        inputs: [
            { id: 'putts_3ft', label: 'Makes from 3ft (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'putts_6ft', label: 'Makes from 6ft (3 pts)', type: 'number', multiplier: 3, default: 0 },
            { id: 'putts_9ft', label: 'Makes from 9ft (5 pts)', type: 'number', multiplier: 5, default: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "ladder_putt": {
        name: "Ladder Distance Control",
        desc: "4 balls at 10, 20, 30, and 40 feet. 5 rounds. Lag it close! Inside Half Club: 5pts, 1 Club: 2pts, 2 Clubs: 1pt.",
        inputs: [
            { id: 'inside_half_club', label: 'Inside Half Club (5 pts)', type: 'number', multiplier: 5 },
            { id: 'inside_1_club', label: 'Inside 1 Club (2 pts)', type: 'number', multiplier: 2 },
            { id: 'inside_2_clubs', label: 'Inside 2 Clubs (1 pt)', type: 'number', multiplier: 1 },
            { id: 'outside_2_clubs', label: 'Outside 2 Clubs (0 pts)', type: 'number', multiplier: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "make_break_5ft": {
        name: "5-Foot Make or Break",
        desc: "5 balls in a semi-circle at 5 feet. 5 sets. Goal is perfection. Each make is 1pt.",
        inputs: [
            { id: 'putts_made', label: 'Putts Made (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'putts_missed', label: 'Putts Missed (0 pts)', type: 'number', multiplier: 0, default: 0 }
        ],
        scoringMath: "higher_is_better"
    },
    "gauntlet_putt": {
        name: "The Gauntlet Challenge",
        desc: "Make a 3ft, 6ft, and 9ft putt in sequence. Extreme focus required. Made 3ft: 1pt, 6ft: 3pts, 9ft: 5pts.",
        inputs: [
            { id: 'made_3ft', label: 'Made 3-footer (1 pt)', type: 'number', multiplier: 1 },
            { id: 'made_6ft', label: 'Made 6-footer (3 pts)', type: 'number', multiplier: 3 },
            { id: 'made_9ft', label: 'Made 9-footer (5 pts)', type: 'number', multiplier: 5 }
        ],
        scoringMath: "higher_is_better"
    }
};

export function initPractice() {
    populatePracticeSelect();
    listenToPractice();
    initCoachSelection();

    const btnAskAi = document.getElementById('btn-ask-ai');
    if (btnAskAi) {
        btnAskAi.addEventListener('click', () => {
            if (!AppState.currentUser) return;
            bindAiGenerator();
            generateAIResponse(AppState.currentUser.uid, 'player');
        });
    }

    const dateInput = document.getElementById('drill-date');
    if (dateInput) dateInput.valueAsDate = new Date();

    if (UI.practiceSelect) {
        UI.practiceSelect.addEventListener('change', (e) => {
            const drillId = e.target.value;
            if (!drillId) {
                UI.logPracticeContainer.classList.add('hidden');
                currentDrillDefinition = null;
                renderPracticeDashboard();
                return;
            }
            currentDrillDefinition = DRILL_TEMPLATES[drillId];
            UI.logPracticeContainer.classList.remove('hidden');
            generatePracticeForm();
            renderPracticeDashboard();
        });
    }

    if (UI.btnCancelPractice) {
        UI.btnCancelPractice.addEventListener('click', () => {
            UI.logPracticeContainer.classList.add('hidden');
            UI.practiceSelect.value = "";
            currentDrillDefinition = null;
            renderPracticeDashboard();
        });
    }

    if (UI.logPracticeForm) {
        UI.logPracticeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!AppState.currentUser || !currentDrillDefinition) return;

            const drillId = UI.practiceSelect.value;

            let dataPayload = {};
            const liveTotalEl = document.getElementById('drill-live-total') || document.querySelector('.drill-live-total');
            let scoreVal = liveTotalEl ? (parseInt(liveTotalEl.textContent) || 0) : 0;
            const safePlayerName = AppState.currentUser.displayName || AppState.currentUser.email || "Player";

            currentDrillDefinition.inputs.forEach(inputDef => {
                const el = document.getElementById('drill-input-' + inputDef.id);
                if (el) {
                    dataPayload[inputDef.id] = parseInt(el.value) || 0;
                }
            });

            const btn = UI.btnSavePractice || e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const dateInput = document.getElementById('drill-date');
                let finalDate = new Date();
                if (dateInput && dateInput.value) {
                    const parsed = new Date(dateInput.value);
                    if (!isNaN(parsed)) finalDate = parsed;
                }

                await addDoc(collection(db, "practice_rounds"), {
                    uid: AppState.currentUser.uid,
                    playerName: safePlayerName,
                    drillId: drillId,
                    drillName: currentDrillDefinition.name,
                    score: scoreVal,
                    data: dataPayload,
                    date: finalDate
                });

                alert("Practice session successfully saved to your profile!");
                if (typeof listenToPractice === 'function') listenToPractice();

                // Reset form
                UI.logPracticeForm.reset();
                UI.logPracticeContainer.classList.add('hidden');
                UI.practiceSelect.value = "";
                currentDrillDefinition = null;

                // Re-render empty dashboard
                renderPracticeDashboard();

            } catch (err) {
                console.error("Error logging practice: ", err);
                alert("Failed to save practice record.");
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save Practice Session';
            }
        });
    }

    if (UI.btnEmailCoach) {
        UI.btnEmailCoach.addEventListener('click', () => {
            const dataStr = AppState.currentPracticeRounds.map(r => {
                let details = "";
                if (r.data && Object.keys(r.data).length > 0) {
                    details = " | Details: " + Object.entries(r.data).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`).join(', ');
                }
                return `${new Date(r.date?.toDate?.() || r.date).toLocaleDateString()} - ${r.drillName}: ${r.score}${details}`;
            }).join('\n');
            window.location.href = `mailto:?subject=Golf Practice Logs&body=Here are my recent practice sessions:\n\n${encodeURIComponent(dataStr)}`;
        });
    }

    if (UI.btnExportPractice) {
        UI.btnExportPractice.addEventListener('click', () => {
            const csv = "Date,Drill,Score,Details\n" + AppState.currentPracticeRounds.map(r => {
                let details = "";
                if (r.data && Object.keys(r.data).length > 0) {
                    details = Object.entries(r.data).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`).join(' | ');
                }
                return `${new Date(r.date?.toDate?.() || r.date).toLocaleDateString()},"${r.drillName}",${r.score},"${details}"`;
            }).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', 'golf_practice.csv');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }

    // CRITICAL FIX: Event Delegation for deleting practice rounds
    if (UI.practiceRecentTbody) {
        UI.practiceRecentTbody.addEventListener('click', async (e) => {
            if (e.target.classList.contains('del-prac-round')) {
                const id = e.target.getAttribute('data-id');
                if (confirm("Are you sure you want to delete this practice session?")) {
                    try {
                        await deleteDoc(doc(db, "practice_rounds", id));
                    } catch (err) {
                        console.error("Failed to delete round", err);
                    }
                }
            }
        });
    }
}

function populatePracticeSelect() {
    if (!UI.practiceSelect) return;
    UI.practiceSelect.innerHTML = '<option value="" disabled selected>-- Select a Drill --</option>';

    for (const [key, drill] of Object.entries(DRILL_TEMPLATES)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = drill.name;
        UI.practiceSelect.appendChild(opt);
    }
}

function generatePracticeForm() {
    const dynamicBody = document.getElementById('practice-dynamic-inputs');
    if (!dynamicBody || !currentDrillDefinition) return;

    dynamicBody.innerHTML = '';

    const descP = document.createElement('p');
    descP.style.fontSize = '0.95rem';
    descP.style.color = '#475569';
    descP.style.marginBottom = '18px';
    descP.style.lineHeight = '1.5';
    descP.textContent = currentDrillDefinition.desc;
    dynamicBody.appendChild(descP);

    currentDrillDefinition.inputs.forEach(inputDef => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.style.marginBottom = '12px';

        const label = document.createElement('label');
        label.textContent = inputDef.label;
        label.htmlFor = 'drill-input-' + inputDef.id;
        label.style.display = 'block';
        label.style.marginBottom = '4px';

        const input = document.createElement('input');
        input.type = inputDef.type;
        input.id = 'drill-input-' + inputDef.id;
        input.className = 'drill-outcome-field';
        input.value = ''; // Start blank
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('pattern', '[0-9]*');
        input.min = 0;
        input.required = true;
        input.style.width = '100%';

        // Real-time calculation listener
        input.addEventListener('input', calculateLiveTotal);

        div.appendChild(label);
        div.appendChild(input);
        dynamicBody.appendChild(div);
    });

    calculateLiveTotal();
}

function calculateLiveTotal() {
    if (!currentDrillDefinition || !UI.drillLiveTotalEl) return;
    let total = 0;
    currentDrillDefinition.inputs.forEach(inputDef => {
        const el = document.getElementById('drill-input-' + inputDef.id);
        if (el) {
            const val = parseInt(el.value) || 0;
            total += (val * (inputDef.multiplier !== undefined ? inputDef.multiplier : 1));
        }
    });
    UI.drillLiveTotalEl.textContent = total;
}

function listenToPractice() {
    if (!AppState.currentUser) return;
    if (unsubscribePractice) unsubscribePractice();

    const q = query(
        collection(db, "practice_rounds"),
        where("uid", "==", AppState.currentUser.uid), // Only fetch personal records
        orderBy("date", "desc")
    );

    unsubscribePractice = onSnapshot(q, (snapshot) => {
        AppState.currentPracticeRounds = [];
        snapshot.forEach(docSnap => {
            AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderPracticeDashboard();
        renderRecentPractice();
    });
}

function renderPracticeDashboard() {
    if (!UI.practiceDashboardResults) return;
    UI.practiceDashboardResults.innerHTML = '';

    const viewDrillId = UI.practiceSelect ? UI.practiceSelect.value : null;

    if (!AppState.currentPracticeRounds.length) {
        UI.practiceDashboardResults.innerHTML = '<p class="empty-text">No practice records found.</p>';
        return;
    }

    if (!viewDrillId) {
        UI.practiceDashboardResults.innerHTML = '<p class="empty-text">Select a specific drill from the dropdown above to view personal high scores and averages.</p>';
        return;
    }

    const filteredRecords = AppState.currentPracticeRounds.filter(r => r.drillId === viewDrillId);

    if (!filteredRecords.length) {
        UI.practiceDashboardResults.innerHTML = `<p class="empty-text">No records logged for <strong>${DRILL_TEMPLATES[viewDrillId].name}</strong> yet.</p>`;
        return;
    }

    const template = DRILL_TEMPLATES[viewDrillId];

    let bestScore = filteredRecords[0].score;
    let sumScore = 0;

    filteredRecords.forEach(r => {
        if (template.scoringMath === 'lower_is_better') {
            if (r.score < bestScore) bestScore = r.score;
        } else {
            if (r.score > bestScore) bestScore = r.score;
        }
        sumScore += r.score;
    });

    const avgScore = (sumScore / filteredRecords.length).toFixed(1);

    // Build a quick stateless HTML grid
    const html = `
        <h3 style="margin-top:0; font-size:1.1rem; color: #1e293b; border-bottom: 2px solid var(--secondary-color); padding-bottom:10px;">
            Personal Stats: ${template.name}
        </h3>
        <div style="display:flex; justify-content:space-around; margin-top:20px;">
            <div style="text-align:center;">
                <div style="font-size:2rem; font-weight:800; color:var(--primary-color);">${bestScore}</div>
                <div style="font-size:0.8rem; color:#64748b; font-weight:bold; text-transform:uppercase;">Personal Best</div>
            </div>
            <div style="text-align:center;">
                <div style="font-size:2rem; font-weight:800; color:#1e293b;">${avgScore}</div>
                <div style="font-size:0.8rem; color:#64748b; font-weight:bold; text-transform:uppercase;">Average</div>
            </div>
            <div style="text-align:center;">
                <div style="font-size:2rem; font-weight:800; color:#1e293b;">${filteredRecords.length}</div>
                <div style="font-size:0.8rem; color:#64748b; font-weight:bold; text-transform:uppercase;">Sessions</div>
            </div>
        </div>
    `;

    UI.practiceDashboardResults.innerHTML = html;
}

function renderRecentPractice() {
    if (!UI.practiceRecentTbody) return;
    UI.practiceRecentTbody.innerHTML = '';

    if (!AppState.currentPracticeRounds.length) {
        UI.practiceRecentTbody.innerHTML = '<tr><td colspan="4" class="empty-text">No practice history.</td></tr>';
        return;
    }

    const uidMatches = AppState.currentUser;

    AppState.currentPracticeRounds.forEach(round => {
        const tr = document.createElement('tr');

        let dateObj = round.date;
        if (dateObj && dateObj.toDate) dateObj = dateObj.toDate();
        else if (typeof dateObj === 'string') dateObj = new Date(dateObj);
        const dateStr = dateObj ? dateObj.toLocaleDateString() : 'Unknown';

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${round.drillName}</strong></td>
            <td style="color:var(--primary-color); font-weight:bold; font-size:1.2rem;">${round.score}</td>
            <td>
                ${(uidMatches && AppState.currentUser.uid === round.uid) ? `<button class="btn btn-danger btn-sm del-prac-round" data-id="${round.id}">X</button>` : ''}
            </td>
        `;
        UI.practiceRecentTbody.appendChild(tr);
    });
}

async function initCoachSelection() {
    const coachSelect = document.getElementById('player-coach-select');
    const saveBtn = document.getElementById('btn-save-coach');
    if (!coachSelect || !AppState.currentUser) return;

    // Populate all coaches
    try {
        const coachQuery = query(collection(db, 'users'), where('isCoach', '==', true));
        const snap = await getDocs(coachQuery);

        // Keep existing placeholder
        coachSelect.innerHTML = '<option value="">-- No Coach Selected --</option>';

        snap.forEach(d => {
            const data = d.data();
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = data.displayName || data.email;
            coachSelect.appendChild(opt);
        });

        // Set current selection
        const userRef = doc(db, 'users', AppState.currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.coachUid) {
                coachSelect.value = userData.coachUid;
            }
        }
    } catch (e) {
        console.error("Coach init error:", e);
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const selectedCoachId = coachSelect.value;
            try {
                await updateDoc(doc(db, 'users', AppState.currentUser.uid), {
                    coachUid: selectedCoachId || null
                });
                alert("Coach updated successfully!");
            } catch (err) {
                console.error("Save coach error:", err);
                alert("Failed to update coach.");
            }
        });
    }
}

