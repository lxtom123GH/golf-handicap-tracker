// ==========================================
// competitions.js
// Custom Competitions & Leaderboards
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, updateDoc, deleteDoc, or } from "firebase/firestore";
import { AppState } from './state.js';
import { UI } from './ui.js';
import { escapeHtml } from './escape.js';
import { parseLocalDate } from './dates.js';

let unsubscribeComps = null;
let unsubscribeCompRounds = null;
let activeCompId = null;
// BL-4.12: snapshot cache + archive visibility, so the "Show Archived" toggle
// can rebuild the selects without another Firestore round-trip.
let _compDocs = [];
let _showArchived = false;

export function initCompetitions() {
    listenToCompetitions();
    bindLeaderboardSortHandlers();
    bindCompetitionCreation();
    bindCompetitionLogging();
    populateRegularsPool();
    bindCompRoundDelete();
    bindArchiveControls();

    if (UI.compSelect) {
        UI.compSelect.addEventListener('change', (e) => {
            setActiveCompetition(e.target.value);
        });
    }
}

// ==========================================
// BL-4.12: archive / delete-forever (creator only)
// ==========================================
function bindArchiveControls() {
    const toggleBtn = document.getElementById('btn-toggle-archived');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            _showArchived = !_showArchived;
            toggleBtn.textContent = _showArchived ? '📦 Hide Archived' : '📦 Show Archived';
            rebuildCompSelects();
        });
    }

    const archiveBtn = document.getElementById('btn-archive-comp');
    if (archiveBtn) {
        archiveBtn.addEventListener('click', async () => {
            const comp = _compDocs.find(c => c.id === activeCompId);
            if (!comp) return;
            try {
                await updateDoc(doc(db, 'competitions', comp.id), { archived: !comp.archived });
            } catch (e) {
                console.error('[Comps] archive failed:', e);
                alert('Could not update the competition.');
            }
        });
    }

    // Delete Forever: type-the-name-to-confirm modal, only offered once archived.
    const modal = document.getElementById('delete-comp-modal');
    const nameEl = document.getElementById('delete-comp-modal-name');
    const input = document.getElementById('delete-comp-confirm-input');
    const confirmBtn = document.getElementById('delete-comp-confirm-btn');
    const cancelBtn = document.getElementById('delete-comp-cancel-btn');
    const deleteBtn = document.getElementById('btn-delete-comp');
    if (!modal || !deleteBtn || !confirmBtn) return;

    deleteBtn.addEventListener('click', () => {
        const comp = _compDocs.find(c => c.id === activeCompId);
        if (!comp) return;
        nameEl.textContent = comp.name || '';
        input.value = '';
        confirmBtn.disabled = true;
        modal.classList.remove('hidden');
    });
    cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
    input.addEventListener('input', () => {
        const comp = _compDocs.find(c => c.id === activeCompId);
        confirmBtn.disabled = !comp || input.value.trim() !== (comp.name || '');
    });
    confirmBtn.addEventListener('click', async () => {
        const comp = _compDocs.find(c => c.id === activeCompId);
        if (!comp || input.value.trim() !== (comp.name || '')) return;
        confirmBtn.disabled = true;
        try {
            // Honour the modal's promise: remove the comp's result rows too.
            // (Rules allow the comp owner to delete rows carrying its compId.)
            const roundsSnap = await getDocs(query(collection(db, 'comp_rounds'), where('compId', '==', comp.id)));
            await Promise.all(roundsSnap.docs.map(d => deleteDoc(d.ref)));
            await deleteDoc(doc(db, 'competitions', comp.id));
            modal.classList.add('hidden');
            UI.compSelect.value = '';
            setActiveCompetition(null);
        } catch (e) {
            console.error('[Comps] delete failed:', e);
            alert('Could not delete the competition.');
            confirmBtn.disabled = false;
        }
    });
}

/** Show/refresh the creator-only archive/delete controls for the active comp. */
function syncCreatorActions() {
    const actions = document.getElementById('comp-creator-actions');
    const archiveBtn = document.getElementById('btn-archive-comp');
    const deleteBtn = document.getElementById('btn-delete-comp');
    if (!actions) return;
    const comp = _compDocs.find(c => c.id === activeCompId);
    const isCreator = comp && AppState.currentUser &&
        (comp.ownerId === AppState.currentUser.uid || window.currentUserIsAdmin);
    actions.classList.toggle('hidden', !isCreator);
    if (!isCreator) return;
    if (archiveBtn) archiveBtn.textContent = comp.archived ? '📦 Unarchive Competition' : '📦 Archive Competition';
    // Deletion is deliberately two-step: archive first, then Delete Forever.
    if (deleteBtn) deleteBtn.classList.toggle('hidden', !comp.archived);
}

function bindCompRoundDelete() {
    if (!UI.compRecentRoundsTbody) return;
    UI.compRecentRoundsTbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.del-comp-round');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm('Delete this competition round?')) return;
        try {
            await deleteDoc(doc(db, 'comp_rounds', id));
        } catch (err) {
            console.error('Error deleting comp round:', err);
            alert('Failed to delete round.');
        }
    });
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
        _compDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        rebuildCompSelects();
        syncCreatorActions();
    });
}

/** Rebuild the three comp dropdowns from the cached snapshot, honouring the
 *  archive filter (BL-4.12). */
function rebuildCompSelects() {
    if (!UI.compSelect) return;
    UI.compSelect.innerHTML = '<option value="" disabled selected>-- Select a Competition --</option>';
    if (UI.ocLinkComp) {
        UI.ocLinkComp.innerHTML = '<option value="">-- No Competition Linked --</option>';
    }
    const tmplSelect = document.getElementById('comp-template-select');
    if (tmplSelect) tmplSelect.innerHTML = '<option value="">-- Build From Scratch --</option>';

    _compDocs.forEach(data => {
        if (data.archived && !_showArchived) return;

        const opt = document.createElement('option');
        opt.value = data.id;
        opt.textContent = `${data.archived ? '📦 ' : ''}${data.name} ${data.visibility === 'private' ? '🔒' : ''}`;

        // Store raw rules array as JSON on option
        opt.setAttribute('data-rules', JSON.stringify(data.rules || []));
        opt.setAttribute('data-name', data.name);
        // Task 1: Store regulars
        opt.setAttribute('data-regulars', JSON.stringify(data.defaultPlayers || []));
        // Store starting points for scoring sync
        opt.setAttribute('data-sp', JSON.stringify(data.startingPoints || {}));

        UI.compSelect.appendChild(opt);

        // On-course link dropdown: never offer archived comps for NEW rounds.
        if (UI.ocLinkComp && !data.archived) {
            UI.ocLinkComp.appendChild(opt.cloneNode(true));
        }

        // Template select (archived comps still make fine templates)
        if (tmplSelect) {
            const opt3 = document.createElement('option');
            opt3.value = data.id;
            opt3.textContent = data.name;
            opt3.setAttribute('data-rules', JSON.stringify(data.rules || []));
            tmplSelect.appendChild(opt3);
        }
    });

    // Restore active selection if it still exists in the filtered list
    if (activeCompId) {
        UI.compSelect.value = activeCompId;
        // Don't auto-fetch rounds if the DOM value actually matches, wait for user event
    }
}

export function setActiveCompetition(compId) {
    activeCompId = compId;
    AppState.activeCompId = compId;

    // (BL-4.13) #log-comp-round-container never existed — the intended element
    // is the card wrapping #log-comp-round-form, already cached at ui.js. The
    // dead lookup meant this card never hid/showed with comp selection.
    const compContainer = UI.logCompRoundContainer;
    const activeCompView = document.getElementById('active-comp-view');
    const noCompEmpty = document.getElementById('no-comp-empty');

    if (!compId || !UI.compSelect || UI.compSelect.selectedIndex === -1) {
        if (compContainer) compContainer.classList.add('hidden');
        if (activeCompView) activeCompView.classList.add('hidden');
        if (noCompEmpty) noCompEmpty.classList.remove('hidden');
        syncCreatorActions(); // hides archive/delete when nothing is active
        return;
    }

    const selectedOpt = UI.compSelect.options[UI.compSelect.selectedIndex];
    // Prevent crash if placeholder is selected
    if (selectedOpt.disabled) {
        if (compContainer) compContainer.classList.add('hidden');
        if (activeCompView) activeCompView.classList.add('hidden');
        if (noCompEmpty) noCompEmpty.classList.remove('hidden');
        return;
    }

    const rulesArray = JSON.parse(selectedOpt.getAttribute('data-rules') || "[]");
    const startingPoints = JSON.parse(selectedOpt.getAttribute('data-sp') || "{}");

    // PRODUCT SWEEP 2026-09-10 SECOND PASS F-7: this is the ONLY assignment to
    // currentCompData, and it was built from three data-* attributes on the
    // <option>. Three separate places have now had to go round it for fields
    // it never carried; ownerId and invitedUIDs are the two the authorization
    // guard needs, so every consumer sees one shape.
    const compDoc = _compDocs.find(c => c.id === activeCompId) || {};
    AppState.currentCompData = {
        id: activeCompId,
        name: selectedOpt.getAttribute('data-name'),
        rules: rulesArray,
        startingPoints: startingPoints,
        ownerId: compDoc.ownerId ?? null,
        invitedUIDs: Array.isArray(compDoc.invitedUIDs) ? compDoc.invitedUIDs : []
    };

    // UI Sync: Update Banner Name and Rules Summary
    const nameEl = document.getElementById('active-comp-name');
    const rulesSummaryEl = document.getElementById('active-comp-rules-summary');
    if (nameEl) nameEl.textContent = AppState.currentCompData.name;
    if (rulesSummaryEl) {
        rulesSummaryEl.innerHTML = ''; // Clear safely
        if (rulesArray.length > 0) {
            rulesArray.forEach((r, idx) => {
                const strong = document.createElement('strong');
                strong.textContent = r.name;
                rulesSummaryEl.appendChild(strong);

                const textNode = document.createTextNode(`: ${r.pts} pts${idx < rulesArray.length - 1 ? ' | ' : ''}`);
                rulesSummaryEl.appendChild(textNode);
            });
        } else {
            rulesSummaryEl.textContent = "No custom rules.";
        }
    }

    const sp = startingPoints || {};
    const parts = [];
    if (sp.round?.enabled) parts.push(`+${sp.round.value||0}/round`);
    if (sp.hole?.enabled)  parts.push(`+${sp.hole.value||0}/hole`);
    const spEl = document.getElementById('active-comp-sp-summary');
    if (spEl) spEl.textContent = parts.length ? `Starting points: ${parts.join(' · ')}` : '';

    if (activeCompView) activeCompView.classList.remove('hidden');
    if (noCompEmpty) noCompEmpty.classList.add('hidden');

    if (compContainer) {
        compContainer.classList.remove('hidden');
        if (UI.logCompRoundForm) {
            UI.logCompRoundForm.reset();
            // Clear dynamic inputs specifically if needed
            const dynamicBody = document.getElementById('comp-dynamic-inputs');
            if (dynamicBody) dynamicBody.innerHTML = '';
            generateDynamicLogInputs(rulesArray);
        }
    }

    // BL-4.12: reveal archive/delete for the creator.
    syncCreatorActions();

    // Ensure this function exists in the file
    if (typeof listenToCompRounds === 'function') listenToCompRounds(compId);
}

function generateDynamicLogInputs(rulesArray) {
    const dynamicBody = document.getElementById('comp-dynamic-inputs');
    if (!dynamicBody) return;
    dynamicBody.innerHTML = '';
    rulesArray.forEach(rule => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `
            <label>${escapeHtml(rule.name)}</label>
            <div style="display:flex; align-items:center;">
                <button type="button" class="btn btn-secondary stepper-minus" aria-label="Decrease" style="font-size:1.5rem; padding:0 15px; border-radius:12px 0 0 12px; height:50px;">-</button>
                <input type="number" class="dynamic-rule-input" data-rulename="${escapeHtml(rule.name)}" data-rulepts="${rule.pts}" value="0" style="text-align:center; border-radius:0; height:50px; flex:1;" readonly>
                <button type="button" class="btn btn-secondary stepper-plus" aria-label="Increase" style="font-size:1.5rem; padding:0 15px; border-radius:0 12px 12px 0; height:50px;">+</button>
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
        trHead.innerHTML += `<th style="cursor:pointer" data-sort="${escapeHtml(rule.name)}">${escapeHtml(rule.name)} ↕</th>`;
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
            <td>${escapeHtml(p.name)}</td>
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
        const emptyEl = document.getElementById('comp-empty-state');
        if (emptyEl) emptyEl.classList.remove('hidden');
    } else {
        const emptyEl = document.getElementById('comp-empty-state');
        if (emptyEl) emptyEl.classList.add('hidden');
        AppState.currentCompRounds.forEach(round => {
            const tr = document.createElement('tr');

            let dateObj = round.date;
            if (dateObj && dateObj.toDate) dateObj = dateObj.toDate();
            else if (typeof dateObj === 'string') dateObj = new Date(dateObj);
            const dateStr = dateObj ? dateObj.toLocaleDateString() : 'Unknown';

            // Generate breakdown string
            let breakdown = '';
            if (round.ruleCounts) {
                breakdown = Object.entries(round.ruleCounts).map(([k, v]) => `${escapeHtml(k)}:${v}`).join(', ');
            }

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${escapeHtml(round.playerName)}</td>
                <td style="color:#16a34a; font-weight:bold;">${round.totalPoints}</td>
                <td style="font-size: 0.8rem; color:#64748b;">${breakdown}</td>
                <td>
                    ${(uidMatches && AppState.currentUser.uid === round.uid || window.currentUserIsAdmin) ? `<button class="btn btn-danger btn-sm del-comp-round" aria-label="Delete Competition Round" data-id="${round.id}">X</button>` : ''}
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


function bindCompetitionCreation() {
    let rules = [];
    const rulesListEl = document.getElementById('comp-rules-list');
    const addRuleBtn = document.getElementById('btn-add-rule');

    // Toggle form
    const btnShowCreateComp = document.getElementById('btn-show-create-comp');
    if (btnShowCreateComp) {
        btnShowCreateComp.addEventListener('click', () => {
            UI.createCompContainer.classList.remove('hidden');
            btnShowCreateComp.classList.add('hidden');
            populateRegularsPool(); // Ensure fresh list
        });
    }

    if (UI.btnCancelComp) {
        UI.btnCancelComp.addEventListener('click', () => {
            UI.createCompContainer.classList.add('hidden');
            if (btnShowCreateComp) btnShowCreateComp.classList.remove('hidden');
            UI.createCompForm.reset();
            rules = [];
            renderRulesList();
        });
    }

    // BL-3.07: Private comps need invitees — show the invite picker only for
    // visibility=private and write invitedUIDs on create (the read rule and
    // the array-contains query both depend on it).
    document.querySelectorAll('input[name="comp-visibility"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const container = document.getElementById('comp-invite-container');
            if (!container) return;
            const isPrivate = document.querySelector('input[name="comp-visibility"]:checked')?.value === 'private';
            container.classList.toggle('hidden', !isPrivate);
            if (isPrivate) populateInvitePool();
        });
    });

    // Config Template Selection
    const tmplSelect = document.getElementById('comp-template-select');
    if (tmplSelect) {
        tmplSelect.addEventListener('change', (e) => {
            if (!e.target.value) {
                rules = [];
            } else {
                const sel = tmplSelect.options[tmplSelect.selectedIndex];
                rules = JSON.parse(sel.getAttribute('data-rules') || "[]");
            }
            renderRulesList();
        });
    }

    // Add Rule
    if (addRuleBtn) {
        addRuleBtn.addEventListener('click', () => {
            const name = document.getElementById('new-rule-name').value.trim();
            const pts = parseFloat(document.getElementById('new-rule-points').value) || 0;
            if (!name) return;

            rules.push({ name, pts });
            document.getElementById('new-rule-name').value = '';
            document.getElementById('new-rule-points').value = '1';
            renderRulesList();
        });
    }

    function renderRulesList() {
        if (!rulesListEl) return;
        if (rules.length === 0) {
            rulesListEl.innerHTML = '<div class="empty-state" style="padding: 10px; font-size: 0.9rem;">No custom rules added yet.</div>';
            return;
        }
        rulesListEl.innerHTML = rules.map((r, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:8px 12px; border-radius:6px; border:1px solid #e2e8f0;">
                <span><strong>${escapeHtml(r.name)}</strong>: ${r.pts} pts</span>
                <button type="button" class="btn-text del-rule" aria-label="Delete Rule" data-index="${i}" style="color:#ef4444; padding:0;">✕</button>
            </div>
        `).join('');

        rulesListEl.querySelectorAll('.del-rule').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-index'));
                rules.splice(idx, 1);
                renderRulesList();
            });
        });
    }

    // Submit Comp
    if (UI.createCompForm) {
        // Dynamic Save Button Validation
        const compNameInput = document.getElementById('comp-name');
        const submitBtn = UI.createCompForm.querySelector('button[type="submit"]');
        if (compNameInput && submitBtn) {
            submitBtn.disabled = compNameInput.value.trim() === '';
            compNameInput.addEventListener('input', () => {
                submitBtn.disabled = compNameInput.value.trim() === '';
            });
        }

        UI.createCompForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('comp-name').value.trim();
            if (!name) {
                alert("Competition Name is required.");
                return;
            }

            const spRoundEnable = document.getElementById('sp-round-enable').checked;
            const spHoleEnable = document.getElementById('sp-hole-enable').checked;

            const visibility = document.querySelector('input[name="comp-visibility"]:checked')?.value || 'public';
            const defaultPlayers = Array.from(UI.compRegularsList.querySelectorAll('input:checked')).map(i => ({
                uid: i.value,
                name: i.getAttribute('data-name')
            }));

            // BL-3.07: for private comps, invited = explicit picks ∪ regulars ∪
            // owner — a private comp its own regulars can't see would be broken.
            let invitedUIDs = [];
            if (visibility === 'private') {
                const picked = Array.from(document.querySelectorAll('#comp-invite-list input:checked')).map(i => i.value);
                invitedUIDs = [...new Set([...picked, ...defaultPlayers.map(p => p.uid), AppState.currentUser.uid])];
            }

            const payload = {
                name,
                ownerId: AppState.currentUser.uid,
                createdAt: serverTimestamp(),
                visibility,
                invitedUIDs,
                rules: rules,
                defaultPlayers,
                startingPoints: {
                    round: {
                        enabled: spRoundEnable,
                        type: document.querySelector('input[name="sp-round-type"]:checked')?.value || 'fixed',
                        value: parseFloat(document.getElementById('sp-round-value').value) || 0
                    },
                    hole: {
                        enabled: spHoleEnable,
                        type: document.querySelector('input[name="sp-hole-type"]:checked')?.value || 'fixed',
                        value: parseFloat(document.getElementById('sp-hole-value').value) || 0
                    }
                }
            };

            try {
                const docRef = await addDoc(collection(db, "competitions"), payload);
                UI.createCompForm.reset();
                rules = [];
                renderRulesList();
                UI.createCompContainer.classList.add('hidden');
                if (btnShowCreateComp) btnShowCreateComp.classList.remove('hidden');

                // Switch to the newly created comp
                UI.compSelect.value = docRef.id;
                setActiveCompetition(docRef.id);
            } catch (err) {
                console.error("Error creating competition:", err);
                alert("Failed to create competition. Check console for details.");
            }
        });
    }

    // Toggle starting point configs
    const spRoundEnable = document.getElementById('sp-round-enable');
    const spHoleEnable = document.getElementById('sp-hole-enable');
    if (spRoundEnable) {
        spRoundEnable.addEventListener('change', (e) => {
            document.getElementById('sp-round-config').classList.toggle('hidden', !e.target.checked);
        });
    }
    if (spHoleEnable) {
        spHoleEnable.addEventListener('change', (e) => {
            document.getElementById('sp-hole-config').classList.toggle('hidden', !e.target.checked);
        });
    }
}

/**
 * F-26: mirrors the comp_rounds create rule's third-party clause — the owner
 * (or an admin) may file anyone's row, and any participant may file the row of
 * another participant of the same competition. Kept beside the call site so it
 * stays in step with firestore.rules; the rule remains the authority.
 * @param {string} targetUid the player whose card is being entered
 */
export function canLogForOthers(targetUid) {
    // PRODUCT SWEEP 2026-09-10 SECOND PASS F-7: this read ownerId and
    // invitedUIDs off AppState.currentCompData, which has never carried
    // either — so canLogForOthers was FALSE for everyone except an admin, and
    // the competition owner could not enter a score for a player in their own
    // competition. That is precisely the case firestore.rules:398-417 was
    // widened to permit in the same PR. Before #136 the write went through.
    //
    // _compDocs holds the whole Firestore document (:153), which is where the
    // fields actually live and what every other check in this file already
    // uses (:51, :72, :81, :85, :111). currentCompData now carries them too,
    // and is the fallback for a caller that has one and no live snapshot.
    const comp = _compDocs.find(c => c.id === activeCompId) || AppState.currentCompData;
    const myUid = AppState.currentUser?.uid;
    if (!comp || !myUid) return false;
    if (window.currentUserIsAdmin || comp.ownerId === myUid) return true;
    const inComp = (uid) => uid === comp.ownerId || (comp.invitedUIDs || []).includes(uid);
    return inComp(myUid) && inComp(targetUid);
}

/** Test seam: the competition snapshot this module is holding. */
export function _setCompDocsForTest(docs, active) {
    _compDocs = docs;
    activeCompId = active;
}

function bindCompetitionLogging() {
    if (!UI.logCompRoundForm) return;

    UI.logCompRoundForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeCompId || !AppState.currentCompData) return;

        const playerSelect = document.getElementById('comp-player-select');
        const targetUid = playerSelect.value;
        const playerName = playerSelect.options[playerSelect.selectedIndex].text;
        const score = parseInt(document.getElementById('comp-score').value);
        const date = document.getElementById('comp-date').value;
        const holesPlayed = parseInt(document.getElementById('comp-holes')?.value, 10) === 9 ? 9 : 18;

        if (!targetUid || isNaN(score)) return;

        // F-26 (product sweep 2026-09-10): the dropdown above lists every
        // approved player in the directory, but the comp_rounds create rule
        // only lets you file someone else's card when you are both in this
        // competition (or you own it / are an admin). Say so here instead of
        // letting the user fill in the whole card and then meet a bare
        // "Failed to log round." from the catch below.
        if (targetUid !== AppState.currentUser?.uid && !canLogForOthers(targetUid)) {
            alert('You can only log a round for a player who is in this competition. '
                + 'Invite them to the competition first, or ask its owner to enter the score.');
            return;
        }

        // Calculate dynamic rule points
        let totalPoints = 0;
        const ruleCounts = {};
        document.querySelectorAll('.dynamic-rule-input').forEach(input => {
            const count = parseInt(input.value) || 0;
            const ptsPer = parseFloat(input.getAttribute('data-rulepts')) || 0;
            const ruleName = input.getAttribute('data-rulename');

            ruleCounts[ruleName] = count;
            totalPoints += (count * ptsPer);
        });

        // Add starting points if enabled
        const sp = AppState.currentCompData.startingPoints || {};
        if (sp.round?.enabled) {
            totalPoints += sp.round.value || 0;
        }
        if (sp.hole?.enabled) {
            // PRODUCT SWEEP 2026-09-10 SECOND PASS F-8: this was `* 18`, so a
            // nine-hole competition round was credited with twice the per-hole
            // allowance it should get. The same "18 is not always 18" class
            // PR #134 swept through whs.js and did not follow into this file.
            totalPoints += (sp.hole.value || 0) * holesPlayed;
        }

        const payload = {
            compId: activeCompId,
            uid: targetUid,
            playerName: playerName,
            totalPoints: totalPoints,
            score: score,
            holesPlayed,
            // F-7 (first pass): a bare new Date('YYYY-MM-DD') is UTC midnight,
            // which renders as the PREVIOUS day west of Greenwich. This was
            // the one structural site the dates sweep missed.
            date: parseLocalDate(date) || new Date(),
            ruleCounts: ruleCounts,
            createdAt: serverTimestamp()
        };

        try {
            await addDoc(collection(db, "comp_rounds"), payload);
            UI.logCompRoundForm.reset();
            // Reset dynamic inputs to 0
            document.querySelectorAll('.dynamic-rule-input').forEach(i => i.value = 0);
        } catch (err) {
            console.error("Error logging round:", err);
            alert("Failed to log round.");
        }
    });

    // Populate player select (BL-DD-05: read the public profiles projection, not
    // the locked-down users collection — displayName/isApproved are mirrored there)
    getDocs(collection(db, 'profiles')).then(snap => {
        const select = document.getElementById('comp-player-select');
        if (!select) return;
        snap.forEach(d => {
            const data = d.data();
            if (data.isApproved) {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = data.displayName || d.id;
                if (d.id === AppState.currentUser?.uid) opt.selected = true;
                select.appendChild(opt);
            }
        });
    });
}

/**
 * BL-3.07 — fill #comp-invite-list with approved players (self excluded; the
 * owner is added to invitedUIDs automatically on create).
 */
function populateInvitePool() {
    const listEl = document.getElementById('comp-invite-list');
    if (!listEl) return;
    getDocs(collection(db, 'profiles')).then(snap => {  // BL-DD-05: public projection
        listEl.innerHTML = '';
        snap.forEach(d => {
            const data = d.data();
            if (data.isApproved && d.id !== AppState.currentUser?.uid) {
                const label = document.createElement('label');
                label.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:0.9rem; cursor:pointer;';
                label.innerHTML = `
                    <input type="checkbox" value="${escapeHtml(d.id)}" data-name="${escapeHtml(data.displayName || d.id)}">
                    <span>${escapeHtml(data.displayName || d.id)}</span>
                `;
                listEl.appendChild(label);
            }
        });
        if (listEl.innerHTML === '') {
            listEl.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem;">No other approved players to invite yet.</p>';
        }
    }).catch(err => {
        console.error('[Competitions] Failed to load invite pool:', err);
        listEl.innerHTML = '<p style="color:#ef4444; font-size:0.85rem;">Failed to load players.</p>';
    });
}

function populateRegularsPool() {
    if (!UI.compRegularsList) return;
    getDocs(collection(db, 'profiles')).then(snap => {  // BL-DD-05: public projection
        UI.compRegularsList.innerHTML = '';
        snap.forEach(d => {
            const data = d.data();
            if (data.isApproved) {
                const label = document.createElement('label');
                label.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:0.9rem; cursor:pointer;';
                label.innerHTML = `
                    <input type="checkbox" value="${escapeHtml(d.id)}" data-name="${escapeHtml(data.displayName || d.id)}">
                    <span>${escapeHtml(data.displayName || d.id)}</span>
                `;
                UI.compRegularsList.appendChild(label);
            }
        });
        if (UI.compRegularsList.innerHTML === '') {
            UI.compRegularsList.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem;">No approved players found.</p>';
        }
    }).catch(err => {
        console.error('[Competitions] Failed to load regulars pool:', err);
        if (UI.compRegularsList) {
            UI.compRegularsList.innerHTML = '<p style="color:#ef4444; font-size:0.85rem;">Failed to load players.</p>';
        }
    });
}

