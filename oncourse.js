// ==========================================
// oncourse.js
// Live Round Tracking & Shot UI Engine
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { AppState } from './state.js';
import { UI } from './ui.js';
import { COURSE_DATA } from './course-data.js';

export function initOnCourse() {
    bindSetupToggles();
    bindCourseSelect();
    bindAddPlayer();
    bindStartRound();
    bindHoleNav();
    bindShotWizard();

    // Default init
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
        });
    }

    if (UI.btnRound9 && UI.btnRound18) {
        UI.btnRound9.addEventListener('click', () => {
            AppState.currentRoundHoles = 9;
            UI.btnRound9.classList.add('active');
            UI.btnRound9.style.background = 'var(--primary-color)';
            UI.btnRound9.style.color = 'white';
            UI.btnRound9.style.border = '2px solid var(--primary-color)';
            UI.btnRound18.classList.remove('active');
            UI.btnRound18.style.background = 'white';
            UI.btnRound18.style.color = '#64748b';
            UI.btnRound18.style.border = '2px solid #cbd5e1';
            const ocKeperraCombosOptgroup = document.getElementById('oc-keperra-18h-group');
            if (ocKeperraCombosOptgroup) ocKeperraCombosOptgroup.classList.add('hidden');
        });
        UI.btnRound18.addEventListener('click', () => {
            AppState.currentRoundHoles = 18;
            UI.btnRound18.classList.add('active');
            UI.btnRound18.style.background = 'var(--primary-color)';
            UI.btnRound18.style.color = 'white';
            UI.btnRound18.style.border = '2px solid var(--primary-color)';
            UI.btnRound9.classList.remove('active');
            UI.btnRound9.style.background = 'white';
            UI.btnRound9.style.color = '#64748b';
            UI.btnRound9.style.border = '2px solid #cbd5e1';
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

            // Populate Tees
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

                // Fallback editable fields if needed
                const parText = data.par > 0 ? data.par : '<input type="number" id="oc-manual-par" style="width:50px; display:inline;" class="form-control form-control-sm" placeholder="Par">';

                if (UI.ocCourseInfoLine) {
                    UI.ocCourseInfoLine.innerHTML = `Par: ${parText} | CR: <input type="number" id="oc-manual-cr" value="${data.rating}" style="width:60px; display:inline;"> | SR: <input type="number" id="oc-manual-sr" value="${data.slope}" style="width:60px; display:inline;">`;
                }

                AppState.currentCoursePars = data.pars || [];

                if (AppState.currentUser) {
                    const hi = await getPlayerHandicap(AppState.currentUser.uid);
                    if (hi !== undefined && data.par > 0) {
                        const dh = Math.round(hi * (data.slope / 113) + (data.rating - data.par));
                        if (UI.ocDailyHandicapLine) UI.ocDailyHandicapLine.innerHTML = `Your Daily Handicap: <strong><input type="number" id="oc-manual-dh" value="${dh}" style="width:60px; display:inline; font-weight:bold; color:var(--primary-color);"></strong>`;
                    } else {
                        if (UI.ocDailyHandicapLine) UI.ocDailyHandicapLine.innerHTML = `Your Daily Handicap: <input type="number" id="oc-manual-dh" value="0" style="width:60px; display:inline; font-weight:bold;">`;
                    }
                }
            }
        });
    }
}

function bindAddPlayer() {
    if (UI.btnOcAddPlayer && UI.ocPlayerSelect) {
        UI.btnOcAddPlayer.addEventListener('click', () => {
            const sel = UI.ocPlayerSelect.options[UI.ocPlayerSelect.selectedIndex];
            if (!sel.value) return;

            // Check if already in list
            if (AppState.liveRoundGroups.find(p => p.uid === sel.value)) {
                alert("Player already added.");
                return;
            }

            AppState.liveRoundGroups.push({
                uid: sel.value,
                name: sel.text,
                scores: {},
                compStats: {},
                simpleStats: {}
            });

            renderOcPlayersList();
        });
    }
}

export function renderOcPlayersList() {
    if (!UI.ocAddedPlayersList) return;
    UI.ocAddedPlayersList.innerHTML = '';
    AppState.liveRoundGroups.forEach((p, index) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '8px';
        div.style.background = '#f1f5f9';
        div.style.marginBottom = '5px';
        div.style.borderRadius = '5px';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;

        const btnRemove = document.createElement('button');
        btnRemove.textContent = 'Remove';
        btnRemove.className = 'btn-text';
        btnRemove.style.color = '#ef4444';
        btnRemove.style.padding = '0';
        btnRemove.addEventListener('click', () => {
            AppState.liveRoundGroups.splice(index, 1);
            renderOcPlayersList();
        });

        div.appendChild(nameSpan);
        div.appendChild(btnRemove);
        UI.ocAddedPlayersList.appendChild(div);
    });
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
            let spConfig = null;

            if (compId) {
                AppState.currentLiveCompId = compId;
                const selectedOpt = UI.ocLinkComp.options[UI.ocLinkComp.selectedIndex];
                try {
                    AppState.currentLiveCompRules = JSON.parse(selectedOpt.getAttribute('data-rules') || "[]");
                } catch (e) { }

                // Fetch Competition doc to get starting points config
                try {
                    const compDoc = await getDoc(doc(db, "competitions", compId));
                    if (compDoc.exists() && compDoc.data().startingPoints) {
                        spConfig = compDoc.data().startingPoints;
                    }
                } catch (err) { console.error("Failed to fetch comp config for starting points", err); }
            } else {
                AppState.currentLiveCompId = null;
                AppState.currentLiveCompRules = [];
            }

            // Setup starting points if enabled
            const ocSPContainer = document.getElementById('oc-start-points-container');
            if (ocSPContainer) {
                ocSPContainer.innerHTML = '';
                let showSPContainer = false;

                if (spConfig && ((spConfig.perRound?.enabled) || (spConfig.perHole?.enabled))) {
                    showSPContainer = true;
                    for (let p of AppState.liveRoundGroups) {
                        const handicap = await getPlayerHandicap(p.uid);
                        p.startingPoints = calculateStartingPoints(spConfig, handicap);

                        const pDiv = document.createElement('div');
                        pDiv.style.display = 'flex';
                        pDiv.style.justifyContent = 'space-between';
                        pDiv.style.marginBottom = '5px';
                        pDiv.innerHTML = `<span>${p.name}:</span> <strong>${p.startingPoints.round} / ${p.startingPoints.hole}</strong>`;
                        ocSPContainer.appendChild(pDiv);
                    }
                }
                const sec = document.getElementById('oc-sp-section');
                if (sec) sec.style.display = showSPContainer ? 'block' : 'none';
            }

            AppState.currentHole = 1;

            // Transition to Full Screen Mode
            document.body.classList.add('round-active');
            document.getElementById('oncourse-setup').classList.add('hidden');
            document.getElementById('oncourse-hub').classList.remove('hidden');

            loadHole();
        });
    }

    const abortBtn = document.getElementById('btn-oc-abort-round');
    if (abortBtn) {
        abortBtn.addEventListener('click', () => {
            document.body.classList.remove('round-active');
            document.getElementById('oncourse-setup').classList.remove('hidden');
            document.getElementById('oncourse-hub').classList.add('hidden');
        });
    }
}

// --- Starting Points Math ---
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
    } catch (e) { console.error(e); }
    return 0;
}

function calculateStartingPoints(spConfig, handicap) {
    let pts = { round: 0, hole: 0 };
    if (!spConfig) return pts;

    if (spConfig.perRound && spConfig.perRound.enabled) {
        if (spConfig.perRound.type === 'fixed') pts.round = parseInt(spConfig.perRound.value) || 0;
        else if (spConfig.perRound.type === 'calc') pts.round = Math.round((parseInt(spConfig.perRound.base) || 36) - handicap);
    }

    if (spConfig.perHole && spConfig.perHole.enabled) {
        if (spConfig.perHole.type === 'fixed') pts.hole = parseInt(spConfig.perHole.value) || 0;
        else if (spConfig.perHole.type === 'calc') pts.hole = Math.round((parseInt(spConfig.perHole.base) || 2) - handicap);
    }
    return pts;
}


function loadHole() {
    // Top hole nav UI
    const fh = document.getElementById('oc-hole-display');
    const ph = document.getElementById('oc-par-display');
    const dotsContainer = document.getElementById('oc-hole-dots');

    if (fh) fh.textContent = `Hole ${AppState.currentHole}`;

    const parForHole = AppState.currentCoursePars[AppState.currentHole - 1] || 0;
    if (ph) ph.textContent = parForHole > 0 ? `Par ${parForHole}` : `Par ?`;

    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        for (let i = 1; i <= AppState.currentRoundHoles; i++) {
            const dot = document.createElement('div');
            dot.className = 'hole-dot';
            if (i < AppState.currentHole) dot.classList.add('done');
            else if (i === AppState.currentHole) dot.classList.add('current');
            dotsContainer.appendChild(dot);
        }
    }

    // Build Group Scores UI
    const scoresContainer = document.getElementById('oc-group-scores');
    if (!scoresContainer) return;
    scoresContainer.innerHTML = '';

    AppState.liveRoundGroups.forEach((p, index) => {
        const pDiv = document.createElement('div');
        pDiv.style.marginBottom = '20px';
        pDiv.style.background = '#f8fafc';
        pDiv.style.padding = '15px';
        pDiv.style.borderRadius = '12px';

        const header = document.createElement('h3');
        header.style.marginTop = '0';
        header.style.marginBottom = '10px';
        header.style.fontSize = '1.3rem';
        header.textContent = p.name;
        if (p.startingPoints && (p.startingPoints.round > 0 || p.startingPoints.hole > 0)) {
            const spSpan = document.createElement('span');
            spSpan.style.fontSize = '0.9rem';
            spSpan.style.color = 'var(--primary-color)';
            spSpan.style.marginLeft = '10px';
            spSpan.textContent = `(SP: +${p.startingPoints.hole}/hole)`;
            header.appendChild(spSpan);
        }
        pDiv.appendChild(header);

        const simpleStatsDiv = document.createElement('div');
        simpleStatsDiv.className = 'mobile-grid three-cols';
        simpleStatsDiv.style.marginBottom = '15px';

        // Fairway Hit Button (Hide if Par 3)
        if (parForHole !== 3) {
            const btnFwy = document.createElement('button');
            btnFwy.className = "btn-grid";
            btnFwy.innerHTML = 'Fwy<br><span style="font-size:1.5rem">🤷</span>';
            if (p.simpleStats[AppState.currentHole]?.fwy === true) {
                btnFwy.classList.add('btn-good');
                btnFwy.innerHTML = 'Fwy<br><span style="font-size:1.5rem">✅</span>';
            } else if (p.simpleStats[AppState.currentHole]?.fwy === false) {
                btnFwy.classList.add('btn-bad');
                btnFwy.innerHTML = 'Fwy<br><span style="font-size:1.5rem">❌</span>';
            }
            btnFwy.addEventListener('click', () => {
                if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                if (p.simpleStats[AppState.currentHole].fwy === true) {
                    p.simpleStats[AppState.currentHole].fwy = false;
                    btnFwy.className = 'btn-grid btn-bad';
                    btnFwy.innerHTML = 'Fwy<br><span style="font-size:1.5rem">❌</span>';
                } else {
                    p.simpleStats[AppState.currentHole].fwy = true;
                    btnFwy.className = 'btn-grid btn-good';
                    btnFwy.innerHTML = 'Fwy<br><span style="font-size:1.5rem">✅</span>';
                }
            });
            simpleStatsDiv.appendChild(btnFwy);
        } else {
            const placeholder = document.createElement('div');
            simpleStatsDiv.appendChild(placeholder);
        }

        // GIR Button
        const btnGIR = document.createElement('button');
        btnGIR.className = "btn-grid";
        btnGIR.innerHTML = 'GIR<br><span style="font-size:1.5rem">🤷</span>';
        if (p.simpleStats[AppState.currentHole]?.gir === true) {
            btnGIR.classList.add('btn-good');
            btnGIR.innerHTML = 'GIR<br><span style="font-size:1.5rem">✅</span>';
        } else if (p.simpleStats[AppState.currentHole]?.gir === false) {
            btnGIR.classList.add('btn-bad');
            btnGIR.innerHTML = 'GIR<br><span style="font-size:1.5rem">❌</span>';
        }
        btnGIR.addEventListener('click', () => {
            if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
            if (p.simpleStats[AppState.currentHole].gir === true) {
                p.simpleStats[AppState.currentHole].gir = false;
                btnGIR.className = 'btn-grid btn-bad';
                btnGIR.innerHTML = 'GIR<br><span style="font-size:1.5rem">❌</span>';
            } else {
                p.simpleStats[AppState.currentHole].gir = true;
                btnGIR.className = 'btn-grid btn-good';
                btnGIR.innerHTML = 'GIR<br><span style="font-size:1.5rem">✅</span>';
            }
        });
        simpleStatsDiv.appendChild(btnGIR);

        // Putts Stepper
        const currentPutts = p.simpleStats[AppState.currentHole]?.putts || 0;
        const puttsWrapper = document.createElement('div');
        puttsWrapper.style.display = 'flex';
        puttsWrapper.style.flexDirection = 'column';
        puttsWrapper.style.alignItems = 'center';
        puttsWrapper.innerHTML = `
             <div style="font-size:0.9rem; font-weight:bold; margin-bottom:5px; color:#64748b;">Putts</div>
             <div style="display:flex; align-items:center;">
                 <button class="btn-putt-minus" style="width:34px; height:34px; border-radius:50%; border:1px solid #cbd5e1; background:white; font-size:1.2rem; cursor:pointer;">-</button>
                 <input type="number" class="putts-val" value="${currentPutts}" readonly style="width:40px; text-align:center; border:none; background:transparent; font-size:1.2rem; font-weight:bold; margin:0 5px;">
                 <button class="btn-putt-plus" style="width:34px; height:34px; border-radius:50%; border:1px solid #cbd5e1; background:white; font-size:1.2rem; cursor:pointer;">+</button>
             </div>
         `;
        if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = { putts: 0 };
        puttsWrapper.querySelector('.btn-putt-plus').addEventListener('click', () => {
            p.simpleStats[AppState.currentHole].putts++;
            puttsWrapper.querySelector('.putts-val').value = p.simpleStats[AppState.currentHole].putts;
        });
        puttsWrapper.querySelector('.btn-putt-minus').addEventListener('click', () => {
            if (p.simpleStats[AppState.currentHole].putts > 0) {
                p.simpleStats[AppState.currentHole].putts--;
                puttsWrapper.querySelector('.putts-val').value = p.simpleStats[AppState.currentHole].putts;
            }
        });
        simpleStatsDiv.appendChild(puttsWrapper);
        pDiv.appendChild(simpleStatsDiv);

        // Dynamic Custom Rule Counters
        if (AppState.currentLiveCompId && AppState.currentLiveCompRules && AppState.currentLiveCompRules.length > 0) {
            const rulesContainer = document.createElement('div');
            rulesContainer.style.background = '#e2e8f0';
            rulesContainer.style.padding = '10px';
            rulesContainer.style.borderRadius = '8px';
            rulesContainer.style.marginBottom = '15px';

            const rHeader = document.createElement('div');
            rHeader.style.fontSize = '0.85rem';
            rHeader.style.fontWeight = 'bold';
            rHeader.style.color = '#475569';
            rHeader.style.marginBottom = '8px';
            rHeader.textContent = "Competition Points (This Hole)";
            rulesContainer.appendChild(rHeader);

            if (!p.compStats) p.compStats = {};
            if (!p.compStats[AppState.currentHole]) p.compStats[AppState.currentHole] = {};

            AppState.currentLiveCompRules.forEach(rule => {
                let currentRuleCount = p.compStats[AppState.currentHole][rule.name] || 0;
                if (currentRuleCount === undefined) currentRuleCount = 0;

                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.justifyContent = 'space-between';
                row.style.marginBottom = '5px';

                row.innerHTML = `
                     <div style="font-size:0.9rem;">${rule.name} <span style="color:#64748b; font-size:0.8rem">(${rule.pts}pt)</span></div>
                     <div style="display:flex; align-items:center;">
                         <button class="btn-rule-minus" data-rule="${rule.name}" style="width:30px; height:30px; border-radius:50%; border:1px solid #cbd5e1; background:white; font-size:1.2rem; cursor:pointer;">-</button>
                         <input type="number" class="rule-val" value="${currentRuleCount}" readonly style="width:40px; text-align:center; border:none; background:transparent; font-size:1.1rem; font-weight:bold; margin:0 5px;">
                         <button class="btn-rule-plus" data-rule="${rule.name}" style="width:30px; height:30px; border-radius:50%; border:1px solid #cbd5e1; background:white; font-size:1.2rem; cursor:pointer;">+</button>
                     </div>
                 `;

                row.querySelector('.btn-rule-plus').addEventListener('click', () => {
                    p.compStats[AppState.currentHole][rule.name] = (p.compStats[AppState.currentHole][rule.name] || 0) + 1;
                    row.querySelector('.rule-val').value = p.compStats[AppState.currentHole][rule.name];
                });
                row.querySelector('.btn-rule-minus').addEventListener('click', () => {
                    if ((p.compStats[AppState.currentHole][rule.name] || 0) > 0) {
                        p.compStats[AppState.currentHole][rule.name]--;
                        row.querySelector('.rule-val').value = p.compStats[AppState.currentHole][rule.name];
                    }
                });
                rulesContainer.appendChild(row);
            });
            pDiv.appendChild(rulesContainer);
        }

        // Total Score Stepper
        const currentScore = p.scores[AppState.currentHole] || 0;
        const scoreCtrl = document.createElement('div');
        scoreCtrl.style.display = 'flex';
        scoreCtrl.style.alignItems = 'center';
        scoreCtrl.style.background = 'white';
        scoreCtrl.style.borderRadius = '12px';
        scoreCtrl.style.border = '2px solid #e2e8f0';
        scoreCtrl.style.padding = '10px';

        scoreCtrl.innerHTML = `
             <div style="font-weight:bold; font-size:1.1rem; flex:1;">Total Strokes</div>
             <button class="btn-score-minus" style="width:44px; height:44px; border-radius:50%; border:1px solid #cbd5e1; background:white; font-size:1.5rem; cursor:pointer;">-</button>
             <input type="number" class="score-val" value="${currentScore}" readonly style="width:50px; text-align:center; border:none; font-size:1.5rem; font-weight:bold; margin:0 10px; color:var(--primary-color);">
             <button class="btn-score-plus" style="width:44px; height:44px; border-radius:50%; border:1px solid #cbd5e1; background:var(--primary-color); color:white; font-size:1.5rem; cursor:pointer;">+</button>
         `;

        const scoreValInput = scoreCtrl.querySelector('.score-val');
        scoreCtrl.querySelector('.btn-score-plus').addEventListener('click', () => {
            const current = parseInt(scoreValInput.value) || 0;
            scoreValInput.value = current + 1;
            p.scores[AppState.currentHole] = current + 1;
        });
        scoreCtrl.querySelector('.btn-score-minus').addEventListener('click', () => {
            const current = parseInt(scoreValInput.value) || 0;
            if (current > 0) {
                scoreValInput.value = current - 1;
                p.scores[AppState.currentHole] = current - 1;
            }
        });
        pDiv.appendChild(scoreCtrl);

        scoresContainer.appendChild(pDiv);
    });
}

function bindHoleNav() {
    const btnPrev = document.getElementById('btn-oc-prev-hole');
    const btnNext = document.getElementById('btn-oc-next-hole');

    if (btnPrev && btnNext) {
        btnPrev.addEventListener('click', () => {
            if (AppState.currentHole > 1) {
                AppState.currentHole--;
                loadHole();
            }
        });
        btnNext.addEventListener('click', () => {
            if (AppState.currentHole < AppState.currentRoundHoles) {
                showToast("Hole Saved ✅");
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
    const modal = document.getElementById('oc-finish-modal');
    modal.classList.add('hidden');

    const holesPlayedStr = document.getElementById('oc-finish-holes').value;

    const manualCR = document.getElementById('oc-manual-cr');
    const manualSR = document.getElementById('oc-manual-sr');
    const cr = manualCR ? parseFloat(manualCR.value) : 72;
    const sr = manualSR ? parseFloat(manualSR.value) : 113;

    try {
        for (let p of AppState.liveRoundGroups) {
            let totalGross = 0;
            for (const h in p.scores) totalGross += p.scores[h];

            let sumSimplePutts = 0;
            let sumSimpleGIR = 0;
            let sumSimpleFwy = 0;
            for (const h in p.simpleStats) {
                if (p.simpleStats[h].putts) sumSimplePutts += p.simpleStats[h].putts;
                if (p.simpleStats[h].gir) sumSimpleGIR += 1;
                if (p.simpleStats[h].fwy) sumSimpleFwy += 1;
            }

            // Save to WHS Database
            await addDoc(collection(db, "whs_rounds"), {
                uid: p.uid,
                course: AppState.currentRoundCourseName + ` (${holesPlayedStr}H)`,
                rating: cr,
                slope: sr,
                adjustedGross: totalGross,
                date: serverTimestamp(),
                notCounting: false,
                isLiveTracked: true,
                liveRoundsMode: AppState.currentTrackingMode,
                stats: {
                    putts: sumSimplePutts,
                    gir: sumSimpleGIR,
                    fwy: sumSimpleFwy
                }
            });

            // Save to Competitions if active
            if (AppState.currentLiveCompId && AppState.currentLiveCompRules) {
                let totalPts = 0;
                let finalRuleCounts = {};

                AppState.currentLiveCompRules.forEach(rule => finalRuleCounts[rule.name] = 0);

                for (const hole in p.compStats) {
                    for (const rName in p.compStats[hole]) {
                        const count = p.compStats[hole][rName];
                        if (count > 0) {
                            if (!finalRuleCounts[rName]) finalRuleCounts[rName] = 0;
                            finalRuleCounts[rName] += count;
                            const ruleDef = AppState.currentLiveCompRules.find(x => x.name === rName);
                            if (ruleDef) totalPts += (count * ruleDef.pts);
                        }
                    }
                }

                // Add Base automated starting points
                if (p.startingPoints) {
                    if (p.startingPoints.round > 0) {
                        totalPts += p.startingPoints.round;
                        finalRuleCounts["Base SP (Round)"] = p.startingPoints.round;
                    }
                    if (p.startingPoints.hole > 0) {
                        const holeSPTotal = p.startingPoints.hole * parseInt(holesPlayedStr);
                        totalPts += holeSPTotal;
                        finalRuleCounts["Base SP (Holes)"] = holeSPTotal;
                    }
                }

                await addDoc(collection(db, "comp_rounds"), {
                    uid: p.uid,
                    playerName: p.name,
                    compId: AppState.currentLiveCompId,
                    totalPoints: totalPts,
                    ruleCounts: finalRuleCounts,
                    date: serverTimestamp(),
                    isLiveTracked: true
                });
            }
        }

        alert("Scores Saved to WHS Database successfully.");
        document.body.classList.remove('round-active');
        document.getElementById('oncourse-setup').classList.remove('hidden');
        document.getElementById('oncourse-hub').classList.add('hidden');
        AppState.liveRoundGroups = [];
        if (UI.ocAddedPlayersList) UI.ocAddedPlayersList.innerHTML = '';

    } catch (err) {
        console.error("Save failed", err);
        alert("Failed to save. Check your connection.");
    }
}


function bindShotWizard() {
    const btnTrackShot = document.getElementById('btn-oc-track-shot');
    const wizardDiv = document.getElementById('oncourse-wizard');
    const btnCancelWiz = document.getElementById('btn-wizard-cancel');
    const wizSkipBtn = document.querySelector('#wizard-step-line .wiz-skip');

    if (btnTrackShot) {
        btnTrackShot.addEventListener('click', () => {
            wizardDiv.classList.remove('hidden');
            AppState.currentShotData = { hole: AppState.currentHole, timestamp: new Date().toISOString() };
            showWizardStep('wizard-step-club', "Select Club");
        });
    }

    if (btnCancelWiz) {
        btnCancelWiz.addEventListener('click', () => {
            wizardDiv.classList.add('hidden');
        });
    }

    function showWizardStep(stepId, title) {
        document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('hidden'));
        const step = document.getElementById(stepId);
        if (step) step.classList.remove('hidden');
        const titleEl = document.getElementById('wizard-title');
        if (titleEl) titleEl.textContent = title;
    }

    // Wizard Flow Control
    document.querySelectorAll('#wizard-step-club .btn-grid').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const clubBtn = e.target.closest('.btn-grid');
            const club = clubBtn ? clubBtn.getAttribute('data-val') : null;
            if (!club) return;
            AppState.currentShotData.club = club;

            if (club === 'Putter') {
                showWizardStep('wizard-step-putt', "Putting");
            } else {
                if (AppState.currentTrackingMode === 'detailed') {
                    showWizardStep('wizard-step-trajectory', "Ball Flight");
                    document.querySelectorAll('[data-traj]').forEach(b => b.style.opacity = '1');
                    delete AppState.currentShotData.trajectory;
                } else {
                    showWizardStep('wizard-step-line', "Start Line & Curve");
                }
            }
        });
    });

    // Step 1b: Trajectory
    document.querySelectorAll('#wizard-step-trajectory .btn-grid[data-traj]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const trajBtn = e.target.closest('.btn-grid');
            const traj = trajBtn ? trajBtn.getAttribute('data-traj') : null;
            if (!traj) return;
            AppState.currentShotData.trajectory = traj;
            document.querySelectorAll('[data-traj]').forEach(b => b.style.opacity = '0.4');
            e.target.style.opacity = '1';

            setTimeout(() => {
                showWizardStep('wizard-step-line', "Start Line & Curve");
            }, 250);
        });
    });

    const btnSkipTraj = document.querySelector('#wizard-step-trajectory .wiz-skip');
    if (btnSkipTraj) {
        btnSkipTraj.addEventListener('click', () => {
            showWizardStep('wizard-step-line', "Start Line & Curve");
        });
    }

    // Step 2: Line & Curve
    document.querySelectorAll('#wizard-step-line .btn-grid').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const lineBtn = e.target.closest('.btn-grid');
            const line = lineBtn ? lineBtn.getAttribute('data-line') : null;
            const curve = lineBtn ? lineBtn.getAttribute('data-curve') : null;

            if (line) {
                document.querySelectorAll('[data-line]').forEach(b => b.style.opacity = '0.4');
                e.target.style.opacity = '1';
                AppState.currentShotData.line = line;
            }
            if (curve) {
                document.querySelectorAll('[data-curve]').forEach(b => b.style.opacity = '0.4');
                e.target.style.opacity = '1';
                AppState.currentShotData.curve = curve;
            }

            if (AppState.currentShotData.line && AppState.currentShotData.curve) {
                setTimeout(() => {
                    showWizardStep('wizard-step-outcome', "Shot Result");
                    document.querySelectorAll('#wizard-step-outcome .btn-grid').forEach(b => b.style.opacity = '1');
                    delete AppState.currentShotData.distanceControl;
                    delete AppState.currentShotData.outcome;
                }, 250);
            }
        });
    });

    if (wizSkipBtn) {
        wizSkipBtn.addEventListener('click', () => {
            showWizardStep('wizard-step-outcome', "Shot Result");
            document.querySelectorAll('#wizard-step-outcome .btn-grid').forEach(b => b.style.opacity = '1');
            delete AppState.currentShotData.distanceControl;
            delete AppState.currentShotData.outcome;
        });
    }

    // Step 3: Outcome
    document.querySelectorAll('#wizard-step-outcome .btn-grid').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const outBtn = e.target.closest('.btn-grid');
            const dist = outBtn ? outBtn.getAttribute('data-dist') : null;
            const out = outBtn ? outBtn.getAttribute('data-out') : null;

            if (dist) {
                document.querySelectorAll('[data-dist]').forEach(b => b.style.opacity = '0.4');
                e.target.style.opacity = '1';
                AppState.currentShotData.distanceControl = dist;
            }
            if (out) {
                document.querySelectorAll('[data-out]').forEach(b => b.style.opacity = '0.4');
                e.target.style.opacity = '1';
                AppState.currentShotData.outcome = out;
            }

            if (AppState.currentShotData.distanceControl && AppState.currentShotData.outcome) {
                setTimeout(() => {
                    if (AppState.currentTrackingMode === 'detailed') {
                        showWizardStep('wizard-step-routine', "Mental Routine");
                    } else {
                        saveShotData();
                    }
                }, 250);
            }
        });
    });

    // Step 4: Putting
    document.querySelectorAll('#wizard-step-putt .btn-grid').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const puttBtn = e.target.closest('.btn-grid');
            const pline = puttBtn ? puttBtn.getAttribute('data-pline') : null;
            const pdist = puttBtn ? puttBtn.getAttribute('data-pdist') : null;

            if (pline) {
                document.querySelectorAll('[data-pline]').forEach(b => b.style.opacity = '0.4');
                e.target.style.opacity = '1';
                AppState.currentShotData.puttLine = pline;
            }
            if (pdist) {
                document.querySelectorAll('[data-pdist]').forEach(b => b.style.opacity = '0.4');
                e.target.style.opacity = '1';
                AppState.currentShotData.puttDistance = pdist;
            }

            if (AppState.currentShotData.puttLine && AppState.currentShotData.puttDistance) {
                setTimeout(() => {
                    if (AppState.currentTrackingMode === 'detailed') {
                        showWizardStep('wizard-step-routine', "Mental Routine");
                    } else {
                        saveShotData();
                    }
                }, 250);
            }
        });
    });

    // Step 5: Routine
    document.querySelectorAll('#wizard-step-routine .btn-grid').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const rBtn = e.target.closest('.btn-grid');
            const type = rBtn ? rBtn.getAttribute('data-routine') : null;
            const val = rBtn ? rBtn.getAttribute('data-val') : null;
            if (!type || !val) return;

            // Simple visual toggle
            const siblings = rBtn.parentElement.querySelectorAll('.btn-grid');
            siblings.forEach(s => {
                s.style.opacity = '0.4';
                s.classList.remove('btn-good', 'btn-bad');
            });
            rBtn.style.opacity = '1';
            rBtn.classList.add(val === 'Pass' ? 'btn-good' : 'btn-bad');

            AppState.currentShotData[type + 'Routine'] = val;
        });
    });

    const btnSaveRoutine = document.getElementById('btn-save-shot-routine');
    if (btnSaveRoutine) {
        btnSaveRoutine.addEventListener('click', saveShotData);
    }
}

async function saveShotData() {
    if (!AppState.currentUser) return;

    const wizardDiv = document.getElementById('oncourse-wizard');
    wizardDiv.classList.add('hidden');

    const payload = {
        uid: AppState.currentUser.uid,
        ...AppState.currentShotData
    };

    try {
        await addDoc(collection(db, "shots"), payload);
        showToast("Shot Logged ⛳");
    } catch (err) {
        console.error("Failed to log shot", err);
        showToast("Error saving shot.");
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#10b981';
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '30px';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '9999';
    toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease-in-out';
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.style.opacity = '1', 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
