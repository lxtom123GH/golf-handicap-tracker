// ==========================================
// practice.js
// Practice Drills & Dashboard Logic
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { AppState } from './state.js';
import { UI } from './ui.js';

let unsubscribePractice = null;
let currentDrillDefinition = null;

const DRILL_TEMPLATES = {
    "bunker_game": {
        name: "Bunker Game (Par 18)",
        desc: "Play 9 bunker shots to different pins. Up & down = Par. Hole out = Birdie. 3 shots = Bogey.",
        inputs: [{ id: "score", label: "Total Score (Par 18)", type: "number", default: 18, isMainScore: true }],
        scoringMath: "lower_is_better"
    },
    // Future templates go here
};

export function initPractice() {
    populatePracticeSelect();
    listenToPractice();

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
            let mainScoreObj = currentDrillDefinition.inputs.find(i => i.isMainScore);
            let scoreVal = 0;

            currentDrillDefinition.inputs.forEach(inputDef => {
                const el = document.getElementById('drill-input-' + inputDef.id);
                if (el) {
                    const rawVal = parseInt(el.value) || 0;
                    dataPayload[inputDef.id] = rawVal;
                    if (inputDef.isMainScore) scoreVal = rawVal;
                }
            });

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                await addDoc(collection(db, "practice_rounds"), {
                    uid: AppState.currentUser.uid,
                    playerName: AppState.currentUser.displayName || AppState.currentUser.email,
                    drillId: drillId,
                    drillName: currentDrillDefinition.name,
                    score: scoreVal,
                    data: dataPayload, // Store the raw inputs layout
                    date: serverTimestamp()
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
                btn.textContent = 'Log Practice Session';
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
    descP.style.fontSize = '0.9rem';
    descP.style.color = '#64748b';
    descP.style.marginBottom = '15px';
    descP.textContent = currentDrillDefinition.desc;
    dynamicBody.appendChild(descP);

    currentDrillDefinition.inputs.forEach(inputDef => {
        const div = document.createElement('div');
        div.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = inputDef.label;
        label.htmlFor = 'drill-input-' + inputDef.id;

        const input = document.createElement('input');
        input.type = inputDef.type;
        input.id = 'drill-input-' + inputDef.id;
        input.value = inputDef.default || 0;
        input.required = true;

        div.appendChild(label);
        div.appendChild(input);
        dynamicBody.appendChild(div);
    });
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

window.deletePracRound = async function (id) {
    if (confirm("Are you sure you want to delete this practice session?")) {
        await deleteDoc(doc(db, "practice_rounds", id));
    }
}
