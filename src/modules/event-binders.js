import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { escapeHtml } from '../escape.js';

export function bindAddPlayer() {
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

export function bindCompQuickAdd() {
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
            const container = document.getElementById('oc-comp-regulars-select');
            if (!container) return;

            const checkedInputs = Array.from(container.querySelectorAll('input:checked'));
            if (checkedInputs.length === 0) {
                alert("Please select at least one player to add.");
                return;
            }

            let addedCount = 0;
            const currentGroups = [...AppState.liveRoundGroups];

            checkedInputs.forEach(input => {
                const uid = input.value;
                const name = input.getAttribute('data-name');
                if (!currentGroups.find(existing => existing.uid === uid)) {
                    currentGroups.push({
                        uid: uid,
                        name: name,
                        scores: {},
                        compStats: {},
                        simpleStats: {}
                    });
                    addedCount++;
                }
            });

            AppState.liveRoundGroups = currentGroups;
            if (addedCount > 0) {
                // Done - list re-renders reactively because of AppState proxy
                // Optionally clear checkboxes here
                checkedInputs.forEach(i => i.checked = false);
            } else {
                alert("Selected players are already in the group.");
            }
        });

        if (UI.ocLinkComp) {
            UI.ocLinkComp.addEventListener('change', () => {
                const sel = UI.ocLinkComp.options[UI.ocLinkComp.selectedIndex];
                const regulars = JSON.parse(sel.getAttribute('data-regulars') || "[]");

                const container = document.getElementById('oc-comp-regulars-select');
                if (!container) return;

                if (sel.value && regulars.length > 0) {
                    container.classList.remove('hidden');
                    // Create checkbox list for regulars
                    let html = '<label style="display:block; font-weight:bold; margin-bottom:8px; font-size:0.9rem;">Select Regulars:</label>';
                    html += '<div style="display:flex; flex-direction:column; gap:5px; max-height:150px; overflow-y:auto; border:1px solid #e2e8f0; padding:10px; border-radius:6px; background:#fff;">';
                    regulars.forEach(p => {
                        html += `
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" value="${escapeHtml(p.uid)}" data-name="${escapeHtml(p.name)}">
                                <span>${escapeHtml(p.name)}</span>
                            </label>
                        `;
                    });
                    html += '</div>';
                    container.innerHTML = html;
                    UI.btnOcQuickAdd.classList.remove('hidden'); // Show the "Add Selected" button
                } else {
                    container.classList.add('hidden');
                    container.innerHTML = '';
                    UI.btnOcQuickAdd.classList.add('hidden');
                }
            });
        }
    }
}


export function bindShotWizard() {
    const btnTrackShot = document.getElementById('btn-oc-track-shot');
    const wizardDiv = document.getElementById('oncourse-wizard');

    if (btnTrackShot) {
        btnTrackShot.addEventListener('click', () => {
            // Need to import startNewShotInput
            import('./score-input.js').then(module => module.startNewShotInput());
        });
    }

    if (UI.btnBackToHole) {
        UI.btnBackToHole.addEventListener('click', () => {
            import('./score-input.js').then(module => {
                module.setWizardActive(false);
                wizardDiv.classList.add('hidden');
            });
        });
    }

    const btnExitShot = document.getElementById('btn-wizard-cancel');
    if (btnExitShot) {
        btnExitShot.addEventListener('click', () => {
            import('./score-input.js').then(module => {
                module.setWizardActive(false);
                wizardDiv.classList.add('hidden');
            });
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

    const offGreenBtn = document.getElementById('wiz-toggle-offgreen');
    if (offGreenBtn) {
        offGreenBtn.addEventListener('click', () => {
            AppState.currentShotData.isOffGreen = !AppState.currentShotData.isOffGreen;
            offGreenBtn.classList.toggle('active', !!AppState.currentShotData.isOffGreen);
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
        UI.btnSaveShotFinal.addEventListener('click', () => {
             import('./score-input.js').then(module => module.saveShotData());
        });
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
        UI.btnWizardDelete.addEventListener('click', () => {
             import('./score-input.js').then(module => module.deleteShotData());
        });
    }
}

export function bindSetupToggles() {
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
            import('../oncourse.js').then(m => m.updateModeVisibility());
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
            import('../oncourse.js').then(m => m.updateModeVisibility());
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

async function updateDhPreview() {
    if (!AppState.currentUser) return;
    const courseName = document.getElementById('oc-course-select')?.value;
    const teeName = document.getElementById('oc-tee-select')?.value;
    const ocModule = await import('../oncourse.js');
    const hi = await ocModule.getPlayerHandicap(AppState.currentUser.uid);
    const { rating, slope, par } = ocModule.resolveRoundRatings(courseName, teeName);
    const dhValue = document.getElementById('oc-dh-value');
    const dhOverride = document.getElementById('oc-dh-override');

    if (hi !== undefined && par > 0) {
        const dh = Math.round(hi * ((slope || 113) / 113) + ((rating || 72) - par));
        if (dhValue) dhValue.textContent = dh;
        if (dhOverride) dhOverride.value = dh;
    } else {
        if (dhValue) dhValue.textContent = '0';
        if (dhOverride) dhOverride.value = '0';
    }
    ocModule.updateModeVisibility();
}

function renderSetupRatings(courseName, teeName) {
    import('../course-data.js').then(module => {
        const COURSE_DATA = module.COURSE_DATA;
        const teeData = COURSE_DATA[courseName]?.[teeName] || {};
        const ratable = module.isRatableTee(teeData);
        
        const statsPanel = document.getElementById('oc-course-stats');
        if (statsPanel) statsPanel.classList.remove('hidden');

        const parInput = document.getElementById('oc-stat-par');
        const crInput = document.getElementById('oc-stat-cr');
        const srInput = document.getElementById('oc-stat-sr');

        if (parInput) { parInput.value = teeData.par ?? ''; parInput.readOnly = ratable; }
        if (crInput) { crInput.value = teeData.rating ?? ''; crInput.readOnly = ratable; }
        if (srInput) { srInput.value = teeData.slope ?? ''; srInput.readOnly = ratable; }

        AppState.currentCoursePars = teeData.pars || [];

        const dhDisplay = document.getElementById('oc-dh-display');
        if (dhDisplay) dhDisplay.classList.remove('hidden');

        updateDhPreview();

        const triggerPreview = () => updateDhPreview();
        if (parInput) parInput.oninput = triggerPreview;
        if (crInput) crInput.oninput = triggerPreview;
        if (srInput) srInput.oninput = triggerPreview;
    });
}

export function bindCourseSelect() {
    if (UI.ocCourseSelect) {
        UI.ocCourseSelect.addEventListener('change', () => {
            const courseName = UI.ocCourseSelect.value;
            const customGroup = document.getElementById('oc-custom-course-group');
            const customNameInput = document.getElementById('oc-custom-course-name');

            if (courseName === 'Custom Course') {
                if (customGroup) customGroup.classList.remove('hidden');
                AppState.currentRoundCourseName = customNameInput ? customNameInput.value : 'Custom Course';
                if (customNameInput) {
                    customNameInput.oninput = (e) => AppState.currentRoundCourseName = e.target.value;
                }
                if (UI.ocTeeSelect) {
                    UI.ocTeeSelect.innerHTML = '<option value="" disabled selected>Custom</option>';
                    UI.ocTeeSelect.dispatchEvent(new Event('change'));
                }
                renderSetupRatings('Custom Course', '');
                return;
            } else {
                if (customGroup) customGroup.classList.add('hidden');
                AppState.currentRoundCourseName = courseName;
            }

            import('../course-data.js').then(module => {
                const COURSE_DATA = module.COURSE_DATA;
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
        });
    }

    if (UI.ocTeeSelect) {
        UI.ocTeeSelect.addEventListener('change', async () => {
            const courseName = UI.ocCourseSelect.value;
            if (courseName === 'Custom Course') return;
            const teeName = UI.ocTeeSelect.value;
            renderSetupRatings(courseName, teeName);
        });
    }
}

export function bindStartRound() {
    if (UI.btnOcStart) {
        UI.btnOcStart.addEventListener('click', async () => {
            if (AppState.liveRoundGroups.length === 0) {
                alert("Please add at least one player to track.");
                return;
            }

            const courseName = UI.ocCourseSelect.value;
            const teeName = UI.ocTeeSelect.value;

            // Single source of rating/slope/par — identical read+validation as the save (BL-4.01)
            const ocModule = await import('../oncourse.js');
            const { rating, slope, par: totalPar } = ocModule.resolveRoundRatings(courseName, teeName);

            if (!totalPar || totalPar <= 0) {
                if (document.body.dataset.activeTab === 'tab-oncourse') {
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

            // Fetch Daily Handicaps for all players (uses the single resolved rating/slope)
            const dhOverrideEl = document.getElementById('oc-dh-override');
            for (let p of AppState.liveRoundGroups) {
                const hi = await ocModule.getPlayerHandicap(p.uid);
                p.handicapIndex = hi;
                p.dailyHandicap = Math.round(hi * ((slope || 113) / 113) + ((rating || 72) - totalPar));
                if (p.uid === AppState.currentUser?.uid && dhOverrideEl) {
                    const overrideVal = parseFloat(dhOverrideEl.value);
                    if (Number.isFinite(overrideVal)) {
                        p.dailyHandicap = overrideVal;
                    }
                }
            }

            document.body.classList.add('round-active');
            document.getElementById('oncourse-setup').classList.add('hidden');
            document.getElementById('oncourse-hub').classList.remove('hidden');

            // Show new sub-nav and progress bar
            const subNav = document.getElementById('oc-sub-nav');
            if (subNav) subNav.classList.remove('hidden');
            const progress = document.getElementById('hole-jumper-container');
            if (progress) progress.classList.remove('hidden');

            import('./card-render.js').then(m => m.renderHoleJumper());
            const exitBar = document.getElementById('oc-exit-bar');
            if (exitBar) exitBar.classList.remove('hidden');

            ocModule.loadHole();
            ocModule.bindHoleNav(); // Re-bind on start
        });
    }

    const abortBtn = document.getElementById('btn-oc-abort-round');
    if (abortBtn) {
        abortBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to end this round session? All unsaved data will be cleared.")) {
                 import('../oncourse.js').then(m => m.endRoundCleanup());
            }
        });
    }
}

export function bindGlobalRoundActions() {
    const btnDiscard = document.getElementById('btn-oc-discard');
    if (btnDiscard) {
        btnDiscard.addEventListener('click', async () => {
            if (confirm("Are you sure you want to discard this round and ALL recorded shots?")) {
                try {
                    const { db } = await import('../firebase-config.js');
                    const { collection, query, where, getDocs, doc, writeBatch } = await import('firebase/firestore');
                    const batch = writeBatch(db);
                    const shotsQuery = query(collection(db, "shots"), where("roundId", "==", AppState.activeRoundId));
                    const shotSnaps = await getDocs(shotsQuery);
                    shotSnaps.forEach(sdoc => batch.delete(sdoc.ref));

                    // CRITICAL FIX: Delete the round document itself
                    const roundRef = doc(db, "whs_rounds", AppState.activeRoundId);
                    batch.delete(roundRef);

                    await batch.commit();

                    // Note: Assuming showToast exists in the file, otherwise replace with console.log
                    import('./score-input.js').then(m => m.showToast("Round & Shots discarded 🗑️"));
                    import('../oncourse.js').then(m => m.endRoundCleanup());
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
    fab.addEventListener('click', () => {
         import('../oncourse.js').then(m => m.openFinishModal());
    });
    document.body.appendChild(fab);

    // Show/Hide FAB based on round state
    window.addEventListener('stateChange', (e) => {
        if (e.detail.property === 'activeRoundId') {
            if (e.detail.newValue) fab.classList.remove('hidden');
            else fab.classList.add('hidden');
        }
    });
}

export function bindOcSubNav() {
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

            if (target === 'leaderboard') {
                 import('./card-render.js').then(m => m.updateLiveLeaderboard());
            }
        });
    });
}
