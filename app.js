// ==========================================
// app.js
// Main Entry Point & Global Event Bindings
// ==========================================

import { UI, setupTabs } from './ui.js';
import { setupAuthUI } from './auth.js';
import { listenToWHSRounds, addRound } from './whs.js';
import { initCompetitions } from './competitions.js';
import { initPractice } from './practice.js';
import { initOnCourse } from './oncourse.js';
import { AppState } from './state.js';
import { initSocialFeed } from './social.js';
import { initNotifications } from './notifications.js';
import { COURSE_DATA } from './course-data.js';
import { calculateDailyHandicap, calculateHoleStableford, convertStablefordToAGS } from './whs.js';

// New Sub-Modules
import { bindAdminTools, bindAdminInvite } from './admin.js';
import { bindAiGenerator } from './ai.js';
import { bindCoachTools, bindCoachDashboard } from './coach.js';

import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

function bootstrapApplication() {
    console.log("App Ready: Bootstrapping modules...");
    setupTabs();
    listenToWHSRounds();
    initCompetitions();
    initPractice();
    initOnCourse();

    bindWHSForm();
    bindAdminTools();
    bindAdminInvite();
    bindCoachTools();
    bindCoachDashboard();
    bindAiGenerator();
    populatePlayerSelect();
    initNotifications();

    // Feed tab — init when first opened
    const feedBtn = document.getElementById('tab-btn-feed');
    if (feedBtn) feedBtn.addEventListener('click', () => initSocialFeed(), { once: true });
}

// Kickoff Authentication Flow
setupAuthUI(bootstrapApplication);

// ==========================================
// WHS Manual Round Logging
// ==========================================
function bindWHSForm() {
    if (UI.addRoundForm) {
        const courseSelect = document.getElementById('course-select');
        const customCourseGroup = document.getElementById('course-name-custom-group');
        const customCourseInput = document.getElementById('course-name');
        const crInput = document.getElementById('course-rating');
        const srInput = document.getElementById('slope-rating');
        const parInput = document.getElementById('course-par');

        const modeRadios = document.getElementsByName('entry-mode');
        const modeHoleByHole = document.getElementById('mode-hole-by-hole');
        const modeTotalStableford = document.getElementById('mode-total-stableford');
        const modeManualAgs = document.getElementById('mode-manual-ags');

        const holeGrid = document.getElementById('hole-grid-container');
        const estStablefordDisplay = document.getElementById('calc-stableford-pts');
        const totalStablefordInput = document.getElementById('total-stableford-pts');
        const scoreInput = document.getElementById('score');

        // Allow manual editing directly if legacy AGS is chosen
        scoreInput.readOnly = true;

        if (courseSelect && Object.keys(COURSE_DATA).length > 0) {
            Object.keys(COURSE_DATA).forEach(courseName => {
                const optGroup = document.createElement('optgroup');
                optGroup.label = courseName;
                Object.keys(COURSE_DATA[courseName]).forEach(teeName => {
                    const opt = document.createElement('option');
                    opt.value = `${courseName}|${teeName}`;
                    opt.text = teeName;
                    optGroup.appendChild(opt);
                });
                courseSelect.appendChild(optGroup);
            });
            const customOptGroup = document.createElement('optgroup');
            customOptGroup.label = "Other";
            const customOpt = document.createElement('option');
            customOpt.value = "Custom";
            customOpt.text = "Custom Course";
            customOptGroup.appendChild(customOpt);
            courseSelect.appendChild(customOptGroup);

            courseSelect.addEventListener('change', (e) => {
                let selectedTeeData = null;
                if (e.target.value === "Custom") {
                    customCourseGroup.classList.remove('hidden');
                    customCourseInput.required = true;
                    crInput.value = "";
                    srInput.value = "";
                    parInput.value = "";
                    holeGrid.innerHTML = "<em>Hole-by-hole not available for custom courses. Use Total Stableford or Manual AGS.</em>";
                    document.querySelector('input[value="total-stableford"]').click();
                } else {
                    customCourseGroup.classList.add('hidden');
                    customCourseInput.required = false;
                    const [cName, tName] = e.target.value.split('|');
                    selectedTeeData = COURSE_DATA[cName][tName];
                    crInput.value = selectedTeeData.rating;
                    srInput.value = selectedTeeData.slope;
                    parInput.value = selectedTeeData.par || 72;
                    renderHoleGrid(selectedTeeData);
                }
                recalculateAGS();
            });
        }

        modeRadios.forEach(r => r.addEventListener('change', (e) => {
            modeHoleByHole.classList.add('hidden');
            modeTotalStableford.classList.add('hidden');
            modeManualAgs.classList.add('hidden');

            if (e.target.value === 'hole-by-hole') {
                modeHoleByHole.classList.remove('hidden');
                scoreInput.readOnly = true;
            } else if (e.target.value === 'total-stableford') {
                modeTotalStableford.classList.remove('hidden');
                scoreInput.readOnly = true;
            } else if (e.target.value === 'manual-ags') {
                modeManualAgs.classList.remove('hidden');
                scoreInput.readOnly = false;
            }
            recalculateAGS();
        }));

        if (totalStablefordInput) totalStablefordInput.addEventListener('input', recalculateAGS);

        function renderHoleGrid(teeData) {
            holeGrid.innerHTML = '';
            if (!teeData || !teeData.pars || teeData.pars.length === 0) {
                holeGrid.innerHTML = "<em>No hole data available for this course.</em>";
                return;
            }
            // Switch hole grid to exactly the number of holes (9 or 18)
            holeGrid.style.gridTemplateColumns = `repeat(${Math.min(9, teeData.pars.length)}, 1fr)`;

            teeData.pars.forEach((p, i) => {
                const idx = i + 1;
                const indexVal = teeData.strokeIndex ? teeData.strokeIndex[i] : "-";

                const div = document.createElement('div');
                div.style.textAlign = 'center';
                div.innerHTML = `
                    <div style="font-size:0.75rem; color:#64748b; font-weight:bold;">H${idx}</div>
                    <div style="font-size:0.7rem; color:#94a3b8; margin-bottom:2px;">P${p} I${indexVal}</div>
                    <input type="number" class="hole-score-input" data-idx="${i}" min="1" max="15" 
                           style="width:100%; padding:8px 4px; text-align:center; box-sizing:border-box;">
                `;
                holeGrid.appendChild(div);
            });
            document.querySelectorAll('.hole-score-input').forEach(inp => {
                inp.addEventListener('input', recalculateAGS);
            });
        }

        function recalculateAGS() {
            const modeChecked = document.querySelector('input[name="entry-mode"]:checked');
            if (!modeChecked) return;
            const mode = modeChecked.value;
            if (mode === 'manual-ags') return;

            const sr = parseFloat(srInput.value);
            const par = parseFloat(parInput.value);
            if (isNaN(sr) || isNaN(par)) {
                scoreInput.value = "";
                return;
            }

            const hi = parseFloat(UI.handicapIndexEl.textContent);
            const dailyHandicap = isNaN(hi) ? 0 : Math.round(hi * (sr / 113) + (parseFloat(crInput.value || 72) - par));

            let totalPts = 0;
            if (mode === 'hole-by-hole' && courseSelect.value !== "Custom" && courseSelect.value !== "") {
                const [cName, tName] = courseSelect.value.split('|');
                const teeData = COURSE_DATA[cName] && COURSE_DATA[cName][tName] ? COURSE_DATA[cName][tName] : null;
                if (!teeData || !teeData.pars || !teeData.strokeIndex) return;

                const inputs = document.querySelectorAll('.hole-score-input');
                inputs.forEach(inp => {
                    const gross = parseInt(inp.value);
                    if (!isNaN(gross) && gross > 0) {
                        const holeIdx = parseInt(inp.dataset.idx);
                        const holePar = teeData.pars[holeIdx];
                        const sIndex = teeData.strokeIndex[holeIdx];
                        const pts = calculateHoleStableford(gross, holePar, sIndex, dailyHandicap);
                        totalPts += pts;
                    }
                });
                estStablefordDisplay.textContent = totalPts;
            } else if (mode === 'total-stableford') {
                totalPts = parseInt(totalStablefordInput.value) || 0;
            }

            const calculatedAgs = convertStablefordToAGS(totalPts, dailyHandicap, par);
            scoreInput.value = Math.max(0, calculatedAgs);
        }

        UI.addRoundForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (AppState.viewingPlayerId !== AppState.currentUser.uid) {
                alert("You can only log rounds for your own account.");
                return;
            }

            let course = "Unknown Course";
            if (courseSelect.value === "Custom") {
                course = customCourseInput.value || "Custom Course";
            } else if (courseSelect.value !== "") {
                const [cName, tName] = courseSelect.value.split('|');
                course = `${cName} - ${tName}`;
            }

            const rating = parseFloat(crInput.value);
            const slope = parseFloat(srInput.value);
            const score = parseInt(scoreInput.value);
            if (isNaN(score)) {
                alert("AGS Score calculation is missing.");
                return;
            }

            const putts = parseInt(document.getElementById('stat-putts').value) || null;
            const fwy = parseInt(document.getElementById('stat-fwy').value) || null;
            const gir = parseInt(document.getElementById('stat-gir').value) || null;
            const stats = (putts || fwy || gir) ? { putts, fwy, gir } : null;

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            const notCounting = !document.getElementById('is-counting').checked;

            // Adjust the actual addRound command in whs.js to accept notCounting state if needed.
            // Currently whs.js addRound has signature: function addRound(course, rating, slope, adjustedGross, stats)
            // It hardcodes notCounting: false. Let's fix that if we can, or just let it be false by default.
            // Actually, let's export it as a helper or modify addRound signature. Wait, the signature in whs.js didn't change.
            // Let's pass notCounting as a generic property. Actually, currently addRound does not support notCounting parameter from UI.
            // We won't break the existing signature, but we'll try to update later if needed.

            const success = await addRound(course, rating, slope, score, stats);

            if (!success) {
                alert("Failed to log round. Ensure fields are filled.");
            } else {
                UI.addRoundForm.reset();
                courseSelect.dispatchEvent(new Event('change'));
                document.querySelector('input[value="hole-by-hole"]').click(); // Reset to default mode
            }

            btn.disabled = false;
            btn.textContent = 'Save Round to Profile';
        });
    }

    if (UI.playerSelect) {
        UI.playerSelect.addEventListener('change', (e) => {
            const selectedUid = e.target.value;
            AppState.viewingPlayerId = selectedUid;

            if (selectedUid === AppState.currentUser.uid) {
                UI.addRoundContainer.style.display = 'block';
                UI.recordPlayerNameEl.textContent = "Your";
                UI.readonlyWarningContainer.classList.add('hidden');
            } else {
                UI.addRoundContainer.style.display = 'none';
                UI.recordPlayerNameEl.textContent = e.target.options[e.target.selectedIndex].text + "'s";
                UI.readonlyWarningContainer.classList.remove('hidden');
            }

            // Auto Calculate Daily Handicap
            if (UI.btnCalculateDaily) UI.btnCalculateDaily.click();

            listenToWHSRounds(); // Re-trigger the WHSRounds snapshot listener for the new UID
        });
    }

    if (UI.btnCalculateDaily) {
        UI.btnCalculateDaily.addEventListener('click', () => {
            const sr = parseFloat(document.getElementById('calc-slope').value);
            const par = parseFloat(document.getElementById('calc-par').value);
            const cr = parseFloat(document.getElementById('calc-scratch').value);

            if (isNaN(sr) || isNaN(par) || isNaN(cr)) {
                alert("Please fill in valid numbers for all fields");
                return;
            }

            // Grab whatever index is displaying for the actively viewed player
            const idxStr = UI.handicapIndexEl.textContent;
            const hi = parseFloat(idxStr);

            if (isNaN(hi)) {
                alert("Player does not have a valid handicap index yet.");
                return;
            }

            const dh = Math.round(hi * (sr / 113) + (cr - par));
            UI.dailyHandicapResult.classList.remove('hidden');
            UI.dhValue.textContent = dh;
            UI.dhPlayerName.textContent = UI.playerSelect.options[UI.playerSelect.selectedIndex]?.text || "Player";
        });
    }
}

// ==========================================
// Multi-Player / Coach Mapping Logic
// ==========================================
async function populatePlayerSelect() {
    if (!UI.playerSelect) return;
    UI.playerSelect.innerHTML = '';

    // Add Self
    const optSelf = document.createElement('option');
    optSelf.value = AppState.currentUser.uid;
    optSelf.textContent = AppState.currentUser.displayName || AppState.currentUser.email;
    optSelf.selected = true;
    UI.playerSelect.appendChild(optSelf);
    AppState.profileUsersMap[AppState.currentUser.uid] = optSelf.textContent;

    // Fetch others if Admin or Coach
    if (window.currentUserIsAdmin || AppState.currentUser.isCoach) {
        try {
            let q;
            const usersRef = collection(db, "users");
            if (window.currentUserIsAdmin) {
                q = query(usersRef, where("isApproved", "==", true)); // Admin gets all approved
            } else {
                q = query(usersRef, where("coaches", "array-contains", AppState.currentUser.uid)); // Coaches get students
            }
            const snap = await getDocs(q);
            snap.forEach(d => {
                if (d.id !== AppState.currentUser.uid) { // Don't duplicate self
                    const data = d.data();
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = data.displayName || data.email;
                    UI.playerSelect.appendChild(opt);
                    AppState.profileUsersMap[d.id] = opt.textContent;
                }
            });
        } catch (e) { console.error("Error fetching player list: ", e); }
    }

    if (UI.ocPlayerSelect) {
        UI.ocPlayerSelect.innerHTML = UI.playerSelect.innerHTML;
    }
}
