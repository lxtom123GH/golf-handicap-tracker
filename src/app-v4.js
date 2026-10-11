// ==========================================
// app.js
// Main Entry Point & Global Event Bindings
// ==========================================

// Update detection: key on the build commit, which changes every deploy —
// this used to read the hand-maintained meta tag, which sat at v6.23.1 for
// weeks and made the check a permanent no-op (BL-OC2 version confusion).
const appMeta = document.querySelector('meta[name="application-version"]');
const CURRENT_VERSION = typeof __BUILD_COMMIT__ !== 'undefined'
    ? `${__APP_VERSION__}+${__BUILD_COMMIT__}`
    : (appMeta ? appMeta.getAttribute('content') : 'v7.0.0');

/**
 * Boot-time update detection. Reloads once when the running bundle is not the
 * one this browser last recorded.
 *
 * PRODUCT SWEEP 2026-09-10 F-17, two coupled defects.
 * (a) The reload was not gated on being online. __BUILD_COMMIT__ changes on
 *     every deploy and the service worker serves a stale cached shell offline
 *     (BL-OFF-01, working as designed), so an offline launch after a deploy
 *     loaded the OLD bundle, found the version stored while last online, and
 *     reloaded itself mid-round — for nothing, because a reload offline cannot
 *     fetch a newer bundle. It only re-serves the same cached shell.
 * (b) It sat at module top level, before any try. With site data blocked or
 *     the quota full, the setItem threw, the whole module body aborted and the
 *     app never bootstrapped at all — in exactly the browser least able to
 *     recover by itself. Storage failure now means "skip the check", not "no
 *     app".
 *
 * @returns {boolean} True when a reload was triggered.
 */
export function checkAppVersion() {
    try {
        const recorded = localStorage.getItem('app_version');
        if (recorded === CURRENT_VERSION) return false;
        // Owner 2026-09-19: a build change must be visible. Leave a flag for
        // bootstrap to turn into an "Updated to …" toast (update-watch.js). A
        // first-ever run has nothing to announce.
        if (recorded) localStorage.setItem('app_version_announce', CURRENT_VERSION);
        localStorage.setItem('app_version', CURRENT_VERSION);
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        location.reload();
        return true;
    } catch (e) {
        console.warn("[Boot] version check skipped (storage unavailable):", e);
        return false;
    }
}

checkAppVersion();

// NOTE: a legacy block here unregistered every service worker and deleted all
// caches on boot — a pre-BL-OFF-01 cache-bust that silently defeated the
// offline shell (index.html registers /sw.js; this killed it next visit).
// sw.js owns its cache lifecycle now (activate() drops old cache names).

import { UI, setupTabs, switchTab } from './ui.js';
import { setupAuthUI } from './auth-v2.js';
import { listenToWHSRounds, addRound, bindStartingIndexButton, indexOnDate, fetchIndexHistory, calculatedIndexFor } from './whs.js';
import { initCompetitions } from './competitions.js';
import { initPractice } from './practice.js';
import { initOnCourse } from './oncourse.js';
import { bindBagSettings } from './bag-settings.js';
import { initInsights } from './modules/insights-render.js';
import { initVideos } from './videos.js';
import { initStrategy } from './strategy.js';
import { AppState, mutateList } from './state.js';
import { initSocialFeed } from './social.js';
import { COURSE_DATA, holesForPar, getStrokeIndex, isPlausibleRating } from './course-data.js';
import { localToday, isRoundDateInFuture } from './dates.js';
import { calculateDailyHandicap, calculateHoleStableford, convertStablefordToAGS } from './whs.js';

// New Sub-Modules
import { bindAdminTools, bindAdminInvite } from './admin.js';
import { bindAiGenerator } from './ai.js';
import { bindCoachTools, bindCoachDashboard } from './coach.js';
import { initTempo } from './tempo.js';
import { initializeAppRouting } from './persistence.js';
import { initWakeLock } from './wakelock.js';
import { announcePendingUpdate, startUpdateWatch, bindCheckForUpdates } from './update-watch.js';
import { initTermHints } from './term-hints.js';

import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "firebase/firestore";

function bootstrapApplication() {
    console.log("App Ready: Bootstrapping modules...");

    // BL-OFF-01: connectivity banner. Firestore queues writes offline and the
    // round lives in localStorage — this just tells the player that's happening.
    try {
        const banner = document.getElementById('offline-banner');
        const syncBanner = () => banner && banner.classList.toggle('hidden', navigator.onLine);
        window.addEventListener('online', syncBanner);
        window.addEventListener('offline', syncBanner);
        syncBanner();
    } catch (e) { console.error("[Bootstrap] offline banner failed:", e); }

    // 1. Restore state first (Critical for routing)
    try { initializeAppRouting(); } catch (e) { console.error("[Bootstrap] initializeAppRouting failed:", e); }
    try { initTermHints(); } catch (e) { console.error("[Bootstrap] term hints failed:", e); }

    // 2. Initialize all modules
    try { listenToWHSRounds(); } catch (e) { console.error("[Bootstrap] listenToWHSRounds failed:", e); }
    // Cards somebody marked for you, waiting to be signed. Best-effort: an
    // unreachable pending list must never stop the dashboard loading, and a
    // card that cannot be shown is simply still waiting next time.
    import('./pending-rounds.js')
        .then(m => m.renderPendingCards())
        .catch(e => console.warn("[Bootstrap] pending cards not rendered:", e));
    try { initCompetitions(); } catch (e) { console.error("[Bootstrap] initCompetitions failed:", e); }
    try { initPractice(); } catch (e) { console.error("[Bootstrap] initPractice failed:", e); }
    try { initOnCourse(); } catch (e) { console.error("[Bootstrap] initOnCourse failed:", e); }
    try { bindBagSettings(); } catch (e) { console.error("[Bootstrap] bag settings failed:", e); }
    try { initInsights(); } catch (e) { console.error("[Bootstrap] initInsights failed:", e); }
    try { initVideos(); } catch (e) { console.error("[Bootstrap] initVideos failed:", e); }
    try { initStrategy(); } catch (e) { console.error("[Bootstrap] initStrategy failed:", e); }

    try { bindWHSForm(); } catch (e) { console.error("[Bootstrap] bindWHSForm failed:", e); }
    // F-4: the Handicap Index field is editable and had no listener at all.
    try { bindStartingIndexButton(); } catch (e) { console.error("[Bootstrap] bindStartingIndexButton failed:", e); }
    try { bindCoachTools(); } catch (e) { console.error("[Bootstrap] bindCoachTools failed:", e); }
    try { bindCoachDashboard(); } catch (e) { console.error("[Bootstrap] bindCoachDashboard failed:", e); }
    try { bindAiGenerator(); } catch (e) { console.error("[Bootstrap] bindAiGenerator failed:", e); }
    try { populatePlayerSelect(); } catch (e) { console.error("[Bootstrap] populatePlayerSelect failed:", e); }
    try { initTempo(); } catch (e) { console.error("[Bootstrap] initTempo failed:", e); }
    try { initWakeLock(); } catch (e) { console.error("[Bootstrap] initWakeLock failed:", e); }
    // Owner 2026-09-19: say when a new build arrived, and watch for the next
    // one while the app is open (foreground / online / every 15 min).
    try { announcePendingUpdate(); } catch (e) { console.error("[Bootstrap] update announcement failed:", e); }
    // Owner 2026-09-20: and a Settings button for asking on demand.
    try { bindCheckForUpdates(startUpdateWatch()); } catch (e) { console.error("[Bootstrap] update watch failed:", e); }

    // Feed tab — init and refresh logic
    try {
        const feedBtn = document.getElementById('tab-btn-feed') || document.querySelector('[data-target="tab-feed"]');
        if (feedBtn) {
            let feedInited = false;
            feedBtn.addEventListener('click', () => {
                if (!feedInited) {
                    initSocialFeed();
                    feedInited = true;
                } else if (typeof window.refreshSocialFeed === 'function') {
                    window.refreshSocialFeed();
                }
            });
        }
    } catch (e) { console.error("[Bootstrap] social feed binding failed:", e); }

    // Final UI Setup - Bind Listeners after all logic is ready
    try { setupTabs(); } catch (e) { console.error("[Bootstrap] setupTabs failed:", e); }
}

// Kickoff Authentication Flow
setupAuthUI(bootstrapApplication);

// ==========================================
// WHS Manual Round Logging
// ==========================================
let roundSaveToastTimer = null;

function showRoundSaveToast(message) {
    const toast = document.getElementById('round-save-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    if (roundSaveToastTimer) clearTimeout(roundSaveToastTimer);
    roundSaveToastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

export function bindWHSForm() {
    let previousRoundEntryPlayerId = null;

    if (UI.addRoundForm) {
        const courseSelect = document.getElementById('course-select');
        const dateInput = document.getElementById('date');
        // Default to today and cap there, matching the on-course picker. Both
        // read the player's day, not the UTC one (F-7/F-8).
        if (dateInput) {
            if (!dateInput.value) dateInput.value = localToday();
            dateInput.max = localToday();
        }
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
                    selectedTeeData = COURSE_DATA[cName] && COURSE_DATA[cName][tName];
                    if (selectedTeeData) {
                        crInput.value = selectedTeeData.rating;
                        srInput.value = selectedTeeData.slope;
                        parInput.value = selectedTeeData.par || 72;
                        renderHoleGrid(selectedTeeData);
                    } else {
                        // Placeholder / cleared value (e.g. the post-save form reset) — clear derived fields.
                        crInput.value = "";
                        srInput.value = "";
                        parInput.value = "";
                        holeGrid.innerHTML = "";
                    }
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

        // Advanced-stat ceilings follow the round length: Insights divides
        // GIR and fairways by holesPlayed, so a nine with 18 greens read as
        // 200% (Codex P2 on #261). Fairways only exist on par 4s and 5s, so
        // a known tee counts them; a Custom course has no per-hole pars, so
        // its only safe ceiling is one fairway a hole.
        const statFwyInput = document.getElementById('stat-fwy');
        const statGirInput = document.getElementById('stat-gir');
        function statLimits() {
            const holes = holesForPar(parseFloat(parInput.value));
            let fwyMax = holes;
            if (courseSelect && courseSelect.value && courseSelect.value !== 'Custom') {
                const [cName, tName] = courseSelect.value.split('|');
                const tee = COURSE_DATA[cName] && COURSE_DATA[cName][tName];
                if (tee && Array.isArray(tee.pars) && tee.pars.length === holes) {
                    fwyMax = tee.pars.filter(p => Number(p) >= 4).length;
                }
            }
            return { holes, fwyMax, girMax: holes };
        }
        function syncStatLimits() {
            const { fwyMax, girMax } = statLimits();
            if (statFwyInput) statFwyInput.max = String(fwyMax);
            if (statGirInput) statGirInput.max = String(girMax);
        }
        if (parInput) parInput.addEventListener('input', syncStatLimits);
        if (courseSelect) courseSelect.addEventListener('change', syncStatLimits);

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
                // `[]` is truthy — this printed "Iundefined" on a tee with no
                // published stroke index (F-9).
                const gridSI = getStrokeIndex(teeData, teeData.pars.length);
                const indexVal = gridSI ? gridSI[i] : "-";

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

        // A backdated card is converted with the index in effect on the day
        // it was played, not today's. History loads once per form session.
        let formIndexHistory = null;
        let formIndexHistoryFor = null;
        // The index in use when the history was read: when it changes, an index
        // may have been published since, so the history is read again.
        let formIndexHistoryHI;
        // A lookup that failed (offline, nothing cached) is retried on the
        // next date change or when the connection returns, not cached as
        // "no history" for the rest of the session.
        let indexHistoryLookupFailed = false;
        // The connection can return while a read is still pending and the
        // read then fail: remember it, or that 'online' is lost.
        let indexHistoryPending = false;
        let reconnectedDuringLookup = false;
        // A new index was published while a read was in flight: read again.
        let historyChangedDuringLookup = false;
        let indexHistoryLookupSeq = 0;
        const indexNote = document.getElementById('log-round-index-note');
        const hasDatedIndex = (h) => Array.isArray(h) && h.some(e => e && Number.isFinite(parseFloat(e.index)));
        function retryIndexHistory() {
            if (indexHistoryLookupFailed) {
                indexHistoryLookupFailed = false;
                formIndexHistoryFor = null;
            } else if (!indexHistoryPending && Array.isArray(formIndexHistory) && !hasDatedIndex(formIndexHistory)) {
                // No dated index yet: one may have been published since the read.
                formIndexHistoryFor = null;
            }
            recalculateAGS();
        }
        function indexForCard() {
            const uid = AppState.currentUser?.uid;
            if (uid && formIndexHistoryFor === uid && !indexHistoryPending
                && String(AppState.handicapIndex) !== String(formIndexHistoryHI)) {
                formIndexHistoryFor = null; // the index changed: re-read the history
            }
            if (uid && formIndexHistoryFor !== uid) {
                formIndexHistoryFor = uid;
                formIndexHistoryHI = AppState.handicapIndex;
                formIndexHistory = null;
                indexHistoryLookupFailed = false;
                indexHistoryPending = true;
                reconnectedDuringLookup = false;
                historyChangedDuringLookup = false;
                const seq = ++indexHistoryLookupSeq;
                fetchIndexHistory(uid).then(h => {
                    if (seq !== indexHistoryLookupSeq || formIndexHistoryFor !== uid) return;
                    indexHistoryPending = false;
                    if (historyChangedDuringLookup) {
                        historyChangedDuringLookup = false;
                        indexHistoryLookupFailed = false;
                        formIndexHistoryFor = null;
                        recalculateAGS();
                        return;
                    }
                    if (h === null) {
                        indexHistoryLookupFailed = true;
                        if (reconnectedDuringLookup) {
                            reconnectedDuringLookup = false;
                            retryIndexHistory();
                            return;
                        }
                    } else formIndexHistory = h;
                    recalculateAGS();
                });
            }
            const dated = indexOnDate(formIndexHistory, dateInput ? dateInput.value : null, localToday());
            // No calculated index has ever been published (the history is empty):
            // the index in use is a declared GA starting index, which has no
            // dated history. Converting with it is what this form did before
            // dated lookups; refusing would close Stableford and hole-by-hole
            // entry to exactly the golfer backfilling cards from their GA record.
            const current = parseFloat(AppState.handicapIndex);
            // ...but not once the app has calculated an index (it may be newer
            // than the card; its history entry may not have been written yet).
            const noCalculatedHistory = dated === null && Array.isArray(formIndexHistory)
                && !hasDatedIndex(formIndexHistory) && calculatedIndexFor(uid) == null;
            const useCurrent = dated === undefined || (noCalculatedHistory && Number.isFinite(current));
            const hi = useCurrent ? current : dated;
            if (indexNote) {
                indexNote.textContent = dated === undefined ? ''
                    : useCurrent
                    ? `No dated index on record, so this card uses your current index: ${current.toFixed(1)}`
                    : (dated === null
                        ? (formIndexHistory === null
                            ? (indexHistoryLookupFailed
                                ? "Couldn't look up your index on that date (offline?). It retries when you reconnect; Manual AGS still saves."
                                : 'Looking up your index on that date…')
                            : 'No Handicap Index on record here for that date, so only Manual AGS can save this card.')
                        : `Using your index on that date: ${dated.toFixed(1)}`);
                indexNote.classList.toggle('hidden', !indexNote.textContent);
            }
            return hi === null ? NaN : hi;
        }
        if (dateInput) dateInput.addEventListener('change', retryIndexHistory);
        window.addEventListener('online', () => {
            if (indexHistoryLookupFailed) retryIndexHistory();
            else if (indexHistoryPending) reconnectedDuringLookup = true;
        });
        // whs.js just wrote a new indexHistory entry (an index was published):
        // the cached history is stale, whether or not the index on show changed.
        window.addEventListener('index-history-changed', () => {
            if (indexHistoryPending) { historyChangedDuringLookup = true; return; }
            formIndexHistoryFor = null;
            recalculateAGS();
        });

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

            const hi = indexForCard();
            // A par of 36-ish is a nine: GA halves the index, the stroke chart
            // wraps at 9, and the Stableford baseline is 18 points rather than
            // 36 (PRODUCT SWEEP 2026-09-10 F-1/F-2/F-6).
            const holes = holesForPar(par);
            // GA Daily Handicap incl. the 0.93 multiplier — single source in whs.js.
            const dailyHandicap = calculateDailyHandicap(hi, sr, parseFloat(crInput.value || 72), par, holes);
            // No established index means no Daily Handicap, and Stableford
            // can't be converted to an AGS without one (F-4). The Manual AGS
            // entry mode is the way in until the player declares an index.
            if (dailyHandicap === null) {
                scoreInput.value = "";
                if (estStablefordDisplay) estStablefordDisplay.textContent = '—';
                return;
            }

            let totalPts = 0;
            if (mode === 'hole-by-hole' && courseSelect.value !== "Custom" && courseSelect.value !== "") {
                const [cName, tName] = courseSelect.value.split('|');
                const teeData = COURSE_DATA[cName] && COURSE_DATA[cName][tName] ? COURSE_DATA[cName][tName] : null;
                // Not `if (teeData.strokeIndex)` — an empty one is truthy (F-9).
                const formSI = getStrokeIndex(teeData, holes);
                if (!teeData || !teeData.pars || !formSI) {
                    scoreInput.value = "";
                    if (estStablefordDisplay) estStablefordDisplay.textContent = '—';
                    return;
                }

                const inputs = document.querySelectorAll('.hole-score-input');
                inputs.forEach(inp => {
                    const gross = parseInt(inp.value);
                    if (!isNaN(gross) && gross > 0) {
                        const holeIdx = parseInt(inp.dataset.idx);
                        const holePar = teeData.pars[holeIdx];
                        const pts = calculateHoleStableford(gross, holePar, formSI[holeIdx], dailyHandicap, holes);
                        totalPts += pts;
                    }
                });
                estStablefordDisplay.textContent = totalPts;
            } else if (mode === 'total-stableford') {
                totalPts = parseInt(totalStablefordInput.value) || 0;
            }

            const calculatedAgs = convertStablefordToAGS(totalPts, dailyHandicap, par, holes);
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
            // Re-derive from the date now in the box: the AGS must come from
            // the index on the day played, even if the date was typed last.
            recalculateAGS();
            const score = parseInt(scoreInput.value);
            if (isNaN(score)) {
                // A converted mode with no AGS: the index note says why (still
                // looking up the index on that date, offline, or none on record).
                const why = document.querySelector('input[name="entry-mode"]:checked')?.value !== 'manual-ags'
                    && indexNote && !indexNote.classList.contains('hidden') ? indexNote.textContent : '';
                alert(why || "AGS Score calculation is missing.");
                return;
            }
            // The box's min="50" was 18-hole only, so it went; this floor is
            // the same guard, relative to the course. A typo (8 for 85) would
            // otherwise count as a -57 differential and collapse the index,
            // while a real 49 on Bulimba (CR 49, all par 3s) must still save.
            const scoreHoles = holesForPar(parseFloat(parInput.value));
            const ratingNow = parseFloat(crInput.value);
            const distanceFloor = scoreHoles === 9 ? 25 : 50;
            const scoreFloor = Number.isFinite(ratingNow)
                ? Math.max(1, Math.min(distanceFloor, Math.floor(ratingNow - 20)))
                : distanceFloor;
            if (score < scoreFloor) {
                alert(`An adjusted score under ${scoreFloor} isn't possible for ${scoreHoles} holes. Check the score.`);
                return;
            }

            // PRODUCT SWEEP 2026-09-10 F-8: the Date Played field is required
            // and was never read — every backfilled card was stamped with the
            // moment of entry. Same future-date rule as the on-course picker:
            // a future round poisons the record's chronology.
            const datePlayed = dateInput ? dateInput.value : null;
            if (isRoundDateInFuture(datePlayed)) {
                alert("Date played can't be in the future.");
                return;
            }

            const putts = parseInt(document.getElementById('stat-putts').value) || null;
            const fwy = parseInt(document.getElementById('stat-fwy').value) || null;
            const gir = parseInt(document.getElementById('stat-gir').value) || null;
            const stats = (putts || fwy || gir) ? { putts, fwy, gir } : null;
            // The box limits catch this in a browser; this catches a par
            // changed after the stats were typed (and keeps the rule testable).
            const { holes: statHoles, fwyMax, girMax } = statLimits();
            if ((fwy != null && fwy > fwyMax) || (gir != null && gir > girMax)) {
                alert(`For ${statHoles} holes: at most ${fwyMax} fairways and ${girMax} greens in regulation.`);
                return;
            }

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            // Record the distance, or calculateIndex cannot apply the WHS 5.1b
            // nine-to-eighteen scaling to a hand-entered nine (F-6).
            const holesPlayed = holesForPar(parseFloat(parInput.value));

            // The browser limits used to be 18-hole only (min="50"), so every
            // nine was refused. The check is now the nine-aware one On Course
            // uses; ratings that fail it still save, but never as counting.
            const ratingReason = isPlausibleRating(rating, slope, parseFloat(parInput.value))
                ? null
                : `Course rating / slope don't look right for a ${holesPlayed}-hole round`;
            const notCounting = !document.getElementById('is-counting').checked || !!ratingReason;

            const success = await addRound(course, rating, slope, score, stats, notCounting,
                { holesPlayed, datePlayed, notCountingReason: ratingReason });

            if (!success) {
                alert("Failed to log round. Ensure fields are filled.");
            } else {
                // F-9: the write is queued, not acknowledged. Offline that is
                // still a save — Firestore replays it on reconnect — but the
                // player is entitled to know which of the two happened.
                if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    alert("Round saved on this device. It will sync to your record when you're back online — don't enter it again.");
                }
                UI.addRoundForm.reset();
                courseSelect.dispatchEvent(new Event('change'));
                document.querySelector('input[value="hole-by-hole"]').click(); // Reset to default mode
                UI.addRoundContainer.classList.add('hidden'); // close the modal after a successful save
                previousRoundEntryPlayerId = null;
                showRoundSaveToast(ratingReason
                    ? `Round saved, but not counted: ${ratingReason}.`
                    : 'Round saved to your WHS record.');
            }

            btn.disabled = false;
            btn.textContent = 'Save Round to Profile';
        });
    }

    // BL-UX-18: open/close the "Log a past round" modal from the persistent
    // On Course affordance. Reset the WHS target because the Handicap player
    // selector may still be viewing a student or coach-managed account.
    const logRoundModal = document.getElementById('add-round-container');
    // A transformed tab container would trap position:fixed to the tab box
    // instead of the viewport. Portal the overlay to <body> so it centres correctly.
    if (logRoundModal && logRoundModal.parentElement !== document.body) {
        document.body.appendChild(logRoundModal);
    }
    const btnOpenLogRound = document.getElementById('btn-oc-log-past-round');
    const btnCloseLogRound = document.getElementById('btn-close-log-round');
    const closeLogRound = () => {
        logRoundModal.classList.add('hidden');
        if (previousRoundEntryPlayerId !== null && UI.playerSelect) {
            UI.playerSelect.value = previousRoundEntryPlayerId;
            UI.playerSelect.dispatchEvent(new Event('change'));
        }
        previousRoundEntryPlayerId = null;
    };
    if (btnOpenLogRound && logRoundModal) {
        btnOpenLogRound.addEventListener('click', () => {
            if (!AppState.currentUser?.uid) return;
            previousRoundEntryPlayerId = AppState.viewingPlayerId;
            if (UI.playerSelect) {
                UI.playerSelect.value = AppState.currentUser.uid;
                UI.playerSelect.dispatchEvent(new Event('change'));
            }
            logRoundModal.classList.remove('hidden');
        });
    }
    if (btnCloseLogRound && logRoundModal) {
        btnCloseLogRound.addEventListener('click', closeLogRound);
    }
    if (logRoundModal) {
        logRoundModal.addEventListener('click', (e) => {
            if (e.target === logRoundModal) closeLogRound(); // click backdrop to close
        });
    }

    if (UI.playerSelect) {
        UI.playerSelect.addEventListener('change', (e) => {
            const selectedUid = e.target.value;
            const playerChanged = AppState.viewingPlayerId !== selectedUid;
            AppState.viewingPlayerId = selectedUid;

            if (selectedUid === AppState.currentUser.uid) {
                UI.recordPlayerNameEl.textContent = "Your";
                UI.readonlyWarningContainer.classList.add('hidden');
            } else {
                UI.addRoundContainer.classList.add('hidden'); // close the modal if switching to a read-only view
                UI.recordPlayerNameEl.textContent = e.target.options[e.target.selectedIndex].text + "'s";
                UI.readonlyWarningContainer.classList.remove('hidden');
            }

            // The calculator used to be auto-clicked here. Its fields start
            // empty, so opening or closing "Log a past round" (both fire this
            // change) popped "Please fill in valid numbers" every time, and it
            // read the previous player's index anyway. When the player really
            // changes, hide the old result (it named the previous player);
            // Calculate recomputes on tap.
            if (playerChanged && UI.dailyHandicapResult) UI.dailyHandicapResult.classList.add('hidden');

            listenToWHSRounds(); // Re-trigger the WHSRounds snapshot listener for the new UID
        });
    }

    // BL-UX-12: first-run welcome CTA → the friendly On Course start flow.
    const btnWelcomeStart = document.getElementById('btn-whs-welcome-start');
    if (btnWelcomeStart) {
        btnWelcomeStart.addEventListener('click', () => switchTab('tab-oncourse'));
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
    mutateList('profileUsersMap', map => { map[AppState.currentUser.uid] = optSelf.textContent; });

    // BL-UX-16: the playerSelect change handler fills the "WHS Scoring Record
    // (<name>)" span, but it never fires on initial load — the default view is
    // self — so the heading rendered as "WHS Scoring Record ()". Seed it here to
    // match the handler's self branch.
    if (UI.recordPlayerNameEl) UI.recordPlayerNameEl.textContent = "Your";

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
                    mutateList('profileUsersMap', map => { map[d.id] = opt.textContent; });
                }
            });
        } catch (e) { console.error("Error fetching player list: ", e); }
    }

    if (UI.ocPlayerSelect) {
        UI.ocPlayerSelect.innerHTML = UI.playerSelect.innerHTML;
        // Owner 2026-09-20 ("how do I pick them as guests for a second
        // round?"): the guests you own are players too. Typing the name again
        // minted a NEW guest and split their rounds; picking them here keeps
        // one record per brother. On-course select only — the WHS record
        // select is a different view.
        try {
            const { listGuests } = await import('./guests.js');
            const guests = await listGuests();
            if (guests.length) {
                const group = document.createElement('optgroup');
                group.label = 'Your guests';
                group.id = 'oc-player-guests';
                group.dataset.guests = '1';
                for (const g of guests.sort((a, b) => a.name.localeCompare(b.name))) {
                    const opt = document.createElement('option');
                    opt.value = g.uid;
                    opt.textContent = `${g.name} (guest)`;
                    // Owner 2026-09-20: their remembered daily handicap rides
                    // on the option so picking them prefills the Daily HC box.
                    if (Number.isFinite(g.dailyHandicap)) opt.dataset.hc = String(g.dailyHandicap);
                    group.appendChild(opt);
                    mutateList('profileUsersMap', map => { map[g.uid] = g.name; });
                }
                UI.ocPlayerSelect.appendChild(group);
            }
        } catch (e) { console.warn('[Guests] list not shown:', e); }
        // Owner 2026-10-05: the Play again card waits for this list, so it
        // can show (and start with) the same players and saved guests.
        UI.ocPlayerSelect.dataset.ready = '1';
        document.dispatchEvent(new CustomEvent('oc-players-ready'));
    }
}
