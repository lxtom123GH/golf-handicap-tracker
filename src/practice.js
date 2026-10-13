// ==========================================
// practice.js
// Practice Drills & Dashboard Logic
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, deleteDoc, updateDoc, getDoc, setDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { AppState, mutateList, normalizePracticeRound } from './state.js';
import { UI } from './ui.js';
import { bindPracticeCaddyUI } from './ui.js';
import { escapeHtml } from './escape.js';
import { showToast } from './modules/score-input.js';
import { localToday, parseLocalDate } from './dates.js';

let unsubscribePractice = null;
let unsubscribeAssignedDrills = null;
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
    listenToAssignedDrills();
    initCoachSelection();
    bindPracticeCaddyUI();

    // Insights analytics picker drives the "My Performance Metrics" dashboard (now on the Insights tab).
    if (UI.insightsDrillSelect) {
        UI.insightsDrillSelect.addEventListener('change', () => renderPracticeDashboard());
    }

    const dateInput = document.getElementById('drill-date');
    // The player's day, not the UTC one (F-7): valueAsDate converts via UTC, so
    // a drill logged before 10am AEST was dated a day early.
    if (dateInput) dateInput.value = localToday();

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

            // E37 review P2: counts start at 0, so "required" no longer stops a
            // stray Save from logging an empty session. Nothing entered = no save.
            if (!Object.values(dataPayload).some(v => v > 0)) {
                showToast('Enter at least one count before saving.');
                return;
            }

            const btn = UI.btnSavePractice || e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const dateInput = document.getElementById('drill-date');
                // Local midnight on the picked day — a bare new Date(str) is
                // UTC midnight, which is the previous day west of Greenwich.
                // A drill logged for today keeps the time of day, so the Last 5
                // list (date desc) orders same-day sessions newest first (E36
                // review P2); a backdated drill stays at local midnight.
                const picked = dateInput && parseLocalDate(dateInput.value);
                const finalDate = !picked ? new Date()
                    : (dateInput.value === localToday() ? new Date() : picked);

                // PRODUCT SWEEP 2026-09-10 SECOND PASS F-9: this awaited the
                // write, and an offline write never settles — so the modal
                // stayed open with the button disabled and reading "Saving…"
                // forever, no alert, no error. Same shape PR #135 applied to
                // the on-course flows: do the user-visible thing first, issue
                // the write without waiting, keep a catch for telemetry. A
                // client-minted id makes a retry idempotent instead of adding
                // a duplicate drill.
                const ref = doc(collection(db, "practice_rounds"));
                setDoc(ref, {
                    uid: AppState.currentUser.uid,
                    playerName: safePlayerName,
                    drillId: drillId,
                    drillName: currentDrillDefinition.name,
                    score: scoreVal,
                    data: dataPayload,
                    date: finalDate
                }).catch(err => console.error("Cloud Save Fail (practice):", err));

                // E37: a toast, not a pop-up to dismiss. The live listener
                // already receives the new session, so no re-subscribe.
                showToast((typeof navigator !== 'undefined' && navigator.onLine === false)
                    ? "Practice session saved on this phone — it syncs when you're online."
                    : "Practice session saved ✅");

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

    bindPracticeHistoryDelete();
}

/**
 * Delete a session from the Last 5 list (event delegation, bound once). The
 * delete is not awaited: offline it never settles, and the live listener
 * drops the row as soon as the local write lands (same pattern as F-9).
 */
export function bindPracticeHistoryDelete() {
    const tbody = UI.practiceRecentTbody;
    if (!tbody || tbody.dataset.bound === '1') return;
    tbody.dataset.bound = '1';
    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest ? e.target.closest('.del-prac-round') : null;
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        if (!id || !confirm("Delete this practice session?")) return;
        deleteDoc(doc(db, "practice_rounds", id))
            .catch(err => console.error("Failed to delete practice session", err));
    });
}

function populatePracticeSelect() {
    // Log-form drill picker (Practice tab) and the Insights analytics picker share the same drill list.
    for (const select of [UI.practiceSelect, UI.insightsDrillSelect]) {
        if (!select) continue;
        select.innerHTML = '<option value="" disabled selected>-- Select a Drill --</option>';
        for (const [key, drill] of Object.entries(DRILL_TEMPLATES)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = drill.name;
            select.appendChild(opt);
        }
    }
}

function generatePracticeForm() {
    const dynamicBody = document.getElementById('practice-dynamic-inputs');
    if (!dynamicBody || !currentDrillDefinition) return;

    dynamicBody.innerHTML = '';

    const pfTitle = document.getElementById('pf-title');
    const pfDesc = document.getElementById('pf-desc');
    if (pfTitle) pfTitle.textContent = currentDrillDefinition.name;
    if (pfDesc) pfDesc.textContent = currentDrillDefinition.desc;

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
        // E37: every count starts at its template default (0 when the
        // template has none), so the golfer only touches the counts that
        // weren't zero instead of typing "0" into "Missed (0 pts)".
        input.value = String(inputDef.default ?? 0);
        // iOS undoes a select() made inside the focus tap; defer it a tick.
        input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
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

/**
 * BL-3.06 — student-side read path for coach-assigned drills
 * (users/{uid}/assignedDrills, written by coach.js). The student may only
 * flip `completed` — enforced by rules and mirrored here.
 */
function listenToAssignedDrills() {
    if (!AppState.currentUser) return;
    if (unsubscribeAssignedDrills) unsubscribeAssignedDrills();

    const section = document.getElementById('assigned-drills-section');
    const list = document.getElementById('assigned-drills-list');
    if (!section || !list) return;

    const q = query(
        collection(db, 'users', AppState.currentUser.uid, 'assignedDrills'),
        orderBy('assignedAt', 'desc')
    );

    unsubscribeAssignedDrills = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = '';
            section.classList.add('hidden');
            return;
        }
        list.innerHTML = '';
        snapshot.forEach(docSnap => {
            const d = docSnap.data();
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:12px; align-items:flex-start; padding:10px 0; border-bottom:1px solid #f1f5f9;';
            const when = d.assignedAt?.toDate ? d.assignedAt.toDate().toLocaleDateString() : '';
            row.innerHTML = `
                <input type="checkbox" ${d.completed ? 'checked' : ''} aria-label="Mark drill completed"
                    style="width:22px; height:22px; margin-top:2px; accent-color:#10b981;">
                <div style="flex:1; ${d.completed ? 'opacity:0.55;' : ''}">
                    <div style="font-weight:700; ${d.completed ? 'text-decoration:line-through;' : ''}">${escapeHtml(d.drillName || 'Drill')}</div>
                    ${d.notes ? `<div style="font-size:0.85rem; color:#475569; margin-top:2px;">${escapeHtml(d.notes)}</div>` : ''}
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">Assigned ${escapeHtml(when)}</div>
                </div>`;
            row.querySelector('input').addEventListener('change', async (e) => {
                try {
                    // completedAt powers the coach's before/after drill-impact
                    // comparison; cleared when unticked.
                    await updateDoc(doc(db, 'users', AppState.currentUser.uid, 'assignedDrills', docSnap.id),
                        { completed: e.target.checked, completedAt: e.target.checked ? serverTimestamp() : null });
                } catch (err) {
                    console.error('[AssignedDrills] toggle failed:', err);
                    e.target.checked = !e.target.checked;
                }
            });
            list.appendChild(row);
        });
        section.classList.remove('hidden');
    }, (err) => {
        console.error('[AssignedDrills] listener failed:', err);
        section.classList.add('hidden');
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
        mutateList('currentPracticeRounds', list => {
            list.length = 0;
            snapshot.forEach(docSnap =>
                list.push(normalizePracticeRound({ id: docSnap.id, ...docSnap.data() }))
            );
        });
        renderPracticeDashboard();
        renderRecentPractice();
    });
}

function renderPracticeDashboard() {
    if (!UI.practiceDashboardResults) return;
    UI.practiceDashboardResults.innerHTML = '';

    const viewDrillId = UI.insightsDrillSelect ? UI.insightsDrillSelect.value : null;

    if (!AppState.currentPracticeRounds.length) {
        UI.practiceDashboardResults.innerHTML = '<p class="empty-text">No practice sessions recorded yet. Choose a drill on Practice, then save a session.</p>';
        return;
    }

    if (!viewDrillId) {
        UI.practiceDashboardResults.innerHTML = '<p class="empty-text">Select a specific drill from the dropdown above to view personal high scores and averages.</p>';
        return;
    }

    const filteredRecords = AppState.currentPracticeRounds.filter(r => r.drillId === viewDrillId);

    if (!filteredRecords.length) {
        UI.practiceDashboardResults.innerHTML = `<p class="empty-text">No records logged for <strong>${DRILL_TEMPLATES[viewDrillId].name}</strong> yet. Choose this drill on Practice, then save a session.</p>`;
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

/** How many sessions the Practice tab lists; the full stats live on Insights. */
const RECENT_PRACTICE_LIMIT = 5;

/**
 * The Last 5 list on Practice (E36). Shows the table or the empty line, never
 * both: the table container used to be hard-coded display:none, so a golfer
 * who had just saved a drill was told "No practice sessions recorded yet".
 */
export function renderRecentPractice() {
    if (!UI.practiceRecentTbody) return;
    UI.practiceRecentTbody.innerHTML = '';

    const me = AppState.currentUser && AppState.currentUser.uid;
    const rounds = (AppState.currentPracticeRounds || []).filter(r => me && r.uid === me);
    const empty = document.getElementById('practice-empty-state');
    const table = document.getElementById('practice-table-container');
    if (empty) empty.classList.toggle('hidden', rounds.length > 0);
    if (table) table.classList.toggle('hidden', rounds.length === 0);
    if (!rounds.length) return;

    const uidMatches = AppState.currentUser;

    rounds.slice(0, RECENT_PRACTICE_LIMIT).forEach(round => {
        const tr = document.createElement('tr');

        let dateObj = round.date;
        if (dateObj && dateObj.toDate) dateObj = dateObj.toDate();
        else if (typeof dateObj === 'string') dateObj = new Date(dateObj);
        const dateStr = dateObj ? dateObj.toLocaleDateString() : 'Unknown';

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${escapeHtml(round.drillName)}</strong></td>
            <td style="color:var(--primary-color); font-weight:bold; font-size:1.2rem;">${escapeHtml(round.score)}</td>
            <td>
                ${(uidMatches && AppState.currentUser.uid === round.uid) ? `<button class="btn btn-danger btn-sm del-prac-round practice-del-btn" aria-label="Delete practice session" data-id="${escapeHtml(round.id)}">✕</button>` : ''}
            </td>
        `;
        UI.practiceRecentTbody.appendChild(tr);
    });
}

async function initCoachSelection() {
    const coachSelect = document.getElementById('player-coach-select');
    const saveBtn = document.getElementById('btn-save-coach');
    if (!coachSelect || !AppState.currentUser) return;

    // The dropdown is single-select, but linkage is the multi-coach coaches[]
    // array. Track the coach currently shown so "No Coach" can remove just it.
    let shownCoachUid = '';

    // Populate all coaches
    try {
        // BL-DD-05: read coaches from the public profiles projection (isCoach +
        // displayName mirrored there), not the locked-down users collection.
        const coachQuery = query(collection(db, 'profiles'), where('isCoach', '==', true));
        const snap = await getDocs(coachQuery);

        // Keep existing placeholder
        coachSelect.innerHTML = '<option value="">-- No Coach Selected --</option>';

        snap.forEach(d => {
            const data = d.data();
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = data.displayName || d.id;
            coachSelect.appendChild(opt);
        });

        // Set current selection
        const userRef = doc(db, 'users', AppState.currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            const userData = userDoc.data();
            shownCoachUid = (userData.coaches || [])[0] || '';
            coachSelect.value = shownCoachUid;
        }
    } catch (e) {
        console.error("Coach init error:", e);
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const selectedCoachId = coachSelect.value;
            try {
                const userRef = doc(db, 'users', AppState.currentUser.uid);
                if (selectedCoachId) {
                    // Add the picked coach to the multi-coach array (idempotent).
                    await updateDoc(userRef, { coaches: arrayUnion(selectedCoachId) });
                    shownCoachUid = selectedCoachId;
                } else if (shownCoachUid) {
                    // "No Coach" selected — unlink only the coach this dropdown was showing.
                    await updateDoc(userRef, { coaches: arrayRemove(shownCoachUid) });
                    shownCoachUid = '';
                }
                alert("Coach updated successfully!");
            } catch (err) {
                console.error("Save coach error:", err);
                alert("Failed to update coach.");
            }
        });
    }
}

