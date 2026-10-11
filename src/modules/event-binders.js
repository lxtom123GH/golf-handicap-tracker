import { AppState, mutateList } from '../state.js';
import { normaliseShotEntry, shotEntryVisibility } from "../shot-entry.js";
import { UI } from '../ui.js';
import { escapeHtml } from '../escape.js';
import { calculateDailyHandicap } from '../whs.js';
import { COURSE_DATA, holesForPar, holesForCourse } from '../course-data.js';
import { localToday, isRoundDateInFuture } from '../dates.js';
// S6 Part 2: the mapper opens course overlays by slug and resolves the
// round's course name to one.
import { courseSlugFor, loadCourseOverlay } from '../hole-overlay.js';
import { isGuestId } from '../guests.js';
import { recordSetup } from '../last-setup.js';
import { applyRememberedWakeLock } from '../wakelock.js';

/**
 * "Add guest" — a golfer with no account, whose card still builds a handicap.
 *
 * Kept separate from bindAddPlayer on purpose. Adding a REGISTERED player to the
 * group lets you mark their card for the round; it does not let you write their
 * handicap record, because only they may (firestore.rules, and PR #138 made that
 * refusal honest rather than silent). A guest is an identity you own, so their
 * round can be saved.
 */
export function bindAddGuest() {
    const btn = document.getElementById('btn-oc-add-guest');
    const input = document.getElementById('oc-guest-name');
    const note = document.getElementById('oc-guest-note');
    if (!btn || !input) return;

    const say = (msg, ok = false) => {
        if (!note) return;
        note.textContent = msg || '';
        note.style.color = ok ? '#15803d' : '#b91c1c';
        note.classList.toggle('hidden', !msg);
    };

    btn.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) { say('Give the guest a name first.'); return; }

        btn.disabled = true;
        const previous = btn.textContent;
        btn.textContent = 'Adding...';
        try {
            const { createGuest } = await import('../guests.js');
            const guest = await createGuest(name);
            AppState.liveRoundGroups = [...AppState.liveRoundGroups, {
                uid: guest.uid,
                name: guest.name,
                isGuest: true,
                scores: {},
                compStats: {},
                simpleStats: {}
            }];
            input.value = '';
            say(`${guest.name} added as a guest - their card will count toward a handicap you keep for them.`, true);
            // Owner 2026-09-20: the new guest is pickable from the list for
            // the rest of this session (next boot lists them from Firestore).
            if (UI.ocPlayerSelect) {
                // (optgroup is created at runtime — contract (b) scans literal
                // #id lookups, so find it by attribute.)
                let group = UI.ocPlayerSelect.querySelector('optgroup[data-guests]');
                if (!group) {
                    group = document.createElement('optgroup');
                    group.label = 'Your guests';
                    group.id = 'oc-player-guests';
                    group.dataset.guests = '1';
                    UI.ocPlayerSelect.appendChild(group);
                }
                const opt = document.createElement('option');
                opt.value = guest.uid;
                opt.textContent = `${guest.name} (guest)`;
                group.appendChild(opt);
            }
        } catch (err) {
            console.error('[Guests] could not add:', err);
            say(err?.message || 'Could not add that guest.');
        } finally {
            btn.disabled = false;
            btn.textContent = previous;
        }
    });
}

/**
 * Settings → Your guests (owner 2026-09-20). Lists the guests you own with
 * their remembered daily handicap, and deletes one. A guest's ROUNDS survive
 * the delete by design (guests.js): tidying a dropdown must not evaporate a
 * handicap record.
 */
export function bindGuestManager() {
    const list = document.getElementById('settings-guests-list');
    const status = document.getElementById('settings-guests-status');
    if (!list) return;
    const say = (t) => { if (status) status.textContent = t || ''; };

    async function render() {
        try {
            const { listGuests } = await import('../guests.js');
            const guests = (await listGuests()).sort((a, b) => a.name.localeCompare(b.name));
            list.innerHTML = '';
            if (!guests.length) {
                list.innerHTML = '<li style="color:var(--text-muted); font-size:0.9rem;">No guests yet. Add one on the On Course tab when you start a round.</li>';
                return;
            }
            for (const g of guests) {
                const li = document.createElement('li');
                li.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-color);';
                li.innerHTML = `
                    <span style="flex:1; min-width:0; font-weight:600;">${escapeHtml(g.name)}</span>
                    <span style="font-size:0.85rem; color:#64748b;">${Number.isFinite(g.dailyHandicap) ? `HC ${g.dailyHandicap}` : 'HC not set'}</span>
                    <button type="button" class="btn btn-secondary btn-sm guest-delete-btn" data-uid="${escapeHtml(g.uid)}" data-name="${escapeHtml(g.name)}"
                        style="margin:0; width:auto; min-height:44px; padding:8px 12px; color:#b91c1c;">Delete</button>`;
                list.appendChild(li);
            }
        } catch (e) {
            console.warn('[Guests] list not rendered:', e);
            say('Could not load your guests.');
        }
    }

    list.addEventListener('click', async (e) => {
        const btn = e.target.closest('.guest-delete-btn');
        if (!btn) return;
        const { uid, name } = btn.dataset;
        if (!confirm(`Delete ${name}? Rounds you already saved for them are kept.`)) return;
        btn.disabled = true;
        try {
            const { deleteGuest } = await import('../guests.js');
            await deleteGuest(uid);
            say(`${name} deleted.`);
            await render();
        } catch (err) {
            console.error('[Guests] delete failed:', err);
            say(`Could not delete ${name}.`);
            btn.disabled = false;
        }
    });

    document.getElementById('tab-btn-settings')?.addEventListener('click', render);
    render();
}

export function bindAddPlayer() {
    if (UI.btnOcAddPlayer && UI.ocPlayerSelect) {
        UI.btnOcAddPlayer.addEventListener('click', () => {
            const sel = UI.ocPlayerSelect.options[UI.ocPlayerSelect.selectedIndex];
            if (!sel.value) return;

            if (AppState.liveRoundGroups.find(p => p.uid === sel.value)) {
                alert("Player already added.");
                return;
            }

            // Owner 2026-09-20: a saved guest picked from the list is the SAME
            // guest as last round (one record), not a new one.
            const guest = isGuestId(sel.value);
            // Owner 2026-09-20: a guest's remembered daily handicap prefills
            // the Daily HC box, so it is typed once, not every round.
            const remembered = parseFloat(sel.dataset?.hc);
            // Update state triggers Proxy 'set' and thus reactive render
            AppState.liveRoundGroups = [...AppState.liveRoundGroups, {
                uid: sel.value,
                name: guest ? sel.text.replace(/\s*\(guest\)\s*$/, '') : sel.text,
                ...(guest ? { isGuest: true } : {}),
                ...(Number.isFinite(remembered) ? { dailyHandicapOverride: remembered } : {}),
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
            // 2026-10-04 glass chips: All toggles the grid in place; a club
            // (chip or grid) sets currentShotData.club and closes the grid.
            // Dynamic import, like the other card-render calls here (cycle).
            const target = e.target;
            import('./card-render.js').then(m => {
                if (m.handleBagGridClick(target) !== 'club') return;
                // Owner feedback 2026-07-05: club choice drives which sections make
                // sense (putter hides trajectory/shape). syncShotWizardUI owns all
                // of that logic — one source of truth instead of a partial copy
                // here that only toggled the putting section.
                // D31: repaint only - a re-mount would drop a swipe in progress.
                return import('./score-input.js').then(m2 => m2.refreshShotWizard());
            });
        });
    }

    const offGreenBtn = document.getElementById('wiz-toggle-offgreen');
    if (offGreenBtn) {
        offGreenBtn.addEventListener('click', () => {
            AppState.currentShotData.isOffGreen = !AppState.currentShotData.isOffGreen;
            offGreenBtn.classList.toggle('active-choice', !!AppState.currentShotData.isOffGreen);
        });
    }

    // BL-OC2: "didn't see the flight" — clears + dims line/trajectory/shape
    // (they're unknowable, not unanswered). syncShotWizardUI owns the render.
    const flightUnseenBtn = document.getElementById('wiz-toggle-flight-unseen');
    if (flightUnseenBtn) {
        flightUnseenBtn.addEventListener('click', () => {
            const on = !AppState.currentShotData.flightUnseen;
            AppState.currentShotData.flightUnseen = on;
            if (on) {
                delete AppState.currentShotData.startLine;
                delete AppState.currentShotData.trajectory;
                delete AppState.currentShotData.shape;
            }
            import('./score-input.js').then(m => {
                m.refreshShotWizard(); // D31: no re-mount
                if (!on) m.resumeLineStep();
            });
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
            // S1 Part B: clearing a prefillable button also clears its Manual
            // flag so a later swipe can prefill it again.
            if (group === 'startLine' || group === 'shape' || group === 'missPattern') {
                delete AppState.currentShotData[`${group}Manual`];
            }
        } else {
            AppState.currentShotData[group] = val;
            // S1 Part B: a deliberate tap sets the Manual flag — a later
            // swipe must not overwrite it.
            if (group === 'startLine' || group === 'shape' || group === 'missPattern') {
                AppState.currentShotData[`${group}Manual`] = true;
            }
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
    // S11: save the intended line before the shot — no stroke counted.
    const btnSavePlan = document.getElementById('btn-save-plan');
    if (btnSavePlan) {
        btnSavePlan.addEventListener('click', () => {
            import('./score-input.js').then(module => module.saveShotPlan());
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
            applyRoundTypeToCourseList();
        });
        UI.btnRound18.addEventListener('click', () => {
            AppState.currentRoundHoles = 18;
            UI.btnRound18.classList.add('active');
            UI.btnRound18.style.background = 'var(--primary-color)';
            UI.btnRound18.style.color = 'white';
            UI.btnRound9.classList.remove('active');
            UI.btnRound9.style.background = 'white';
            UI.btnRound9.style.color = '#64748b';
            applyRoundTypeToCourseList();
        });
        // Apply once at bind time: 9 Holes is the shipped default in the
        // markup, so an unfiltered list is what a player who never touches
        // the toggle sees.
        applyRoundTypeToCourseList();
    }
}

/**
 * Show only the course records that match the selected round length.
 *
 * PRODUCT SWEEP 2026-09-10 SECOND PASS F-2. The toggle used to hide one
 * optgroup and nothing else, so with the default 9 Holes selected the list
 * still offered Ashgrove, McLeod and Bulimba — all 18-hole records. Picking
 * one computed the Daily Handicap from an 18-hole par and then allocated it
 * on a nine-hole stroke chart: 12 strokes over the front nine where GA gives
 * 9, three extra Stableford points a round, straight into the saved AGS and
 * the handicap index. An 18-hole tee has no nine-hole Course Rating, so the
 * combination is not fixable downstream — it has to stop being offered.
 *
 * Custom Course stays available at both lengths: its par is typed at Start
 * Round, and holesForPar() reads the round's holes off that.
 */
export function applyRoundTypeToCourseList() {
    const sel = document.getElementById('oc-course-select');
    if (!sel) return;
    const want = AppState.currentRoundHoles === 18 ? 18 : 9;
    let clearedSelection = false;

    Array.from(sel.querySelectorAll('option')).forEach(opt => {
        const value = opt.value;
        if (!value || value === 'Custom Course') return; // placeholder + custom
        const courseHoles = holesForCourse(value);
        const ok = courseHoles === null || courseHoles === want;
        opt.hidden = !ok;
        opt.disabled = !ok;
        if (!ok && sel.value === value) clearedSelection = true;
    });

    // An optgroup whose options are all hidden still renders its label.
    Array.from(sel.querySelectorAll('optgroup')).forEach(group => {
        const anyVisible = Array.from(group.querySelectorAll('option')).some(o => !o.hidden);
        group.classList.toggle('hidden', !anyVisible);
        group.hidden = !anyVisible;
    });

    if (clearedSelection) {
        sel.value = '';
        sel.dispatchEvent(new Event('change'));
    }
}

export async function updateDhPreview() {
    if (!AppState.currentUser) return;
    const courseName = document.getElementById('oc-course-select')?.value;
    const teeName = document.getElementById('oc-tee-select')?.value;
    const ocModule = await import('../oncourse.js');
    const hi = await ocModule.getPlayerHandicap(AppState.currentUser.uid);
    // Codex P2 (quick start): a preview still waiting on the handicap lookup
    // when the course or tee changes (Play again sets both at once) must not
    // write the OLD course's daily handicap into the override box — Start
    // Round would read it as a manual override. The newer preview writes.
    if (document.getElementById('oc-course-select')?.value !== courseName
        || document.getElementById('oc-tee-select')?.value !== teeName) return;
    const { rating, slope, par } = ocModule.resolveRoundRatings(courseName, teeName);
    const dhValue = document.getElementById('oc-dh-value');
    const dhOverride = document.getElementById('oc-dh-override');

    const dh = par > 0 ? calculateDailyHandicap(hi, slope || 113, rating || 72, par, holesForPar(par)) : null; // GA formula incl. ×0.93, halved over nine
    if (dh !== null) {
        if (dhValue) dhValue.textContent = dh;
        if (dhOverride) dhOverride.value = dh;
    } else {
        // No established Handicap Index, so no Daily Handicap (F-4). A dash,
        // not 0 — 0 is a scratch golfer's Daily Handicap, and showing it here
        // is how a 26-marker ended up receiving no strokes. The override box
        // stays empty so a player who knows their DH can type it in.
        if (dhValue) dhValue.textContent = '—';
        if (dhOverride) dhOverride.value = '';
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

            // Filled synchronously (2026-10-06, quick start): the Play again
            // card sets the course and then the tee in one go, and an async
            // refill here would land after it and put the first tee back.
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
            if (courseName === 'Custom Course') return;
            const teeName = UI.ocTeeSelect.value;
            renderSetupRatings(courseName, teeName);
        });
    }
}

/**
 * Owner decision 2026-09-20: the signed-in golfer is always in the round unless
 * they removed themselves from the group on the setup screen (the Remove
 * button sets AppState.roundSelfOptOut). Pure: returns a new array, never
 * mutates. Exported for the unit gate.
 * @param {Array<{uid:string}>} groups
 * @param {{uid:string, name:string}|null} self
 * @param {boolean} optedOut
 */
export function withSelfIncluded(groups, self = currentSelf(), optedOut = AppState.roundSelfOptOut === true) {
    const list = Array.isArray(groups) ? groups : [];
    if (!self || !self.uid || optedOut) return list;
    if (list.some(p => p.uid === self.uid)) return list;
    return [{ uid: self.uid, name: self.name, scores: {}, compStats: {}, simpleStats: {} }, ...list];
}

function currentSelf() {
    const uid = AppState.currentUser?.uid;
    if (!uid) return null;
    const opt = UI.ocPlayerSelect && Array.from(UI.ocPlayerSelect.options).find(o => o.value === uid);
    return { uid, name: opt?.text || AppState.currentUser?.displayName || 'Me' };
}

/**
 * Store how this round was set up (course, tee, 9/18, mode, who played) under
 * golf.lastSetup.<uid>. Never a daily handicap, a date, a side game or a
 * competition: those belong to the day. Exported for the unit gate.
 */
export function rememberRoundSetup(course, tee, holes) {
    const uid = AppState.currentUser?.uid;
    if (!uid) return;
    try {
        const group = AppState.liveRoundGroups || [];
        recordSetup(localStorage, uid, {
            course, tee, holes,
            mode: AppState.currentTrackingMode,
            players: group.filter(p => p.uid !== uid).map(p => ({
                uid: p.uid, name: p.name, isGuest: p.isGuest === true || isGuestId(p.uid) === true,
            })),
            selfIncluded: group.some(p => p.uid === uid),
        });
    } catch (e) {
        console.warn('[QuickStart] setup not remembered:', e);
    }
}

// Codex P2 (quick start): one Start Round at a time. A second tap (on Start
// Round or Play again) while the first is still resolving handicaps used to
// run a second, overlapping round start.
let _startRound = null;
let _startBusy = () => false;

/** True while a Start Round is still resolving (Play again must not touch the form then). */
export function isStartRoundInFlight() {
    return _startBusy();
}

/** Run Start Round as if tapped; resolves when it has finished (or refused). */
export function runStartRound() {
    return _startRound ? _startRound() : Promise.resolve();
}

export function bindStartRound() {
    if (UI.btnOcStart) {
        const startRoundOnce = async () => {
            // Owner decisions 2026-07-04 + 2026-09-20: you are always in your own
            // round unless you removed yourself, so a solo round needs no Add tap.
            // Simplify C19: the empty-group path used to take whoever the player
            // dropdown showed, so a guest picked there (but never added) started
            // a round without you. Both paths now use the same rule, with one
            // exception kept from before: a coach or admin who picked another
            // ACCOUNT (a student) and tapped Start records that player's round.
            const sel = UI.ocPlayerSelect && UI.ocPlayerSelect.options[UI.ocPlayerSelect.selectedIndex];
            const pickedAccount = AppState.liveRoundGroups.length === 0 && sel && sel.value
                && sel.value !== AppState.currentUser?.uid && !isGuestId(sel.value);
            AppState.liveRoundGroups = pickedAccount
                ? [{ uid: sel.value, name: sel.text, scores: {}, compStats: {}, simpleStats: {} }]
                : withSelfIncluded(AppState.liveRoundGroups);
            if (AppState.liveRoundGroups.length === 0) {
                alert("Please add at least one player to track.");
                return;
            }

            const courseName = UI.ocCourseSelect.value;
            const teeName = UI.ocTeeSelect.value;

            // Single source of rating/slope/par — identical read+validation as the save (BL-4.01)
            const ocModule = await import('../oncourse.js');
            const { rating, slope, par: totalPar, counting } = ocModule.resolveRoundRatings(courseName, teeName);

            if (!totalPar || totalPar <= 0) {
                if (document.body.dataset.activeTab === 'tab-oncourse') {
                    alert("Please specify a valid total Par for this course.");
                }
                return;
            }

            const dateInput = document.getElementById('oc-round-date');
            // Validate before resolving handicaps or changing round metadata.
            // A rejected future date must leave the setup state untouched.
            // T3-dateValidation: the max attribute stops the picker, but typed
            // input can still exceed it — enforce server of record = today.
            // Today is the PLAYER's day (F-7): against the UTC day this fired
            // on the true local date every morning before 10am and refused to
            // start the round at all.
            if (dateInput && isRoundDateInFuture(dateInput.value)) {
                alert("Round date can't be in the future.");
                return;
            }

            // Side game (derived view; persists with the round). The 2-player
            // games are validated here so the round doesn't start with a game
            // that can never resolve.
            const sideGameSel = document.getElementById('oc-side-game');
            const sideGame = sideGameSel ? sideGameSel.value : '';
            if ((sideGame === 'matchplay' || sideGame === 'nassau') && AppState.liveRoundGroups.length !== 2) {
                alert("Match Play and Nassau need exactly 2 players in the group.");
                return;
            }
            const roundHoles = holesForPar(totalPar);
            const dhOverrideEl = document.getElementById('oc-dh-override');
            const resolvedPlayers = [];

            // Resolve every player before changing round state. A missing or
            // failed lookup remains null: unknown is gross-only, never scratch.
            for (const p of AppState.liveRoundGroups) {
                const hi = await ocModule.getPlayerHandicap(p.uid);
                let dailyHandicap = calculateDailyHandicap(
                    hi, slope || 113, rating || 72, totalPar, roundHoles
                );
                if (p.uid === AppState.currentUser?.uid && dhOverrideEl) {
                    const overrideVal = parseFloat(dhOverrideEl.value);
                    if (Number.isFinite(overrideVal)) dailyHandicap = overrideVal;
                }
                // Owner 2026-09-20: the per-player setup override wins for
                // that player, including guests who have no profile index.
                if (Number.isFinite(p.dailyHandicapOverride)) {
                    dailyHandicap = p.dailyHandicapOverride;
                }
                resolvedPlayers.push({ uid: p.uid, handicapIndex: hi, dailyHandicap });
            }

            // Resolve ONCE and persist with the round (BL-UX-08): the save path
            // must never depend on the tee <select>, which resets on reload.
            AppState.currentRoundTee = teeName;
            AppState.currentRoundRatings = { rating, slope, par: totalPar, counting };
            AppState.currentSideGame = sideGame || null;

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

            AppState.currentRoundDate = (dateInput && dateInput.value) ? dateInput.value : localToday();

            AppState.currentHole = 1;
            AppState.activeRoundId = `round_${Date.now()}`;
            AppState.currentHoleShots = [];

            // F-2: the holes the Daily Handicap is computed for ARE the round's
            // holes. Derived from the par actually being played so the toggle,
            // the course record and the stroke chart cannot disagree.
            AppState.currentRoundHoles = roundHoles;
            mutateList('liveRoundGroups', list => {
                for (let i = 0; i < list.length; i++) {
                    const player = list[i];
                    const resolved = resolvedPlayers.find(p => p.uid === player.uid);
                    list[i] = {
                        ...player,
                        handicapIndex: resolved?.handicapIndex ?? null,
                        dailyHandicap: resolved?.dailyHandicap
                            ?? (Number.isFinite(player.dailyHandicapOverride) ? player.dailyHandicapOverride : null),
                        dailyHandicapHoles: roundHoles,
                    };
                }
            });

            // Owner 2026-10-05 (quick start): remember this setup for the
            // Play again card and next round's defaults.
            rememberRoundSetup(courseName, teeName, roundHoles);

            document.body.classList.add('round-active');
            document.getElementById('oncourse-setup').classList.add('hidden');
            document.getElementById('oncourse-hub').classList.remove('hidden');

            // Show new sub-nav and progress bar
            const subNav = document.getElementById('oc-sub-nav');
            if (subNav) subNav.classList.remove('hidden');
            // One-thumb strip (2026-09-16): the jumper and the More sheet start
            // folded; the strip's hole label and ⋯ button open them.
            const progress = document.getElementById('hole-jumper-container');
            if (progress) progress.classList.add('hidden');
            const moreSheet = document.getElementById('oc-more-sheet');
            if (moreSheet) moreSheet.classList.add('hidden');
            for (const id of ['btn-oc-hole-strip', 'btn-oc-more']) {
                document.getElementById(id)?.setAttribute('aria-expanded', 'false');
            }

            import('./card-render.js').then(m => m.renderHoleJumper());
            const exitBar = document.getElementById('oc-exit-bar');
            if (exitBar) exitBar.classList.remove('hidden');

            // BL-UX-13: bindHoleNav clone-replaces #oc-par-select to clear stale
            // listeners, which reverts it to its static HTML default (par 4). Run
            // it BEFORE loadHole so loadHole sets the par LAST from the course's
            // actual hole par (currentCoursePars) — otherwise hole 1 shows par 4
            // while the display says the real par, silently skewing stableford.
            ocModule.bindHoleNav(); // Re-bind on start (resets par-select to default)
            ocModule.loadHole();
            // Decision 12: GPS on with the round on a mapped course, and the
            // golfer's remembered keep-awake choice re-applied (a tap, so iOS
            // grants the wake lock).
            ocModule.startGpsForRound(courseName);
            // The remembered keep-awake was requested inside the tap (see
            // startRound); say so if the golfer's "on" couldn't be honoured.
            wakeAtTap?.then(ok => {
                if (ok === false) import('./score-input.js').then(m => m.showToast("Couldn't keep the screen awake — GPS stops if it locks."));
            }).catch(() => {});

            // Owner feedback 2026-07-05: a Detailed round exists to track
            // shots — open the wizard for the first shot automatically
            // instead of demanding a "Track my shot" tap.
            if (AppState.currentTrackingMode === 'detailed') {
                import('./score-input.js').then(m => m.startNewShotInput());
            }
        };

        let inFlight = null; // per binding, so a re-bind starts clean
        let wakeAtTap = null;
        const startRound = () => {
            if (inFlight) return inFlight;
            // Decision 12: re-apply a remembered keep-awake NOW, inside the
            // tap - after the awaits below the gesture has expired on iOS.
            wakeAtTap = applyRememberedWakeLock({ gesture: true }).catch(() => null);
            inFlight = startRoundOnce().finally(() => { inFlight = null; });
            return inFlight;
        };
        _startRound = startRound;
        _startBusy = () => inFlight !== null;
        UI.btnOcStart.addEventListener('click', startRound);
        return startRound;
    }
    return null;

}

// Review P3: a double-tap on ✕ Abandon asked twice (both taps passed the
// awaited import before either confirm). One prompt at a time, and none once
// the round is gone.
let discardInFlight = false;

/**
 * Abandon the live round: ONE flow for ⋯ → ✕ Abandon and the summary's
 * ✕ Abandon round (owner 2026-09-20: "one flow"; simplify C21). Clears the
 * round locally first, then deletes its shots. Its whs_rounds doc is never
 * touched: a saved round takes the "already sent to save" branch below, and an
 * unsaved one has no such doc.
 */
export async function discardRound() {
    if (discardInFlight || !AppState.activeRoundId) return;
    discardInFlight = true;
    try {
        await discardRoundOnce();
    } finally {
        discardInFlight = false;
    }
}

async function discardRoundOnce() {
    const { endRoundCleanup, roundAlreadySaved } = await import('../oncourse.js');
    // Review P1: saving doesn't end the round (the locker room does), and a
    // reload there restores it as live. Abandoning THAT must never delete the
    // saved handicap round or its shots: leave it, keep the data.
    if (roundAlreadySaved(AppState.activeRoundId)) {
        if (confirm("This round was already sent to save. Leave it? It and its shots are kept (nothing is deleted).")) {
            endRoundCleanup();
        }
        return;
    }
    if (confirm("Abandon this round? Its scores and ALL logged shots will be deleted.")) {
        // F-18: abandoning a round is a LOCAL decision and must never
        // depend on connectivity. The local teardown used to sit behind
        // `await batch.commit()`, which under persistentLocalCache never
        // settles offline — the player confirmed, nothing happened, and
        // the deferred commit could later fire endRoundCleanup() against
        // whatever round was current by then. Tear down first, then let
        // the deletes replay from Firestore's own queue.
        const roundId = AppState.activeRoundId;
        const uid = AppState.currentUser?.uid;

        const { showToast } = await import('./score-input.js');
        endRoundCleanup();
        showToast("Round & Shots discarded 🗑️");

        try {
            const { db } = await import('../firebase-config.js');
            const { collection, query, where, getDocs, writeBatch } = await import('firebase/firestore');
            // Review P1 (PR #245): this batch used to also delete
            // whs_rounds/${roundId}_${uid}. That doc doesn't exist for an
            // unsaved round, the delete rule reads resource.data.uid (null →
            // denied unless admin), and a batch is all-or-nothing, so the
            // shot deletes never committed for a normal golfer. Saved rounds
            // never reach here, so there is no round doc to delete: shots only.
            // Review P2: the shots read rule needs uid == you, and rules
            // don't filter a query, they refuse it whole. Ask for yours.
            // getDocs falls back to the local cache offline, so this settles.
            if (uid) {
                const shotsQuery = query(collection(db, "shots"), where("uid", "==", uid), where("roundId", "==", roundId));
                const shotSnaps = await getDocs(shotsQuery);
                const batch = writeBatch(db);
                shotSnaps.forEach(sdoc => batch.delete(sdoc.ref));
                if (shotSnaps.size > 0) batch.commit().catch(e => console.error("Discard sync failed:", e));
            }
        } catch (e) {
            console.error("Could not delete the round's shots:", e);
        }
    }
}

export function bindGlobalRoundActions() {
    // ⋯ → ✕ Abandon. It used to only clear the round (endRoundCleanup) and
    // left the round's shots behind, skewing club and dispersion stats.
    document.getElementById('btn-oc-exit')?.addEventListener('click', () => discardRound());

    // BL-UX-09 (owner-approved rec): ONE finish CTA. The floating
    // "🏁 Finish Round" FAB duplicated the in-flow finish button (#btn-oc-finish)
    // and overlapped content; it has been removed. Abandon stays in the header.
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

            document.getElementById('oc-leaderboard').classList.toggle('hidden', target !== 'leaderboard');

            if (target === 'leaderboard') {
                 import('./card-render.js').then(m => m.updateLiveLeaderboard());
            }
        });
    });
}

// ==========================================================================
// S6 Part 2: the hole mapper — opened from the round's More sheet (current
// course/hole) or from Settings (any course/hole). The card lives inside the
// on-course tab, so the Settings path switches tabs first. Save lands in
// Part 2b.
// ==========================================================================
const MAPPER_COURSES = [
    { name: 'Keperra Country Golf Club', slug: 'keperra' },
    { name: 'Ashgrove Golf Club', slug: 'ashgrove' },
    { name: 'Redcliffe Golf Club', slug: 'redcliffe' },
    { name: 'Virginia Golf Club', slug: 'virginia' },
];
let mapperCtl = null;

export function bindHoleMapper() {
    const btnMap = document.getElementById('btn-oc-map-hole');
    if (btnMap) {
        btnMap.addEventListener('click', async () => {
            const slug = courseSlugFor(AppState.currentRoundCourseName);
            if (!slug) return;
            // The More sheet sits over the round; fold it back first.
            document.getElementById('oc-more-sheet')?.classList.add('hidden');
            document.getElementById('btn-oc-more')?.setAttribute('aria-expanded', 'false');
            await openHoleMapper(slug, AppState.currentHole);
        });
    }

    const courseSel = document.getElementById('mapper-course-select');
    const holeSel = document.getElementById('mapper-hole-select');
    if (courseSel) {
        for (const c of MAPPER_COURSES) {
            const o = document.createElement('option');
            o.value = c.slug;
            o.textContent = c.name;
            courseSel.appendChild(o);
        }
        courseSel.addEventListener('change', async () => {
            holeSel.innerHTML = '';
            const overlay = await loadCourseOverlay(courseSel.value);
            const nums = Object.keys(overlay.holes).map(Number).sort((a, b) => a - b);
            for (const n of nums) {
                const o = document.createElement('option');
                o.value = String(n);
                o.textContent = `Hole ${n}`;
                holeSel.appendChild(o);
            }
        });
        courseSel.dispatchEvent(new Event('change'));
    }
    document.getElementById('btn-mapper-open')?.addEventListener('click', async () => {
        const slug = courseSel?.value;
        const hole = Number(holeSel?.value);
        if (!slug || !hole) return;
        // The card lives in the on-course tab — switch there, then open.
        document.querySelector('.tab-btn[data-target="tab-oncourse"]')?.click();
        await openHoleMapper(slug, hole);
    });
    document.getElementById('btn-mapper-exit')?.addEventListener('click', () => closeHoleMapper());
}

// S3 Part B: the player's own hole-plan card (Settings). Mounted lazily on
// the first Settings opening — the binder runs before login, and the card
// needs AppState.currentUser.uid for the save path. The coach's copy of
// the same editor mounts from coach.js with authorRole 'coach'.
export function bindHolePlanCards() {
    const settingsBtn = document.getElementById('tab-btn-settings');
    if (!settingsBtn) return;
    settingsBtn.addEventListener('click', () => {
        const root = document.getElementById('settings-plan-root');
        if (!root || root.childElementCount) return;
        if (!AppState.currentUser?.uid) return;
        import('./hole-plan-card.js').then(({ mountHolePlanCard }) => {
            if (!root.childElementCount) {
                mountHolePlanCard(root, { authorRole: 'self', targetUid: AppState.currentUser.uid });
            }
        });
    });
}

// S5 Part A: the GPS assist toggle — a per-device convenience setting.
// The checkbox mirrors AppState.gpsAssist; the value lives in
// localStorage ('golf.gpsAssist') so it survives reloads without ever
// entering round state or PERSIST_FIELDS.
// S12 E: the shot-entry preference — select <-> AppState <-> localStorage.
// The visibility decision is pure (src/shot-entry.js); this only wires the
// Settings control and persists the choice. Applied live: a mid-round
// switch re-flows the wizard immediately.
export function bindShotEntry() {
    const sel = document.getElementById('shot-entry-select');
    if (!sel) return;
    // S12 E shipped calling applyShotEntryVisibility() here with no import of
    // it: a ReferenceError at boot that aborted the REST of the binder chain
    // in oncourse.js (found 2026-09-20 when a binder added after this one
    // never ran). It lives in score-input.js, loaded dynamically like every
    // other score-input call in this module, so no import cycle.
    const apply = () => import('./score-input.js')
        .then(m => m.applyShotEntryVisibility())
        .catch(e => console.warn('[ShotEntry] not applied:', e));
    sel.value = normaliseShotEntry(AppState.shotEntry);
    sel.addEventListener('change', () => {
        AppState.shotEntry = normaliseShotEntry(sel.value);
        try { localStorage.setItem('golf.shotEntry', AppState.shotEntry); } catch (e) { /* private mode */ }
        apply();
    });
    apply();
}

export function bindGpsAssist() {
    const toggle = document.getElementById('gps-assist-toggle');
    if (!toggle) return;
    toggle.checked = AppState.gpsAssist === true;
    toggle.addEventListener('change', () => {
        AppState.gpsAssist = toggle.checked;
        try {
            localStorage.setItem('golf.gpsAssist', toggle.checked ? 'on' : 'off');
        } catch (e) {
            console.warn('Failed to persist gpsAssist', e);
        }
    });
}

// S12 C: the auto-rotate preference ("Rotate map to the shot") — the same
// per-device pattern as the GPS assist toggle (localStorage 'golf.rotateMap').
export function bindRotateMap() {
    const toggle = document.getElementById('rotate-map-toggle');
    if (!toggle) return;
    toggle.checked = AppState.rotateMap === true;
    toggle.addEventListener('change', () => {
        AppState.rotateMap = toggle.checked;
        try {
            localStorage.setItem('golf.rotateMap', toggle.checked ? 'on' : 'off');
        } catch (e) {
            console.warn('Failed to persist rotateMap', e);
        }
    });
}

async function openHoleMapper(slug, holeNumber) {
    closeHoleMapper();
    const overlay = await loadCourseOverlay(slug);
    const hole = overlay.holes[String(holeNumber)];
    const card = document.getElementById('hole-mapper');
    if (!hole || !card) return;
    card.classList.remove('hidden');
    // The card sits deep in the on-course tab; bring it to the front so the
    // first tap lands on the canvas, not on whatever is above the fold.
    card.scrollIntoView({ block: 'start' });
    const canvas = document.getElementById('mapper-canvas');
    const { mountHoleMapper } = await import('../hole-mapper.js');
    mapperCtl = mountHoleMapper({ canvas, hole, slug, holeNumber, attributions: overlay.attributions || [] });
}

function closeHoleMapper() {
    if (mapperCtl) {
        mapperCtl.destroy();
        mapperCtl = null;
    }
    document.getElementById('hole-mapper')?.classList.add('hidden');
}
