// ==========================================
// oncourse.js
// Live Round Tracking & Shot UI Engine
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc, doc, updateDoc, getDoc, getDocs, writeBatch, deleteDoc } from "firebase/firestore";
import { AppState, mutateList } from './state.js';
import { UI } from './ui.js';
import { COURSE_DATA, KEPERRA_GPS, isRatableTee, isPlausibleRating, getStrokeIndex, holesForPar } from './course-data.js';

import { calculateDailyHandicap, calculateHoleStableford, convertStablefordToAGS, scoringUnavailableReason } from './whs.js';
import { httpsCallable } from "firebase/functions";
import { functions } from './firebase-config.js';
import { AudioService } from './services/audioService.js';
import { escapeHtml } from './escape.js';
import { aiErrorMessage } from './ai-errors.js';
import { computeMilestones, computeTiger5, holeStatsSanity, computePuttDiagnostics } from './insights.js';
import { derivedGir, girOf, fairwayHit } from './play-mode.js';
import { fetchCurrentWeather, bearingBetween, describeShot } from './weather.js';
import { GPS_POLICY } from './gps-capture.js';
// S5: GPS assist — the pure bias/snap maths and the overlay frame tools.
import { estimateBias, applyBias, snapToPlayable } from './gps-bias.js';
import { courseSlugFor, loadCourseOverlay } from './hole-overlay.js';
import { makeFrame, toFrame, fromFrame } from './geo.js';
import { greenTargetsFromPlayer } from './green-targets.js';
import { initBigNumbersView, updateBigNumbersView, closeBigNumbersView } from './big-numbers.js';

import { updateLiveLeaderboard, renderDetailedReview, renderBagButtons, renderHoleJumper } from './modules/card-render.js';
import { startNewShotInput, loadExistingShotData, syncShotWizardUI, setWizardActive, saveShotData, deleteShotData, showToast, refreshTrackButtonLabel } from './modules/score-input.js';
import { bindAddPlayer, bindCompQuickAdd, bindSetupToggles, bindCourseSelect, bindStartRound, bindGlobalRoundActions, bindOcSubNav, bindShotWizard, discardRound } from './modules/event-binders.js';
import { writeRoundBackup, markRoundBackupUnsynced, hasRoundBackup, markRoundSaved } from './persistence.js';
import { isGuestId } from './guests.js';
import { proposeRound } from './pending-rounds.js';
import { localToday, parseLocalDate } from './dates.js';
import { scoredHoles, defaultHolesPlayed, holesMismatchText, nineOnEighteenReason, tooFewForEighteenReason, unplayedNetParPoints } from './finish-holes.js';


/**
 * Initializes the on-course tracking module and binds global event listeners.
 * Configures UI states for the start of a round.
 * @returns {void}
 */
export function initOnCourse() {
    initBigNumbersView(() => {
        if (!isGpsWatchActive()) {
            _gpsWarm = false;
            _gpsGoodFixes = 0;
            const tee = COURSE_DATA[AppState.currentRoundCourseName]?.[AppState.currentRoundTee];
            updateBigNumbersView({ physicalHole: tee?.physicalHoles?.[AppState.currentHole - 1] ?? AppState.currentHole,
                par: AppState.currentCoursePars[AppState.currentHole - 1], warm: false });
            toggleGPS();
        }
    });
    import('./modules/event-binders.js').then(binders => {
        binders.bindSetupToggles();
        binders.bindCourseSelect();
        binders.bindAddPlayer();
        binders.bindAddGuest();
        binders.bindShotWizard();
        binders.bindStartRound();
        binders.bindGlobalRoundActions();
        binders.bindCompQuickAdd();
        binders.bindOcSubNav();
        binders.bindHoleMapper();
        binders.bindHolePlanCards();
        binders.bindGpsAssist();
        binders.bindRotateMap();
        binders.bindShotEntry(); // S12 E: wire the Settings select + apply at boot
        binders.bindGuestManager(); // owner 2026-09-20: Settings → Your guests
        // Owner 2026-10-05: Play again card + remembered defaults + GPS pick.
        // After the setup binders, because it drives those same controls.
        // Owner 2026-10-06: Play mode — the round on a full-screen map.
        return Promise.all([
            import('./modules/quick-start.js').then(m => m.initQuickStart()),
            import('./modules/play-mode.js').then(m => m.initPlayMode()),
        ]);
    }).catch(e => console.error('[OnCourse] setup binders failed:', e));
    bindReviewModal();
    bindPenaltyModal();
    bindReviewActions();
    bindAdvancedTools();
    bindHoleNav();
    bindAudioDiaryUI();


    // Default init
    if (typeof updateModeVisibility === 'function') updateModeVisibility();
    if (UI.ocCourseSelect && UI.ocCourseSelect.value) {
        UI.ocCourseSelect.dispatchEvent(new Event('change'));
    }

    seedRoundDatePicker();
}

/**
 * Seeds the round-date picker with the player's today and caps it there.
 *
 * PRODUCT SWEEP 2026-09-10 F-7: this used `valueAsDate = new Date()` (the date
 * input converts via UTC) for the default and the UTC day for `max`, so before
 * 10am AEST the picker opened on YESTERDAY and greyed out the true date. Typing
 * it anyway tripped the future-date guard at Start Round and the round would
 * not start until the player put it back to the wrong day.
 * @returns {void}
 */
export function seedRoundDatePicker() {
    const dateInput = document.getElementById('oc-round-date');
    if (!dateInput) return;
    const today = localToday();
    dateInput.value = today;
    // T3-dateValidation: a future-dated round poisons the handicap
    // record's chronology — cap the picker at today.
    dateInput.max = today;
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
 * Fold the ⋯ sheet and reset its button. Simplify C22: the sheet sits outside
 * the hub, so anything it opens (Finish, Review Card, the mapper) or the end of
 * the round must fold it, or it stays over the next screen.
 * @returns {void}
 */
export function closeMoreSheet() {
    document.getElementById('oc-more-sheet')?.classList.add('hidden');
    document.getElementById('btn-oc-more')?.setAttribute('aria-expanded', 'false');
}

/**
 * Clears the active round state and gracefully resets the UI back to the setup screen.
 * Ensures no stale data carries over to the next round.
 * @returns {void}
 */
export function endRoundCleanup() {
    closeBigNumbersView();
    updateBigNumbersView({});
    stopAudioTimer();
    cancelVoiceSession();
    document.body.classList.remove('round-active');
    if (gpsWatchId) toggleGPS(); // the watcher belongs to the round; stop it and forget "on"
    else rememberGpsOn(false);
    document.getElementById('oncourse-setup').classList.remove('hidden');
    const hub = document.getElementById('oncourse-hub');
    if (hub) hub.classList.add('hidden');
    const finishModal = document.getElementById('oc-finish-modal');
    if (finishModal) finishModal.classList.add('hidden');
    closeMoreSheet();
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
    // Owner bug report 2026-07-05 ("abandon didn't work"): a legacy line here
    // force-hid #tab-oncourse (.hidden !important) and then navigated TO it —
    // blank screen. Visibility belongs to body[data-active-tab] alone; never
    // class-hide a tab screen (Sydney visibility rule).
    const tabOnCourse = document.getElementById('tab-oncourse');
    if (tabOnCourse) tabOnCourse.classList.remove('hidden');

    // Leaving the Locker Room: hand the UI back to the On Course setup screen
    // (state-driven; without this, activeTab stays 'oc-locker-room' and the
    // app goes blank after "Back to Home").
    AppState.activeTab = 'tab-oncourse';

    AppState.liveRoundGroups = [];
    // S5: the bias and its samples are per-round by definition — a new round
    // starts from zero evidence.
    AppState.gpsBias = null;
    AppState.gpsBiasSamples = [];
    AppState.currentHole = 1;
    AppState.currentLiveCompId = null;
    AppState.currentLiveCompRules = [];
    AppState.currentHoleShots = [];
    _lastLoadedHole = null;
    AppState.activeRoundId = null;
    AppState.currentRoundDate = null;

    // v6.7.0 FIX: Reset ALL round-scoped state to prevent stale data leaking
    AppState.currentCoursePars = [];
    AppState.currentRoundCourseName = '';
    AppState.currentRoundTee = null;
    AppState.currentRoundRatings = null;
    AppState.currentSideGame = null;
    AppState.currentRoundHoles = 9;
    AppState.currentTrackingMode = 'simple';
    AppState.currentShotData = {};
    AppState.roundSelfOptOut = false; // owner 2026-09-20: setup-only flag

    if (UI.ocAddedPlayersList) UI.ocAddedPlayersList.innerHTML = '';

    // Owner 2026-10-05 (quick start): the setup screen is fresh again — the
    // Play again card, remembered defaults and GPS pick refresh on this.
    document.dispatchEvent(new CustomEvent('oc-setup-reset'));
}

/**
 * The player's established Handicap Index, or null when they do not have one.
 *
 * PRODUCT SWEEP 2026-09-10 SECOND PASS F-1: this returned the NUMBER 0 — a
 * scratch golfer — for a profile with no index, and it is the only place the
 * on-course path learns the index. So the whole "index not established" answer
 * PR #137 built into calculateIndex/calculateDailyHandicap (a dash in the
 * preview, an empty override box, a gross-only round) was unreachable, and a
 * brand-new golfer was instead handed a computed Daily Handicap. On most nines
 * the Course Rating is below par, so that Daily Handicap came out NEGATIVE: a
 * 26-marker who shot 54 on a par-36 nine was scored as a plus-2, given 1
 * Stableford point where GA gives 11, and had AGS 51 written against a gross
 * of 54. `null` and `0` are different answers and only one of them is "unknown".
 *
 * The `window.currentHandicapIndex` early-out that used to sit here was dead —
 * nothing in src/ or index.html ever assigned it — and would have re-introduced
 * the same 0/null confusion the moment something did.
 *
 * @param {string} uid - The player's uid.
 * @returns {Promise<number|null>} The index, or null if none is established.
 */
export async function getPlayerHandicap(uid) {
    try {
        const docRef = doc(db, "profiles", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const raw = docSnap.data().handicapIndex;
            const parsed = parseFloat(raw);
            // parseFloat('') and parseFloat(null) are NaN; parseFloat(0) is 0,
            // and 0 must survive as a genuine scratch index.
            if (Number.isFinite(parsed)) return parsed;
        }
    } catch (e) { }
    return null;
}

/**
 * Renders the interface for the current active hole.
 * Updates par, yardages, shot history, and resets input states for the new hole context.
 * @returns {void}
 */
let _lastLoadedHole = null;
// F-12: re-entry guard for the round save (see saveRoundToDatabase). Holds the
// id of the round already handed to the save path; cleared on a genuine failure
// so the player can retry, and naturally stale once a new round starts.
let _savedRoundId = null;

/**
 * Has this round already been handed to the save (this session, or before a
 * reload: the end-of-round backup carries its id)? Abandon must not delete a
 * saved round (simplify C21, review P1).
 * @param {string|null} roundId
 * @returns {boolean}
 */
export function roundAlreadySaved(roundId) {
    if (!roundId) return false;
    return _savedRoundId === roundId || hasRoundBackup(roundId);
}
/**
 * Owner 2026-10-06: GIR is worked out (on the green with two putts to
 * spare), so it follows the score and putts. Only when putts are recorded —
 * otherwise the player's own GIR tap (normal screen) stands. Call inside
 * mutateList.
 */
function syncDerivedGir(p) {
    const h = AppState.currentHole;
    const g = derivedGir({
        par: AppState.currentCoursePars[h - 1] || 4,
        gross: p.scores[h] || 0,
        putts: p.simpleStats?.[h]?.putts,
    });
    if (g === null) {
        // Codex P2 (pass 4): the hole was cleared, or the putts can't be
        // right - a GIR WORKED OUT earlier (girAuto) no longer stands. A GIR
        // the player tapped is theirs and stays (girOf ignores it on an
        // unscored hole anyway).
        const st = p.simpleStats?.[h];
        if (st?.girAuto) { delete st.gir; delete st.girAuto; }
        return;
    }
    if (!p.simpleStats[h]) p.simpleStats[h] = {};
    p.simpleStats[h].gir = g;
    p.simpleStats[h].girAuto = true;
}

export function loadHole() {
    // Re-aim a live fix at the new green; with the watcher off the last fix
    // (≤ 90 s old) is not "here", and replaying it would rewrite distM cross-hole.
    const fix = isGpsWatchActive() ? getLastGpsFix() : null;
    if (fix) updateGPSDistances(fix.lat, fix.lon, fix.accuracyM, fix.speedMps, fix.at, false);
    // S11: the hub button names a pending plan for this hole, if any.
    try { refreshTrackButtonLabel(); } catch (_) { /* wizard module not mounted in some unit stubs */ }
    try {
        const fh = document.getElementById('oc-hole-display');
        const ph = document.getElementById('oc-par-display');

        const parForHole = AppState.currentCoursePars[AppState.currentHole - 1] || 4;
        const parSelect = document.getElementById('oc-par-select');
        if (parSelect) parSelect.value = parForHole;

        if (fh) fh.textContent = `Hole ${AppState.currentHole}`;
        if (ph) ph.textContent = parForHole > 0 ? `Par ${parForHole}` : `Par ?`;
        syncHoleNavLabels();

        // (BL-4.13) #oc-hole-dots never existed in HTML — the hole jumper
        // below is the live per-hole progress UI; the dead dots loop is gone.

        // Update hole jumper active state
        renderHoleJumper();

        // Owner bug 2026-07-05 ("always says Shot 1"): loadHole re-runs on
        // every score tap, and clearing unconditionally wiped the hole's shot
        // list mid-hole — shot numbers restarted at 1 and the auto-GIR/putt
        // logic lost its inputs. Clear only when the hole actually changes.
        if (AppState.currentUser && _lastLoadedHole !== AppState.currentHole) {
            AppState.currentHoleShots = [];
        }
        _lastLoadedHole = AppState.currentHole;

        const scoresContainer = document.getElementById('oc-group-scores');
        if (!scoresContainer) return;
        scoresContainer.innerHTML = '';

        // Can this round be scored at all? Asked once, here, and answered the
        // same way on every surface (F-9/F-4). The signed-in player's Daily
        // Handicap decides the handicap half — a guest with no index does not
        // silence everyone else's points.
        const holeTeeData = COURSE_DATA[AppState.currentRoundCourseName]?.[AppState.currentRoundTee] || {};
        const holeStrokeIndex = getStrokeIndex(holeTeeData, AppState.currentRoundHoles || 18);
        const self = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
        const blockedReason = scoringUnavailableReason(holeStrokeIndex, self ? self.dailyHandicap : null);
        const notice = document.getElementById('oc-scoring-notice');
        if (notice) {
            notice.textContent = blockedReason || '';
            notice.classList.toggle('hidden', !blockedReason);
        }

        // MAP MULTIPLE PLAYERS INTO SCORING GRID
        AppState.liveRoundGroups.forEach((p, index) => {
            const pDiv = document.createElement('div');
            pDiv.className = 'compact-score-card';
            // Play mode (owner 2026-10-06): your card stays on the map; the
            // rest of the group pulls up. If you sat out, the first card.
            const selfIdx = AppState.liveRoundGroups.findIndex(x => x.uid === AppState.currentUser?.uid);
            const isPrimary = index === (selfIdx >= 0 ? selfIdx : 0);
            if (isPrimary) pDiv.classList.add('is-primary');

            const nameRow = document.createElement('div');
            nameRow.className = 'oc-card-head';

            // Calculate cumulative score (gross)
            let totalSoFar = 0;
            for (let h = 1; h < AppState.currentHole; h++) {
                totalSoFar += (p.scores[h] || 0);
            }
            const holeScore = p.scores[AppState.currentHole] || 0;

            // Running stableford beside gross (owner feedback 2026-07-05).
            // Suppressed entirely when the round can't be scored (F-9/F-4):
            // the old guard was `if (siList)`, and an empty stroke index is
            // truthy, so it entered the loop, skipped every hole and showed a
            // motionless "Pts: 0" for the whole round.
            let ptsSoFar = 0;
            const siList = blockedReason ? null : holeStrokeIndex;
            if (siList) {
                for (let h = 1; h <= AppState.currentHole; h++) {
                    const g = p.scores[h] || 0;
                    const hp = AppState.currentCoursePars[h - 1];
                    if (g > 0 && hp && siList[h - 1]) {
                        ptsSoFar += calculateHoleStableford(g, hp, siList[h - 1], p.dailyHandicap, siList.length);
                    }
                }
            }
            // Owner 2026-10-06: GIR is worked out from strokes and putts, never
            // pressed. Shown on the card in Play mode (.oc-card-gir).
            const holePar = AppState.currentCoursePars[AppState.currentHole - 1] || 4;
            const girNow = derivedGir({ par: holePar, gross: holeScore, putts: p.simpleStats?.[AppState.currentHole]?.putts });
            nameRow.innerHTML = `
            <span class="oc-card-name">${escapeHtml(p.name)}</span>
            <span class="oc-card-total">Gross: <span class="oc-card-num">${totalSoFar + holeScore}</span>${siList ? ` · Pts: <span class="oc-card-num">${ptsSoFar}</span>` : ''}</span>
            <span class="oc-card-gir">${girNow === true ? 'GIR ✓' : (girNow === false ? 'no GIR' : '')}</span>
            ${isPrimary && blockedReason ? `<span class="oc-card-grossonly" title="${escapeHtml(blockedReason)}">Gross only</span>` : ''}
        `;
            pDiv.appendChild(nameRow);

            const controlRow = document.createElement('div');
            controlRow.className = 'oc-card-controls';
            // One-thumb layout (2026-09-16): 56px targets on the right edge,
            // sizes in .compact-score-card CSS; the label no longer repeats the
            // hole number, which the strip already shows.
            controlRow.innerHTML = `
            <div class="oc-score-label">Strokes</div>
            <div class="oc-score-btns">
                <button class="btn-grid-minus" aria-label="Decrease Score">−</button>
                <span class="oc-score-value">${holeScore}</span>
                <button class="btn-grid-plus" aria-label="Increase Score">+</button>
            </div>
        `;

            // F-13: every score/stat tap goes through mutateList so the Proxy
            // set trap fires and persistence.js writes the snapshot. Mutating
            // p in place keeps the same array reference, so the trap never saw
            // the tap and the hole lived only in RAM until the NEXT hole change
            // — and the final hole, where Next opens the finish modal instead
            // of incrementing currentHole, was never saved at all. (D-03's
            // "loadHole() reassigns currentHoleShots" save path stopped
            // covering this when that reassignment was gated on a hole change.)
            controlRow.querySelector('.btn-grid-plus').onclick = () => {
                mutateList('liveRoundGroups', () => {
                    p.scores[AppState.currentHole] = (p.scores[AppState.currentHole] || 0) + 1;
                    syncDerivedGir(p);
                });
                loadHole();
                updateLiveLeaderboard();
            };
            controlRow.querySelector('.btn-grid-minus').onclick = () => {
                if (p.scores[AppState.currentHole] > 0) {
                    mutateList('liveRoundGroups', () => { p.scores[AppState.currentHole]--; syncDerivedGir(p); });
                    loadHole();
                    updateLiveLeaderboard();
                }
            };

            pDiv.appendChild(controlRow);

            // Optional Simple Stats Row (Small icons for GIR/Fwy + Plus/Minus for Putts)
            const statsRow = document.createElement('div');
            statsRow.className = 'oc-stats-row';

            const fwySet = p.simpleStats[AppState.currentHole]?.fwy;
            // Codex P2 (pass 5): the button shows the GIR that counts (worked
            // out when it can be; untouched = neither colour). Deliberately NOT
            // girOf (pass 6 asked): before a score is in, it must show the
            // player's own tap - the button toggles the stored value, so
            // showing "miss" there would make the next tap switch it OFF.
            // Totals use girOf, which ignores a GIR on an unplayed hole.
            const girCalc = derivedGir({
                par: AppState.currentCoursePars[AppState.currentHole - 1] || 4,
                gross: p.scores[AppState.currentHole] || 0,
                putts: p.simpleStats[AppState.currentHole]?.putts,
            });
            const girSet = girCalc === null ? p.simpleStats[AppState.currentHole]?.gir : girCalc;
            const putts = p.simpleStats[AppState.currentHole]?.putts || 0;

            statsRow.innerHTML = `
            <button class="mini-stat mini-fw ${fwySet === true ? 'active-fwy' : (fwySet === false ? 'active-miss' : '')}${holePar <= 3 ? ' hidden' : ''}">🌿 FW</button>
            <button class="mini-stat mini-gir ${girSet === true ? 'active-gir' : (girSet === false ? 'active-miss' : '')}">🟢 GIR</button>
            <div class="oc-putts">
                <button class="putt-minus" aria-label="Decrease Putts">−</button>
                <span class="oc-putts-val">⛳ ${putts} P</span>
                <button class="putt-plus" aria-label="Increase Putts">+</button>
            </div>
        `;

            statsRow.querySelector('.mini-stat:nth-child(1)').onclick = () => {
                mutateList('liveRoundGroups', () => {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].fwy = !p.simpleStats[AppState.currentHole].fwy;
                    delete p.simpleStats[AppState.currentHole].fwyAuto; // the player's own call now
                });
                loadHole();
            };
            statsRow.querySelector('.mini-stat:nth-child(2)').onclick = () => {
                mutateList('liveRoundGroups', () => {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].gir = !p.simpleStats[AppState.currentHole].gir;
                    delete p.simpleStats[AppState.currentHole].girAuto; // the player's own call now
                });
                loadHole();
            };
            statsRow.querySelector('.putt-plus').onclick = () => {
                mutateList('liveRoundGroups', () => {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].putts = (p.simpleStats[AppState.currentHole].putts || 0) + 1;
                    syncDerivedGir(p);
                });
                loadHole();
            };
            statsRow.querySelector('.putt-minus').onclick = () => {
                mutateList('liveRoundGroups', () => {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    const cur = p.simpleStats[AppState.currentHole].putts || 0;
                    if (cur > 0) p.simpleStats[AppState.currentHole].putts = cur - 1;
                    syncDerivedGir(p);
                });
                loadHole();
            };

            pDiv.appendChild(statsRow);

            // Owner feedback 2026-07-05: impossible stat combos (GIR + 10 putts
            // + gross 4) sailed through silently. Warn, never block.
            const sanity = holeStatsSanity({
                par: AppState.currentCoursePars[AppState.currentHole - 1] || 4,
                gross: p.scores[AppState.currentHole],
                putts: p.simpleStats?.[AppState.currentHole]?.putts,
                gir: p.simpleStats?.[AppState.currentHole]?.gir
            });
            if (sanity) {
                const warn = document.createElement('div');
                warn.setAttribute('role', 'status');
                warn.style.cssText = 'margin-top:6px; background:#fffbeb; border:1px solid #fcd34d; color:#92400e; border-radius:8px; padding:6px 10px; font-size:0.8rem;';
                warn.textContent = sanity;
                pDiv.appendChild(warn);
            }

            scoresContainer.appendChild(pDiv);
        });

        renderCompPanel();
        updateLiveLeaderboard();
        // Play mode follows the hole (src/modules/play-mode.js).
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
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
    closeMoreSheet();

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
    // Simplify C20: default to the holes actually scored (9 when nobody has a
    // score after hole 9), and say so when the choice doesn't match. The
    // dropdown stays visible and editable: it is the WHS checkpoint.
    const holesSel = document.getElementById('oc-finish-holes');
    const roundHoles = AppState.currentRoundHoles || (AppState.currentHole > 9 ? 18 : 9);
    const groups = AppState.liveRoundGroups || [];
    const me = groups.find(x => x.uid === AppState.currentUser?.uid) || groups[0];
    holesSel.value = String(defaultHolesPlayed(me ? [me] : [], roundHoles));
    const syncHolesWarning = () => {
        const warn = document.getElementById('oc-finish-holes-warn');
        if (!warn) return;
        // The same par the save uses (codex P3): the persisted ratings, or the
        // tee's for a legacy resumed round that has none.
        const persisted = AppState.currentRoundRatings;
        const teePar = persisted && persisted.par > 0 ? persisted.par
            : resolveRoundRatings(AppState.currentRoundCourseName, AppState.currentRoundTee || UI.ocTeeSelect?.value).par;
        const nine = nineOnEighteenReason(holesSel.value, teePar);
        const scoredCount = scoredHoles(me?.scores).length;
        const tooFew = tooFewForEighteenReason(holesSel.value, scoredCount);
        const text = [holesMismatchText(scoredCount, holesSel.value),
            nine ? "Nine holes off an 18-hole tee won't count in your index." : '',
            tooFew ? "Fewer than 14 holes won't count as an 18." : ''].filter(Boolean).join(' ');
        warn.textContent = text;
        warn.classList.toggle('hidden', !text);
    };
    holesSel.onchange = syncHolesWarning;
    syncHolesWarning();

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


    // Simplify C23: open at the top (totals, Confirm Holes Played), not
    // scrolled down to the Save button.
    modal.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
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
    // The tee <select> resets on reload; the round's own tee does not.
    const teeName = AppState.currentRoundTee || UI.ocTeeSelect.value;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    const maxHole = AppState.currentRoundHoles || 9;
    const si = getStrokeIndex(teeData, maxHole);
    const reviewSI = scoringUnavailableReason(si, p.dailyHandicap) ? null : si;
    for (let h = 1; h <= maxHole; h++) {
        const score = p.scores[h] || 0;
        if (score === 0) continue;

        totalShots += score;

        // Points
        const holeIdx = h - 1;
        const hPar = AppState.currentCoursePars[holeIdx] || 4;
        // No invented stroke index (F-9) and no scoring without a Daily
        // Handicap (F-4) — the summary shows the gross either way.
        if (reviewSI) {
            totalPoints += calculateHoleStableford(score, hPar, reviewSI[holeIdx], p.dailyHandicap, reviewSI.length);
        }

        // Stats
        if (p.simpleStats[h]) {
            if (p.simpleStats[h].putts) totalPutts += p.simpleStats[h].putts;
            if (fairwayHit(p.simpleStats[h], hPar)) totalFIR++; // C25: par 4/5 only
            if (girOf({ par: hPar, gross: score, putts: p.simpleStats[h].putts, stored: p.simpleStats[h].gir })) totalGIR++;
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

export function bindReviewActions() {
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
    const editorPar = AppState.currentCoursePars[holeNum - 1] || 4;
    const gir = !!p.simpleStats[holeNum]?.gir;

    // firStart: the fairway as the editor opened it, so a save that never
    // touched the toggle keeps the lie-derived mark (fwyAuto) in place.
    editorState = { score, putts, penalties: 0, fir, firStart: fir, gir };

    document.getElementById('hole-editor-title').textContent = `Hole ${holeNum} Editor`;
    document.getElementById('editor-score-val').textContent = score;
    document.getElementById('editor-putts-val').textContent = putts;
    document.getElementById('editor-pen-val').textContent = 0;

    const btnFIR = document.getElementById('editor-btn-fir');
    const btnGIR = document.getElementById('editor-btn-gir');
    if (btnFIR) {
        btnFIR.classList.toggle('btn-primary', fir);
        btnFIR.classList.toggle('btn-secondary', !fir);
        btnFIR.classList.toggle('hidden', editorPar <= 3); // C25: no fairway on a par 3
    }
    if (btnGIR) {
        btnGIR.classList.toggle('btn-primary', gir);
        btnGIR.classList.toggle('btn-secondary', !gir);
    }

    UI.ocHoleEditorModal.classList.remove('hidden');
}

export function saveHoleEdits() {
    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
    if (!p || !currentEditingHole) return;

    // Apply edits (F-13: via mutateList so the edit reaches localStorage)
    mutateList('liveRoundGroups', () => {
        p.scores[currentEditingHole] = editorState.score + editorState.penalties;
        if (!p.simpleStats[currentEditingHole]) p.simpleStats[currentEditingHole] = {};
        p.simpleStats[currentEditingHole].putts = editorState.putts;
        // Simplify C25: one fairway key. The live card writes .fwy; the editor
        // wrote .fir, so un-ticking here left .fwy = true and it still counted.
        // Write .fwy, drop the old .fir (readers still count old .fir data).
        // Only a real change to the toggle makes the fairway the golfer's own
        // call (drop fwyAuto); a score/putts/GIR-only save leaves the lie-derived
        // fairway, and its auto mark, exactly as they were.
        const st = p.simpleStats[currentEditingHole];
        if (editorState.fir !== editorState.firStart) {
            st.fwy = editorState.fir;
            delete st.fir;
            delete st.fwyAuto;
        } else if ('fir' in st) {
            st.fwy = editorState.fir; // migrate the old key, same value
            delete st.fir;
        }
        p.simpleStats[currentEditingHole].gir = editorState.gir;
        delete p.simpleStats[currentEditingHole].girAuto;
    });

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
            if (recognition && !voiceSessionActive) {
                voiceSessionActive = true;
                try { recognition.start(); }
                catch (error) { voiceSessionActive = false; throw error; }
            }
        });
    }
    if (UI.btnCancelVoice) {
        UI.btnCancelVoice.addEventListener('click', cancelVoiceSession);
    }
    if (UI.btnCloseRulesCard) {
        UI.btnCloseRulesCard.addEventListener('click', () => {
            UI.rulesResponseCard.classList.add('hidden');
        });
    }
}

let gpsWatchId = null;
// Sunday-readiness 2026-10-03: a reload mid-round (iOS evicting a backgrounded
// Safari tab) restored the card but not the GPS watcher, so the distances
// vanished until the player found ⋯ → GPS again. The on/off choice is kept
// per device while a round is live and replayed by resumeGpsIfWasOn().
const GPS_ON_KEY = 'golf.gpsOn';
function rememberGpsOn(on) {
    try {
        if (on) localStorage.setItem(GPS_ON_KEY, '1');
        else localStorage.removeItem(GPS_ON_KEY);
    } catch { /* storage unavailable: the toggle still works for this page */ }
}

/** Re-start the GPS watcher after a restored round if it was on before. */
export function resumeGpsIfWasOn() {
    let wasOn = false;
    try { wasOn = localStorage.getItem(GPS_ON_KEY) === '1'; } catch { /* no storage */ }
    if (wasOn && !gpsWatchId) toggleGPS();
}

/** C27 review: Play mode's 📡 chip is the only GPS-off control, so it shows
 * it is working between the tap and the first fix (up to 15 s when cold). */
function setPlayGpsLocating(on) {
    const chip = document.getElementById('btn-play-gps');
    if (!chip) return;
    chip.classList.toggle('is-locating', on);
    if (on) chip.setAttribute('aria-busy', 'true');
    else chip.removeAttribute('aria-busy');
    chip.setAttribute('aria-label', on ? 'Locating GPS' : 'Start GPS');
}

/**
 * Decision 12 (simplify 2026-10-07): GPS starts with the round on a mapped
 * course - the map needs it, and it saves the first tap of every round.
 * Quiet: a golfer who has refused location gets no error toast each round.
 * Never toggles a running watch off.
 */
export function startGpsForRound(courseName) {
    if (gpsWatchId || !courseSlugFor(courseName) || !navigator.geolocation) return false;
    toggleGPS(true, { quiet: true });
    return true;
}

function toggleGPS(rememberChoice = true, { quiet = false } = {}) {
    if (gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        if (rememberChoice) rememberGpsOn(false);
        if (UI.btnToggleGps) UI.btnToggleGps.textContent = "📡 GPS: OFF";
        if (UI.ocGpsWidget) UI.ocGpsWidget.classList.add('hidden');
        const stripGps = document.getElementById('oc-strip-gps');
        if (stripGps) stripGps.classList.add('hidden');
        setPlayGpsLocating(false);
        // The Map-first live dot listens: no watch, no "you are here".
        document.dispatchEvent(new CustomEvent('gps-watch-stopped'));
    } else {
        if (!navigator.geolocation) {
            showToast("GPS not supported on this device.");
            return;
        }

        if (UI.btnToggleGps) UI.btnToggleGps.textContent = "⌛ Locating...";
        // A fresh watch is cold: its first fixes can be 65 m - 1 km off. Only
        // the big-numbers opener used to reset this; every start does now.
        _gpsWarm = false;
        _gpsGoodFixes = 0;
        setPlayGpsLocating(true);
        rememberGpsOn(true);
        gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                // S4: accuracy rides through — the shot chain honours it.
                // S10: speed + the fix's own timestamp ride too.
                updateGPSDistances(latitude, longitude, pos.coords.accuracy, pos.coords.speed, pos.timestamp);
                _notifyGpsFix({
                    lat: latitude,
                    lon: longitude,
                    accuracyM: pos.coords.accuracy,
                    speedMps: pos.coords.speed,
                    at: pos.timestamp,
                });
                if (UI.btnToggleGps) UI.btnToggleGps.textContent = "📡 GPS: ON";
                if (UI.ocGpsWidget) UI.ocGpsWidget.classList.remove('hidden');
                setPlayGpsLocating(false);
            },
            (err) => {
                console.error("GPS Error:", err);
                // S10: cold phones produce spurious POSITION_UNAVAILABLE errors
                // (the same reason the timeout is now 15 s). A transient code 2
                // right after working fixes is ignored — killing the watcher
                // here is what lost GPS for the rest of the round.
                if (err.code === 2 && _lastGpsFix && (Date.now() - (_lastGpsFix.at || 0)) < 15000) {
                    return;
                }
                // Decision 12 review: GPS started by Start Round (often in the
                // car park) keeps trying through a slow cold start - no toast,
                // no stop; the 📡 chip pulses until a fix lands. Only a refusal
                // ends it (quietly, below).
                if (quiet && err.code !== 1) return;
                let msg = "GPS Error";
                if (err.code === 1) msg = "GPS Permission Denied";
                else if (err.code === 2) msg = "GPS Position Unavailable";
                if (!(quiet && err.code === 1)) showToast(msg);
                // Stop a failed watcher without losing the player's on choice.
                // Permission denial is permanent until the player enables GPS.
                toggleGPS(err.code === 1);
            },
            // S10: the old 5 s timeout produced spurious errors on cold phones.
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
    }
}

// BL-DEC-01: latest GPS fix to the green centre, snapshotted onto shots at
// log time (score-input.js) so dispersion can be bucketed by distance and
// "bogey inside 150" (Tiger-5 #4) becomes detectable. Module-scoped on
// purpose — putting it in AppState would fire stateChange every GPS tick.
let _lastGpsFix = null; // { distM, at }
export function getLastGpsFix() {
    return (_lastGpsFix && Date.now() - _lastGpsFix.at < 90000) ? _lastGpsFix : null;
}

/** True while the GPS watcher is running. score-input.js gates the capture
 * on this: a round with GPS off is a normal round — no ring, no notes. */
export function isGpsWatchActive() {
    return !!gpsWatchId;
}

// ---- S10: capture plumbing ------------------------------------------------
// The capture object itself stays module-local to score-input.js (GPS is off
// AppState except through shot objects); this is only the tap on the shoulder.
let _gpsWarm = true;        // cold after a resume; two fixes ≤ 15 m re-warm
let _gpsGoodFixes = 0;
const _gpsFixListeners = [];

/** Subscribe to raw fixes as they arrive. Returns an unsubscribe fn. */
export function onGpsFix(cb) {
    _gpsFixListeners.push(cb);
    return () => {
        const i = _gpsFixListeners.indexOf(cb);
        if (i >= 0) _gpsFixListeners.splice(i, 1);
    };
}

function _notifyGpsFix(fix) {
    for (const cb of [..._gpsFixListeners]) {
        try { cb(fix); } catch (e) { console.error('[GPS] fix listener failed:', e); }
    }
}

// A resume (screen unlock / tab return) makes the receiver cold again —
// the first fix back is 65 m - 1 km. Mark it so the strip says "GPS warming".
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        _gpsWarm = false;
        _gpsGoodFixes = 0;
    }
});
window.addEventListener('pageshow', () => {
    _gpsWarm = false;
    _gpsGoodFixes = 0;
});
export function isGpsWarm() {
    return _gpsWarm;
}

// S5: GPS assist — the playable union for the current hole, cached. Built
// fire-and-forget when a fix arrives for a hole whose playable isn't ready
// yet; until then the strip shows the raw distance (graceful, no spin).
let _assistCache = null; // { key, hole, frame }
const _assistPending = new Set();
// A failed or empty (offline) load is retried after a pause — not on every
// ~1 s fix, and not never: the network may come back mid-round.
const ASSIST_RETRY_MS = 30000;
const _assistRetryAt = new Map();

async function ensureAssistPlayable(courseName, physicalHole, key) {
    const slug = courseSlugFor(courseName);
    if (!slug || _assistPending.has(key) || Date.now() < (_assistRetryAt.get(key) ?? 0)) return;
    _assistPending.add(key);
    try {
        const overlay = await loadCourseOverlay(slug);
        const hole = overlay?.holes?.[String(physicalHole)] ?? null;
        if (!hole) {
            _assistRetryAt.set(key, Date.now() + ASSIST_RETRY_MS);
            return;
        }
        _assistRetryAt.delete(key);
        const frame = hole.tee && hole.green?.centre
            ? makeFrame([hole.tee.lat, hole.tee.lon], [hole.green.centre.lat, hole.green.centre.lon]) : null;
        _assistCache = { key, hole, frame };
    } catch (e) {
        _assistRetryAt.set(key, Date.now() + ASSIST_RETRY_MS);
        console.warn('[GPS] course geometry unavailable:', e?.message || e);
    } finally {
        _assistPending.delete(key);
    }
    // A4: off Keperra the green comes from this file, so the pill shows
    // -- until it lands. Re-aim the live fix now rather than on the next one.
    if (_assistCache?.key !== key) return;
    const fix = isGpsWatchActive() ? getLastGpsFix() : null;
    if (fix) updateGPSDistances(fix.lat, fix.lon, fix.accuracyM, fix.speedMps, fix.at, false);
}

/**
 * S5 Part C: record a truth pair — the golfer stood on a known point
 * (a holed-out putt) while the phone reported a fix.
 * Fire-and-forget; gated behind the assist toggle; re-estimates the
 * per-round bias from the last 5 pairs after each push.
 */
export async function collectGpsBiasSample(fix) {
    if (!AppState.gpsAssist || !fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return;
    if (!AppState.currentRoundCourseName) return;
    try {
        const slug = courseSlugFor(AppState.currentRoundCourseName);
        if (!slug) return;
        const holeIdx = AppState.currentHole - 1;
        const teeName = AppState.currentRoundTee || UI.ocTeeSelect?.value;
        const teeData = COURSE_DATA[AppState.currentRoundCourseName]?.[teeName] || {};
        let physical = holeIdx + 1;
        if (teeData.physicalHoles && teeData.physicalHoles[holeIdx]) physical = teeData.physicalHoles[holeIdx];
        const overlay = await loadCourseOverlay(slug);
        const hole = overlay.holes[String(physical)];
        if (!hole?.green?.centre) return; // no mapped green: nothing to learn from
        if (!Array.isArray(AppState.gpsBiasSamples)) AppState.gpsBiasSamples = [];
        AppState.gpsBiasSamples.push({
            fix: { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM ?? null },
            truth: { lat: hole.green.centre.lat, lon: hole.green.centre.lon },
        });
        const b = estimateBias(AppState.gpsBiasSamples);
        if (b) AppState.gpsBias = b;
    } catch (e) {
        console.warn('[gps-assist] sample skipped:', e?.message || e);
    }
}

/**
 * A4 (simplify 2026-10-07): the fixed green (centre/front/back) for a hole.
 * KEPERRA_GPS is Keperra's own table (physical holes 1-27); every other
 * course reads its course file (`hole` = the loaded overlay hole, or null
 * while it loads -> no green, the pill shows --). Before this, Ashgrove,
 * Redcliffe and Virginia read Keperra's table and were 3-5 km off.
 */
export function courseGreenFor(slug, physicalHole, hole) {
    if (slug === 'keperra') {
        const k = KEPERRA_GPS[physicalHole];
        return k ? { c: [k[0], k[1]], f: [k[2], k[3]], b: [k[4], k[5]] } : null;
    }
    const g = hole?.green;
    if (!g?.centre) return null;
    const ll = p => (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? [p.lat, p.lon] : null);
    return { c: ll(g.centre), f: ll(g.front), b: ll(g.back) };
}

function updateGPSDistances(lat, lon, accuracy = null, speedMps = null, fixAt = null, newFix = true) {
    // S10 warm-up: a resume (screen unlock) makes the next fix cold
    // (65 m - 1 km). Stay cold until two fixes ≤ 15 m arrive. A4: counted
    // for every fix, green or not - it is about the receiver, and a course
    // file still loading must not hold the strip on 'GPS warming'.
    if (newFix) {
        if (accuracy != null && accuracy <= 15) _gpsGoodFixes++;
        else _gpsGoodFixes = 0;
    }
    if (!_gpsWarm && _gpsGoodFixes >= 2) {
        _gpsWarm = true;
        const strip = document.getElementById('oc-strip-gps');
        if (strip && strip.dataset.pendingWarm === '1') {
            delete strip.dataset.pendingWarm;
        }
    }
    const holeIdx = AppState.currentHole - 1;
    const courseName = AppState.currentRoundCourseName;
    const teeName = AppState.currentRoundTee || UI.ocTeeSelect?.value;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    // 1. Identify physical hole number (1-27)
    let physicalHole = holeIdx + 1; // Default fallback
    if (teeData.physicalHoles && teeData.physicalHoles[holeIdx]) {
        physicalHole = teeData.physicalHoles[holeIdx];
    }

    // 2. The green for that physical hole: Keperra's table, else the course
    // file (decision 14: Surveyor mode and its pinned greens are gone).
    const slug = courseSlugFor(courseName);
    const key = slug ? `${slug}-${physicalHole}` : null;
    if (key && _assistCache?.key !== key) {
        ensureAssistPlayable(courseName, physicalHole, key); // never wait for polygons
    }
    const groundTruth = courseGreenFor(slug, physicalHole, _assistCache?.key === key ? _assistCache.hole : null);

    if (groundTruth && groundTruth.c) {
        const targets = greenTargetsFromPlayer([lat, lon], groundTruth.c,
            _assistCache?.key === key ? _assistCache.hole?.features : null,
            { front: groundTruth.f, back: groundTruth.b });
        const modeHint = document.getElementById('gps-distance-mode');
        if (modeHint) modeHint.textContent = targets.mode;
        // 3. Calculate Haversine distance in meters
        const distCenter = getDistance(lat, lon, groundTruth.c[0], groundTruth.c[1]);
        const distFront = targets.front ? getDistance(lat, lon, targets.front[0], targets.front[1]) : null;
        const distBack = targets.back ? getDistance(lat, lon, targets.back[0], targets.back[1]) : null;

        // S5: GPS assist — bias, then map snap, then the corrected strip
        // distance. Gated behind the toggle: with it off, not one byte of
        // this runs and the strip is byte-identical to pre-S5. The GPS
        // widget above keeps the RAW distances; the strip shows the
        // corrected value with a ≈ prefix whenever the snap moved the fix.
        let stripDistM = distCenter;
        let stripSnapped = false;
        if (AppState.gpsAssist) {
            try {
                if (key && _assistCache?.key === key && _assistCache.frame) {
                    const corrected = AppState.gpsBias ? applyBias({ lat, lon }, AppState.gpsBias) : { lat, lon };
                    const s = snapToPlayable(toFrame(_assistCache.frame, [corrected.lat, corrected.lon]), _assistCache.hole);
                    if (s.snapped) {
                        const [slat, slon] = fromFrame(_assistCache.frame, s.xy);
                        stripDistM = getDistance(slat, slon, groundTruth.c[0], groundTruth.c[1]);
                        stripSnapped = true;
                    } else if (AppState.gpsBias) {
                        stripDistM = getDistance(corrected.lat, corrected.lon, groundTruth.c[0], groundTruth.c[1]);
                    }
                }
            } catch (e) {
                console.warn('[gps-assist] strip correction skipped:', e?.message || e);
            }
        }

        // 4. Update UI labels (meters)
        if (UI.gpsMiddle) UI.gpsMiddle.textContent = `${Math.round(distCenter)}m`;
        // The strip itself is un-hidden here; its text + accuracy colour are
        // set further down (S10: `142 m · ±6`, class-coded).
        const stripGps = document.getElementById('oc-strip-gps');
        if (stripGps) stripGps.classList.remove('hidden');
        if (UI.gpsFront) UI.gpsFront.textContent = distFront !== null ? `${Math.round(distFront)}m` : "---m";
        if (UI.gpsBack) UI.gpsBack.textContent = distBack !== null ? `${Math.round(distBack)}m` : "---m";

        // S4: the whole fix — a shot's start is where the phone is, and the
        // previous shot's finish. Callers use .distM; the shot chain uses the rest.
        // S10: speedMps + the fix's own timestamp (not Date.now()) so the
        // capture policy can judge staleness and movement.
        _lastGpsFix = {
            distM: Math.round(distCenter),
            lat, lon,
            accuracyM: (accuracy != null ? Math.round(accuracy) : null),
            speedMps: (speedMps != null ? speedMps : null),
            at: (fixAt != null ? fixAt : Date.now())
        };

        // S10 strip: `142 m · ±6` with the accuracy colour-coded (classes only),
        // thresholds read from GPS_POLICY so the numbers live in one place.
        // While the receiver is warming up after a resume, say so instead.
        // S5: with assist on and the snap applied, the strip distance is the
        // corrected one with a ≈ prefix — the widget above stays raw.
        const stripAcc = document.getElementById('oc-strip-gps');
        if (stripAcc) {
            stripAcc.textContent = !_gpsWarm
                ? 'GPS warming'
                : `${stripSnapped ? '≈ ' : ''}${Math.round(stripDistM)}m` + (accuracy != null ? ` · ±${Math.round(accuracy)}` : '');
            stripAcc.classList.remove('gps-acc-good', 'gps-acc-warn', 'gps-acc-bad');
            if (_gpsWarm && accuracy != null) {
                if (accuracy <= GPS_POLICY.acceptNowM) stripAcc.classList.add('gps-acc-good');
                else if (accuracy <= GPS_POLICY.acceptWindowM) stripAcc.classList.add('gps-acc-warn');
                else stripAcc.classList.add('gps-acc-bad');
            }
        }
        updateBigNumbersView({ physicalHole, par: AppState.currentCoursePars[holeIdx],
            frontM: distFront, middleM: distCenter, backM: distBack,
            accuracyM: accuracy, warm: _gpsWarm, mode: targets.mode });

        // BL-WX-01: weather + plays-like for THIS shot (player → green centre).
        updatePlaysLike(lat, lon, groundTruth.c, distCenter);
        // BL-DEC-02: active-strategy aim reminder, personalised by miss bias.
        updateStrategyHint();
    } else {
        // A4: no green for this hole (file still loading, or an unmapped
        // course). Keep the position for the shot chain, but no distance:
        // the last hole's number must not reach the club strip or a shot.
        _lastGpsFix = { distM: null, lat, lon,
            accuracyM: (accuracy != null ? Math.round(accuracy) : null),
            speedMps: (speedMps != null ? speedMps : null),
            at: (fixAt != null ? fixAt : Date.now()) };
        updateBigNumbersView({ physicalHole, par: AppState.currentCoursePars[holeIdx], warm: false });
        // Mock fallback if no coordinates found
        if (UI.gpsMiddle) UI.gpsMiddle.textContent = "---m";
        if (UI.gpsFront) UI.gpsFront.textContent = "---m";
        if (UI.gpsBack) UI.gpsBack.textContent = "---m";
        const pl = document.getElementById('gps-plays-like');
        if (pl) pl.classList.add('hidden');
        // ...and no strip number left over from the last hole.
        const strip = document.getElementById('oc-strip-gps');
        if (strip) {
            strip.textContent = _gpsWarm ? '--' : 'GPS warming';
            strip.classList.remove('gps-acc-good', 'gps-acc-warn', 'gps-acc-bad');
        }
    }
}

/**
 * Fire-and-forget weather line under the GPS numbers. fetchCurrentWeather is
 * cached for 15 min, so calling this on every GPS tick is cheap; any failure
 * (offline on the course) just hides the row — never blocks the distances.
 */
function updatePlaysLike(lat, lon, greenCenter, distM) {
    const row = document.getElementById('gps-plays-like');
    if (!row) return;
    fetchCurrentWeather(lat, lon).then(wx => {
        if (!wx) { row.classList.add('hidden'); return; }
        const bearing = bearingBetween(lat, lon, greenCenter[0], greenCenter[1]);
        const shot = describeShot(wx, bearing, distM);
        const sum = document.getElementById('gps-weather-summary');
        const val = document.getElementById('gps-plays-like-value');
        if (sum) sum.textContent = `${shot.summary}${wx.isRaining ? ' · 🌧️' : ''}`;
        if (val) {
            val.textContent = Math.abs(shot.deltaM) < 2
                ? `plays ${shot.playsM}m`
                : `plays ~${shot.playsM}m (${shot.deltaM > 0 ? '+' : ''}${shot.deltaM}m ${shot.windWord})`;
        }
        row.classList.remove('hidden');
    });
}

/**
 * BL-DEC-02: one-line aim reminder for the active strategy period, shown in
 * the GPS widget. Strategy + the player's dominant approach-miss bias are
 * each loaded ONCE per session (dynamic imports keep strategy/insights out of
 * the hot GPS path); per-tick work is a cheap string build. Par-5s get the
 * strategy's par-5 framing.
 */
let _hintCache = null; // { strategy, biasText } | 'loading' | 'none'
function updateStrategyHint() {
    const el = document.getElementById('gps-strategy-hint');
    if (!el) return;

    if (_hintCache === 'none') { el.classList.add('hidden'); return; }
    if (_hintCache === 'loading') return;

    if (!_hintCache) {
        _hintCache = 'loading';
        (async () => {
            try {
                const { getActiveStrategy } = await import('./strategy.js');
                const strategy = await getActiveStrategy();
                if (!strategy || !strategy.hint) { _hintCache = 'none'; el.classList.add('hidden'); return; }

                let biasText = '';
                try {
                    const { getDocs, query: q2, collection: coll, where: wh, orderBy: ob, limit: lim } =
                        await import('firebase/firestore');
                    const { overallMissBias } = await import('./insights.js');
                    const snap = await getDocs(q2(coll(db, 'shots'),
                        wh('uid', '==', auth.currentUser.uid), ob('timestamp', 'desc'), lim(300)));
                    const bias = overallMissBias(snap.docs.map(d => d.data()));
                    if (bias) biasText = ` You miss ${bias.pattern} ${bias.pct}% — favour the other half.`;
                } catch { /* bias is a bonus, never block the hint */ }

                _hintCache = { strategy, biasText };
                updateStrategyHint();
            } catch (e) {
                console.warn('[StrategyHint] unavailable:', e.message);
                _hintCache = 'none';
            }
        })();
        return;
    }

    const { strategy, biasText } = _hintCache;
    const par = AppState.currentCoursePars?.[AppState.currentHole - 1];
    const text = (par === 5 && strategy.par5) ? strategy.par5 : strategy.hint;
    el.textContent = `🧭 [${strategy.name}] ${text}${par === 5 ? '' : biasText}`;
    el.classList.remove('hidden');
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
let voiceHideTimer = null;
let voiceSessionActive = false;
function cancelVoiceSession() {
    const wasActive = voiceSessionActive;
    // Invalidate before stop: it can synchronously deliver end, or queue results.
    voiceSessionActive = false;
    clearTimeout(voiceHideTimer);
    voiceHideTimer = null;
    if (UI.voiceTranscript) UI.voiceTranscript.textContent = '';
    UI.voiceOverlay?.classList.add('hidden');
    if (wasActive) recognition?.stop();
}
window.addEventListener('stateChange', ({ detail }) => {
    if (detail.property !== 'activeTab') return;
    if (detail.newValue !== 'tab-oncourse') {
        cancelVoiceSession();
    }
});
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
        if (!voiceSessionActive) return;
        clearTimeout(voiceHideTimer);
        voiceHideTimer = null;
        UI.voiceOverlay.classList.remove('hidden');
        UI.voiceStatus.textContent = "Listening...";
        UI.voiceTranscript.textContent = "";
    };

    recognition.onresult = (event) => {
        if (!voiceSessionActive) return;
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        UI.voiceTranscript.textContent = transcript;
    };

    recognition.onerror = (event) => {
        if (!voiceSessionActive) return;
        voiceSessionActive = false;
        clearTimeout(voiceHideTimer);
        if (event.error === 'not-allowed') {
            // Reset for a later attempt; browser permission may still need changing.
            recognition = null;
            UI.voiceStatus.textContent = "Mic blocked. Allow it in browser settings, or use the score buttons.";
        } else {
            UI.voiceStatus.textContent = event.error === 'no-speech'
                ? "No speech was heard. Tap the mic and try speaking again."
                : "Voice input is unavailable. Enter your score with the buttons instead.";
        }
        voiceHideTimer = setTimeout(() => {
            voiceHideTimer = null;
            UI.voiceOverlay.classList.add('hidden');
        }, event.error === 'not-allowed' ? 2500 : 2000);
    };

    recognition.onend = () => {
        // An error is followed by end; keep its feedback until the hide deadline.
        if (!voiceSessionActive || voiceHideTimer !== null) return;
        voiceSessionActive = false;
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
        return aiErrorMessage(e, "AI rules advice is unavailable. Check the Rules of Golf or ask the competition committee.");
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

        // Final State: Success. Owner feedback 2026-07-05: "saved to cloud,
        // analyse later — no way to find it later." Say WHERE it lives.
        if (btnAudio) {
            btnAudio.innerHTML = "✅ Saved — find it in Handicap → Round History (🔊 plays it, 💡 gets the AI briefing)";
            btnAudio.className = "btn btn-success";
            btnAudio.disabled = true;
            btnAudio.style.display = "block";
            btnAudio.style.width = "100%";
            btnAudio.style.background = "#10b981";
            btnAudio.style.whiteSpace = "normal";
        }
    } catch (err) {
        console.error("Upload failed:", err);
        alert("Could not upload the diary. Check your connection, then record it again before uploading.");
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

/**
 * Simplify C23: Prev/Next say what they do at the ends of the round. Next on
 * the last hole already opens the summary, so it says "Finish ✓"; Prev does
 * nothing on hole 1, so it is disabled there (a disabled button also ignores
 * the swipe's synthetic click).
 * @returns {void}
 */
export function syncHoleNavLabels() {
    const prev = document.getElementById('btn-oc-prev-hole');
    const next = document.getElementById('btn-oc-next-hole');
    if (prev) prev.disabled = AppState.currentHole <= 1;
    if (next) {
        const last = AppState.currentHole >= (AppState.currentRoundHoles || 9);
        next.textContent = last ? 'Finish ✓' : 'Next Hole →';
        next.classList.toggle('oc-thumb-finish', last);
    }
}

export function bindHoleNav() {
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
            // Owner feedback 2026-07-05: it was possible to sail past a hole
            // with no score and only notice holes later when the pars stopped
            // matching. One gentle confirm, only when NOBODY has a score.
            const anyScore = AppState.liveRoundGroups.some(p => (p.scores?.[AppState.currentHole] || 0) > 0);
            if (!anyScore && AppState.liveRoundGroups.length > 0
                && !confirm(`No score entered for hole ${AppState.currentHole} — ${AppState.currentHole >= (AppState.currentRoundHoles || 9) ? 'finish' : 'move on'} anyway?`)) {
                return;
            }
            if (AppState.currentHole < (AppState.currentRoundHoles || 9)) {
                AppState.currentHole++;
                loadHole();
                // Owner feedback 2026-07-05: in a Detailed round, arriving on a
                // fresh hole means the next tap is always "track my shot" — do
                // it for them. Revisiting a hole with shots stays quiet.
                if (AppState.currentTrackingMode === 'detailed'
                    && !(AppState.currentHoleShots && AppState.currentHoleShots.length)) {
                    startNewShotInput();
                }
            } else {
                openFinishModal();
            }
        });
    }

    // One-thumb strip (2026-09-16): the hole label opens the jumper, ⋯ opens
    // the More sheet, and a horizontal swipe on the hub changes hole. All
    // visibility is the `hidden` class (Sydney rule); the clone-replace keeps
    // a re-bind at round start from stacking listeners.
    const stripHole = document.getElementById('btn-oc-hole-strip');
    const jumper = document.getElementById('hole-jumper-container');
    if (stripHole && jumper) {
        stripHole.replaceWith(stripHole.cloneNode(true));
        document.getElementById('btn-oc-hole-strip').addEventListener('click', (e) => {
            const open = jumper.classList.toggle('hidden') === false;
            e.currentTarget.setAttribute('aria-expanded', String(open));
        });
    }
    const more = document.getElementById('btn-oc-more');
    const sheet = document.getElementById('oc-more-sheet');
    if (more && sheet) {
        more.replaceWith(more.cloneNode(true));
        document.getElementById('btn-oc-more').addEventListener('click', (e) => {
            const open = sheet.classList.toggle('hidden') === false;
            e.currentTarget.setAttribute('aria-expanded', String(open));
        });
    }
    const hub = document.getElementById('oncourse-hub');
    if (hub && !hub.dataset.swipeBound) {
        hub.dataset.swipeBound = '1';
        let startX = 0, startY = 0, tracking = false;
        hub.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX; startY = e.touches[0].clientY; tracking = true;
        }, { passive: true });
        hub.addEventListener('touchend', (e) => {
            if (!tracking) return;
            tracking = false;
            const t = e.changedTouches[0];
            const dx = t.clientX - startX, dy = t.clientY - startY;
            // A deliberate sideways flick: far enough, and flatter than it is tall.
            if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
            if (e.target.closest('button, select, input, .oc-thumb-bar')) return;
            document.getElementById(dx < 0 ? 'btn-oc-next-hole' : 'btn-oc-prev-hole')?.click();
        }, { passive: true });
    }

    // Clone-replace before binding (like prev/next above) so re-running this
    // at round start can't stack duplicate listeners — a second save listener
    // would double-save every round.
    let btnFinish = document.getElementById('btn-oc-finish');
    if (btnFinish) {
        btnFinish.replaceWith(btnFinish.cloneNode(true));
        btnFinish = document.getElementById('btn-oc-finish');
        btnFinish.addEventListener('click', () => openFinishModal());
    }
    // Owner 2026-09-20: the summary's exits sit in its header, reachable
    // without scrolling past 18 holes. Simplify C21: they are the only pair
    // now (the bottom Discard / Back to Active Round duplicates are gone), and
    // Abandon runs the same discardRound() as ⋯ → ✕ Abandon.
    let btnFinishClose = document.getElementById('btn-oc-finish-close');
    if (btnFinishClose) {
        btnFinishClose.replaceWith(btnFinishClose.cloneNode(true));
        btnFinishClose = document.getElementById('btn-oc-finish-close');
        btnFinishClose.addEventListener('click', () => {
            document.getElementById('oc-finish-modal')?.classList.add('hidden');
        });
    }
    let btnFinishAbandon = document.getElementById('btn-oc-finish-abandon');
    if (btnFinishAbandon) {
        btnFinishAbandon.replaceWith(btnFinishAbandon.cloneNode(true));
        btnFinishAbandon = document.getElementById('btn-oc-finish-abandon');
        btnFinishAbandon.addEventListener('click', () => discardRound());
    }

    let btnSaveWhs = document.getElementById('btn-oc-save-whs');
    if (btnSaveWhs) {
        btnSaveWhs.replaceWith(btnSaveWhs.cloneNode(true));
        btnSaveWhs = document.getElementById('btn-oc-save-whs');
        btnSaveWhs.addEventListener('click', saveRoundToDatabase);
    }

    let parSelect = document.getElementById('oc-par-select');
    if (parSelect) {
        parSelect.replaceWith(parSelect.cloneNode(true));
        parSelect = document.getElementById('oc-par-select');
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
    // Fold the jumper again: it was opened from the strip for this one pick.
    document.getElementById('hole-jumper-container')?.classList.add('hidden');
    document.getElementById('btn-oc-hole-strip')?.setAttribute('aria-expanded', 'false');
    // Scroll hub back to top
    const hub = document.getElementById('oncourse-hub');
    if (hub) hub.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* MOVED TO MODULE: renderHoleJumper */




/**
 * Single source of a round's rating / slope / par. Read identically by the
 * daily-handicap calc (bindStartRound) and the WHS save so one set of values
 * flows DH -> AGS -> saved differential -> notCounting (BL-4.01).
 *
 * Ratable tee: trust the stored teeData. Unratable tee: read the manual
 * #oc-stat-cr/sr/par inputs and validate them with the same predicate at
 * both sites. `counting` is false unless the values are WHS-plausible.
 *
 * @param {string} courseName
 * @param {string} teeName
 * @returns {{rating:number, slope:number, par:number, ratable:boolean, counting:boolean}}
 */
export function resolveRoundRatings(courseName, teeName) {
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};
    if (isRatableTee(teeData)) {
        return { rating: teeData.rating, slope: teeData.slope, par: teeData.par, ratable: true, counting: true };
    }
    const crEl = document.getElementById('oc-stat-cr');
    const srEl = document.getElementById('oc-stat-sr');
    const parEl = document.getElementById('oc-stat-par');
    const rating = crEl ? parseFloat(crEl.value) : NaN;
    const slope = srEl ? parseFloat(srEl.value) : NaN;
    const par = parEl ? parseInt(parEl.value) : NaN;
    const counting = isPlausibleRating(rating, slope, par);
    return { rating, slope, par, ratable: false, counting };
}

// PRODUCT SWEEP 2026-09-10 SECOND PASS F-5. State for the current save, so a
// rejection that arrives AFTER the locker room has rendered can still correct
// what the player is being told.
let _cloudRejections = [];
let _backupKey = null;

/**
 * A cloud write was REFUSED — say so.
 *
 * The distinction the whole fix rests on: an offline write never rejects.
 * Firestore queues it in its own IndexedDB and replays it on reconnect
 * (verified against a real emulator in tests/offline/firestore-offline.test.js:
 * the promise stays pending, forever). So a rejection that actually arrives is
 * a real refusal — the security rules, a quota, a malformed document — and it
 * is the one thing "Round Saved Successfully" must never be shown for.
 *
 * PR #135 was right to stop awaiting these writes and wrong to let the
 * `.catch` do nothing but console.error: `anyCloudFail` was seeded once from
 * navigator.onLine and never assigned again, so a refused save produced a
 * locker room reading "Round Saved Successfully", a localStorage backup
 * stamped synced, and a round that did not exist.
 *
 * @param {string} what - What was refused, in the player's words.
 * @param {Error} err - The Firestore error.
 * @returns {void}
 */
function noteCloudRejection(what, err) {
    console.error(`Cloud Save Fail (${what}):`, err);
    if (!_cloudRejections.includes(what)) _cloudRejections.push(what);
    markRoundBackupUnsynced(_backupKey);
    renderCloudRejection();
}

/** Put the refusals on the locker room, over whatever it currently says. */
function renderCloudRejection() {
    if (!_cloudRejections.length) return;
    const msg = document.getElementById('locker-room-msg');
    const errBox = document.getElementById('locker-room-err');
    if (msg) msg.textContent = "Round NOT saved to the cloud";
    if (errBox) {
        errBox.classList.remove('hidden');
        errBox.textContent = `⚠️ The server refused this save (${_cloudRejections.join('; ')}). ` +
            `Your card is still on this device. Try saving again; if it keeps failing, this round has not reached your record.`;
    }
}

/**
 * Par for the holes actually played.
 *
 * PRODUCT SWEEP 2026-09-10 SECOND PASS F-2: the save handed the TEE's total
 * par to convertStablefordToAGS along with a holesPlayed of 9, so a nine
 * walked off an eighteen-hole record was converted against par 68 with a
 * nine-hole baseline — an AGS on neither scale. Sums the real per-hole pars
 * when they are known; falls back to halving an eighteen-hole par when a
 * resumed round has lost the array.
 *
 * @param {number} teePar - The tee's total par.
 * @param {number} holesPlayed - Holes actually completed.
 * @param {number[]} [played] - Hole numbers scored. Simplify C20 (codex P2):
 *   the par must match the holes the Stableford points came from. Exactly
 *   `holesPlayed` scored holes sum their own pars (a nine of holes 2-10);
 *   fewer, all on the back nine, take the back nine's par.
 * @returns {number} Par for those holes.
 */
export function parForHolesPlayed(teePar, holesPlayed, played = null) {
    const pars = AppState.currentCoursePars;
    const known = Array.isArray(played) && Array.isArray(pars) && played.length > 0
        && played.every(h => Number.isInteger(h) && h >= 1 && h <= pars.length && Number(pars[h - 1]) > 0);
    if (known && new Set(played).size === holesPlayed) {
        return [...new Set(played)].reduce((t, h) => t + Number(pars[h - 1]), 0);
    }
    const backNine = holesPlayed === 9 && known && pars.length >= 18 && played.every(h => h >= 10 && h <= 18);
    const start = backNine ? 9 : 0;
    if (Array.isArray(pars) && pars.length >= start + holesPlayed) {
        const sum = pars.slice(start, start + holesPlayed).reduce((t, v) => t + (Number(v) || 0), 0);
        if (sum > 0) return sum;
    }
    const total = Number(teePar);
    if (!Number.isFinite(total) || total <= 0) return total;
    // No per-hole array: an eighteen-hole par split for a nine is the only
    // honest approximation, and a nine's own par needs no adjustment.
    return (holesPlayed === 9 && holesForPar(total) === 18) ? Math.round(total / 2) : total;
}

/**
 * Compiles the final round data, calculates adjusted gross scores and differentials,
 * and persists the completed round to Firestore.
 * @returns {Promise<void>}
 */
async function saveRoundToDatabase() {
    // F-12: the save button is not disabled and, before the fire-and-forget
    // change below, every tap parked a run on a never-settling write. Each
    // stacked run performed its own addDoc into comp_rounds — a NON-idempotent
    // write — so reconnecting flushed one duplicate competition row per tap.
    if (_savedRoundId && _savedRoundId === AppState.activeRoundId) return;
    _savedRoundId = AppState.activeRoundId;

    const holesPlayedEl = document.getElementById('oc-finish-holes');
    const holesPlayedStr = holesPlayedEl ? holesPlayedEl.value : "9";
    const holesPlayed = parseInt(holesPlayedStr, 10) || 18;

    // Reset milestone chips from any previous round; repopulated below if earned.
    const milestoneBox = document.getElementById('locker-milestones');
    if (milestoneBox) { milestoneBox.innerHTML = ''; milestoneBox.classList.add('hidden'); }

    const courseName = AppState.currentRoundCourseName;
    // Prefer the tee + ratings resolved at Start Round and persisted with the
    // round state (BL-UX-08): the tee <select> resets on reload, so resumed
    // rounds used to save with NaN rating/slope. The select is only a fallback
    // for legacy in-flight rounds persisted before this fix.
    const teeName = AppState.currentRoundTee || (UI.ocTeeSelect ? UI.ocTeeSelect.value : null);
    const persisted = AppState.currentRoundRatings;
    const { rating: cr, slope: sr, par, counting } =
        (persisted && Number.isFinite(persisted.rating) && Number.isFinite(persisted.slope) && persisted.par > 0)
            ? persisted
            : resolveRoundRatings(courseName, teeName);
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

    // F-12: the cloud writes are fire-and-forget now, so "did it sync?" can no
    // longer be answered by awaiting them. Offline the answer is known up front,
    // and "Round Saved Locally" is exactly the message this state was built for
    // — it was simply unreachable, because an offline write never rejects.
    let anyCloudFail = (typeof navigator !== 'undefined' && navigator.onLine === false);
    _cloudRejections = [];
    _backupKey = null;
    // F-5: whs_rounds allows a create only for your OWN uid
    // (firestore.rules:315-318), and this loop writes one document per player
    // in the group. Every partner document was therefore guaranteed to be
    // refused, and the screen said they had all saved. Writing a document the
    // rules are certain to reject and calling it a success is the worst of the
    // available options; the round is written for the signed-in player (or by
    // an admin, for whom the rule does allow it) and the partners are named on
    // screen instead.
    const canWriteForOthers = (typeof window !== 'undefined' && window.currentUserIsAdmin === true);
    const partnersNotSaved = [];
    const partnersProposed = [];

    // The tee's real stroke index, or null. Never the hole number (F-9).
    const strokeIndex = getStrokeIndex(teeData, holesPlayed);
    let scoringNote = null;
    // Simplify C20 (review P1): nine holes saved off an 18-hole tee would pair
    // a nine-hole AGS with the 18-hole Course Rating and Slope (there is no
    // nine-hole rating for that tee), so the differential comes out far too
    // low. Keep the round, but out of the index, and say why (per player,
    // below: nineOnEighteenReason).

    try {
        for (let p of AppState.liveRoundGroups) {
            let totalGross = 0;
            let totalStableford = 0;
            // Per player: the stroke index is the tee's, the Daily Handicap
            // is theirs. A round that cannot be scored is recorded as gross
            // and excluded from the index rather than given an AGS derived
            // from data nobody published (F-9/F-4).
            const played = scoredHoles(p.scores);
            // The Finish choice is confirmed against YOUR card (codex P2): a
            // partner who played on past the turn when you stopped at nine is
            // saved as the 18 they played (the 14-hole rule and net par for
            // unplayed holes apply), not as a nine that can't count.
            const pHoles = (holesPlayed === 9 && played.length > 9 && p.uid !== AppState.currentUser?.uid)
                ? 18 : holesPlayed;
            const pStrokeIndex = pHoles === holesPlayed ? strokeIndex : getStrokeIndex(teeData, pHoles);
            const blockedReason = scoringUnavailableReason(pStrokeIndex, p.dailyHandicap);
            const notCountingReason = blockedReason || nineOnEighteenReason(pHoles, par)
                || tooFewForEighteenReason(pHoles, played.length);
            if (notCountingReason && p.uid === AppState.currentUser?.uid) scoringNote = notCountingReason;

            for (const h in p.scores) {
                const gross = p.scores[h];
                totalGross += gross;

                const holeIdx = parseInt(h) - 1;
                const hPar = AppState.currentCoursePars[holeIdx] || 4;
                const hSI = pStrokeIndex ? pStrokeIndex[holeIdx] : null;

                if (!blockedReason && hPar && hSI) {
                    // F-2: the stroke chart wraps where the Daily Handicap was
                    // computed (the course record's holes), NOT at the value of
                    // the Finish dropdown — a player who walks in after nine of
                    // an eighteen still has an eighteen-hole Daily Handicap.
                    totalStableford += calculateHoleStableford(gross, hPar, hSI, p.dailyHandicap, p.dailyHandicapHoles || pHoles);
                }
            }

            // Convert to AGS. The Stableford baseline is two points a hole, so
            // the holes played must reach whs.js — without it a nine was scored
            // against the 18-hole figure of 36 and stored ~18 strokes too high
            // (PRODUCT SWEEP 2026-09-10 F-1).
            // An unscorable round keeps its real gross as the AGS — honest,
            // and plausible to firestore.rules — instead of a figure derived
            // from an invented stroke index or a Daily Handicap of 0.
            // F-2: the AGS baseline is two points per hole PLAYED, against the
            // par of the holes PLAYED. `par` is the whole tee's par, so a nine
            // walked off an eighteen-hole record used to be converted against
            // 68 with a baseline of 18.
            // WHS: a hole of an 18 that wasn't played counts as net par, two
            // Stableford points (a 14-17 hole round still counts as an 18).
            const parPlayed = parForHolesPlayed(par, pHoles, played);
            const adjustedGross = blockedReason
                ? totalGross
                : convertStablefordToAGS(totalStableford + unplayedNetParPoints(pHoles, played.length),
                    p.dailyHandicap, parPlayed, pHoles);

            let sumPutts = 0, sumGIR = 0, sumFwy = 0;
            if (p.simpleStats) {
                for (const h in p.simpleStats) {
                    if (p.simpleStats[h].putts) sumPutts += p.simpleStats[h].putts;
                    if (girOf({ par: AppState.currentCoursePars[Number(h) - 1] || 4, gross: p.scores?.[h] || 0,
                        putts: p.simpleStats[h].putts, stored: p.simpleStats[h].gir })) sumGIR += 1;
                    // Old rounds' editor wrote .fir, the card writes .fwy: fairwayHit
                    // counts both (N17/BL-4.01), and par 4/5 only (simplify C25).
                    if (fairwayHit(p.simpleStats[h], AppState.currentCoursePars[Number(h) - 1] || 4)) sumFwy += 1;
                }
            }

            // BL-DEC-01: compact per-hole detail — powers Tiger-5 detection
            // (doubles, par-5 bogeys, three-putts) and future hole analysis.
            // Named holeScores because CSV-imported rounds already use `holes`
            // as a NUMBER (holes played).
            const holeScores = Object.keys(p.scores)
                .map(h => parseInt(h, 10))
                .filter(h => Number.isFinite(h) && p.scores[h] > 0)
                .sort((a, b) => a - b)
                .map(h => ({
                    h,
                    par: AppState.currentCoursePars[h - 1] || 4,
                    gross: p.scores[h],
                    putts: (p.simpleStats && p.simpleStats[h] && Number(p.simpleStats[h].putts)) || 0
                }));

            const payload = safeSerialize({
                uid: p.uid,
                holeScores,
                course: AppState.currentRoundCourseName + ` (${pHoles}H)`,
                courseName: AppState.currentRoundCourseName,
                rating: cr,
                slope: sr,
                par: par,
                adjustedGross: adjustedGross,
                notCounting: !counting || !!notCountingReason,
                notCountingReason: notCountingReason || null,
                totalGross: totalGross,
                totalScore: totalGross,
                totalStableford: blockedReason ? null : totalStableford,
                dailyHandicap: p.dailyHandicap,
                isLiveTracked: true,
                liveRoundsMode: AppState.currentTrackingMode,
                // 9 or 18 — drives the WHS 9→18 expected-score scaling in
                // calculateIndex (BL-UX-07). The rating/slope above are true
                // 9-hole values when a nine was played.
                holesPlayed: pHoles,
                stats: { putts: sumPutts, gir: sumGIR, fwy: sumFwy },
                totalPutts: sumPutts
            });
            // Inject date AFTER serialization to preserve sentinel/Date object.
            // The picked day becomes LOCAL midnight (F-7): new Date('2026-09-11')
            // is UTC midnight, which renders back as the previous day west of
            // Greenwich and as 10am here.
            payload.date = parseLocalDate(AppState.currentRoundDate) || serverTimestamp();

            // Personal-best chips for the Locker Room (self only), computed
            // against the pre-save history so this round can beat its records.
            // currentRounds holds the *viewed* player's history, so only use it
            // when we're viewing ourselves.
            if (p.uid === auth.currentUser?.uid && AppState.viewingPlayerId === p.uid) {
                try {
                    const selfDocId = `${AppState.activeRoundId}_${p.uid}`;
                    const prior = (AppState.currentRounds || []).filter(r => r.id !== selfDocId);
                    const milestones = computeMilestones(payload, prior);
                    // BL-DEC-01: Tiger-5 card-wreckers for this round (DECADE).
                    const tiger = computeTiger5(payload);
                    if (tiger) {
                        milestones.push(tiger.total === 0
                            ? '🐯 Clean Tiger-5 round — no doubles, par-5 bogeys or three-putts!'
                            : `🐯 Tiger-5 mistakes: ${tiger.total} (${tiger.parts.join(' · ')})`);
                    }
                    const box = document.getElementById('locker-milestones');
                    if (box) {
                        box.innerHTML = milestones.map(m =>
                            `<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px; font-weight:600;">${escapeHtml(m)}</div>`
                        ).join('');
                        box.classList.toggle('hidden', milestones.length === 0);
                    }
                } catch (e) { console.warn('[Milestones] skipped:', e); }
            }

            // F-12: fire-and-forget. Under persistentLocalCache a write promise
            // resolves only on the SERVER ack, so awaiting it offline hangs the
            // whole save forever — no locker room, no local backup, no error.
            // The write is durable in Firestore's own IndexedDB queue the moment
            // it is issued and replays on reconnect; the player must not wait.
            // v6.15.0: predictable ID format {roundId}_{uid} allows later updates
            // (e.g. audioUrl) and makes the write idempotent across retries.
            const docId = `${AppState.activeRoundId}_${p.uid}`;
            const myUid = auth.currentUser?.uid || AppState.currentUser?.uid;
            const isSelf = p.uid === myUid;
            const isMyGuest = isGuestId(p.uid);

            if (isMyGuest) {
                // A guest is a golfer YOU own, so their card counts toward a
                // handicap the same way yours does. `guestOwnerUid` is what the
                // security rule checks against the guest document; without it
                // the write is refused, which is the correct outcome for a guest
                // somebody else owns.
                payload.guestOwnerUid = myUid;
            }

            if (isSelf || isMyGuest || canWriteForOthers) {
                setDoc(doc(db, "whs_rounds", docId), payload)
                    .catch(cloudErr => noteCloudRejection(
                        isSelf ? 'your round'
                            : `${p.name || (isMyGuest ? 'your guest' : 'a playing partner')}'s round`,
                        cloudErr));
            } else {
                // A registered player who is not you. Only they may write their
                // own handicap record — so the card is PROPOSED to them and
                // becomes a round when they sign it, which is how a marked card
                // works on a real course. Fire-and-forget like every other write
                // here: the player must not wait on it.
                proposeRound({ playerUid: p.uid, playerName: p.name, round: payload })
                    .catch(err => noteCloudRejection(
                        `${p.name || 'a playing partner'}'s card could not be sent for approval`,
                        err));
                partnersProposed.push(p.name || 'a playing partner');
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
                    totalPoints: totalStableford + totalRulePoints,
                    ruleCounts: ruleCounts,
                    isLiveSynced: true
                });
                // Inject date AFTER serialization
                compPayload.date = serverTimestamp();

                // F-12: same fire-and-forget rule. This write is NOT idempotent
                // — every completed run adds a competition row — so the
                // re-entry guard above is what stops a second tap duplicating it.
                addDoc(collection(db, "comp_rounds"), compPayload)
                    .catch(cloudErr => noteCloudRejection(
                        `${p.name || 'a player'}'s competition card`, cloudErr));
            }
        }

        // Resilient Backup: Always write to localStorage as well.
        // F-14: bounded. These keys were never pruned and never read, so a
        // regular player filled the ~5 MB origin quota with them until
        // saveRoundState() started throwing mid-round.
        markRoundSaved(AppState.activeRoundId);
        _backupKey = writeRoundBackup({
            roundId: AppState.activeRoundId,
            date: new Date().toISOString(),
            course: AppState.currentRoundCourseName,
            players: safeSerialize(AppState.liveRoundGroups),
            // Optimistic: the writes have been issued and no answer has arrived
            // yet. noteCloudRejection() corrects this if one is refused (F-5).
            synced: !anyCloudFail
        });

        showLockerRoom(anyCloudFail, scoringNote, partnersNotSaved, partnersProposed);
        // A refusal that somehow beat the render would otherwise be painted
        // over by "Round Saved Successfully"; re-assert it over the fresh DOM.
        renderCloudRejection();
    } catch (err) {
        console.error("Critical Save Loop Error:", err);
        _savedRoundId = null; // a real preparation failure — let the player retry
        alert("A critical error occurred while preparing the save. Your data is still in memory; please do not refresh.");
    }
}

/**
 * Transitions the UI to the Post-Round Locker Room.
 * @param {boolean} isPartialFail - Whether cloud sync failed.
 * @param {string|null} scoringNote - Why this round is gross-only (F-9/F-4).
 * @param {Array<string>} partnersNotSaved - Playing partners whose cards were
 *   NOT written to their handicap record, because only they may write it
 *   (F-5). Silence here is what told a marker that both rounds had saved.
 */
function showLockerRoom(isPartialFail = false, scoringNote = null, partnersNotSaved = [], partnersProposed = []) {
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

    // Show Locker Room via the state-driven path: body[data-active-tab] is the
    // only mechanism that makes a screen visible since the .active-class CSS
    // was removed in the data-active-tab migration. (Assigned directly rather
    // than via switchTab so 'oc-locker-room' is never persisted as the
    // default boot tab.)
    AppState.activeTab = 'oc-locker-room';
    const locker = document.getElementById('oc-locker-room');
    if (locker) {
        locker.classList.remove('hidden');
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
        // Why this round is gross-only and won't count (F-9/F-4). Silence here
        // is what let a corrupted Stableford total reach the index unnoticed.
        const noteDisplay = document.getElementById('locker-room-note');
        if (noteDisplay) {
            const notes = [];
            if (scoringNote) notes.push(scoringNote);
            if (partnersProposed && partnersProposed.length) {
                const who = partnersProposed.join(', ');
                const plural = partnersProposed.length > 1;
                notes.push(`Your card is saved. ${who}'s card ${plural ? 'has' : 'has'} been sent to ${plural ? 'them' : 'them'} to approve — it lands on ${plural ? 'their' : 'their'} handicap record as soon as ${plural ? 'they' : 'they'} sign it.`);
            }
            if (partnersNotSaved && partnersNotSaved.length) {
                const who = partnersNotSaved.join(', ');
                notes.push(`Your card is saved. ${who}'s ${partnersNotSaved.length > 1 ? 'scores were' : 'score was'} kept for this round only — a handicap record can only be written by the player it belongs to, so ${partnersNotSaved.length > 1 ? 'they each need' : 'they need'} to log the round from their own account.`);
            }
            noteDisplay.textContent = notes.join(' ');
            noteDisplay.classList.toggle('hidden', notes.length === 0);
        }

        // S5: the GPS assist summary — only when the toggle is on and the
        // round actually estimated a bias.
        const gpsLine = document.getElementById('locker-room-gps');
        if (gpsLine) {
            if (AppState.gpsAssist && AppState.gpsBias && Number.isFinite(AppState.gpsBias.magM)) {
                gpsLine.textContent = `GPS assist: bias ${Math.round(AppState.gpsBias.magM)} m from ${AppState.gpsBias.n} samples`;
                gpsLine.classList.remove('hidden');
            } else {
                gpsLine.textContent = '';
                gpsLine.classList.add('hidden');
            }
        }
    }
}

/**
 * v6.10.0 Math Engine: Calculates enriched stats, then calls the Cloud Coach.
 */
export async function runStatAnalysis() {
    console.log("[Stats] Running Instant Analysis...");
    const modal = document.getElementById('stat-analysis-modal');
    const resultsDiv = document.getElementById('stat-analysis-results');
    const btnClose = document.getElementById('btn-close-stats');
    const btnCloseX = document.getElementById('btn-close-stats-x');

    if (modal) modal.classList.remove('hidden');
    const closeStats = () => {
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
    if (btnClose) btnClose.onclick = closeStats;
    if (btnCloseX) btnCloseX.onclick = closeStats;

    const p = AppState.liveRoundGroups.find(x => x.uid === auth.currentUser?.uid);
    if (!p || !p.scores) {
        if (resultsDiv) resultsDiv.innerHTML = "<p>No scores are available for this analysis. Close this window and check your scoring record.</p>";
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
            if (girOf({ par, gross: score, putts: stats.putts, stored: stats.gir })) {
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
    const sq = query(collection(db, "shots"), where("roundId", "==", AppState.activeRoundId));
    const snap = await getDocs(sq);
    const shapeCounts = {};
    const myShots = [];
    snap.forEach(d => {
        const s = d.data();
        if (s.uid !== p.uid) return;
        myShots.push(s);
        if (s.shape) {
            shapeCounts[s.shape] = (shapeCounts[s.shape] || 0) + 1;
        }
    });
    const puttDiag = computePuttDiagnostics(myShots);

    Object.keys(simpleStats).forEach(holeNum => {
        const hStats = simpleStats[holeNum];
        if (!hStats) return;
        if (hStats.penalties && hStats.penalties > 0) penaltyTotal += hStats.penalties;
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
        </div>
        <div style="text-align:left; font-size:0.85rem; background:#f1f5f9; padding:12px; border-radius:8px;">
            <p><strong>Par Averages:</strong>
                3s: ${payload.par3Avg !== null ? payload.par3Avg.toFixed(1) : 'N/A'} |
                4s: ${payload.par4Avg !== null ? payload.par4Avg.toFixed(1) : 'N/A'} |
                5s: ${payload.par5Avg !== null ? payload.par5Avg.toFixed(1) : 'N/A'}</p>
            <p><strong>Primary Shape:</strong> ${payload.shotShapeTendency || 'None Recorded'}</p>
            <p><strong>Total Penalties:</strong> ${payload.penalties}</p>
            ${puttDiag ? `<p><strong>Putting:</strong> ${puttDiag.onLinePct !== null ? puttDiag.onLinePct + '% started on line' : ''}${puttDiag.onLinePct !== null && puttDiag.goodReadPct !== null ? ' · ' : ''}${puttDiag.goodReadPct !== null ? puttDiag.goodReadPct + '% good reads' : ''}${puttDiag.verdict === 'stroke' ? ' → work the stroke, the reads are there' : puttDiag.verdict === 'read' ? ' → work green-reading, the stroke is there' : ''}</p>` : ''}
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
        if (feedbackDiv) {
            const msg = aiErrorMessage(error, 'The Game Master is unavailable. Focus on your averages above!');
            feedbackDiv.innerHTML = `<p style='color: #dc3545; font-size:0.85rem;'>${escapeHtml(msg)}</p>`;
        }
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

            mutateList('liveRoundGroups', () => {
                p.scores[AppState.currentHole] = (p.scores[AppState.currentHole] || 0) + penaltyCount;
            });

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

/* MOVED TO MODULE: saveShotData */



/* MOVED TO MODULE: deleteShotData */



/* MOVED TO MODULE: showToast */


function bindReviewModal() {
    if (UI.btnOcReviewRound) {
        UI.btnOcReviewRound.addEventListener('click', async () => {
            if (!UI.reviewRoundModal || !UI.reviewContent) return;
            closeMoreSheet();
            UI.reviewRoundModal.classList.remove('hidden');
            UI.reviewContent.innerHTML = '<p style="text-align:center; padding:20px; color:#64748b;">Generating detailed review...</p>';

            const courseName = AppState.currentRoundCourseName;
            const teeName = AppState.currentRoundTee || UI.ocTeeSelect.value;
            const teeData = COURSE_DATA[courseName]?.[teeName] || {};
            const manualPar = document.getElementById('oc-stat-par');
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
                const holeRows = [];
                const pShots = allRoundShots.filter(s => s.uid === p.uid);

                const reviewHoles = AppState.currentRoundHoles || 9;
                for (let h = 1; h <= reviewHoles; h++) {
                    const gross = p.scores[h] || 0;
                    totalGross += gross;

                    const holeIdx = h - 1;
                    const hPar = (teeData.pars && teeData.pars[holeIdx]) || AppState.currentCoursePars[holeIdx] || 4;
                    let hPts = null;
                    const reviewSI = getStrokeIndex(teeData, reviewHoles);
                    if (teeData.pars && reviewSI && !scoringUnavailableReason(reviewSI, p.dailyHandicap)) {
                        const hSI = reviewSI[holeIdx];
                        if (hPar && hSI && gross > 0) {
                            hPts = calculateHoleStableford(gross, hPar, hSI, p.dailyHandicap, reviewHoles);
                            totalStableford += hPts;
                        }
                    }
                    const putts = p.simpleStats?.[h]?.putts || 0;
                    const vsPar = gross > 0 ? gross - hPar : null;
                    holeRows.push(`
                        <tr style="${gross === 0 ? 'background:#fef2f2;' : (vsPar <= -1 ? 'background:#f0fdf4;' : (vsPar >= 2 ? 'background:#fff7ed;' : ''))}">
                            <td>${h}</td><td>${hPar}</td>
                            <td style="font-weight:700;">${gross || '—'}</td>
                            <td>${vsPar === null ? '' : (vsPar === 0 ? 'E' : (vsPar > 0 ? '+' + vsPar : vsPar))}</td>
                            <td>${hPts === null ? '' : hPts}</td>
                            <td>${putts || ''}</td>
                        </tr>`);
                }

                const ags = convertStablefordToAGS(totalStableford, p.dailyHandicap, par, reviewHoles);

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
                        <strong style="font-size:1.15rem; color:var(--primary-color);">${escapeHtml(p.name)}</strong>
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
                    <table class="leaderboard-table" style="width:100%; font-size:0.8rem; margin-top:12px;">
                        <thead><tr><th>H</th><th>Par</th><th>Gross</th><th>±</th><th>Pts</th><th>Putts</th></tr></thead>
                        <tbody>${holeRows.join('')}</tbody>
                    </table>
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
function renderCompPanel() {
    const panel = document.getElementById('oc-comp-panel');
    if (!panel) return;
    const rules = AppState.currentLiveCompRules || [];
    if (!AppState.currentLiveCompId || rules.length === 0) {
        panel.classList.add('hidden');
        return;
    }
    // SCOPE: current user only. To extend to all players later, loop
    // AppState.liveRoundGroups and render one labelled block per player.
    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
    if (!p) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');

    const holeLabel = document.getElementById('oc-comp-panel-hole');
    if (holeLabel) holeLabel.textContent = `(Hole ${AppState.currentHole})`;

    // Collapse toggle — assignment (.onclick), never addEventListener, so it
    // cannot stack across re-renders. Header markup is static.
    const header = document.getElementById('oc-comp-panel-header');
    const caret  = document.getElementById('oc-comp-panel-caret');
    if (header) header.onclick = () => {
        const body = document.getElementById('oc-comp-panel-body');
        if (!body) return;
        const collapsed = body.classList.toggle('hidden');
        if (caret) caret.textContent = collapsed ? '▶' : '▼';
    };

    const body = document.getElementById('oc-comp-panel-body');
    if (!body) return;
    body.innerHTML = '';
    const holeStats = p.compStats[AppState.currentHole] || {};

    rules.forEach(rule => {
        const count = holeStats[rule.name] || 0;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0;';
        // Stepper controls are STATIC markup — safe to use innerHTML here.
        row.innerHTML = `
            <span class="comp-rule-label" style="font-size:0.9rem; font-weight:600; color:#475569;"></span>
            <div style="display:flex; align-items:center; gap:12px;">
                <button class="comp-rule-minus" style="width:40px; height:40px; border-radius:10px; border:2px solid #cbd5e1; background:white; font-size:1.3rem; font-weight:bold;">−</button>
                <span class="comp-rule-count" style="min-width:24px; text-align:center; font-size:1.3rem; font-weight:800; color:#1e293b;">${count}</span>
                <button class="comp-rule-plus" style="width:40px; height:40px; border-radius:10px; background:var(--primary-color); color:white; border:none; font-size:1.3rem; font-weight:bold;">+</button>
            </div>
        `;
        // rule.name is COMP-CREATOR-CONTROLLED user input (stored XSS surface,
        // BL-4.17). NEVER interpolate it into an innerHTML string. Set it via
        // textContent and aria-labels via setAttribute (both are HTML-inert).
        const label = row.querySelector('.comp-rule-label');
        label.textContent = `${rule.name} (${rule.pts} pt${rule.pts === 1 ? '' : 's'})`;
        const minus = row.querySelector('.comp-rule-minus');
        const plus  = row.querySelector('.comp-rule-plus');
        minus.setAttribute('aria-label', `Decrease ${rule.name}`);
        plus.setAttribute('aria-label', `Increase ${rule.name}`);

        plus.onclick = () => {
            mutateList('liveRoundGroups', () => {
                if (!p.compStats[AppState.currentHole]) p.compStats[AppState.currentHole] = {};
                p.compStats[AppState.currentHole][rule.name] =
                    (p.compStats[AppState.currentHole][rule.name] || 0) + 1;
            });
            loadHole(); // REQUIRED — see persistence note; do not remove.
        };
        minus.onclick = () => {
            mutateList('liveRoundGroups', () => {
                if (!p.compStats[AppState.currentHole]) p.compStats[AppState.currentHole] = {};
                const cur = p.compStats[AppState.currentHole][rule.name] || 0;
                if (cur > 0) p.compStats[AppState.currentHole][rule.name] = cur - 1;
            });
            loadHole();
        };
        body.appendChild(row);
    });
}

export function updateModeVisibility() {
    const btnTrack = document.getElementById('btn-oc-track-shot');
    const wizard = document.getElementById('oncourse-wizard');

    if (AppState.currentTrackingMode === 'simple') {
        if (btnTrack) btnTrack.classList.add('hidden');
        if (wizard) wizard.classList.add('hidden');
    } else {
        // Detailed mode
        if (btnTrack) btnTrack.classList.remove('hidden');

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
