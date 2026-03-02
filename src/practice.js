// ==========================================
// practice.js
// Practice Drills & Dashboard Logic
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, deleteDoc } from "firebase/firestore";
import { AppState } from './state.js';
import { UI } from './ui.js';
import { bindAiGenerator } from './ai.js';

let unsubscribePractice = null;
let currentDrillDefinition = null;

const DRILL_TEMPLATES = {
    "bunker_game": {
        name: "Bunker Game (Par 18)",
        desc: "Hit 9 bunker shots. Focus on getting up-and-down. 1 pt for holed, 2 pts for up & down, 3 pts for bogey+.",
        inputs: [
            { id: 'holed', label: 'Holed (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'up_down', label: 'Up & Down (2 pts)', type: 'number', multiplier: 2, default: 0 },
            { id: 'missed', label: 'Bogey+ (3 pts)', type: 'number', multiplier: 3, default: 0 }
        ],
        scoringMath: "lower_is_better"
    },
    "inside_30": {
        name: "Inside 30 Yards (Proximity)",
        desc: "9 shots from 30 yards. Reward proximity with structured points. Stay inside the circle!",
        inputs: [
            { id: 'holed', label: 'Holed (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'in_1_club', label: 'Inside 1 Club (2 pts)', type: 'number', multiplier: 2, default: 0 },
            { id: 'in_2_clubs', label: 'Inside 2 Clubs (3 pts)', type: 'number', multiplier: 3, default: 0 },
            { id: 'missed', label: 'Outside 2 Clubs (5 pts)', type: 'number', multiplier: 5, default: 0 }
        ],
        scoringMath: "lower_is_better"
    },
    "putting_9": {
        name: "Putting (9 Holes)",
        desc: "A 9-hole putting course challenge. 1 pt for a 1-putt, 2 pts for a 2-putt, 4 pts for a 3-putt catastrophe.",
        inputs: [
            { id: 'putts_1', label: '1-Putts (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'putts_2', label: '2-Putts (2 pts)', type: 'number', multiplier: 2, default: 0 },
            { id: 'putts_3', label: '3+ Putts (4 pts)', type: 'number', multiplier: 4, default: 0 }
        ],
        scoringMath: "lower_is_better"
    },
    "up_down": {
        name: "Up & Down Challenge",
        desc: "Play 9 shots around the green. Chip-ins are king. Focus on making those par saves.",
        inputs: [
            { id: 'birdies', label: 'Holed (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'pars', label: 'Up & Down (2 pts)', type: 'number', multiplier: 2, default: 0 },
            { id: 'bogeys', label: 'Bogey+ (3 pts)', type: 'number', multiplier: 3, default: 0 }
        ],
        scoringMath: "lower_is_better"
    },
    "putting_369": {
        name: "3-6-9 Putting Ladder",
        desc: "Hit 3 balls from 3ft, 6ft, and 9ft. 1 pt for a make, 0 for a miss. Max score 9.",
        inputs: [
            { id: 'putts_3ft', label: 'Makes from 3ft (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'putts_6ft', label: 'Makes from 6ft (1 pt)', type: 'number', multiplier: 1, default: 0 },
            { id: 'putts_9ft', label: 'Makes from 9ft (1 pt)', type: 'number', multiplier: 1, default: 0 }
        ],
        scoringMath: "higher_is_better"
    }
};

export function initPractice() {
    populatePracticeSelect();
    listenToPractice();

    const btnAskAi = document.getElementById('btn-ask-ai');
    if (btnAskAi) btnAskAi.addEventListener('click', bindAiGenerator);

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
            let scoreVal = parseInt(UI.drillLiveTotalEl.textContent) || 0;

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
                await addDoc(collection(db, "practice_rounds"), {
                    uid: AppState.currentUser.uid,
                    playerName: AppState.currentUser.displayName || AppState.currentUser.email,
                    drillId: drillId,
                    drillName: currentDrillDefinition.name,
                    score: scoreVal,
                    data: dataPayload,
                    date: dateInput && dateInput.value ? new Date(dateInput.value) : new Date()
                });

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
            const dataStr = AppState.currentPracticeRounds.map(r =>
                `${new Date(r.date?.toDate?.() || r.date).toLocaleDateString()} - ${r.drillName}: ${r.score}`
            ).join('\n');
            window.location.href = `mailto:?subject=Golf Practice Logs&body=Here are my recent practice sessions:\n\n${encodeURIComponent(dataStr)}`;
        });
    }

    if (UI.btnExportPractice) {
        UI.btnExportPractice.addEventListener('click', () => {
            const csv = "Date,Drill,Score\n" + AppState.currentPracticeRounds.map(r =>
                `${new Date(r.date?.toDate?.() || r.date).toLocaleDateString()},${r.drillName},${r.score}`
            ).join('\n');
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
        input.value = inputDef.default || 0;
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
            total += (val * (inputDef.multiplier || 1));
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

