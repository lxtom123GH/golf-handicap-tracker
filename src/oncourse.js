// ==========================================
// oncourse.js
// Live Round Tracking & Shot UI Engine
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc, doc, updateDoc, getDoc, getDocs, writeBatch, deleteDoc } from "firebase/firestore";
import { AppState } from './state.js';
import { UI } from './ui.js';
import { COURSE_DATA } from './course-data.js';

import { initNotifications } from './notifications.js';
import { calculateDailyHandicap, calculateHoleStableford, convertStablefordToAGS } from './whs.js';

export function initOnCourse() {
    bindSetupToggles();
    bindCourseSelect();
    bindAddPlayer();
    bindShotWizard();
    bindStartRound();
    bindGlobalRoundActions();
    bindReviewModal();

    // Default init
    if (typeof updateModeVisibility === 'function') updateModeVisibility();
    if (UI.ocCourseSelect && UI.ocCourseSelect.value) {
        UI.ocCourseSelect.dispatchEvent(new Event('change'));
    }
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


    function updateModeVisibility() {
        const btnTrack = document.getElementById('btn-oc-track-shot');
        const wizard = document.getElementById('oncourse-wizard');
        if (AppState.currentTrackingMode === 'simple') {
            if (btnTrack) btnTrack.classList.add('hidden');
            if (wizard) wizard.classList.add('hidden');
        } else {
            if (btnTrack) btnTrack.classList.remove('hidden');
        }
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
                alert("Please specify a valid total Par for this course.");
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
                AppState.currentLiveCompId = null;
                AppState.currentLiveCompRules = [];
            }

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

            loadHole();
            bindHoleNav(); // Re-bind on start
        });
    }

    const abortBtn = document.getElementById('btn-oc-abort-round');
    if (abortBtn) {
        abortBtn.addEventListener('click', endRoundCleanup);
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
}

function endRoundCleanup() {
    document.body.classList.remove('round-active');
    document.getElementById('oncourse-setup').classList.remove('hidden');
    document.getElementById('oncourse-hub').classList.add('hidden');
    document.getElementById('oc-finish-modal').classList.add('hidden');

    AppState.liveRoundGroups = [];
    AppState.currentHole = 1;
    AppState.currentLiveCompId = null;
    AppState.currentLiveCompRules = [];
    AppState.currentHoleShots = [];
    AppState.activeRoundId = null;

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

function loadHole() {
    const fh = document.getElementById('oc-hole-display');
    const ph = document.getElementById('oc-par-display');
    const dotsContainer = document.getElementById('oc-hole-dots');

    if (fh) fh.textContent = `Hole ${AppState.currentHole}`;
    const parForHole = AppState.currentCoursePars[AppState.currentHole - 1] || 0;
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

    if (AppState.currentUser) {
        AppState.currentHoleShots = []; // Clear for new hole
    }

    const scoresContainer = document.getElementById('oc-group-scores');
    if (!scoresContainer) return;
    scoresContainer.innerHTML = '';

    AppState.liveRoundGroups.forEach((p, index) => {
        const pDiv = document.createElement('div');
        pDiv.style.cssText = 'margin-bottom:20px; background:#f8fafc; padding:15px; border-radius:12px;';

        const header = document.createElement('h3');
        header.style.cssText = 'margin-top:0; margin-bottom:10px; font-size:1.3rem;';
        header.textContent = p.name;
        pDiv.appendChild(header);

        const simpleStatsDiv = document.createElement('div');
        simpleStatsDiv.className = 'mobile-grid three-cols';
        simpleStatsDiv.style.marginBottom = '15px';

        if (parForHole !== 3) {
            const btnFwy = document.createElement('button');
            btnFwy.className = "btn-grid";
            btnFwy.innerHTML = 'Fwy<br><span style="font-size:1.5rem">' + (p.simpleStats[AppState.currentHole]?.fwy === true ? '✅' : (p.simpleStats[AppState.currentHole]?.fwy === false ? '❌' : '🤷')) + '</span>';
            if (p.simpleStats[AppState.currentHole]?.fwy === true) btnFwy.classList.add('btn-good');
            else if (p.simpleStats[AppState.currentHole]?.fwy === false) btnFwy.classList.add('btn-bad');

            btnFwy.addEventListener('click', () => {
                if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                p.simpleStats[AppState.currentHole].fwy = !p.simpleStats[AppState.currentHole].fwy;
                loadHole();
            });
            simpleStatsDiv.appendChild(btnFwy);
        } else {
            simpleStatsDiv.appendChild(document.createElement('div'));
        }

        const btnGIR = document.createElement('button');
        btnGIR.className = "btn-grid";
        btnGIR.innerHTML = 'GIR<br><span style="font-size:1.5rem">' + (p.simpleStats[AppState.currentHole]?.gir === true ? '✅' : (p.simpleStats[AppState.currentHole]?.gir === false ? '❌' : '🤷')) + '</span>';
        if (p.simpleStats[AppState.currentHole]?.gir === true) btnGIR.classList.add('btn-good');
        else if (p.simpleStats[AppState.currentHole]?.gir === false) btnGIR.classList.add('btn-bad');

        btnGIR.addEventListener('click', () => {
            if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
            p.simpleStats[AppState.currentHole].gir = !p.simpleStats[AppState.currentHole].gir;
            loadHole();
        });
        simpleStatsDiv.appendChild(btnGIR);

        const puttsVal = p.simpleStats[AppState.currentHole]?.putts || 0;
        const puttsWrapper = document.createElement('div');
        puttsWrapper.style.cssText = 'display:flex; flex-direction:column; align-items:center;';
        puttsWrapper.innerHTML = `
             <div style="font-size:0.9rem; font-weight:bold; margin-bottom:5px; color:#64748b;">Putts</div>
             <div style="display:flex; align-items:center;">
                 <button class="btn-minus-putt" style="width:34px; height:34px; border-radius:50%; border:1px solid #cbd5e1; background:white;">-</button>
                 <span style="width:30px; text-align:center; font-weight:bold; font-size:1.2rem;">${puttsVal}</span>
                 <button class="btn-plus-putt" style="width:34px; height:34px; border-radius:50%; border:1px solid #cbd5e1; background:white;">+</button>
             </div>
        `;
        puttsWrapper.querySelector('.btn-plus-putt').addEventListener('click', () => {
            if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
            p.simpleStats[AppState.currentHole].putts = (p.simpleStats[AppState.currentHole].putts || 0) + 1;
            loadHole();
        });
        puttsWrapper.querySelector('.btn-minus-putt').addEventListener('click', () => {
            if (p.simpleStats[AppState.currentHole]?.putts > 0) {
                p.simpleStats[AppState.currentHole].putts--;
                loadHole();
            }
        });
        simpleStatsDiv.appendChild(puttsWrapper);
        pDiv.appendChild(simpleStatsDiv);

        const currentScore = p.scores[AppState.currentHole] || 0;
        const scoreCtrl = document.createElement('div');
        scoreCtrl.style.cssText = 'display:flex; align-items:center; background:white; border-radius:12px; border:2px solid #e2e8f0; padding:10px;';
        scoreCtrl.innerHTML = `
             <div style="font-weight:bold; font-size:1.1rem; flex:1;">Total Strokes</div>
             <button class="btn-score-minus" style="width:40px; height:40px; border-radius:50%; border:1px solid #cbd5e1; background:white;">-</button>
             <span style="width:40px; text-align:center; font-size:1.5rem; font-weight:bold; margin:0 10px; color:var(--primary-color);">${currentScore}</span>
             <button class="btn-score-plus" style="width:40px; height:40px; border-radius:50%; background:var(--primary-color); color:white; border:none;">+</button>
        `;
        scoreCtrl.querySelector('.btn-score-plus').addEventListener('click', () => {
            p.scores[AppState.currentHole] = (p.scores[AppState.currentHole] || 0) + 1;
            loadHole();
        });
        scoreCtrl.querySelector('.btn-score-minus').addEventListener('click', () => {
            if (p.scores[AppState.currentHole] > 0) {
                p.scores[AppState.currentHole]--;
                loadHole();
            }
        });
        pDiv.appendChild(scoreCtrl);
        scoresContainer.appendChild(pDiv);
    });
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
                document.getElementById('oc-finish-modal').classList.remove('hidden');
                document.getElementById('oc-finish-holes').value = AppState.currentRoundHoles;
            }
        });
    }

    const btnFinish = document.getElementById('btn-oc-finish');
    if (btnFinish) {
        btnFinish.addEventListener('click', () => {
            document.getElementById('oc-finish-modal').classList.remove('hidden');
            document.getElementById('oc-finish-holes').value = AppState.currentHole;
        });
    }

    const btnCancelFinish = document.getElementById('btn-oc-cancel-finish');
    if (btnCancelFinish) {
        btnCancelFinish.addEventListener('click', () => document.getElementById('oc-finish-modal').classList.add('hidden'));
    }

    const btnSaveWhs = document.getElementById('btn-oc-save-whs');
    if (btnSaveWhs) {
        btnSaveWhs.addEventListener('click', saveRoundToDatabase);
    }
}

async function saveRoundToDatabase() {
    const holesPlayedStr = document.getElementById('oc-finish-holes').value;
    const manualCR = document.getElementById('oc-manual-cr');
    const manualSR = document.getElementById('oc-manual-sr');
    const manualPar = document.getElementById('oc-manual-par');

    const cr = manualCR ? parseFloat(manualCR.value) : 72;
    const sr = manualSR ? parseFloat(manualSR.value) : 113;
    const par = manualPar ? parseFloat(manualPar.value) : 72;

    const courseName = AppState.currentRoundCourseName;
    const teeName = UI.ocTeeSelect.value;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    try {
        for (let p of AppState.liveRoundGroups) {
            let totalGross = 0;
            let totalStableford = 0;

            for (const h in p.scores) {
                const gross = p.scores[h];
                totalGross += gross;

                // Calculate Stableford if we have hole data
                if (teeData.pars && teeData.strokeIndex) {
                    const holeIdx = parseInt(h) - 1;
                    const hPar = teeData.pars[holeIdx];
                    const hSI = teeData.strokeIndex[holeIdx];
                    if (hPar && hSI) {
                        totalStableford += calculateHoleStableford(gross, hPar, hSI, p.dailyHandicap);
                    }
                }
            }

            // Convert to AGS (Adjusted Gross Score)
            const adjustedGross = convertStablefordToAGS(totalStableford, p.dailyHandicap, par);

            let sumPutts = 0, sumGIR = 0, sumFwy = 0;
            for (const h in p.simpleStats) {
                if (p.simpleStats[h].putts) sumPutts += p.simpleStats[h].putts;
                if (p.simpleStats[h].gir) sumGIR += 1;
                if (p.simpleStats[h].fwy) sumFwy += 1;
            }

            await addDoc(collection(db, "whs_rounds"), {
                uid: p.uid,
                course: AppState.currentRoundCourseName + ` (${holesPlayedStr}H)`,
                rating: cr,
                slope: sr,
                adjustedGross: adjustedGross, // Saved as WHS Adjusted Gross
                totalGross: totalGross,
                totalStableford: totalStableford,
                dailyHandicap: p.dailyHandicap,
                date: serverTimestamp(),
                isLiveTracked: true,
                liveRoundsMode: AppState.currentTrackingMode,
                stats: { putts: sumPutts, gir: sumGIR, fwy: sumFwy }
            });
        }
        alert("Scores Saved successfully.");
        endRoundCleanup();
    } catch (err) {
        console.error(err);
        alert("Failed to save.");
    }
}

function bindShotWizard() {
    const btnTrackShot = document.getElementById('btn-oc-track-shot');
    const wizardDiv = document.getElementById('oncourse-wizard');
    const btnCancelWiz = document.getElementById('btn-wizard-cancel');

    if (btnTrackShot) {
        btnTrackShot.addEventListener('click', () => {
            wizardDiv.classList.remove('hidden');
            const shotNum = (AppState.currentHoleShots?.length || 0) + 1;
            AppState.currentShotData = {
                hole: AppState.currentHole,
                shotNumber: shotNum,
                roundId: AppState.activeRoundId,
                timestamp: new Date().toISOString()
            };
            showWizardStep('wizard-step-club', `Hole ${AppState.currentHole} - Shot ${shotNum}`);

            // Smooth scroll to inputs for better UX
            const scrollAnchor = document.getElementById('detailed-shot-inputs');
            if (scrollAnchor) {
                scrollAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                wizardDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    if (UI.btnWizardPrev) {
        UI.btnWizardPrev.addEventListener('click', () => {
            if (AppState.currentShotData.shotNumber > 1) {
                const prevShotNum = AppState.currentShotData.shotNumber - 1;
                const prevShot = AppState.currentHoleShots.find(s => s.shotNumber === prevShotNum);
                if (prevShot) {
                    AppState.currentShotData = { ...prevShot };
                    showWizardStep('wizard-step-club', `Hole ${AppState.currentHole} - Shot ${prevShotNum}`);
                }
            }
        });
    }

    if (UI.btnWizardNext) {
        UI.btnWizardNext.addEventListener('click', () => {
            const nextShotNum = AppState.currentShotData.shotNumber + 1;
            const nextShot = AppState.currentHoleShots.find(s => s.shotNumber === nextShotNum);
            if (nextShot) {
                AppState.currentShotData = { ...nextShot };
                showWizardStep('wizard-step-club', `Hole ${AppState.currentHole} - Shot ${nextShotNum}`);
            } else {
                AppState.currentShotData = {
                    hole: AppState.currentHole,
                    shotNumber: nextShotNum,
                    roundId: AppState.activeRoundId,
                    timestamp: new Date().toISOString()
                };
                showWizardStep('wizard-step-club', `Hole ${AppState.currentHole} - Shot ${nextShotNum}`);
            }
        });
    }

    if (btnCancelWiz) {
        btnCancelWiz.addEventListener('click', () => wizardDiv.classList.add('hidden'));
    }

    function showWizardStep(stepId, title) {
        document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('hidden'));
        const step = document.getElementById(stepId);
        if (step) step.classList.remove('hidden');
        const titleEl = document.getElementById('wizard-title');
        if (titleEl) titleEl.textContent = title;

        // Show/Hide Delete button based on whether we're editing an existing shot
        if (UI.btnWizardDelete) {
            if (AppState.currentShotData?.id) {
                UI.btnWizardDelete.classList.remove('hidden');
            } else {
                UI.btnWizardDelete.classList.add('hidden');
            }
        }
    }

    if (UI.btnWizardDelete) {
        UI.btnWizardDelete.addEventListener('click', deleteShotData);
    }

    // Bind Grid Buttons
    document.querySelectorAll('.wizard-step .btn-grid').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const b = e.target.closest('.btn-grid');
            const club = b.getAttribute('data-val');
            const traj = b.getAttribute('data-traj');
            const line = b.getAttribute('data-line');
            const curve = b.getAttribute('data-curve');
            const dist = b.getAttribute('data-dist');
            const out = b.getAttribute('data-out');
            const pline = b.getAttribute('data-pline');
            const pdist = b.getAttribute('data-pdist');

            if (club) {
                AppState.currentShotData.club = club;
                if (club === 'Putter') showWizardStep('wizard-step-putt', "Putting");
                else showWizardStep('wizard-step-line', "Start Line & Curve");
            } else if (traj) {
                AppState.currentShotData.trajectory = traj;
                showWizardStep('wizard-step-line', "Start Line & Curve");
            } else if (line || curve) {
                if (line) AppState.currentShotData.line = line;
                if (curve) AppState.currentShotData.curve = curve;
                if (AppState.currentShotData.line && AppState.currentShotData.curve) showWizardStep('wizard-step-outcome', "Shot Result");
            } else if (dist || out) {
                if (dist) AppState.currentShotData.distanceControl = dist;
                if (out) AppState.currentShotData.outcome = out;
                if (AppState.currentShotData.distanceControl && AppState.currentShotData.outcome) saveShotData();
            } else if (pline || pdist) {
                if (pline) AppState.currentShotData.puttLine = pline;
                if (pdist) AppState.currentShotData.puttDistance = pdist;
                if (AppState.currentShotData.puttLine && AppState.currentShotData.puttDistance) saveShotData();
            }
        });
    });
}

async function saveShotData() {
    if (!AppState.currentUser) return;
    document.getElementById('oncourse-wizard').classList.add('hidden');
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
