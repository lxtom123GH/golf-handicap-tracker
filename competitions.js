// ==========================================
// competitions.js
// Custom Competitions & Leaderboards
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, updateDoc, deleteDoc, or } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { AppState } from './state.js';
import { UI } from './ui.js';

let unsubscribeComps = null;
let unsubscribeCompRounds = null;
let activeCompId = null;

export function initCompetitions() {
    listenToCompetitions();
    bindLeaderboardSortHandlers();
}

function listenToCompetitions() {
    if (!AppState.currentUser) return;

    // Fetch Public OR Private(Invited) OR Private(Owner)
    const q = query(
        collection(db, "competitions"),
        or(
            where("visibility", "==", "public"),
            where("ownerId", "==", AppState.currentUser.uid), // Can see own private comps
            where("invitedUIDs", "array-contains", AppState.currentUser.uid)
        ),
        orderBy("createdAt", "desc")
    );

    unsubscribeComps = onSnapshot(q, (snapshot) => {
        UI.compSelect.innerHTML = '<option value="" disabled selected>-- Select a Competition --</option>';
        if (UI.ocLinkComp) {
            UI.ocLinkComp.innerHTML = '<option value="">-- No Competition Linked --</option>';
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const opt = document.createElement('option');
            opt.value = docSnap.id;
            opt.textContent = `${data.name} ${data.visibility === 'private' ? '🔒' : ''}`;

            // Store raw rules array as JSON on option
            opt.setAttribute('data-rules', JSON.stringify(data.rules || []));
            opt.setAttribute('data-name', data.name);

            UI.compSelect.appendChild(opt);

            // Populate on-course tracker dropdown if it exists
            if (UI.ocLinkComp) {
                const opt2 = opt.cloneNode(true);
                UI.ocLinkComp.appendChild(opt2);
            }
        });

        // Restore active selection if activeCompId exists
        if (activeCompId) {
            UI.compSelect.value = activeCompId;
            // Don't auto-fetch rounds if the DOM value actually matches, wait for user event
        }
    });
}

export function setActiveCompetition(compId) {
    activeCompId = compId;

    // Save locally
    AppState.activeCompId = compId;

    if (!compId) {
        UI.logCompRoundContainer.classList.add('hidden');
        AppState.currentCompData = null;
        renderCompLeaderboard();
        return;
    }

    const selectedOpt = UI.compSelect.options[UI.compSelect.selectedIndex];
    let rulesArray = [];
    try {
        rulesArray = JSON.parse(selectedOpt.getAttribute('data-rules') || "[]");
    } catch (e) { console.error("Rules parse err:", e); }

    AppState.currentCompData = {
        name: selectedOpt.getAttribute('data-name'),
        rules: rulesArray
    };

    // Build the rules desc UI
    UI.compRulesDesc.innerHTML = '<strong>Scoring Rules:</strong> ' + rulesArray.map(r => `${r.name}: ${r.pts}pt`).join(', ');

    // Reveal logging container and inject dynamic inputs
    UI.logCompRoundContainer.classList.remove('hidden');
    generateDynamicLogInputs(rulesArray);

    // Listen for rounds specific to this comp
    listenToCompRounds(compId);
}

function generateDynamicLogInputs(rulesArray) {
    const dynamicBody = document.getElementById('log-comp-dynamic');
    dynamicBody.innerHTML = '';
    rulesArray.forEach(rule => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `
            <label>${rule.name}</label>
            <div style="display:flex; align-items:center;">
                <button type="button" class="btn btn-secondary stepper-minus" style="font-size:1.5rem; padding:0 15px; border-radius:12px 0 0 12px; height:50px;">-</button>
                <input type="number" class="dynamic-rule-input" data-rulename="${rule.name}" data-rulepts="${rule.pts}" value="0" style="text-align:center; border-radius:0; height:50px; flex:1;" readonly>
                <button type="button" class="btn btn-secondary stepper-plus" style="font-size:1.5rem; padding:0 15px; border-radius:0 12px 12px 0; height:50px;">+</button>
            </div>
        `;
        dynamicBody.appendChild(div);
    });

    // Rebind steppers
    dynamicBody.querySelectorAll('.stepper-minus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const input = e.target.nextElementSibling;
            const currentObjLength = parseInt(input.value) || 0;
            if (currentObjLength > 0) input.value = currentObjLength - 1;
        });
    });
    dynamicBody.querySelectorAll('.stepper-plus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const input = e.target.previousElementSibling;
            const currentObjLength = parseInt(input.value) || 0;
            input.value = currentObjLength + 1;
        });
    });
}

function listenToCompRounds(compId) {
    if (unsubscribeCompRounds) unsubscribeCompRounds();

    const q = query(
        collection(db, "comp_rounds"),
        where("compId", "==", compId),
        orderBy("date", "desc")
    );

    unsubscribeCompRounds = onSnapshot(q, (snapshot) => {
        AppState.currentCompRounds = [];
        snapshot.forEach(docSnap => {
            AppState.currentCompRounds.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderCompLeaderboard();
        renderRecentCompRounds();
    });
}

// Complex Leaderboard Aggregation Math
function renderCompLeaderboard() {
    UI.compLeaderboardHead.innerHTML = '';
    UI.compLeaderboardTbody.innerHTML = '';

    if (!AppState.currentCompRounds.length || !AppState.currentCompData) return;

    // 1. Generate Head Row based on dynamic rules
    const trHead = document.createElement('tr');
    trHead.innerHTML = `<th>Rank</th><th style="cursor:pointer" data-sort="name">Player ↕</th><th style="cursor:pointer; background:#f0fdf4;" data-sort="pts">Pts ↕</th><th style="cursor:pointer" data-sort="rounds">Rds ↕</th>`;

    // Add columns for every rule
    AppState.currentCompData.rules.forEach(rule => {
        trHead.innerHTML += `<th style="cursor:pointer" data-sort="${rule.name}">${rule.name} ↕</th>`;
    });
    UI.compLeaderboardHead.appendChild(trHead);

    // 2. Aggregate Data
    const agg = {}; // map of uid -> { name, totalPoints, rounds, counts: { ruleName: Sum } }
    AppState.currentCompRounds.forEach(r => {
        if (!agg[r.uid]) {
            agg[r.uid] = { name: r.playerName, totalPoints: 0, rounds: 0, counts: {} };
            AppState.currentCompData.rules.forEach(rule => agg[r.uid].counts[rule.name] = 0);
        }
        agg[r.uid].totalPoints += r.totalPoints || 0;
        agg[r.uid].rounds += 1;

        // Sum the raw counts if they exist in the round data
        if (r.ruleCounts) {
            for (const ruleName in r.ruleCounts) {
                if (agg[r.uid].counts[ruleName] !== undefined) {
                    agg[r.uid].counts[ruleName] += r.ruleCounts[ruleName];
                }
            }
        }
    });

    let leaderboard = Object.values(agg);

    // Fallback sorting logic reading from UI state if available
    const sortField = window.currentCompSortField || "pts";
    const sortAsc = window.currentCompSortAsc === true;

    leaderboard.sort((a, b) => {
        let valA, valB;
        if (sortField === 'name') {
            valA = a.name.toLowerCase(); valB = b.name.toLowerCase();
        } else if (sortField === 'pts') {
            valA = a.totalPoints; valB = b.totalPoints;
        } else if (sortField === 'rounds') {
            valA = a.rounds; valB = b.rounds;
        } else {
            // Must be a ruleName
            valA = a.counts[sortField] || 0;
            valB = b.counts[sortField] || 0;
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    leaderboard.forEach((p, index) => {
        const tr = document.createElement('tr');
        if (index === 0) tr.style.fontWeight = 'bold';

        // Base cols
        let html = `
            <td>${index + 1}</td>
            <td>${p.name}</td>
            <td style="color:#16a34a; font-weight:bold;">${p.totalPoints}</td>
            <td>${p.rounds}</td>
        `;

        // Rule count cols
        AppState.currentCompData.rules.forEach(rule => {
            html += `<td>${p.counts[rule.name] || 0}</td>`;
        });

        tr.innerHTML = html;
        UI.compLeaderboardTbody.appendChild(tr);
    });
}

function renderRecentCompRounds() {
    UI.compRecentRoundsTbody.innerHTML = '';
    const uidMatches = AppState.currentUser;

    if (!AppState.currentCompRounds.length) {
        // UI.compEmptyState ??
    } else {
        AppState.currentCompRounds.forEach(round => {
            const tr = document.createElement('tr');

            let dateObj = round.date;
            if (dateObj && dateObj.toDate) dateObj = dateObj.toDate();
            else if (typeof dateObj === 'string') dateObj = new Date(dateObj);
            const dateStr = dateObj ? dateObj.toLocaleDateString() : 'Unknown';

            // Generate breakdown string
            let breakdown = '';
            if (round.ruleCounts) {
                breakdown = Object.entries(round.ruleCounts).map(([k, v]) => `${k}:${v}`).join(', ');
            }

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${round.playerName}</td>
                <td style="color:#16a34a; font-weight:bold;">${round.totalPoints}</td>
                <td style="font-size: 0.8rem; color:#64748b;">${breakdown}</td>
                <td>
                    ${(uidMatches && AppState.currentUser.uid === round.uid || window.currentUserIsAdmin) ? `<button class="btn btn-danger btn-sm del-comp-round" data-id="${round.id}">X</button>` : ''}
                </td>
            `;
            UI.compRecentRoundsTbody.appendChild(tr);
        });
    }
}

function bindLeaderboardSortHandlers() {
    // We bind using event delegation on the TH elements inside compLeaderboardHead
    UI.compLeaderboardHead.addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th) return;
        const sortField = th.getAttribute('data-sort');
        if (!sortField) return;

        if (window.currentCompSortField === sortField) {
            window.currentCompSortAsc = !window.currentCompSortAsc;
        } else {
            window.currentCompSortField = sortField;
            // Pts default desc, Name default asc, everything else default desc
            window.currentCompSortAsc = sortField === 'name' ? true : false;
        }
        renderCompLeaderboard();
    });
}

window.deleteCompRound = async function (id) {
    if (confirm("Are you sure you want to delete this round?")) {
        await deleteDoc(doc(db, "comp_rounds", id));
    }
}
