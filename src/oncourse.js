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
import { AudioService } from './services/audioService.js';

import { updateLiveLeaderboard, renderDetailedReview, renderBagButtons, renderHoleJumper } from './modules/card-render.js';
import { startNewShotInput, loadExistingShotData, syncShotWizardUI, setWizardActive, saveShotData, deleteShotData, showToast } from './modules/score-input.js';
import { bindAddPlayer, bindCompQuickAdd, bindSetupToggles, bindCourseSelect, bindStartRound, bindGlobalRoundActions, bindOcSubNav, bindShotWizard } from './modules/event-binders.js';


/**
 * Initializes the on-course tracking module and binds global event listeners.
 * Configures UI states for the start of a round.
 * @returns {void}
 */
export function initOnCourse() {
    import('./modules/event-binders.js').then(binders => {
        binders.bindSetupToggles();
        binders.bindCourseSelect();
        binders.bindAddPlayer();
        binders.bindShotWizard();
        binders.bindStartRound();
        binders.bindGlobalRoundActions();
        binders.bindCompQuickAdd();
        binders.bindOcSubNav();
    });
    bindReviewModal();
    bindPenaltyModal();
    bindReviewActions();
    bindAdvancedTools();
    bindHoleNav();
    bindAudioDiaryUI();


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


/* MOVED TO MODULE: bindSetupToggles */



/* MOVED TO MODULE: bindCourseSelect */



/* MOVED TO MODULE: bindAddPlayer */



/* MOVED TO MODULE: bindCompQuickAdd */

/**
 * Binds the 'Start Round' button to initialize the round state.
 * Validates player count, course par, fetches handicaps, and transitions the UI to the live hub.
 * @returns {void}
 */

/* MOVED TO MODULE: bindStartRound */



/* MOVED TO MODULE: bindGlobalRoundActions */


/**
 * Clears the active round state and gracefully resets the UI back to the setup screen.
 * Ensures no stale data carries over to the next round.
 * @returns {void}
 */
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
    const locker = document.getElementById('oc-locker-room');
    if (locker) {
        locker.classList.add('hidden');
        locker.classList.remove('active');
    }
    const tabs = document.querySelector('.tabs-container');
    if (tabs) tabs.classList.remove('hidden');
    const tabOnCourse = document.getElementById('tab-oncourse');
    if (tabOnCourse) tabOnCourse.classList.add('hidden');

    AppState.liveRoundGroups = [];
    AppState.currentHole = 1;
    AppState.currentLiveCompId = null;
    AppState.currentLiveCompRules = [];
    AppState.currentHoleShots = [];
    AppState.activeRoundId = null;
    AppState.currentRoundDate = null;

    // v6.7.0 FIX: Reset ALL round-scoped state to prevent stale data leaking
    AppState.currentCoursePars = [];
    AppState.currentRoundCourseName = '';
    AppState.currentRoundHoles = 9;
    AppState.currentTrackingMode = 'simple';
    AppState.currentShotData = {};

    if (UI.ocAddedPlayersList) UI.ocAddedPlayersList.innerHTML = '';
}

export async function getPlayerHandicap(uid) {
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

/**
 * Renders the interface for the current active hole.
 * Updates par, yardages, shot history, and resets input states for the new hole context.
 * @returns {void}
 */
export function loadHole() {
    try {
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
            pDiv.className = 'compact-score-card';

            const nameRow = document.createElement('div');
            nameRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

            // Calculate cumulative score (gross)
            let totalSoFar = 0;
            for (let h = 1; h < AppState.currentHole; h++) {
                totalSoFar += (p.scores[h] || 0);
            }
            const holeScore = p.scores[AppState.currentHole] || 0;

            nameRow.innerHTML = `
            <span style="font-weight:700; font-size:0.95rem; color:#1e293b;">${p.name}</span>
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
    } catch (e) {
        console.error("UI Error Boundary caught generic hole load failure:", e);
        const scoresContainer = document.getElementById('oc-group-scores');
        if (scoresContainer) {
            scoresContainer.innerHTML = '';
            const errDiv = document.createElement('div');
            errDiv.style.cssText = 'padding:15px; background:#fee2e2; color:#b91c1c; border-radius:8px; text-align:center; font-weight:bold; margin-top:20px;';
            errDiv.textContent = 'Unable to load hole data. Please try skipping to the next hole.';
            scoresContainer.appendChild(errDiv);
        }
    }
}

export function openFinishModal() {
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
    const btnSync = document.getElementById('btn-sync-rounds');
    if (btnSync) btnSync.onclick = () => { /* Sync logic */ };

    // v6.7.0 Locker Room Actions
    const btnPostHome = document.getElementById('btn-post-home');
    if (btnPostHome) btnPostHome.onclick = () => endRoundCleanup();

    const btnPostAnalyze = document.getElementById('btn-post-analyze');
    if (btnPostAnalyze) {
        btnPostAnalyze.onclick = (e) => {
            e.preventDefault();
            runStatAnalysis();
        };
    }


    const btnSave = document.getElementById('btn-oc-save-whs');
    if (btnSave) btnSave.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Aggregates live statistics (shots, points, putts, FIR, GIR) for the current player's round review.
 * Called immediately prior to displaying the end-of-round summary.
 * @returns {Object} An object containing aggregated statistics: { shots, points, putts, fir, gir, penalties }
 */
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


/* MOVED TO MODULE: renderDetailedReview */


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

export function openHoleEditor(holeNum) {
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

    // v6.21.0: Surveyor Mode Bindings
    if (UI.btnToggleSurveyor) {
        UI.btnToggleSurveyor.addEventListener('click', () => {
            import('./surveyor').then(m => m.toggleSurveyor());
        });
    }
    if (UI.btnPinFront) {
        UI.btnPinFront.addEventListener('click', () => {
            import('./surveyor').then(m => m.capturePin('front'));
        });
    }
    if (UI.btnPinBack) {
        UI.btnPinBack.addEventListener('click', () => {
            import('./surveyor').then(m => m.capturePin('back'));
        });
    }
    if (UI.btnPinOverride) {
        UI.btnPinOverride.addEventListener('click', () => {
            import('./surveyor').then(m => m.capturePin('override'));
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
    // Priority: 1. Survey Override, 2. Calculated Green Center, 3. Static GPS (KEPERRA_GPS)
    let groundTruth = null;
    const survey = AppState.surveyData?.[AppState.currentHole];

    if (survey) {
        if (survey.override) {
            groundTruth = {
                c: [survey.override.lat, survey.override.lng],
                f: survey.front ? [survey.front.lat, survey.front.lng] : null,
                b: survey.back ? [survey.back.lat, survey.back.lng] : null
            };
        } else if (survey.greenCenter) {
            groundTruth = {
                c: [survey.greenCenter.lat, survey.greenCenter.lng],
                f: survey.front ? [survey.front.lat, survey.front.lng] : null,
                b: survey.back ? [survey.back.lat, survey.back.lng] : null
            };
        }
    }

    if (!groundTruth && KEPERRA_GPS[physicalHole]) {
        const k = KEPERRA_GPS[physicalHole];
        groundTruth = {
            c: [k[0], k[1]],
            f: [k[2], k[3]],
            b: [k[4], k[5]]
        };
    }

    if (groundTruth && groundTruth.c) {
        // 3. Calculate Haversine distance in meters
        const distCenter = getDistance(lat, lon, groundTruth.c[0], groundTruth.c[1]);
        const distFront = groundTruth.f ? getDistance(lat, lon, groundTruth.f[0], groundTruth.f[1]) : null;
        const distBack = groundTruth.b ? getDistance(lat, lon, groundTruth.b[0], groundTruth.b[1]) : null;

        // 4. Update UI labels (meters)
        if (UI.gpsMiddle) UI.gpsMiddle.textContent = `${Math.round(distCenter)}m`;
        if (UI.gpsFront) UI.gpsFront.textContent = distFront !== null ? `${Math.round(distFront)}m` : "---m";
        if (UI.gpsBack) UI.gpsBack.textContent = distBack !== null ? `${Math.round(distBack)}m` : "---m";

        // v6.21.0 Telemetry: Log if we are using Surveyor data
        if (survey) console.log(`[GPS] Using Ground Truth (Survey) for Hole ${AppState.currentHole}`);
    } else {
        // Mock fallback if no coordinates found
        if (UI.gpsMiddle) UI.gpsMiddle.textContent = "---m";
        if (UI.gpsFront) UI.gpsFront.textContent = "---m";
        if (UI.gpsBack) UI.gpsBack.textContent = "---m";
    }
}

/**
 * Calculates the exact geographic distance between two sets of coordinates using the Haversine formula.
 * @param {number} lat1 - Latitude of the first point.
 * @param {number} lon1 - Longitude of the first point.
 * @param {number} lat2 - Latitude of the second point.
 * @param {number} lon2 - Longitude of the second point.
 * @returns {number} The distance in meters.
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
let audioBlob = null;
let audioTimerInterval = null;
let recordingSeconds = 0;
let audioDiaryState = 'idle'; // 'idle', 'recording', 'review'
let _audioObjectUrl = null; // Tracked for revocation to prevent memory leaks
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

/**
 * Sends a natural language query to the AI Rules Engine via Firebase Cloud Functions.
 * @param {string} text - The user's spoken or typed rules question.
 * @returns {Promise<string>} The AI-generated answer or fallback error message.
 */
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

/**
 * v6.14.0: Audio Capture UI Logic
 * Binds the click listener for the Audio Diary button and manages the 3-state UI flow.
 */
function bindAudioDiaryUI() {
    const btnAudio = document.getElementById('btn-post-audio');
    if (!btnAudio) return;

    btnAudio.addEventListener('click', handleAudioDiaryClick);
}

async function handleAudioDiaryClick() {
    const btnAudio = document.getElementById('btn-post-audio');
    if (!btnAudio) return;

    // State Machine
    if (audioDiaryState === 'idle') {
        try {
            audioDiaryState = 'recording';
            recordingSeconds = 0;
            updateAudioUI();
            await AudioService.startRecording();
            startAudioTimer();
        } catch (err) {
            console.error("Recording start failed:", err);
            audioDiaryState = 'idle';
            updateAudioUI();
            alert("Could not start recording. Please ensure microphone permissions are granted.");
        }
    } else if (audioDiaryState === 'recording') {
        try {
            stopAudioTimer();
            audioBlob = await AudioService.stopRecording();
            audioDiaryState = 'review';
            updateAudioUI();
        } catch (err) {
            console.error("Recording stop failed:", err);
            audioDiaryState = 'idle';
            updateAudioUI();
        }
    } else if (audioDiaryState === 'review') {
        // Handled by specific sub-buttons or re-tap logic
        // For simplicity, we'll implement sub-button click listeners in updateAudioUI
    }
}

function startAudioTimer() {
    if (audioTimerInterval) clearInterval(audioTimerInterval);
    audioTimerInterval = setInterval(() => {
        recordingSeconds++;
        updateAudioUI();
    }, 1000);
}

function stopAudioTimer() {
    if (audioTimerInterval) {
        clearInterval(audioTimerInterval);
        audioTimerInterval = null;
    }
}

function updateAudioUI() {
    const btnAudio = document.getElementById('btn-post-audio');
    if (!btnAudio) return;

    if (audioDiaryState === 'idle') {
        btnAudio.innerHTML = "🎙️ Record Audio Diary";
        btnAudio.className = "btn btn-secondary";
        btnAudio.disabled = false;
        btnAudio.style.width = "100%";
    }
    else if (audioDiaryState === 'recording') {
        const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
        const secs = (recordingSeconds % 60).toString().padStart(2, '0');
        btnAudio.innerHTML = `🛑 Stop (${mins}:${secs})`;
        btnAudio.className = "btn btn-danger pulse-highlight";
    }
    else if (audioDiaryState === 'review') {
        // Modern split UI for Play and Upload
        // We replace the button content with two smaller buttons
        btnAudio.innerHTML = "";
        btnAudio.disabled = true; // Disable the parent container click
        btnAudio.style.display = "flex";
        btnAudio.style.gap = "8px";
        btnAudio.style.background = "none";
        btnAudio.style.border = "none";
        btnAudio.style.padding = "0";

        const btnPlay = document.createElement('button');
        btnPlay.className = "btn btn-primary";
        btnPlay.style.flex = "1";
        btnPlay.innerHTML = "▶️ Play";
        btnPlay.onclick = (e) => {
            e.stopPropagation();
            playRecordedAudio();
        };

        const btnUpload = document.createElement('button');
        btnUpload.className = "btn btn-success";
        btnUpload.style.flex = "2";
        btnUpload.innerHTML = "📤 Upload Diary";
        btnUpload.onclick = (e) => {
            e.stopPropagation();
            uploadRecordedDiary();
        };

        btnAudio.appendChild(btnPlay);
        btnAudio.appendChild(btnUpload);
    }
}

function playRecordedAudio() {
    if (!audioBlob) return;
    // Revoke the previous object URL before creating a new one to prevent RAM leaks on mobile
    if (_audioObjectUrl) {
        URL.revokeObjectURL(_audioObjectUrl);
    }
    _audioObjectUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(_audioObjectUrl);
    audio.play();
}

async function uploadRecordedDiary() {
    if (!audioBlob) return;

    const btnAudio = document.getElementById('btn-post-audio');
    const uploadBtn = btnAudio?.querySelector('.btn-success');
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = "⌛ Uploading...";
    }

    try {
        const roundId = AppState.activeRoundId || `manual_${Date.now()}`;
        const url = await AudioService.uploadDiary(audioBlob, roundId);
        console.log("Diary uploaded successfully:", url);

        // v6.15.0: The Handshake — persist the audioUrl to the specific round document
        if (AppState.activeRoundId && auth.currentUser) {
            const docId = `${AppState.activeRoundId}_${auth.currentUser.uid}`;
            const roundRef = doc(db, "whs_rounds", docId);
            try {
                await updateDoc(roundRef, { audioUrl: url });
                console.log("[Data Handshake] audioUrl saved to Firestore:", docId);
            } catch (err) {
                console.warn("[Data Handshake] Failed to update round doc with audioUrl:", err);
            }
        }

        // Final State: Success
        if (btnAudio) {
            btnAudio.innerHTML = "✅ Diary Saved to Cloud";
            btnAudio.className = "btn btn-success";
            btnAudio.disabled = true;
            btnAudio.style.display = "block";
            btnAudio.style.width = "100%";
            btnAudio.style.background = "#10b981";
        }
    } catch (err) {
        console.error("Upload failed:", err);
        alert(err.message || "Upload failed. Please try again.");
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = "📤 Upload Diary";
        }
    } finally {
        // CRITICAL: Guaranteed revocation and memory release per Audit Specification
        if (_audioObjectUrl) { URL.revokeObjectURL(_audioObjectUrl); _audioObjectUrl = null; }
        audioBlob = null;
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
/**
 * Navigates the user interface directly to a specified hole index.
 * Useful for reviewing past holes or skipping ahead.
 * @param {number} holeIndex - The round-relative hole number to jump to (1-indexed).
 * @returns {void}
 */
export function jumpToHole(holeIndex) {
    const total = AppState.currentRoundHoles || 9;
    if (holeIndex < 1 || holeIndex > total) return;
    AppState.currentHole = holeIndex;
    loadHole();
    // Scroll hub back to top
    const hub = document.getElementById('oncourse-hub');
    if (hub) hub.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* MOVED TO MODULE: renderHoleJumper */




/**
 * Compiles the final round data, calculates adjusted gross scores and differentials,
 * and persists the completed round to Firestore.
 * @returns {Promise<void>}
 */
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

    // Helper for defensive serialization: deep clone & strip non-serializable objects (DOM/Functions)
    const safeSerialize = (obj) => {
        try {
            return JSON.parse(JSON.stringify(obj, (key, value) => {
                if (value instanceof HTMLElement || (value && typeof value === 'object' && value.nodeType)) return undefined;
                if (typeof value === 'undefined') return null;
                return value;
            }));
        } catch (e) {
            console.warn("Serialization warning:", e);
            return null;
        }
    };

    let anyCloudFail = false;

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

            const payload = safeSerialize({
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
                isLiveTracked: true,
                liveRoundsMode: AppState.currentTrackingMode,
                stats: { putts: sumPutts, gir: sumGIR, fwy: sumFwy },
                totalPutts: sumPutts
            });
            // Inject date AFTER serialization to preserve sentinel/Date object
            payload.date = AppState.currentRoundDate ? new Date(AppState.currentRoundDate) : serverTimestamp();

            try {
                // v6.15.0: Use predictable ID format {roundId}_{uid} to allow later updates (e.g. audioUrl)
                const docId = `${AppState.activeRoundId}_${p.uid}`;
                await setDoc(doc(db, "whs_rounds", docId), payload);
            } catch (cloudErr) {
                console.error("Cloud Save Fail (WHS):", cloudErr);
                anyCloudFail = true;
            }

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

                const compPayload = safeSerialize({
                    compId: AppState.currentLiveCompId,
                    uid: p.uid,
                    playerName: p.playerName || p.name,
                    stablefordPoints: totalStableford,
                    netScore: totalGross,
                    rulePoints: totalRulePoints,
                    totalCompScore: totalStableford + totalRulePoints,
                    ruleCounts: ruleCounts,
                    isLiveSynced: true
                });
                // Inject date AFTER serialization
                compPayload.date = serverTimestamp();

                try {
                    await addDoc(collection(db, "competition_results"), compPayload);
                    await addDoc(collection(db, "comp_rounds"), compPayload); // Backward compat
                } catch (cloudErr) {
                    console.error("Cloud Save Fail (Comp):", cloudErr);
                    anyCloudFail = true;
                }
            }
        }

        // Resilient Backup: Always write to localStorage as well
        const backupId = `round_backup_${Date.now()}`;
        localStorage.setItem(backupId, JSON.stringify({
            date: new Date().toISOString(),
            course: AppState.currentRoundCourseName,
            players: safeSerialize(AppState.liveRoundGroups),
            synced: !anyCloudFail
        }));

        showLockerRoom(anyCloudFail);

        // Remove fixed finish button if exists
        const fab = document.getElementById('oc-fixed-finish-btn');
        if (fab) fab.remove();
    } catch (err) {
        console.error("Critical Save Loop Error:", err);
        alert("A critical error occurred while preparing the save. Your data is still in memory; please do not refresh.");
    }
}

/**
 * Transitions the UI to the Post-Round Locker Room.
 * @param {boolean} isPartialFail - Whether cloud sync failed.
 */
function showLockerRoom(isPartialFail = false) {
    // CRITICAL: Remove round-active FIRST to disable the CSS override
    document.body.classList.remove('round-active');

    // Hide active containers explicitly
    const hub = document.getElementById('oncourse-hub');
    const setup = document.getElementById('oncourse-setup');
    const finishModal = document.getElementById('oc-finish-modal');
    const jumper = document.getElementById('hole-jumper-container');
    const subNav = document.getElementById('oc-sub-nav');
    const exitBar = document.getElementById('oc-exit-bar');
    const tabOnCourse = document.getElementById('tab-oncourse');

    if (hub) hub.classList.add('hidden');
    if (setup) setup.classList.add('hidden');
    if (finishModal) finishModal.classList.add('hidden');
    if (jumper) jumper.classList.add('hidden');
    if (subNav) subNav.classList.add('hidden');
    if (exitBar) exitBar.classList.add('hidden');
    if (tabOnCourse) tabOnCourse.classList.add('hidden');

    const tabs = document.querySelector('.tabs-container');
    if (tabs) tabs.classList.add('hidden');

    // Show Locker Room — MUST add .active to override .tab-content base rule
    const locker = document.getElementById('oc-locker-room');
    if (locker) {
        locker.classList.remove('hidden');
        locker.classList.add('active');
        // Handle Error Toggle
        const errDisplay = document.getElementById('locker-room-err');
        const msgDisplay = document.getElementById('locker-room-msg');
        if (isPartialFail) {
            if (errDisplay) errDisplay.classList.remove('hidden');
            if (msgDisplay) msgDisplay.textContent = "Round Saved Locally";
        } else {
            if (errDisplay) errDisplay.classList.add('hidden');
            if (msgDisplay) msgDisplay.textContent = "Round Saved Successfully";
        }
    }
}

/**
 * v6.10.0 Math Engine: Calculates enriched stats, then calls the Cloud Coach.
 */
async function runStatAnalysis() {
    console.log("[Stats] Running Instant Analysis...");
    const modal = document.getElementById('stat-analysis-modal');
    const resultsDiv = document.getElementById('stat-analysis-results');
    const btnClose = document.getElementById('btn-close-stats');

    if (modal) modal.classList.remove('hidden');
    if (btnClose) btnClose.onclick = () => {
        if (modal) modal.classList.add('hidden');
        // UX State Progression: Update original button to show completion
        const mainBtn = document.getElementById('btn-post-analyze');
        if (mainBtn) {
            mainBtn.innerHTML = "✅ Quest Accepted";
            mainBtn.disabled = true;
            mainBtn.style.backgroundColor = "#10b981";
            mainBtn.style.borderColor = "#10b981";
            mainBtn.style.color = "white";
        }
        // v6.11.1 Final Exit UX: Highlight remaining options
        const btnAudio = document.getElementById('btn-post-audio');
        const btnHome = document.getElementById('btn-post-home');
        if (btnAudio) btnAudio.classList.add('pulse-highlight');
        if (btnHome) btnHome.classList.add('pulse-highlight');
    };

    const p = AppState.liveRoundGroups.find(x => x.uid === auth.currentUser?.uid);
    if (!p || !p.scores) {
        if (resultsDiv) resultsDiv.innerHTML = "<p>No score data found for analysis.</p>";
        return;
    }

    const pars = AppState.currentCoursePars || [];
    const scores = p.scores;
    const simpleStats = p.simpleStats || {};

    // 1. Math counters
    const parStats = { 3: { total: 0, count: 0 }, 4: { total: 0, count: 0 }, 5: { total: 0, count: 0 } };
    let holesPlayed = 0;
    let totalPutts = 0;
    let girCount = 0;
    let fwyOpportunityCount = 0;
    let fwyHitCount = 0;
    let puttOnGirTotal = 0;

    Object.keys(scores).forEach(holeNum => {
        const score = parseInt(scores[holeNum]);
        if (score <= 0) return;

        holesPlayed++;
        const holeIdx = parseInt(holeNum) - 1;
        const par = parseInt(pars[holeIdx]) || 4;

        // Par Averages
        if (parStats[par]) {
            parStats[par].total += score;
            parStats[par].count++;
        }

        // Advanced Stats from simpleStats
        const stats = simpleStats[holeNum];
        if (stats) {
            if (stats.putts) totalPutts += stats.putts;
            if (stats.gir) {
                girCount++;
                if (stats.putts) puttOnGirTotal += stats.putts;
            }
            if (par >= 4) {
                fwyOpportunityCount++;
                if (stats.fwy || stats.fir) fwyHitCount++;
            }
        }
    });

    // 2. Shot-level analytics (Penalties, Mental Score, Shape)
    let penaltyTotal = 0;
    let routinePassCount = 0;
    let routineTotal = 0;
    const shapeCounts = {};
    Object.keys(simpleStats).forEach(holeNum => {
        const hStats = simpleStats[holeNum];
        if (!hStats) return;
        if (hStats.penalties && hStats.penalties > 0) penaltyTotal += hStats.penalties;
        if (hStats.routines && hStats.routines.pre) {
            routineTotal++;
            if (hStats.routines.pre === 'Pass') routinePassCount++;
        }
        if (hStats.shape) {
            shapeCounts[hStats.shape] = (shapeCounts[hStats.shape] || 0) + 1;
        }
    });

    let dominantShape = null;
    let maxShapeCount = 0;
    for (const shape in shapeCounts) {
        if (shapeCounts[shape] > maxShapeCount) {
            maxShapeCount = shapeCounts[shape];
            dominantShape = shape;
        }
    }

    // 3. Final Payload (with divide-by-zero protection)
    const payload = {
        par3Avg: parStats[3].count > 0 ? parseFloat((parStats[3].total / parStats[3].count).toFixed(2)) : null,
        par4Avg: parStats[4].count > 0 ? parseFloat((parStats[4].total / parStats[4].count).toFixed(2)) : null,
        par5Avg: parStats[5].count > 0 ? parseFloat((parStats[5].total / parStats[5].count).toFixed(2)) : null,
        holesPlayed,
        totalPutts,
        fairwaysHit: fwyOpportunityCount > 0 ? parseFloat((fwyHitCount / fwyOpportunityCount).toFixed(2)) : null,
        girPercent: holesPlayed > 0 ? parseFloat((girCount / holesPlayed).toFixed(2)) : null,
        puttsPerGir: girCount > 0 ? parseFloat((puttOnGirTotal / girCount).toFixed(2)) : null,
        penalties: penaltyTotal,
        mentalScore: routineTotal > 0 ? parseFloat((routinePassCount / routineTotal).toFixed(2)) : null,
        shotShapeTendency: dominantShape
    };

    // Render local stats first
    let html = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="font-size:0.7rem; color:#64748b; font-weight:700; text-transform:uppercase;">FIR%</div>
                <div style="font-size:1.2rem; font-weight:800; color:var(--primary-color);">${payload.fairwaysHit !== null ? Math.round(payload.fairwaysHit * 100) + '%' : 'N/A'}</div>
            </div>
            <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="font-size:0.7rem; color:#64748b; font-weight:700; text-transform:uppercase;">GIR%</div>
                <div style="font-size:1.2rem; font-weight:800; color:var(--primary-color);">${payload.girPercent !== null ? Math.round(payload.girPercent * 100) + '%' : 'N/A'}</div>
            </div>
            <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="font-size:0.7rem; color:#64748b; font-weight:700; text-transform:uppercase;">Putts/GIR</div>
                <div style="font-size:1.2rem; font-weight:800; color:var(--primary-color);">${payload.puttsPerGir !== null ? payload.puttsPerGir.toFixed(1) : 'N/A'}</div>
            </div>
            <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="font-size:0.7rem; color:#64748b; font-weight:700; text-transform:uppercase;">Mental Routine</div>
                <div style="font-size:1.2rem; font-weight:800; color:var(--primary-color);">${payload.mentalScore !== null ? Math.round(payload.mentalScore * 100) + '%' : 'N/A'}</div>
            </div>
        </div>
        <div style="text-align:left; font-size:0.85rem; background:#f1f5f9; padding:12px; border-radius:8px;">
            <p><strong>Par Averages:</strong> 
                3s: ${payload.par3Avg !== null ? payload.par3Avg.toFixed(1) : 'N/A'} | 
                4s: ${payload.par4Avg !== null ? payload.par4Avg.toFixed(1) : 'N/A'} | 
                5s: ${payload.par5Avg !== null ? payload.par5Avg.toFixed(1) : 'N/A'}</p>
            <p><strong>Primary Shape:</strong> ${payload.shotShapeTendency || 'None Recorded'}</p>
            <p><strong>Total Penalties:</strong> ${payload.penalties}</p>
        </div>
    `;

    // Add loading state for AI response
    html += `<div id="ai-coach-feedback" style="margin-top: 15px; border-top: 1px solid #dee2e6; padding-top: 15px;">
                <p style="color: var(--text-muted); font-style: italic;">Consulting the Game Master...</p>
             </div>`;

    if (resultsDiv) resultsDiv.innerHTML = html;

    try {
        const analyzeRoundStats = httpsCallable(functions, 'analyzeRoundStats');
        const result = await analyzeRoundStats(payload);

        const feedbackDiv = document.getElementById('ai-coach-feedback');
        if (feedbackDiv) {
            feedbackDiv.innerHTML = `
                <div style="text-align: left; font-size: 0.92rem; line-height: 1.6; color: #334155;">
                    ${renderMarkdownLite(result.data.answer)}
                </div>
            `;
        }
        console.log("[Stats] AI analysis received.");
    } catch (error) {
        console.error("[Stats] AI Error:", error);
        const feedbackDiv = document.getElementById('ai-coach-feedback');
        if (feedbackDiv) feedbackDiv.innerHTML = "<p style='color: #dc3545; font-size:0.85rem;'>The Game Master is unavailable. Focus on your averages above!</p>";
    }
}

/**
 * Lightweight, zero-dependency Markdown-lite renderer.
 * Converts headers, bold text, and line breaks into safe HTML.
 */
function renderMarkdownLite(text) {
    if (!text) return '';
    return text
        .replace(/^### (.+)$/gm, '<h3 style="margin:12px 0 4px; color:var(--primary-color);">$1</h3>')
        .replace(/^## (.+)$/gm, '<h2 style="margin:14px 0 4px;">$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}


/* MOVED TO MODULE: setWizardActive */



/* MOVED TO MODULE: bindShotWizard */



/* MOVED TO MODULE: startNewShotInput */



/* MOVED TO MODULE: loadExistingShotData */


/**
 * Synchronizes the visual state of the Shot Wizard UI to match the current in-memory shot data.
 * Updates button active states across all intent/result grids.
 * @returns {void}
 */

/* MOVED TO MODULE: syncShotWizardUI */



/* MOVED TO MODULE: renderBagButtons */



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

            AppState.playerClubs = newBag;
            localStorage.setItem('golfAppClubs', JSON.stringify(newBag));
            const msg = document.getElementById('bag-msg');
            if (msg) {
                msg.classList.remove('hidden');
                setTimeout(() => msg.classList.add('hidden'), 3000);
            }
        });
    }

    // Sync UI with state
    if (AppState.playerClubs) {
        document.querySelectorAll('.bag-check').forEach(chk => {
            const cat = chk.getAttribute('data-cat');
            const val = chk.getAttribute('data-val');
            if (cat === 'driver' || cat === 'putter') {
                chk.checked = !!AppState.playerClubs[cat];
            } else {
                chk.checked = AppState.playerClubs[cat]?.includes(val);
            }
        });
    }
}


/* MOVED TO MODULE: saveShotData */



/* MOVED TO MODULE: deleteShotData */



/* MOVED TO MODULE: showToast */


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

/* MOVED TO MODULE: updateLiveLeaderboard */



/* MOVED TO MODULE: bindOcSubNav */


export { getDistance, updateGPSDistances };
