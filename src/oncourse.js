// ==========================================
// oncourse.js
// Live Round Tracking & Shot UI Engine
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc, doc, updateDoc, getDoc, getDocs, writeBatch, deleteDoc } from "firebase/firestore";
import { AppState } from './state.js';
import { UI } from './ui.js';
import { COURSE_DATA, KEPERRA_GPS } from './course-data.js';

import { initNotifications } from './notifications.js';
import { calculateDailyHandicap, calculateHoleStableford, convertStablefordToAGS } from './whs.js';
import { httpsCallable } from "firebase/functions";
import { functions } from './firebase-config.js';

export function initOnCourse() {
    bindSetupToggles();
    bindCourseSelect();
    bindAddPlayer();
    bindShotWizard();
    bindStartRound();
    bindGlobalRoundActions();
    bindReviewModal();
    bindPenaltyModal();
    bindReviewActions();
    bindAdvancedTools();
    bindOcSubNav();
    bindCompQuickAdd();
    bindHoleNav();

    // Bind the exit-round bar button
    const btnExit = document.getElementById('btn-oc-exit');
    if (btnExit) {
        btnExit.addEventListener('click', () => {
            if (confirm("Are you sure you want to exit this round? All unsaved data will be cleared.")) {
                endRoundCleanup();
            }
        });
    }

    // Default init
    if (typeof updateModeVisibility === 'function') updateModeVisibility();
    if (UI.ocCourseSelect && UI.ocCourseSelect.value) {
        UI.ocCourseSelect.dispatchEvent(new Event('change'));
    }

    const dateInput = document.getElementById('oc-round-date');
    if (dateInput) dateInput.valueAsDate = new Date();
}

function bindSetupToggles() {
    if (UI.btnModeSimple && UI.btnModeDetailed) {
        UI.btnModeSimple.addEventListener('click', () => {
            AppState.currentTrackingMode = 'simple';
            UI.btnModeSimple.classList.add('active');
            UI.btnModeSimple.style.background = 'white';
            UI.btnModeSimple.style.color = 'black';
            UI.btnModeDetailed.classList.remove('active');
            UI.btnModeDetailed.style.background = 'transparent';
            UI.btnModeDetailed.style.color = '#64748b';
            if (UI.ocModeDesc) UI.ocModeDesc.textContent = "Simple: fairway, GIR, putts per hole";
            updateModeVisibility();
        });
        UI.btnModeDetailed.addEventListener('click', () => {
            AppState.currentTrackingMode = 'detailed';
            UI.btnModeDetailed.classList.add('active');
            UI.btnModeDetailed.style.background = 'white';
            UI.btnModeDetailed.style.color = 'black';
            UI.btnModeSimple.classList.remove('active');
            UI.btnModeSimple.style.background = 'transparent';
            UI.btnModeSimple.style.color = '#64748b';
            if (UI.ocModeDesc) UI.ocModeDesc.textContent = "Detailed: Tracking ball flight, start line, curve, & outcomes";
            updateModeVisibility();
        });
    }



    if (UI.btnRound9 && UI.btnRound18) {
        UI.btnRound9.addEventListener('click', () => {
            AppState.currentRoundHoles = 9;
            UI.btnRound9.classList.add('active');
            UI.btnRound9.style.background = 'var(--primary-color)';
            UI.btnRound9.style.color = 'white';
            UI.btnRound18.classList.remove('active');
            UI.btnRound18.style.background = 'white';
            UI.btnRound18.style.color = '#64748b';
            const ocKeperraCombosOptgroup = document.getElementById('oc-keperra-18h-group');
            if (ocKeperraCombosOptgroup) ocKeperraCombosOptgroup.classList.add('hidden');
        });
        UI.btnRound18.addEventListener('click', () => {
            AppState.currentRoundHoles = 18;
            UI.btnRound18.classList.add('active');
            UI.btnRound18.style.background = 'var(--primary-color)';
            UI.btnRound18.style.color = 'white';
            UI.btnRound9.classList.remove('active');
            UI.btnRound9.style.background = 'white';
            UI.btnRound9.style.color = '#64748b';
            const ocKeperraCombosOptgroup = document.getElementById('oc-keperra-18h-group');
            if (ocKeperraCombosOptgroup) ocKeperraCombosOptgroup.classList.remove('hidden');
        });
    }
}

function bindCourseSelect() {
    if (UI.ocCourseSelect) {
        UI.ocCourseSelect.addEventListener('change', () => {
            const courseName = UI.ocCourseSelect.value;
            AppState.currentRoundCourseName = courseName;

            if (UI.ocTeeSelect && COURSE_DATA[courseName]) {
                UI.ocTeeSelect.innerHTML = '';
                for (const tee in COURSE_DATA[courseName]) {
                    const opt = document.createElement('option');
                    opt.value = tee;
                    opt.textContent = tee;
                    UI.ocTeeSelect.appendChild(opt);
                }
                UI.ocTeeSelect.dispatchEvent(new Event('change'));
            }
        });
    }

    if (UI.ocTeeSelect) {
        UI.ocTeeSelect.addEventListener('change', async () => {
            const courseName = UI.ocCourseSelect.value;
            const teeName = UI.ocTeeSelect.value;
            if (COURSE_DATA[courseName] && COURSE_DATA[courseName][teeName]) {
                const data = COURSE_DATA[courseName][teeName];
                const parText = data.par > 0 ? data.par : '<input type="number" id="oc-manual-par" style="width:50px; display:inline;" class="form-control form-control-sm" placeholder="Par">';

                if (UI.ocCourseInfoLine) {
                    UI.ocCourseInfoLine.innerHTML = `Par: ${parText} | CR: <input type="number" id="oc-manual-cr" value="${data.rating || 0}" style="width:60px; display:inline;"> | SR: <input type="number" id="oc-manual-sr" value="${data.slope || 0}" style="width:60px; display:inline;">`;
                }

                AppState.currentCoursePars = data.pars || [];

                if (AppState.currentUser) {
                    const hi = await getPlayerHandicap(AppState.currentUser.uid);
                    if (hi !== undefined && data.par > 0) {
                        const dh = Math.round(hi * ((data.slope || 113) / 113) + ((data.rating || 72) - (data.par || 72)));
                        if (UI.ocDailyHandicapLine) UI.ocDailyHandicapLine.innerHTML = `Your Daily Handicap: <strong><input type="number" id="oc-manual-dh" value="${dh}" style="width:60px; display:inline; font-weight:bold; color:var(--primary-color);"></strong>`;
                    } else {
                        if (UI.ocDailyHandicapLine) UI.ocDailyHandicapLine.innerHTML = `Your Daily Handicap: <input type="number" id="oc-manual-dh" value="0" style="width:60px; display:inline; font-weight:bold;">`;
                    }
                }

                // Force UI isolation check on tee/mode change
                updateModeVisibility();
            }
        });
    }
}

function bindAddPlayer() {
    if (UI.btnOcAddPlayer && UI.ocPlayerSelect) {
        UI.btnOcAddPlayer.addEventListener('click', () => {
            const sel = UI.ocPlayerSelect.options[UI.ocPlayerSelect.selectedIndex];
            if (!sel.value) return;

            if (AppState.liveRoundGroups.find(p => p.uid === sel.value)) {
                alert("Player already added.");
                return;
            }

            // Update state triggers Proxy 'set' and thus reactive render
            AppState.liveRoundGroups = [...AppState.liveRoundGroups, {
                uid: sel.value,
                name: sel.text,
                scores: {},
                compStats: {},
                simpleStats: {}
            }];
        });
    }
}

function bindCompQuickAdd() {
    if (UI.ocLinkComp && UI.btnOcQuickAdd) {
        UI.ocLinkComp.addEventListener('change', () => {
            const sel = UI.ocLinkComp.options[UI.ocLinkComp.selectedIndex];
            if (!sel || !sel.value) {
                UI.btnOcQuickAdd.classList.add('hidden');
                return;
            }
            const regulars = JSON.parse(sel.getAttribute('data-regulars') || "[]");
            if (regulars.length > 0) {
                UI.btnOcQuickAdd.classList.remove('hidden');
            } else {
                UI.btnOcQuickAdd.classList.add('hidden');
            }
        });

        UI.btnOcQuickAdd.addEventListener('click', () => {
            const sel = UI.ocLinkComp.options[UI.ocLinkComp.selectedIndex];
            const regulars = JSON.parse(sel.getAttribute('data-regulars') || "[]");
            if (regulars.length === 0) return;

            let addedCount = 0;
            const currentGroups = [...AppState.liveRoundGroups];
            regulars.forEach(p => {
                if (!currentGroups.find(existing => existing.uid === p.uid)) {
                    currentGroups.push({
                        uid: p.uid,
                        name: p.name,
                        scores: {},
                        compStats: {},
                        simpleStats: {}
                    });
                    addedCount++;
                }
            });
            AppState.liveRoundGroups = currentGroups;
            if (addedCount > 0) {
                // Done
            } else {
                alert("All regulars are already in the group.");
            }
        });
    }
}
function bindStartRound() {
    if (UI.btnOcStart) {
        UI.btnOcStart.addEventListener('click', async () => {
            if (AppState.liveRoundGroups.length === 0) {
                alert("Please add at least one player to track.");
                return;
            }

            const courseName = UI.ocCourseSelect.value;
            let manualParInput = document.getElementById('oc-manual-par');
            const totalPar = manualParInput ? parseInt(manualParInput.value) : (COURSE_DATA[courseName]?.[UI.ocTeeSelect.value]?.par || 0);

            if (!totalPar) {
                if (document.getElementById('tab-oncourse').classList.contains('active')) {
                    alert("Please specify a valid total Par for this course.");
                }
                return;
            }

            const compId = UI.ocLinkComp ? UI.ocLinkComp.value : null;
            if (compId) {
                AppState.currentLiveCompId = compId;
                const selectedOpt = UI.ocLinkComp.options[UI.ocLinkComp.selectedIndex];
                try {
                    AppState.currentLiveCompRules = JSON.parse(selectedOpt.getAttribute('data-rules') || "[]");
                } catch (e) { }
            } else {
                AppState.currentLiveCompRules = [];
            }

            const dateInput = document.getElementById('oc-round-date');
            AppState.currentRoundDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

            AppState.currentHole = 1;
            AppState.activeRoundId = `round_${Date.now()}`;
            AppState.currentHoleShots = [];

            // Fetch Daily Handicaps for all players
            const teeData = COURSE_DATA[courseName]?.[UI.ocTeeSelect.value] || {};
            for (let p of AppState.liveRoundGroups) {
                const hi = await getPlayerHandicap(p.uid);
                p.handicapIndex = hi;
                p.dailyHandicap = Math.round(hi * ((teeData.slope || 113) / 113) + ((teeData.rating || 72) - totalPar));
            }

            document.body.classList.add('round-active');
            document.getElementById('oncourse-setup').classList.add('hidden');
            document.getElementById('oncourse-hub').classList.remove('hidden');

            // Show new sub-nav and progress bar
            const subNav = document.getElementById('oc-sub-nav');
            if (subNav) subNav.classList.remove('hidden');
            const progress = document.getElementById('hole-jumper-container');
            if (progress) progress.classList.remove('hidden');
            renderHoleJumper();
            const exitBar = document.getElementById('oc-exit-bar');
            if (exitBar) exitBar.classList.remove('hidden');

            loadHole();
            bindHoleNav(); // Re-bind on start
        });
    }

    const abortBtn = document.getElementById('btn-oc-abort-round');
    if (abortBtn) {
        abortBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to end this round session? All unsaved data will be cleared.")) {
                endRoundCleanup();
            }
        });
    }
}

function bindGlobalRoundActions() {
    const btnDiscard = document.getElementById('btn-oc-discard');
    if (btnDiscard) {
        btnDiscard.addEventListener('click', async () => {
            if (confirm("Are you sure you want to discard this round and ALL recorded shots?")) {
                try {
                    const batch = writeBatch(db);
                    const shotsQuery = query(collection(db, "shots"), where("roundId", "==", AppState.activeRoundId));
                    const shotSnaps = await getDocs(shotsQuery);
                    shotSnaps.forEach(sdoc => batch.delete(sdoc.ref));

                    // CRITICAL FIX: Delete the round document itself
                    const roundRef = doc(db, "whs_rounds", AppState.activeRoundId);
                    batch.delete(roundRef);

                    await batch.commit();

                    // Note: Assuming showToast exists in the file, otherwise replace with console.log
                    if (typeof showToast !== 'undefined') showToast("Round & Shots discarded 🗑️");
                    endRoundCleanup();
                } catch (e) {
                    alert("Failed to discard round data cleanly.");
                }
            }
        });
    }

    // Add floating finish button
    const fab = document.createElement('button');
    fab.id = 'oc-fixed-finish-btn';
    fab.className = 'fixed-action-btn hidden';
    fab.innerHTML = '🏁 Finish Round';
    fab.addEventListener('click', openFinishModal);
    document.body.appendChild(fab);

    // Show/Hide FAB based on round state
    window.addEventListener('stateChange', (e) => {
        if (e.detail.property === 'activeRoundId') {
            if (e.detail.newValue) fab.classList.remove('hidden');
            else fab.classList.add('hidden');
        }
    });
}

export function endRoundCleanup() {
    document.body.classList.remove('round-active');
    document.getElementById('oncourse-setup').classList.remove('hidden');
    const hub = document.getElementById('oncourse-hub');
    if (hub) hub.classList.add('hidden');
    const finishModal = document.getElementById('oc-finish-modal');
    if (finishModal) finishModal.classList.add('hidden');
    const progress = document.getElementById('hole-jumper-container');
    if (progress) progress.classList.add('hidden');
    const exitBar = document.getElementById('oc-exit-bar');
    if (exitBar) exitBar.classList.add('hidden');
    const subNav = document.getElementById('oc-sub-nav');
    if (subNav) subNav.classList.add('hidden');

    AppState.liveRoundGroups = [];
    AppState.currentHole = 1;
    AppState.currentLiveCompId = null;
    AppState.currentLiveCompRules = [];
    AppState.currentHoleShots = [];
    AppState.activeRoundId = null;
    AppState.currentRoundDate = null;

    if (UI.ocAddedPlayersList) UI.ocAddedPlayersList.innerHTML = '';
}

async function getPlayerHandicap(uid) {
    if (AppState.currentUser && uid === AppState.currentUser.uid && window.currentHandicapIndex !== undefined) {
        return window.currentHandicapIndex;
    }
    try {
        const docRef = doc(db, "profiles", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().handicapIndex !== undefined) {
            return parseFloat(docSnap.data().handicapIndex);
        }
    } catch (e) { }
    return 0;
}

export function loadHole() {
    const fh = document.getElementById('oc-hole-display');
    const ph = document.getElementById('oc-par-display');
    const dotsContainer = document.getElementById('oc-hole-dots');

    const parForHole = AppState.currentCoursePars[AppState.currentHole - 1] || 4;
    const parSelect = document.getElementById('oc-par-select');
    if (parSelect) parSelect.value = parForHole;

    if (fh) fh.textContent = `Hole ${AppState.currentHole}`;
    if (ph) ph.textContent = parForHole > 0 ? `Par ${parForHole}` : `Par ?`;

    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        const totalHoles = AppState.currentRoundHoles || 9;
        for (let i = 1; i <= totalHoles; i++) {
            const dot = document.createElement('div');
            dot.className = 'hole-dot';
            if (i < AppState.currentHole) dot.classList.add('done');
            else if (i === AppState.currentHole) dot.classList.add('current');
            dotsContainer.appendChild(dot);
        }
    }

    // Update hole jumper active state
    renderHoleJumper();

    if (AppState.currentUser) {
        AppState.currentHoleShots = []; // Clear for new hole
    }

    const scoresContainer = document.getElementById('oc-group-scores');
    if (!scoresContainer) return;
    scoresContainer.innerHTML = '';

    // MAP MULTIPLE PLAYERS INTO SCORING GRID
    AppState.liveRoundGroups.forEach((p, index) => {
        const pDiv = document.createElement('div');
        pDiv.style.cssText = 'margin-bottom:12px; background:white; padding:15px; border-radius:12px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:10px;';

        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

        // Calculate cumulative score (gross)
        let totalSoFar = 0;
        for (let h = 1; h < AppState.currentHole; h++) {
            totalSoFar += (p.scores[h] || 0);
        }
        const holeScore = p.scores[AppState.currentHole] || 0;

        nameRow.innerHTML = `
            <span style="font-weight:700; font-size:1.1rem; color:#1e293b;">${p.name}</span>
            <span style="font-size:0.85rem; color:#64748b; font-weight:600;">Total: <span style="color:var(--primary-color); font-size:1rem;">${totalSoFar + holeScore}</span></span>
        `;
        pDiv.appendChild(nameRow);

        const controlRow = document.createElement('div');
        controlRow.style.cssText = 'display:flex; align-items:center; gap:15px;';
        controlRow.innerHTML = `
            <div style="flex:1; font-size:0.9rem; font-weight:600; color:#475569;">Hole ${AppState.currentHole} Strokes</div>
            <div style="display:flex; align-items:center; gap:12px;">
                <button class="btn-grid-minus" style="width:44px; height:44px; border-radius:12px; border:2px solid #cbd5e1; background:white; font-size:1.4rem; font-weight:bold;">−</button>
                <span style="min-width:30px; text-align:center; font-size:1.8rem; font-weight:800; color:#1e293b;">${holeScore}</span>
                <button class="btn-grid-plus" style="width:44px; height:44px; border-radius:12px; background:var(--primary-color); color:white; border:none; font-size:1.4rem; font-weight:bold;">+</button>
            </div>
        `;

        controlRow.querySelector('.btn-grid-plus').onclick = () => {
            p.scores[AppState.currentHole] = (p.scores[AppState.currentHole] || 0) + 1;
            loadHole();
            updateLiveLeaderboard();
        };
        controlRow.querySelector('.btn-grid-minus').onclick = () => {
            if (p.scores[AppState.currentHole] > 0) {
                p.scores[AppState.currentHole]--;
                loadHole();
                updateLiveLeaderboard();
            }
        };

        pDiv.appendChild(controlRow);

        // Optional Simple Stats Row (Small icons for GIR/Fwy + Plus/Minus for Putts)
        const statsRow = document.createElement('div');
        statsRow.style.cssText = 'display:flex; gap:10px; margin-top:5px; align-items:center;';

        const fwySet = p.simpleStats[AppState.currentHole]?.fwy;
        const girSet = p.simpleStats[AppState.currentHole]?.gir;
        const putts = p.simpleStats[AppState.currentHole]?.putts || 0;

        statsRow.innerHTML = `
            <button class="mini-stat ${fwySet === true ? 'active-fwy' : (fwySet === false ? 'active-miss' : '')}" style="flex:1; padding:8px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:0.75rem; font-weight:bold;">🌿 FW</button>
            <button class="mini-stat ${girSet === true ? 'active-gir' : (girSet === false ? 'active-miss' : '')}" style="flex:1; padding:8px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:0.75rem; font-weight:bold;">🟢 GIR</button>
            <div style="flex:1.5; display:flex; align-items:center; justify-content:space-between; padding:4px 8px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc;">
                <button class="putt-minus" style="border:none; background:none; font-weight:bold; padding:4px 8px; font-size:1rem;">−</button>
                <span style="font-size:0.85rem; font-weight:800; color:var(--primary-color);">⛳ ${putts} P</span>
                <button class="putt-plus" style="border:none; background:none; font-weight:bold; padding:4px 8px; font-size:1rem;">+</button>
            </div>
        `;

        statsRow.querySelector('.mini-stat:nth-child(1)').onclick = () => {
            if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
            p.simpleStats[AppState.currentHole].fwy = !p.simpleStats[AppState.currentHole].fwy;
            loadHole();
        };
        statsRow.querySelector('.mini-stat:nth-child(2)').onclick = () => {
            if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
            p.simpleStats[AppState.currentHole].gir = !p.simpleStats[AppState.currentHole].gir;
            loadHole();
        };
        statsRow.querySelector('.putt-plus').onclick = () => {
            if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
            p.simpleStats[AppState.currentHole].putts = (p.simpleStats[AppState.currentHole].putts || 0) + 1;
            loadHole();
        };
        statsRow.querySelector('.putt-minus').onclick = () => {
            if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
            const cur = p.simpleStats[AppState.currentHole].putts || 0;
            if (cur > 0) p.simpleStats[AppState.currentHole].putts = cur - 1;
            loadHole();
        };

        pDiv.appendChild(statsRow);
        scoresContainer.appendChild(pDiv);
    });

    // Hide single-player stats block if group round
    const simpleStatsBlock = document.getElementById('oc-simple-stats-container');
    if (simpleStatsBlock) {
        if (AppState.liveRoundGroups.length > 1) {
            simpleStatsBlock.classList.add('hidden');
        } else {
            simpleStatsBlock.classList.remove('hidden');
        }
    }

    updateLiveLeaderboard();
}

function openFinishModal() {
    const modal = document.getElementById('oc-finish-modal');
    if (!modal) return;

    // Aggregate stats for current user
    const stats = recalculateReviewStats();

    // Update summary card
    if (UI.sumTotalShots) UI.sumTotalShots.textContent = stats.shots;
    if (UI.sumTotalPoints) UI.sumTotalPoints.textContent = stats.points;
    if (UI.sumTotalPutts) UI.sumTotalPutts.textContent = stats.putts;
    if (UI.sumTotalFir) UI.sumTotalFir.textContent = stats.fir;
    if (UI.sumTotalGir) UI.sumTotalGir.textContent = stats.gir;
    if (UI.sumTotalPen) UI.sumTotalPen.textContent = stats.penalties;

    modal.classList.remove('hidden');
    document.getElementById('oc-finish-holes').value = AppState.currentRoundHoles || (AppState.currentHole > 9 ? 18 : 9);

    // Smooth scroll to the buttons
    const btnSave = document.getElementById('btn-oc-save-whs');
    if (btnSave) btnSave.scrollIntoView({ behavior: 'smooth' });
}

function recalculateReviewStats() {
    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
    if (!p) return { shots: 0, points: 0, putts: 0, fir: 0, gir: 0, penalties: 0 };

    let totalShots = 0;
    let totalPoints = 0;
    let totalPutts = 0;
    let totalFIR = 0;
    let totalGIR = 0;
    let totalPen = 0;

    const courseName = AppState.currentRoundCourseName;
    const teeName = UI.ocTeeSelect.value;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    const maxHole = AppState.currentRoundHoles || 9;
    for (let h = 1; h <= maxHole; h++) {
        const score = p.scores[h] || 0;
        if (score === 0) continue;

        totalShots += score;

        // Points
        const holeIdx = h - 1;
        const hPar = AppState.currentCoursePars[holeIdx] || 4;
        const hSI = teeData.strokeIndex?.[holeIdx] || (holeIdx + 1);
        totalPoints += calculateHoleStableford(score, hPar, hSI, p.dailyHandicap);

        // Stats
        if (p.simpleStats[h]) {
            if (p.simpleStats[h].putts) totalPutts += p.simpleStats[h].putts;
            if (p.simpleStats[h].fir || p.simpleStats[h].fwy) totalFIR++;
            if (p.simpleStats[h].gir) totalGIR++;
        }

        // Penalties (Search in shots if available)
        const holeShots = AppState.currentHoleShots.filter(s => s.hole === h);
        holeShots.forEach(s => {
            if (s.penalty) totalPen++; // Basic count, though some penalties are +2
        });
    }

    return {
        shots: totalShots,
        points: totalPoints,
        putts: totalPutts,
        fir: totalFIR,
        gir: totalGIR,
        penalties: totalPen
    };
}

function bindReviewActions() {
    if (UI.btnOcEditReview) {
        UI.btnOcEditReview.addEventListener('click', () => {
            openDetailedReview();
        });
    }

    const btnCloseDetailed = document.getElementById('btn-close-detailed');
    if (btnCloseDetailed) {
        btnCloseDetailed.addEventListener('click', () => {
            UI.ocDetailedReviewModal.classList.add('hidden');
        });
    }

    const btnDetailedDone = document.getElementById('btn-detailed-done');
    if (btnDetailedDone) {
        btnDetailedDone.addEventListener('click', () => {
            UI.ocDetailedReviewModal.classList.add('hidden');
            openFinishModal(); // Refresh summary
        });
    }

    if (UI.btnEditorSave) {
        UI.btnEditorSave.addEventListener('click', saveHoleEdits);
    }

    if (UI.btnEditorCancel) {
        UI.btnEditorCancel.addEventListener('click', () => {
            UI.ocHoleEditorModal.classList.add('hidden');
        });
    }

    const btnFIR = document.getElementById('editor-btn-fir');
    if (btnFIR) {
        btnFIR.addEventListener('click', () => {
            editorState.fir = !editorState.fir;
            btnFIR.classList.toggle('btn-primary', editorState.fir);
            btnFIR.classList.toggle('btn-secondary', !editorState.fir);
        });
    }

    const btnGIR = document.getElementById('editor-btn-gir');
    if (btnGIR) {
        btnGIR.addEventListener('click', () => {
            editorState.gir = !editorState.gir;
            btnGIR.classList.toggle('btn-primary', editorState.gir);
            btnGIR.classList.toggle('btn-secondary', !editorState.gir);
        });
    }
}

function openDetailedReview() {
    if (!UI.ocDetailedReviewModal) return;
    renderDetailedReview();
    UI.ocDetailedReviewModal.classList.remove('hidden');
    UI.ocFinishModal = document.getElementById('oc-finish-modal');
    if (UI.ocFinishModal) UI.ocFinishModal.classList.add('hidden');
}

function renderDetailedReview() {
    if (!UI.ocDetailedTbody) return;
    UI.ocDetailedTbody.innerHTML = '';

    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
    if (!p) return;

    const courseName = AppState.currentRoundCourseName;
    const teeName = UI.ocTeeSelect.value;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    const maxHole = AppState.currentRoundHoles || 9;
    for (let h = 1; h <= maxHole; h++) {
        const score = p.scores[h] || 0;
        const holeIdx = h - 1;
        const hPar = AppState.currentCoursePars[holeIdx] || 4;
        const hSI = teeData.strokeIndex?.[holeIdx] || (holeIdx + 1);
        const points = calculateHoleStableford(score, hPar, hSI, p.dailyHandicap);
        const putts = p.simpleStats[h]?.putts || 0;
        const statsStr = [
            (p.simpleStats[h]?.fir || p.simpleStats[h]?.fwy) ? 'FIR' : '',
            p.simpleStats[h]?.gir ? 'GIR' : ''
        ].filter(Boolean).join(', ') || '-';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td><strong>${h}</strong> <span style="font-size:0.7rem; opacity:0.6;">(P${hPar})</span></td>
            <td style="font-weight:bold;">${score || '-'}</td>
            <td>${points}</td>
            <td>${putts}</td>
            <td style="font-size:0.75rem;">${statsStr}</td>
        `;
        tr.addEventListener('click', () => openHoleEditor(h));
        UI.ocDetailedTbody.appendChild(tr);
    }
}

let currentEditingHole = null;
let editorState = { score: 0, putts: 0, penalties: 0, fir: false, gir: false };

window.adjustEditorField = function (field, delta) {
    if (editorState[field] !== undefined) {
        editorState[field] = Math.max(0, editorState[field] + delta);
        if (field === 'score') document.getElementById('editor-score-val').textContent = editorState.score;
        if (field === 'putts') document.getElementById('editor-putts-val').textContent = editorState.putts;
        if (field === 'penalties') document.getElementById('editor-pen-val').textContent = editorState.penalties;
    }
}

function openHoleEditor(holeNum) {
    currentEditingHole = holeNum;
    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
    const score = p.scores[holeNum] || 0;
    const putts = p.simpleStats[holeNum]?.putts || 0;
    const fir = !!(p.simpleStats[holeNum]?.fir || p.simpleStats[holeNum]?.fwy);
    const gir = !!p.simpleStats[holeNum]?.gir;

    editorState = { score, putts, penalties: 0, fir, gir };

    document.getElementById('hole-editor-title').textContent = `Hole ${holeNum} Editor`;
    document.getElementById('editor-score-val').textContent = score;
    document.getElementById('editor-putts-val').textContent = putts;
    document.getElementById('editor-pen-val').textContent = 0;

    const btnFIR = document.getElementById('editor-btn-fir');
    const btnGIR = document.getElementById('editor-btn-gir');
    if (btnFIR) {
        btnFIR.classList.toggle('btn-primary', fir);
        btnFIR.classList.toggle('btn-secondary', !fir);
    }
    if (btnGIR) {
        btnGIR.classList.toggle('btn-primary', gir);
        btnGIR.classList.toggle('btn-secondary', !gir);
    }

    UI.ocHoleEditorModal.classList.remove('hidden');
}

function saveHoleEdits() {
    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
    if (!p || !currentEditingHole) return;

    // Apply edits
    p.scores[currentEditingHole] = editorState.score + editorState.penalties;
    if (!p.simpleStats[currentEditingHole]) p.simpleStats[currentEditingHole] = {};
    p.simpleStats[currentEditingHole].putts = editorState.putts;
    p.simpleStats[currentEditingHole].fir = editorState.fir;
    p.simpleStats[currentEditingHole].gir = editorState.gir;

    UI.ocHoleEditorModal.classList.add('hidden');
    renderDetailedReview(); // Refresh table
    loadHole(); // Sync hub if needed
}

function bindAdvancedTools() {
    if (UI.btnToggleGps) {
        UI.btnToggleGps.addEventListener('click', toggleGPS);
    }
    if (UI.btnVoiceRules) {
        UI.btnVoiceRules.addEventListener('click', () => {
            if (!recognition) initVoiceRules();
            if (recognition) recognition.start();
        });
    }
    if (UI.btnCancelVoice) {
        UI.btnCancelVoice.addEventListener('click', () => {
            if (recognition) recognition.stop();
            UI.voiceOverlay.classList.add('hidden');
        });
    }
    if (UI.btnCloseRulesCard) {
        UI.btnCloseRulesCard.addEventListener('click', () => {
            UI.rulesResponseCard.classList.add('hidden');
        });
    }
}

let gpsWatchId = null;
function toggleGPS() {
    if (gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        if (UI.btnToggleGps) UI.btnToggleGps.textContent = "📡 GPS: OFF";
        if (UI.ocGpsWidget) UI.ocGpsWidget.classList.add('hidden');
    } else {
        if (!navigator.geolocation) {
            showToast("GPS not supported on this device.");
            return;
        }

        if (UI.btnToggleGps) UI.btnToggleGps.textContent = "⌛ Locating...";
        gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                updateGPSDistances(latitude, longitude);
                if (UI.btnToggleGps) UI.btnToggleGps.textContent = "📡 GPS: ON";
                if (UI.ocGpsWidget) UI.ocGpsWidget.classList.remove('hidden');
            },
            (err) => {
                console.error("GPS Error:", err);
                let msg = "GPS Error";
                if (err.code === 1) msg = "GPS Permission Denied";
                else if (err.code === 2) msg = "GPS Position Unavailable";
                showToast(msg);
                toggleGPS(); // Turn off
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    }
}

function updateGPSDistances(lat, lon) {
    const holeIdx = AppState.currentHole - 1;
    const courseName = AppState.currentRoundCourseName;
    const teeName = UI.ocTeeSelect.value;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    // 1. Identify physical hole number (1-27)
    let physicalHole = holeIdx + 1; // Default fallback
    if (teeData.physicalHoles && teeData.physicalHoles[holeIdx]) {
        physicalHole = teeData.physicalHoles[holeIdx];
    }

    // 2. Look up coordinates for that physical hole
    const coords = KEPERRA_GPS[physicalHole];

    if (coords && coords.length >= 6) {
        const [cLat, cLon, fLat, fLon, bLat, bLon] = coords;

        // 3. Calculate Haversine distance in meters
        const distCenter = getDistance(lat, lon, cLat, cLon);
        const distFront = getDistance(lat, lon, fLat, fLon);
        const distBack = getDistance(lat, lon, bLat, bLon);

        // 4. Update UI labels (meters)
        if (UI.gpsMiddle) UI.gpsMiddle.textContent = `${Math.round(distCenter)}m`;
        if (UI.gpsFront) UI.gpsFront.textContent = `${Math.round(distFront)}m`;
        if (UI.gpsBack) UI.gpsBack.textContent = `${Math.round(distBack)}m`;
    } else {
        // Mock fallback if no coordinates found
        if (UI.gpsMiddle) UI.gpsMiddle.textContent = "---m";
        if (UI.gpsFront) UI.gpsFront.textContent = "---m";
        if (UI.gpsBack) UI.gpsBack.textContent = "---m";
    }
}

/**
 * Calculate distance between two points in meters using Haversine formula
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

let recognition = null;
function initVoiceRules() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
        UI.voiceOverlay.classList.remove('hidden');
        UI.voiceStatus.textContent = "Listening...";
        UI.voiceTranscript.textContent = "";
    };

    recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        UI.voiceTranscript.textContent = transcript;
    };

    recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
            // Permission was denied — reset so next tap re-triggers the browser prompt
            recognition = null;
            UI.voiceStatus.textContent = "Mic access denied. Tap the mic again to retry.";
            setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);
        } else {
            UI.voiceStatus.textContent = "Error: " + event.error;
            setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2000);
        }
    };

    recognition.onend = () => {
        const finalTranscript = UI.voiceTranscript.textContent.trim();
        if (finalTranscript) {
            processVoiceQuery(finalTranscript);
        }
        UI.voiceOverlay.classList.add('hidden');
    };
}

async function processVoiceQuery(text) {
    if (!UI.rulesResponseCard) return;
    UI.rulesResponseCard.classList.remove('hidden');
    UI.rulesResponseContent.textContent = "Consulting Rules AI for: \"" + text + "\"...";

    const mockAns = await queryRulesAI(text);
    UI.rulesResponseContent.innerHTML = `<strong>Rule Clarification:</strong> ${mockAns}`;
}

async function queryRulesAI(text) {
    try {
        const rulesFn = httpsCallable(functions, 'processRulesQuery');
        const result = await rulesFn({ query: text });
        return result.data.answer;
    } catch (e) {
        console.error("AI Rules Query Error:", e);
        return "Rules engine is currently unavailable. Please check the USGA handbook manually.";
    }
}

function bindHoleNav() {
    const btnPrev = document.getElementById('btn-oc-prev-hole');
    const btnNext = document.getElementById('btn-oc-next-hole');

    if (btnPrev) {
        btnPrev.replaceWith(btnPrev.cloneNode(true));
        document.getElementById('btn-oc-prev-hole').addEventListener('click', () => {
            if (AppState.currentHole > 1) {
                AppState.currentHole--;
                loadHole();
            }
        });
    }

    if (btnNext) {
        btnNext.replaceWith(btnNext.cloneNode(true));
        document.getElementById('btn-oc-next-hole').addEventListener('click', () => {
            if (AppState.currentHole < (AppState.currentRoundHoles || 9)) {
                AppState.currentHole++;
                loadHole();
            } else {
                openFinishModal();
            }
        });
    }

    const btnFinish = document.getElementById('btn-oc-finish');
    if (btnFinish) {
        btnFinish.addEventListener('click', () => openFinishModal());
    }
    const btnCancelFinish = document.getElementById('btn-oc-cancel-finish');
    if (btnCancelFinish) {
        btnCancelFinish.addEventListener('click', () => {
            const modal = document.getElementById('oc-finish-modal');
            if (modal) modal.classList.add('hidden');
        });
    }

    const btnSaveWhs = document.getElementById('btn-oc-save-whs');
    if (btnSaveWhs) {
        btnSaveWhs.addEventListener('click', saveRoundToDatabase);
    }

    const parSelect = document.getElementById('oc-par-select');
    if (parSelect) {
        parSelect.addEventListener('change', (e) => {
            const val = parseInt(e.target.value) || 4;
            const holeIdx = AppState.currentHole - 1;
            if (AppState.currentCoursePars) {
                AppState.currentCoursePars[holeIdx] = val;
                const ph = document.getElementById('oc-par-display');
                if (ph) ph.textContent = `Par ${val}`;
            }
        });
    }
}

// ==========================================
// Hole Jumper: jump to any hole directly
// ==========================================
export function jumpToHole(holeIndex) {
    const total = AppState.currentRoundHoles || 9;
    if (holeIndex < 1 || holeIndex > total) return;
    AppState.currentHole = holeIndex;
    loadHole();
    // Scroll hub back to top
    const hub = document.getElementById('oncourse-hub');
    if (hub) hub.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderHoleJumper() {
    const container = document.getElementById('hole-jumper-container');
    if (!container) return;
    const total = AppState.currentRoundHoles || 9;
    container.innerHTML = '';
    for (let i = 1; i <= total; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = i;
        const isCurrent = i === AppState.currentHole;
        const isDone = i < AppState.currentHole;
        const baseStyle = 'min-width:44px; height:44px; border-radius:50%; border:2px solid; font-weight:700; font-size:0.85rem; cursor:pointer; flex-shrink:0;';
        if (isCurrent) {
            btn.style.cssText = baseStyle + 'border-color:#1e3c72; background:#1e3c72; color:white;';
        } else if (isDone) {
            btn.style.cssText = baseStyle + 'border-color:#10b981; background:#dcfce7; color:#065f46;';
        } else {
            btn.style.cssText = baseStyle + 'border-color:#cbd5e1; background:white; color:#475569;';
        }
        btn.setAttribute('aria-label', `Go to hole ${i}`);
        btn.addEventListener('click', () => jumpToHole(i));
        container.appendChild(btn);
    }
    // Auto-center active hole button
    const activeBtn = container.children[AppState.currentHole - 1];
    if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}



async function saveRoundToDatabase() {
    const holesPlayedEl = document.getElementById('oc-finish-holes');
    const holesPlayedStr = holesPlayedEl ? holesPlayedEl.value : "9";
    const manualCR = document.getElementById('oc-manual-cr');
    const manualSR = document.getElementById('oc-manual-sr');
    const manualPar = document.getElementById('oc-manual-par');

    const cr = manualCR ? parseFloat(manualCR.value) : 72;
    const sr = manualSR ? parseFloat(manualSR.value) : 113;
    const par = manualPar ? parseFloat(manualPar.value) : 72;

    const courseName = AppState.currentRoundCourseName;
    const teeName = UI.ocTeeSelect ? UI.ocTeeSelect.value : null;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    try {
        for (let p of AppState.liveRoundGroups) {
            let totalGross = 0;
            let totalStableford = 0;

            for (const h in p.scores) {
                const gross = p.scores[h];
                totalGross += gross;

                const holeIdx = parseInt(h) - 1;
                const hPar = AppState.currentCoursePars[holeIdx] || 4;
                const hSI = teeData.strokeIndex?.[holeIdx] || (holeIdx + 1);

                if (hPar && hSI) {
                    totalStableford += calculateHoleStableford(gross, hPar, hSI, p.dailyHandicap);
                }
            }

            // Convert to AGS
            const adjustedGross = convertStablefordToAGS(totalStableford, p.dailyHandicap, par);

            let sumPutts = 0, sumGIR = 0, sumFwy = 0;
            if (p.simpleStats) {
                for (const h in p.simpleStats) {
                    if (p.simpleStats[h].putts) sumPutts += p.simpleStats[h].putts;
                    if (p.simpleStats[h].gir) sumGIR += 1;
                    if (p.simpleStats[h].fwy) sumFwy += 1;
                }
            }

            const payload = {
                uid: p.uid,
                course: AppState.currentRoundCourseName + ` (${holesPlayedStr}H)`,
                courseName: AppState.currentRoundCourseName,
                rating: cr,
                slope: sr,
                adjustedGross: adjustedGross,
                totalGross: totalGross,
                totalScore: totalGross,
                totalStableford: totalStableford,
                dailyHandicap: p.dailyHandicap,
                date: AppState.currentRoundDate ? new Date(AppState.currentRoundDate) : serverTimestamp(),
                isLiveTracked: true,
                liveRoundsMode: AppState.currentTrackingMode,
                stats: { putts: sumPutts, gir: sumGIR, fwy: sumFwy },
                totalPutts: sumPutts
            };

            await addDoc(collection(db, "whs_rounds"), payload);

            // If a competition is linked, save to results collection
            if (AppState.currentLiveCompId) {
                let totalRulePoints = 0;
                const ruleCounts = {};
                const rules = AppState.currentLiveCompRules || [];
                rules.forEach(r => { if (r.name) ruleCounts[r.name] = 0; });

                if (p.compStats) {
                    for (const h in p.compStats) {
                        if (!p.compStats[h]) continue;
                        for (const ruleName in p.compStats[h]) {
                            const count = p.compStats[h][ruleName] || 0;
                            ruleCounts[ruleName] = (ruleCounts[ruleName] || 0) + count;
                            const ruleDef = rules.find(r => r.name === ruleName);
                            if (ruleDef) totalRulePoints += (count * (ruleDef.pts || ruleDef.value || 0));
                        }
                    }
                }

                await addDoc(collection(db, "competition_results"), {
                    compId: AppState.currentLiveCompId,
                    uid: p.uid,
                    playerName: p.name,
                    stablefordPoints: totalStableford,
                    netScore: totalGross,
                    rulePoints: totalRulePoints,
                    totalCompScore: totalStableford + totalRulePoints,
                    date: serverTimestamp(),
                    ruleCounts: ruleCounts,
                    isLiveSynced: true
                });

                // Maintain legacy comp_rounds for backward compat if needed, 
                // but main logic now targets competition_results as requested.
                await addDoc(collection(db, "comp_rounds"), {
                    compId: AppState.currentLiveCompId,
                    uid: p.uid,
                    playerName: p.name,
                    totalPoints: totalStableford + totalRulePoints,
                    score: totalGross,
                    date: serverTimestamp(),
                    ruleCounts: ruleCounts
                });
            }
        }
        alert("Scores Saved successfully.");
        endRoundCleanup();

        // Remove fixed finish button if exists
        const fab = document.getElementById('oc-fixed-finish-btn');
        if (fab) fab.remove();
    } catch (err) {
        console.error(err);
        alert("Failed to save.");
    }
}

function setWizardActive(isActive) {
    if (isActive) {
        document.body.classList.add('active-wizard-mode');
    } else {
        document.body.classList.remove('active-wizard-mode');
    }
}

function bindShotWizard() {
    const btnTrackShot = document.getElementById('btn-oc-track-shot');
    const wizardDiv = document.getElementById('oncourse-wizard');

    if (btnTrackShot) {
        btnTrackShot.addEventListener('click', () => {
            startNewShotInput();
        });
    }

    if (UI.btnBackToHole) {
        UI.btnBackToHole.addEventListener('click', () => {
            setWizardActive(false);
            wizardDiv.classList.add('hidden');
        });
    }

    const btnExitShot = document.getElementById('btn-wizard-cancel');
    if (btnExitShot) {
        btnExitShot.addEventListener('click', () => {
            setWizardActive(false);
            wizardDiv.classList.add('hidden');
        });
    }

    // Weapon Section (Manual Binding as it's dynamic)
    if (UI.bagButtonsGrid) {
        UI.bagButtonsGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-grid-compact');
            if (!btn) return;
            const val = btn.getAttribute('data-val');
            AppState.currentShotData.club = val;

            // Toggle Putting Section
            const puttingSection = document.getElementById('section-putting-outcome');
            if (val === 'Putter') {
                puttingSection.classList.remove('hidden');
            } else {
                puttingSection.classList.add('hidden');
            }

            // UI Feedback
            UI.bagButtonsGrid.querySelectorAll('.btn-grid-compact').forEach(b => b.classList.remove('active-choice'));
            btn.classList.add('active-choice');
        });
    }

    // Intent Grid & Putting Delegation
    wizardDiv.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-grid-compact');
        if (!btn || btn.closest('#bag-buttons-grid')) return;

        const group = btn.getAttribute('data-group');
        const val = btn.getAttribute('data-val');
        if (!group) return;

        // Toggle Logic
        if (btn.classList.contains('active-choice')) {
            delete AppState.currentShotData[group];
            btn.classList.remove('active-choice');
        } else {
            AppState.currentShotData[group] = val;
            btn.closest('div').querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('active-choice'));
            btn.classList.add('active-choice');
        }
    });

    // Final Save
    if (UI.btnSaveShotFinal) {
        UI.btnSaveShotFinal.addEventListener('click', saveShotData);
    }

    // Routine Toggles
    document.querySelectorAll('.wiz-routine-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const b = e.target.closest('.wiz-routine-btn');
            const field = b.getAttribute('data-routine');
            const val = b.getAttribute('data-val');

            if (!AppState.currentShotData.routines) AppState.currentShotData.routines = {};

            // Toggle
            if (AppState.currentShotData.routines[field] === val) {
                delete AppState.currentShotData.routines[field];
                b.classList.remove('active');
            } else {
                AppState.currentShotData.routines[field] = val;
                // Deactivate sibling
                b.parentElement.querySelectorAll('.wiz-routine-btn').forEach(sib => sib.classList.remove('active'));
                b.classList.add('active');
            }
        });
    });

    if (UI.btnWizardDelete) {
        UI.btnWizardDelete.addEventListener('click', deleteShotData);
    }
}

function startNewShotInput(forcedShotNum = null) {
    const shotNum = forcedShotNum || (AppState.currentHoleShots?.length || 0) + 1;
    AppState.currentShotData = {
        hole: AppState.currentHole,
        shotNumber: shotNum,
        roundId: AppState.activeRoundId,
        timestamp: new Date().toISOString()
    };

    setWizardActive(true);
    const wizard = document.getElementById('oncourse-wizard');
    if (wizard) {
        wizard.classList.remove('hidden');
        wizard.scrollTop = 0;
    }

    syncShotWizardUI();
}

function loadExistingShotData(shotId) {
    const existing = AppState.currentHoleShots.find(s => s.id === shotId);
    if (existing) {
        AppState.currentShotData = { ...existing };
        setWizardActive(true);
        const wizard = document.getElementById('oncourse-wizard');
        if (wizard) {
            wizard.classList.remove('hidden');
            wizard.scrollTop = 0;
        }
        syncShotWizardUI();
    }
}

function syncShotWizardUI() {
    renderBagButtons();

    const wizard = document.getElementById('oncourse-wizard');
    if (!wizard) return;

    // Reset all intent/grid buttons
    wizard.querySelectorAll('.btn-grid-compact').forEach(btn => btn.classList.remove('active-choice'));

    // Populate choices
    const data = AppState.currentShotData;
    ['startLine', 'trajectory', 'strikeQuality', 'shape', 'puttControl'].forEach(group => {
        if (data[group]) {
            const btn = wizard.querySelector(`[data-group="${group}"][data-val="${data[group]}"]`);
            if (btn) btn.classList.add('active-choice');
        }
    });

    // Populate routines
    document.querySelectorAll('.wiz-routine-btn').forEach(btn => {
        const field = btn.getAttribute('data-routine');
        const val = btn.getAttribute('data-val');
        if (data.routines && data.routines[field] === val) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Show/Hide delete
    if (UI.btnWizardDelete) {
        UI.btnWizardDelete.classList.toggle('hidden', !data.id);
    }

    // Toggle Putter Section
    const puttingSection = document.getElementById('section-putting-outcome');
    if (data.club === 'Putter') puttingSection.classList.remove('hidden');
    else puttingSection.classList.add('hidden');
}

function renderBagButtons() {
    if (!UI.bagButtonsGrid) return;
    UI.bagButtonsGrid.innerHTML = '';

    const defaultBag = {
        driver: true,
        woods: ['3 Wood'],
        irons: ['Long Irons', 'Mid Irons', 'Short Iron'],
        wedges: ['56'],
        putter: true
    };
    const bag = (AppState.myBag && Object.keys(AppState.myBag).length > 0) ? AppState.myBag : defaultBag;

    const categories = [
        { key: 'driver', label: 'Dr', standalone: true },
        { key: 'woods', label: 'Woods', items: bag.woods },
        { key: 'irons', label: 'Irons', items: bag.irons },
        { key: 'wedges', label: 'Wedges', items: bag.wedges },
        { key: 'putter', label: 'Putter', standalone: true }
    ];

    categories.forEach(cat => {
        if (cat.standalone && bag[cat.key]) {
            addButton(cat.label, cat.key === 'driver' ? 'Driver' : 'Putter');
        } else if (cat.items && cat.items.length > 0) {
            cat.items.forEach(item => {
                // Shorten labels for pills
                let display = item.replace('Wood', 'W').replace('Iron', 'i').replace('Wedge', 'W');
                if (display === 'Long i') display = 'Li';
                if (display === 'Mid i') display = 'Mi';
                if (display === 'Short i') display = 'Si';
                addButton(display, item);
            });
        }
    });

    function addButton(label, val) {
        const btn = document.createElement('button');
        btn.className = 'btn-grid-compact';
        btn.style.minWidth = '60px';
        btn.style.whiteSpace = 'nowrap';
        if (AppState.currentShotData.club === val) btn.classList.add('active-choice');
        btn.setAttribute('data-val', val);
        btn.textContent = label;
        UI.bagButtonsGrid.appendChild(btn);
    }
}


function bindPenaltyModal() {
    if (UI.btnWizardPenalty) {
        UI.btnWizardPenalty.addEventListener('click', () => {
            if (UI.penaltyModal) UI.penaltyModal.classList.remove('hidden');
        });
    }

    document.querySelectorAll('.penalty-opt').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const opt = e.target.closest('.penalty-opt');
            const type = opt.getAttribute('data-type');

            const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser.uid);
            if (!p) return;

            // Apply Penalty Strokes
            let penaltyCount = 0;
            if (type === 'ob_lost') {
                penaltyCount = 1;
                AppState.currentShotData.penalty = 'OB/Lost Ball';
                AppState.currentShotData.outcome = 'OB';
            } else if (type === 'hazard') {
                penaltyCount = 1;
                AppState.currentShotData.penalty = 'Hazard Drop';
                AppState.currentShotData.outcome = 'Hazard';
            } else if (type === 'local_rule') {
                penaltyCount = 2;
                AppState.currentShotData.penalty = 'Local Rule (Fairway Drop)';
                AppState.currentShotData.outcome = 'Fairway';
            }

            p.scores[AppState.currentHole] = (p.scores[AppState.currentHole] || 0) + penaltyCount;

            // Auto-advance or stay put depends on type
            // But we'll save the "Shot with penalty" first
            await saveShotData();

            // If OB, next shot number should skip the penalty.
            // e.g. Hit 1 OOB. Penalty is 2. Next is 3. 
            // My saveShotData increments by 1. So 1 is logged. Score is 1+1=2.
            // Next startNewShotInput will see shotNumber as 2. We need it to be 3.
            if (type === 'ob_lost' || type === 'local_rule' || type === 'hazard') {
                const nextShotNum = AppState.currentShotData.shotNumber + penaltyCount + 1;
                startNewShotInput(nextShotNum);
            }

            if (UI.penaltyModal) UI.penaltyModal.classList.add('hidden');
        });
    });

    const btnCancel = document.getElementById('btn-cancel-penalty');
    if (btnCancel) btnCancel.addEventListener('click', () => UI.penaltyModal.classList.add('hidden'));
}

export function bindBagSettings() {
    if (UI.btnSaveBag) {
        UI.btnSaveBag.addEventListener('click', () => {
            const newBag = {
                driver: false,
                woods: [],
                irons: [],
                wedges: [],
                putter: false
            };

            document.querySelectorAll('.bag-check').forEach(chk => {
                if (chk.checked) {
                    const cat = chk.getAttribute('data-cat');
                    const val = chk.getAttribute('data-val');
                    if (cat === 'driver' || cat === 'putter') newBag[cat] = true;
                    else newBag[cat].push(val);
                }
            });

            AppState.myBag = newBag;
            const msg = document.getElementById('bag-msg');
            if (msg) {
                msg.classList.remove('hidden');
                setTimeout(() => msg.classList.add('hidden'), 3000);
            }
        });
    }

    // Sync UI with state
    if (AppState.myBag) {
        document.querySelectorAll('.bag-check').forEach(chk => {
            const cat = chk.getAttribute('data-cat');
            const val = chk.getAttribute('data-val');
            if (cat === 'driver' || cat === 'putter') {
                chk.checked = !!AppState.myBag[cat];
            } else {
                chk.checked = AppState.myBag[cat]?.includes(val);
            }
        });
    }
}

async function saveShotData() {
    if (!AppState.currentUser) return;
    document.getElementById('oncourse-wizard').classList.add('hidden');
    setWizardActive(false); // Deactivate wizard mode
    const payload = { uid: AppState.currentUser.uid, ...AppState.currentShotData };
    try {
        if (AppState.currentShotData.id) {
            await updateDoc(doc(db, "shots", AppState.currentShotData.id), payload);
            const idx = AppState.currentHoleShots.findIndex(s => s.id === AppState.currentShotData.id);
            if (idx !== -1) AppState.currentHoleShots[idx] = { ...payload, id: AppState.currentShotData.id };
        } else {
            const docRef = await addDoc(collection(db, "shots"), payload);
            AppState.currentHoleShots.push({ ...payload, id: docRef.id });
            const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser.uid);
            if (p) {
                p.scores[AppState.currentHole] = (p.scores[AppState.currentHole] || 0) + 1;

                // TASK 1: Automated GIR Logic
                const holeIdx = AppState.currentHole - 1;
                const par = AppState.currentCoursePars[holeIdx] || 4;
                if (payload.outcome === 'Green' && payload.shotNumber <= (par - 2)) {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].gir = true;
                }

                // TASK 2: Putter Stats (Exclude Fringe)
                if (payload.club === 'Putter' && !payload.isOffGreen) {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].putts = (p.simpleStats[AppState.currentHole].putts || 0) + 1;
                }

                loadHole();
            }
        }
        showToast("Shot Logged ⛳");
    } catch (e) {
        showToast("Error saving shot.");
    }
}

async function deleteShotData() {
    if (!AppState.currentUser || !AppState.currentShotData.id) return;
    if (!confirm("Are you sure you want to delete this shot?")) return;

    document.getElementById('oncourse-wizard').classList.add('hidden');
    try {
        await deleteDoc(doc(db, "shots", AppState.currentShotData.id));

        // Remove from local state
        AppState.currentHoleShots = AppState.currentHoleShots.filter(s => s.id !== AppState.currentShotData.id);

        // Update player score
        const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser.uid);
        if (p) {
            p.scores[AppState.currentHole] = Math.max(0, (p.scores[AppState.currentHole] || 0) - 1);
            loadHole();
        }

        showToast("Shot Deleted 🗑️");
        AppState.currentShotData = {};
    } catch (e) {
        console.error(e);
        showToast("Error deleting shot.");
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#10b981; color:white; padding:12px 24px; border-radius:30px; font-weight:bold; z-index:9999;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function bindReviewModal() {
    if (UI.btnOcReviewRound) {
        UI.btnOcReviewRound.addEventListener('click', async () => {
            if (!UI.reviewRoundModal || !UI.reviewContent) return;
            UI.reviewRoundModal.classList.remove('hidden');
            UI.reviewContent.innerHTML = '<p style="text-align:center; padding:20px; color:#64748b;">Generating detailed review...</p>';

            const courseName = AppState.currentRoundCourseName;
            const teeName = UI.ocTeeSelect.value;
            const teeData = COURSE_DATA[courseName]?.[teeName] || {};
            const manualPar = document.getElementById('oc-manual-par');
            const par = manualPar ? parseFloat(manualPar.value) : (teeData.par || 72);

            const shotsQuery = query(
                collection(db, "shots"),
                where("roundId", "==", AppState.activeRoundId)
            );

            // Fetch and organize shots
            let allRoundShots = [];
            try {
                const snap = await getDocs(shotsQuery);
                snap.forEach(d => allRoundShots.push(d.data()));
                allRoundShots.sort((a, b) => (a.hole - b.hole) || (a.shotNumber - b.shotNumber));
            } catch (e) { console.error("Error fetching shots for review:", e); }

            UI.reviewContent.innerHTML = '';

            AppState.liveRoundGroups.forEach(p => {
                let totalGross = 0;
                let totalStableford = 0;
                const pShots = allRoundShots.filter(s => s.uid === p.uid);

                for (let h = 1; h <= (AppState.currentRoundHoles || 9); h++) {
                    const gross = p.scores[h] || 0;
                    totalGross += gross;

                    if (teeData.pars && teeData.strokeIndex) {
                        const holeIdx = h - 1;
                        const hPar = teeData.pars[holeIdx];
                        const hSI = teeData.strokeIndex[holeIdx];
                        if (hPar && hSI && gross > 0) {
                            totalStableford += calculateHoleStableford(gross, hPar, hSI, p.dailyHandicap);
                        }
                    }
                }

                const ags = convertStablefordToAGS(totalStableford, p.dailyHandicap, par);

                const playerCard = document.createElement('div');
                playerCard.className = 'card';
                playerCard.style.cssText = 'padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);';

                let shotsHtml = '';
                if (pShots.length > 0) {
                    shotsHtml = `<details style="margin-top:10px; border-top:1px solid #f1f5f9; padding-top:10px;">
                        <summary style="cursor:pointer; font-size:0.85rem; color:var(--secondary-color); font-weight:600;">View Shot History (${pShots.length})</summary>
                        <div style="font-size:0.8rem; margin-top:8px; color:#475569;">
                            ${pShots.map(s => `<div>H${s.hole} S${s.shotNumber}: ${s.club || 'Club'} → ${s.outcome || 'Result'}</div>`).join('')}
                        </div>
                    </details>`;
                }

                playerCard.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <strong style="font-size:1.15rem; color:var(--primary-color);">${p.name}</strong>
                        <span style="font-size:0.85rem; background:#f1f5f9; padding:2px 8px; border-radius:12px; color:#64748b;">DH: ${p.dailyHandicap}</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; text-align:center; background:#f8fafc; padding:10px; border-radius:8px;">
                        <div>
                            <div style="font-size:0.7rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Gross</div>
                            <div style="font-size:1.25rem; font-weight:800; color:#1e293b;">${totalGross}</div>
                        </div>
                        <div>
                            <div style="font-size:0.7rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Pts</div>
                            <div style="font-size:1.25rem; font-weight:800; color:var(--primary-color);">${totalStableford}</div>
                        </div>
                        <div>
                            <div style="font-size:0.7rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">AGS</div>
                            <div style="font-size:1.25rem; font-weight:800; color:#334155;">${ags || totalGross}</div>
                        </div>
                    </div>
                    ${shotsHtml}
                `;
                UI.reviewContent.appendChild(playerCard);
            });
        });
    }
    if (UI.btnCloseReview) UI.btnCloseReview.addEventListener('click', () => UI.reviewRoundModal.classList.add('hidden'));
    if (UI.btnReviewFinished) UI.btnReviewFinished.addEventListener('click', () => UI.reviewRoundModal.classList.add('hidden'));
}

/**
 * Bulletproof Visibility UI
 * Handles switching between Simple (Stats) and Detailed (Wizard) tracking
 */
export function updateModeVisibility() {
    const btnTrack = document.getElementById('btn-oc-track-shot');
    const wizard = document.getElementById('oncourse-wizard');
    const simpleStats = document.getElementById('oc-simple-stats');

    if (AppState.currentTrackingMode === 'simple') {
        if (btnTrack) btnTrack.classList.add('hidden');
        if (wizard) wizard.classList.add('hidden');

        // Aggressive Hide for Groups: stats block only for single player
        const isSinglePlayer = AppState.liveRoundGroups.length <= 1;
        if (simpleStats) {
            simpleStats.classList.toggle('hidden', !isSinglePlayer);
        }
    } else {
        // Detailed mode
        if (btnTrack) btnTrack.classList.remove('hidden');
        if (simpleStats) simpleStats.classList.add('hidden');

        // If hub is visible, make sure track button is too
        const hub = document.getElementById('oncourse-hub');
        if (hub && !hub.classList.contains('hidden')) {
            if (btnTrack) btnTrack.classList.remove('hidden');
        }
    }
}
/**
 * Task 3: Live Leaderboard Logic
 * Calculates Stableford points across all players in current session
 */
function updateLiveLeaderboard() {
    const tbody = document.getElementById('oc-leaderboard-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const courseName = AppState.currentRoundCourseName;
    const teeName = UI.ocTeeSelect ? UI.ocTeeSelect.value : null;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    const standings = AppState.liveRoundGroups.map(p => {
        let pts = 0;
        let thru = 0;
        for (let h = 1; h <= AppState.currentRoundHoles; h++) {
            const gross = p.scores[h];
            if (gross > 0) {
                thru = h;
                const hIdx = h - 1;
                const hPar = AppState.currentCoursePars[hIdx] || 4;
                const hSI = teeData.strokeIndex?.[hIdx] || h;
                pts += calculateHoleStableford(gross, hPar, hSI, p.dailyHandicap);
            }
        }
        return { name: p.name, points: pts, thru: thru };
    });

    // Sort by Stableford points desc
    standings.sort((a, b) => b.points - a.points);

    standings.forEach((s, i) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.innerHTML = `
            <td style="padding:12px 8px; font-weight:700; color:#64748b;">${i + 1}</td>
            <td style="padding:12px 8px; font-weight:600;">${s.name}</td>
            <td style="padding:12px 8px; text-align:center; color:#64748b;">${s.thru}</td>
            <td style="padding:12px 8px; text-align:right; font-weight:800; color:var(--primary-color);">${s.points}</td>
        `;
        tbody.appendChild(tr);
    });
}

function bindOcSubNav() {
    const btns = document.querySelectorAll('.oc-sub-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-sub');
            btns.forEach(b => {
                b.classList.remove('active');
                b.style.color = '#64748b';
                b.style.borderBottom = 'none';
            });
            btn.classList.add('active');
            btn.style.color = 'var(--primary-color)';
            btn.style.borderBottom = '3px solid var(--primary-color)';

            const isHub = target === 'hub';
            const isSinglePlayer = AppState.liveRoundGroups.length <= 1;
            const simpleStats = document.getElementById('oc-simple-stats');

            if (simpleStats) {
                simpleStats.classList.toggle('hidden', !isHub || !isSinglePlayer);
            }

            document.getElementById('oc-leaderboard').classList.toggle('hidden', target !== 'leaderboard');

            if (target === 'leaderboard') updateLiveLeaderboard();
        });
    });
}
