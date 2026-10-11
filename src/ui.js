// ==========================================
// Centralized DOM Element Caching & UI Helpers
// ==========================================
import { AppState, mutateList, normalizePracticePlan } from './state.js';
import Chart from 'chart.js/auto';
import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, getDoc, setDoc, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, functions } from './firebase-config.js';
import { escapeHtml } from './escape.js';
import { aiErrorMessage } from './ai-errors.js';
import { roundDifferential } from './differential.js';
import { formatHandicap, grossDifferentialDecimal, roundHandicap } from './handicap-decimal.js';
import { coldStartPreview } from './cold-start.js';
import { isCountingRound, appExcludedReason } from './round-validity.js';

// Tempo is folded into Practice (BL-UX-19 S5) — no longer a standalone screen.
const ALL_SCREENS = ['tab-whs', 'tab-comp', 'tab-practice', 'tab-oncourse', 'tab-feed', 'tab-coach', 'tab-admin', 'tab-settings'];

export const UI = {
    // Core App
    authOverlay: document.getElementById('auth-overlay'),
    mainApp: document.getElementById('main-app'),
    loggedInUserNameEl: document.getElementById('logged-in-user-name'),
    btnLogout: document.getElementById('btn-logout'),

    // Auth Forms
    authForm: document.getElementById('auth-form'),
    authError: document.getElementById('auth-error'),
    registerFields: document.getElementById('register-fields'),
    btnLogin: document.getElementById('btn-login'),
    btnRegister: document.getElementById('btn-register'),
    authSwitchBack: document.getElementById('auth-switch-back'),
    linkBackLogin: document.getElementById('link-back-login'),

    // Admin & Sandbox
    authPending: document.getElementById('auth-pending'),
    btnPendingLogout: document.getElementById('btn-pending-logout'),
    tabBtnAdmin: document.getElementById('tab-btn-admin'),
    adminUsersList: document.getElementById('admin-users-list'),
    adminPreapproveForm: document.getElementById('admin-preapprove-form'),
    adminNewEmail: document.getElementById('admin-new-email'),
    adminEmailsList: document.getElementById('admin-emails-list'),

    // Tabs
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),

    // WHS Setup
    playerSelect: document.getElementById('player-select'),
    recordPlayerNameEl: document.getElementById('record-player-name'),
    addRoundContainer: document.getElementById('add-round-container'),
    readonlyWarningContainer: document.getElementById('readonly-warning-container'),
    addRoundForm: document.getElementById('add-round-form'),
    historyTbody: document.getElementById('history-tbody'),
    emptyState: document.getElementById('empty-state'),
    loadingState: document.getElementById('loading-state'),
    handicapIndexEl: document.getElementById('handicap-index'),
    indexSubtextEl: document.getElementById('index-subtext'),

    // Competitions
    btnCreateCompContainer: document.getElementById('btn-show-create-comp'),
    createCompContainer: document.getElementById('create-comp-container'),
    createCompForm: document.getElementById('create-comp-form'),
    btnCancelComp: document.getElementById('btn-cancel-comp'),
    compSelect: document.getElementById('comp-select'),
    logCompRoundContainer: document.getElementById('log-comp-round-form') ? document.getElementById('log-comp-round-form').closest('.card') : null,
    logCompRoundForm: document.getElementById('log-comp-round-form'),
    compRecentRoundsTbody: document.getElementById('comp-recent-rounds-tbody'),
    compLeaderboardHead: document.getElementById('comp-leaderboard-head'),
    compLeaderboardTbody: document.getElementById('comp-leaderboard-tbody'),
    compRulesDesc: document.getElementById('active-comp-rules-summary'),
    compRegularsList: document.getElementById('comp-regulars-list'),
    btnOcQuickAdd: document.getElementById('btn-oc-quick-add'),

    // Practice Module
    tabBtnPractice: document.querySelector('[data-target="tab-practice"]'),
    practiceSelect: document.getElementById('drill-select'),
    insightsDrillSelect: document.getElementById('insights-drill-select'),
    btnLogPracticeContainer: document.getElementById('practice-form-container'),
    logPracticeContainer: document.getElementById('practice-form-container'),
    logPracticeForm: document.getElementById('form-log-practice'),
    btnSavePractice: document.getElementById('btn-save-practice'),
    btnEmailCoach: document.getElementById('btn-email-coach'),
    btnExportPractice: document.getElementById('btn-export-practice'),
    drillLiveTotalEl: document.getElementById('drill-live-total'),
    practiceDashboardResults: document.getElementById('practice-best-score') ? document.getElementById('practice-best-score').parentElement.parentElement : null,
    practiceRecentTbody: document.getElementById('practice-history-tbody'),

    // On-Course Tracker
    btnModeSimple: document.getElementById('btn-mode-simple'),
    btnModeDetailed: document.getElementById('btn-mode-detailed'),
    ocModeDesc: document.getElementById('oc-mode-desc'),
    btnRound9: document.getElementById('btn-round-9'),
    btnRound18: document.getElementById('btn-round-18'),
    ocCourseSelect: document.getElementById('oc-course-select'),
    ocTeeSelect: document.getElementById('oc-tee-select'),
    ocPlayerSelect: document.getElementById('oc-player-select'),
    btnOcAddPlayer: document.getElementById('btn-oc-add-player'),
    ocAddedPlayersList: document.getElementById('oc-players-list'),
    ocLinkComp: document.getElementById('oc-link-comp'),
    btnOcStart: document.getElementById('btn-oc-start'),

    // Sequential Shots & Review
    btnWizardDelete: document.getElementById('btn-wizard-delete'),
    btnOcReviewRound: document.getElementById('btn-oc-review-round'),
    reviewRoundModal: document.getElementById('review-round-modal'),
    ocFinishModal: document.getElementById('oc-finish-modal'),
    btnOcSaveWhs: document.getElementById('btn-oc-save-whs'),
    btnOcFinish: document.getElementById('btn-oc-finish'),

    // Tempo Vibes
    tempoPlayBtn: document.getElementById('tempo-play-btn'),
    tempoResetCounter: document.getElementById('tempo-reset-counter'),
    tempoSwingCounter: document.getElementById('tempo-swing-counter'),
    tempoSwingState: document.getElementById('tempo-swing-state'),
    tempoCoreCircle: document.getElementById('tempo-core-circle'),
    tempoRing: document.getElementById('tempo-ring'),
    tempoSelect: document.getElementById('tempo-select'),
    tempoVibeSelect: document.getElementById('tempo-vibe-select'),
    tempoSpeedSlider: document.getElementById('tempo-speed-slider'),
    tempoSpeedDisplay: document.getElementById('tempo-speed-display'),
    tempoDelaySlider: document.getElementById('tempo-delay-slider'),
    tempoDelayDisplay: document.getElementById('tempo-delay-display'),
    tempoLoopToggle: document.getElementById('tempo-loop-toggle'),
    tempoDelayContainer: document.getElementById('tempo-delay-container'),
    nativeAudioPlayer: document.getElementById('native-audio-player'),

    // Feed
    reviewContent: document.getElementById('review-content'),
    btnCloseReview: document.getElementById('btn-close-review'),
    btnReviewFinished: document.getElementById('btn-review-finished'),

    // Modals (Other)
    aiModalOverlay: document.getElementById('ai-modal-overlay'),
    aiModalTitle: document.getElementById('ai-modal-title'),
    btnCloseAiModal: document.getElementById('btn-close-ai-modal'),

    // My Bag and Overhauled Wizard
    bagChecks: document.querySelectorAll('.bag-check'),
    bagButtonsGrid: document.getElementById('bag-buttons-grid'),
    btnSaveShotFinal: document.getElementById('btn-save-shot-final'),
    btnWizardPenalty: document.getElementById('btn-wizard-penalty'),
    penaltyModal: document.getElementById('penalty-modal'),

    // Round Review Summary
    sumTotalShots: document.getElementById('sum-total-shots'),
    sumTotalPoints: document.getElementById('sum-total-points'),
    sumTotalPutts: document.getElementById('sum-total-putts'),
    sumTotalFir: document.getElementById('sum-total-fir'),
    sumTotalGir: document.getElementById('sum-total-gir'),
    sumTotalPen: document.getElementById('sum-total-pen'),
    btnOcEditReview: document.getElementById('btn-oc-edit-review'),

    // Detailed Review & Hole Editor
    ocDetailedReviewModal: document.getElementById('oc-detailed-review-modal'),
    ocDetailedTbody: document.getElementById('oc-detailed-tbody'),
    ocHoleEditorModal: document.getElementById('oc-hole-editor-modal'),
    editorScoreVal: document.getElementById('editor-score-val'),
    editorPuttsVal: document.getElementById('editor-putts-val'),
    editorPenVal: document.getElementById('editor-pen-val'),
    btnEditorSave: document.getElementById('btn-editor-save'),
    btnEditorCancel: document.getElementById('btn-editor-cancel'),

    // Phase 5: GPS & Voice
    btnToggleGps: document.getElementById('btn-toggle-gps'),
    ocGpsWidget: document.getElementById('oc-gps-widget'),
    gpsFront: document.getElementById('gps-front'),
    gpsMiddle: document.getElementById('gps-middle'),
    gpsBack: document.getElementById('gps-back'),
    btnVoiceRules: document.getElementById('btn-voice-rules'),
    voiceOverlay: document.getElementById('voice-overlay'),
    voiceStatus: document.getElementById('voice-status'),
    voiceTranscript: document.getElementById('voice-transcript'),
    btnCancelVoice: document.getElementById('btn-cancel-voice'),
    rulesResponseCard: document.getElementById('rules-response-card'),
    rulesResponseContent: document.getElementById('rules-response-content'),
    btnCloseRulesCard: document.getElementById('btn-close-rules-card'),

};

/**
 * Injects the application version from the meta tag into all matching displays.
 */
export function injectVersionFromMeta() {
    const appMeta = document.querySelector('meta[name="application-version"]');
    // Owner feedback 2026-07-05: the hand-maintained meta version went stale
    // for weeks and made current builds look old. Prefer the build-time stamp
    // (vite define: version + build moment + commit); the meta is fallback.
    const rawVersion = appMeta ? appMeta.getAttribute('content') : 'vUnknown';
    const version = typeof __APP_VERSION__ !== 'undefined'
        ? __APP_VERSION__
        : rawVersion.split(' - ')[0].trim();
    const buildInfo = (typeof __BUILD_STAMP__ !== 'undefined' && typeof __BUILD_COMMIT__ !== 'undefined')
        ? ` · built ${__BUILD_STAMP__} · ${__BUILD_COMMIT__}`
        : '';

    document.querySelectorAll('.version-display').forEach(el => {
        el.textContent = version;
    });

    // Header keeps it short; the footer carries the full build stamp so a
    // "am I on the latest?" check is one glance.
    const footerVer = document.getElementById('footer-version');
    const headerVer = document.getElementById('header-version');
    if (footerVer) footerVer.textContent = `${version}${buildInfo}`;
    if (headerVer) headerVer.textContent = version;

    console.log(`[UI] Version: ${version}${buildInfo}`);
}

// ==========================================
// TABS & NAVIGATION HELPER
// ==========================================
const DEFAULT_TAB_KEY = 'golfAppDefaultTab';

/**
 * Ensures all mapped tab screens exist in the DOM.
 * @returns {void}
 */
export function ensureScreensExist() {
    ALL_SCREENS.forEach(id => {
        if (!document.getElementById(id)) {
            console.warn(`[Navigation] Missing screen element: #${id}`);
        }
    });
}

/**
 * Switches the active application tab and scrolls to the top.
 * @param {string} targetId - The ID of the tab content to show.
 * @returns {void}
 */
export function switchTab(targetId) {
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) {
        console.error(`[Navigation] Target screen not found: #${targetId}`);
        return;
    }

    // Persist as default
    localStorage.setItem(DEFAULT_TAB_KEY, targetId);

    console.log(`[Navigation] switching to: ${targetId}`);

    // State-driven UI update, then reset scroll — scrolling before the swap let
    // the browser re-anchor to the old tab's offset, so deep-scrolled tabs
    // opened the next tab mid-page.
    AppState.activeTab = targetId;
    window.scrollTo(0, 0);
}

/**
 * Initializes navigation event listeners and sets the initial tab.
 * @returns {void}
 */
export function initNavigation() {
    ensureScreensExist();
    console.log("[Navigation] Initializing Clean Slate Architecture...");

    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(btn => {
        // Task 3: Strict Direct Binding (No Clone Purge)
        btn.addEventListener('click', (e) => {
            const target = btn.getAttribute('data-target');
            if (target) {
                switchTab(target);
            }
        });
    });

    // Determine and set initial tab
    let initialTab = 'tab-oncourse';
    if (AppState.activeRoundId) {
        initialTab = 'tab-oncourse';
    } else {
        const savedTabId = localStorage.getItem(DEFAULT_TAB_KEY);
        initialTab = savedTabId || 'tab-oncourse';
    }

    switchTab(initialTab);
}

/**
 * Setup tabs and version injection. Wrapper for initNavigation.
 * @returns {void}
 */
export function setupTabs() {
    // Deprecated in favor of initNavigation for Phase 8.6
    // But we keep it as a wrapper to avoid breaking bootstrapApplication
    initNavigation();

    // Dynamic Version Injection (Single-Source)
    try {
        injectVersionFromMeta();
    } catch (e) {
        console.error("[UI] Version injection failed:", e);
    }
}

/**
 * Renders the WHS round history table.
 * @param {Array} rounds - Array of round objects.
 * @param {Array} usedIds - Array of IDs for rounds contributing to the index.
 * @returns {void}
 */
export function renderRoundsHistory(rounds = AppState.currentRounds, usedIds = []) {
    if (!UI.historyTbody) return;
    UI.historyTbody.innerHTML = '';
    const uidMatches = AppState.currentUser && AppState.viewingPlayerId === AppState.currentUser.uid;
    const isAdmin = window.currentUserIsAdmin || false;

    // "WHS Scoring Record (<name>)" — otherwise the heading renders as
    // "WHS Scoring Record ()". PRODUCT SWEEP 2026-09-10 F-5: this lived in a
    // second, dead copy of this function in whs.js, so the span was only ever
    // filled by the player-selector handlers and reverted to empty on every
    // re-render from a data change.
    if (UI.recordPlayerNameEl && AppState.currentUser) {
        UI.recordPlayerNameEl.textContent = uidMatches
            ? (AppState.currentUser.displayName || AppState.currentUser.email || 'You')
            : (AppState.profileUsersMap[AppState.viewingPlayerId] || 'Player');
    }

    // Event delegation, bound once on the persistent tbody so re-renders don't
    // stack handlers. PRODUCT SWEEP 2026-09-10 F-5: this too was in the dead
    // whs.js copy, so the Exclude/Include and Delete buttons this function
    // emits below had no handler at all — a user could not remove or exclude a
    // bad round by any route in the UI. The globals come from whs.js, which is
    // imported for its side effects at boot.
    if (!UI.historyTbody.dataset.rowActionsBound) {
        UI.historyTbody.dataset.rowActionsBound = '1';
        UI.historyTbody.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('.toggle-count-btn');
            if (toggleBtn) return window.toggleCountingRules(toggleBtn.dataset.id);
            const delBtn = e.target.closest('.del-round-btn');
            if (delBtn) return window.deleteWhsRound(delBtn.dataset.id);
        });
        // One ⋯ open at a time: an open menu covers its row's Score and Diff.
        UI.historyTbody.addEventListener('toggle', (e) => {
            if (!e.target.matches?.('details.round-actions') || !e.target.open) return;
            UI.historyTbody.querySelectorAll('details.round-actions[open]').forEach(d => {
                if (d !== e.target) d.open = false;
            });
        }, true);
    }

    // BL-UX-12/21: first-run welcome — only on the user's OWN empty dashboard
    // (never when a coach is viewing an athlete with no rounds).
    const welcome = document.getElementById('whs-welcome');
    if (welcome) welcome.classList.toggle('hidden', !(uidMatches && rounds.length === 0));

    if (rounds.length === 0) {
        if (UI.emptyState) UI.emptyState.classList.remove('hidden');
    } else {
        if (UI.emptyState) UI.emptyState.classList.add('hidden');
        rounds.forEach(round => {
            const tr = document.createElement('tr');

            // Faded and struck through cell by cell, not on the row: the ⋯
            // menu lives in the row and must stay opaque and readable.
            if (round.notCounting) tr.classList.add('round-not-counting');

            // F-6: the Differential column and the index have to be the same
            // number — the asterisk on this row means "used in your index".
            const difNum = roundDifferential(round, AppState.handicapIndex);
            const dif = difNum === null ? '--' : formatHandicap(difNum);
            let diffSpan = `<span>${dif}</span>`;
            if (usedIds.includes(round.id)) {
                diffSpan = `<span class="asterisk-highlight">${dif} *</span>`;
            }

            let dateObj = round.date;
            if (dateObj && dateObj.toDate) {
                dateObj = dateObj.toDate();
            } else if (typeof dateObj === 'string') {
                dateObj = new Date(dateObj);
            }
            const dateStr = dateObj ? dateObj.toLocaleDateString() : 'Unknown';

            // No "Include" for a round the app kept out for a reason.
            const excludedWhy = round.notCounting ? appExcludedReason(round) : null;
            // A coach gets View Only: Exclude/Include, like Delete, is for the
            // owner or an admin (the write is refused for anyone else).
            const canEdit = !!(uidMatches || isAdmin);
            // The "can't count" reason is for everyone, coaches included.
            const hasActions = canEdit || !!round.audioUrl || !!(round.notCounting && excludedWhy);

            // Four columns the header names (Date · Course · Score · Diff) plus
            // one ⋯ for the row's actions. The old row drew 6 cells under an
            // 8-column header, and the phone rule hid the Diff cell.
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${escapeHtml(round.course)}</td>
                <td><strong>${escapeHtml(round.adjustedGross)}</strong>${round.notCounting ? ' <span class="round-excluded-tag">excluded</span>' : ''}</td>
                <td>${diffSpan}</td>
                <td class="col-action">${hasActions ? `
                  <details class="round-actions">
                    <summary aria-label="Round actions">⋯</summary>
                    <div class="round-actions-menu">
                    ${round.audioUrl ? `
                        <button class="btn btn-secondary btn-sm play-audio-btn"
                                data-url="${round.audioUrl}"
                                title="Listen to Audio Diary">
                            🔊
                        </button>
                        <button class="btn btn-secondary btn-sm briefing-btn"
                                data-id="${round.id}"
                                data-url="${round.audioUrl}"
                                title="AI Caddy Briefing">
                            💡
                        </button>
                    ` : ''}
                    ${(round.notCounting && excludedWhy)
                        ? `<span class="round-excluded-why">Can't count: ${escapeHtml(excludedWhy)}</span>`
                        : !canEdit ? '' : `<button class="btn btn-secondary btn-sm toggle-count-btn" data-id="${round.id}" title="Toggle Counting Rules">
                        ${round.notCounting ? 'Include' : 'Exclude'}
                    </button>`}
                    ${canEdit ? `<button class="btn btn-danger btn-sm del-round-btn" aria-label="Delete Round" data-id="${round.id}">Delete</button>` : ''}
                    </div>
                  </details>` : ''}
                </td>
            `;

            // v6.15.0: Bind playback button
            const playBtn = tr.querySelector('.play-audio-btn');
            if (playBtn) {
                playBtn.addEventListener('click', () => {
                    const originalText = playBtn.textContent.trim();
                    playBtn.textContent = '⏳';
                    playHistoricalAudio(round.audioUrl)
                        .then(() => playBtn.textContent = originalText)
                        .catch(() => playBtn.textContent = '⚠️');
                });
            }

            // v6.17.0: Bind Briefing button
            const briefingBtn = tr.querySelector('.briefing-btn');
            if (briefingBtn) {
                briefingBtn.addEventListener('click', () => {
                    showAiBriefing(round, briefingBtn, tr);
                });
            }
            if (UI.historyTbody) UI.historyTbody.appendChild(tr);
        });
    }
}

/**
 * Playback Engine for Historical Audio.
 * Fetches and plays an audio file from a URL.
 * @param {string} url - URL of the audio file to play.
 * @returns {Promise<void>}
 */
export async function playHistoricalAudio(url) {
    if (!url) return;
    try {
        const audio = new Audio(url);
        // Returns a promise that resolves when the audio starts playing
        await audio.play();
    } catch (err) {
        console.error("[Audio] Historical playback failed:", err);
        alert("Audio Diary could not be loaded. This might be due to a poor network connection or a deleted file.");
        throw err;
    }
}

/**
 * v6.17.8: AI Briefing Logic — Quota Protection & Persistence
 * - Checks local round object first (in-memory cache)
 * - Saves to Firestore after first generation
 * - Shows a toast when a fresh summary is saved
 */
/**
 * AI Briefing Logic — Quota Protection & Persistence.
 * Checks local round object first, then generates and saves to Firestore.
 * @param {Object} round - The round object to brief.
 * @param {HTMLElement} btn - The button element that triggered the briefing.
 * @param {HTMLElement} roundRow - The table row containing the round.
 * @returns {Promise<void>}
 */
export async function showAiBriefing(round, btn, roundRow) {
    const originalText = btn.textContent.trim();

    // Toggle: if drawer already open, close it
    const nextRow = roundRow.nextElementSibling;
    if (nextRow && nextRow.classList.contains('briefing-drawer')) {
        nextRow.remove();
        return;
    }

    try {
        let aiSummary = round.aiSummary;
        let isCached = !!aiSummary;

        if (!aiSummary) {
            btn.disabled = true;
            btn.textContent = '⏳';
            const generateAudioBriefing = httpsCallable(functions, 'generateAudioBriefing');
            const result = await generateAudioBriefing({ audioUrl: round.audioUrl });
            aiSummary = result.data;

            // Persist to Firestore
            if (round.id) {
                const roundRef = doc(db, "whs_rounds", round.id);
                await updateDoc(roundRef, { aiSummary: aiSummary });
            }

            // Mutate in-memory so repeat clicks skip the API entirely this session
            round.aiSummary = aiSummary;

            // Success toast
            showBriefingToast('💾 Briefing saved to history!');
        }

        // Build the bullet list HTML
        const bulletHtml = (aiSummary.writtenSummary || '')
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => `<li style="margin-bottom:6px;">${escapeHtml(line.replace(/^[*\-•]\s+/, ''))}</li>`)
            .join('');

        const cachedBadge = isCached
            ? `<span style="font-size:0.75rem; color: var(--text-muted); margin-left:8px;">⚡ Loaded from cache</span>`
            : `<span style="font-size:0.75rem; color: #22c55e; margin-left:8px;">✨ Just generated</span>`;

        // Build the Drawer Row
        const drawerRow = document.createElement('tr');
        drawerRow.className = 'briefing-drawer';

        drawerRow.innerHTML = `
            <td colspan="100%" style="padding: 20px; border-left: 4px solid var(--accent-light); background: #f8fafc;">
                <div style="max-width: 600px; margin: 0 auto;">
                    <div style="display:flex; align-items:center; margin-bottom:12px;">
                        <h4 style="margin:0; color: var(--accent-dark);">💡 AI Caddy Briefing</h4>
                        ${cachedBadge}
                    </div>
                    <ul style="padding-left: 20px; margin-bottom: 20px; line-height: 1.6;">
                        ${bulletHtml}
                    </ul>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <button class="btn btn-secondary btn-sm close-briefing-btn">✖️ Close Briefing</button>
                        ${aiSummary.verbalBriefing ? `<button class="btn btn-secondary btn-sm replay-btn">🔊 Replay Audio</button>` : ''}
                    </div>
                </div>
            </td>
        `;

        roundRow.after(drawerRow);

        // Bind close
        drawerRow.querySelector('.close-briefing-btn').onclick = () => {
            window.speechSynthesis?.cancel();
            drawerRow.remove();
        };

        // Bind optional replay button
        const replayBtn = drawerRow.querySelector('.replay-btn');
        if (replayBtn && aiSummary.verbalBriefing) {
            replayBtn.addEventListener('click', () => speakBriefing(aiSummary.verbalBriefing));
        }

        // Auto-speak the verbal briefing
        if (aiSummary.verbalBriefing) {
            speakBriefing(aiSummary.verbalBriefing);
        }

    } catch (err) {
        console.error("[AI Briefing] Error:", err);
        alert(aiErrorMessage(err, "Could not generate AI briefing. Ensure your internet is connected."));
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

/**
 * Brief toast notification for feedback.
 * @param {string} message - The message to display.
 * @returns {void}
 */
export function showBriefingToast(message) {
    const toast = document.createElement('div');
    toast.className = 'app-toast'; // taps pass through (style.css)
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: #1e293b; color: #fff; padding: 10px 20px; border-radius: 8px;
        font-size: 0.9rem; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: fadeInUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * The Narrator: Uses Web Speech API to read text aloud.
 * @param {string} text - The text to speak.
 * @returns {void}
 */
export function speakBriefing(text) {
    if (!window.speechSynthesis) return;

    // Cancel any existing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Try to find an Australian voice for that local caddy feel
    const voices = window.speechSynthesis.getVoices();
    const auVoice = voices.find(v => v.lang === 'en-AU' || v.lang.includes('AU'));
    if (auVoice) utterance.voice = auVoice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
}

/**
 * Renders the live round players list for On-Course mode.
 * @param {Array} groups - Array of player group objects.
 * @returns {void}
 */
export function renderOcPlayersList(groups = AppState.liveRoundGroups) {
    if (!UI.ocAddedPlayersList) return;
    UI.ocAddedPlayersList.innerHTML = '';

    if (groups.length === 0) {
        UI.ocAddedPlayersList.innerHTML = '<li style="color:var(--text-muted); padding:10px;">No players added yet</li>';
        return;
    }

    groups.forEach((p, index) => {
        const li = document.createElement('li');
        li.style.cssText = `
            background: white; padding: 12px 15px; border-radius: 8px; margin-bottom: 8px;
            display: flex; justify-content: space-between; align-items: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        `;
        // Owner 2026-09-20: a Daily HC box per player. A guest has no profile
        // index, so without this their card scores gross only. Blank keeps
        // the automatic value (profile index → daily handicap at Start Round).
        const hc = Number.isFinite(p.dailyHandicapOverride) ? String(p.dailyHandicapOverride) : '';
        li.innerHTML = `
            <div style="display:flex; flex-direction:column; min-width:0;">
                <span style="font-weight:600; color:var(--text-dark);">${escapeHtml(p.name)}${p.isGuest ? ' <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">(guest)</span>' : ''}</span>
                <span style="font-size:0.75rem; color:var(--text-muted);">ID: ${escapeHtml(p.uid.substring(0, 8))}...</span>
            </div>
            <label class="oc-player-hc" style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:var(--text-muted); margin:0 8px;">Daily HC
                <input type="number" inputmode="decimal" step="0.1" min="-10" max="54" class="player-hc-input" data-uid="${escapeHtml(p.uid)}" value="${hc}" placeholder="auto" aria-label="Daily handicap for ${escapeHtml(p.name)}" style="width:64px; min-height:44px; padding:6px 8px; border:1px solid var(--border-color); border-radius:6px; font-size:1rem;">
            </label>
            <button class="btn btn-danger btn-sm remove-player-btn" data-uid="${escapeHtml(p.uid)}">Remove</button>
        `;
        UI.ocAddedPlayersList.appendChild(li);

        // The box writes straight onto this player's group entry via
        // mutateList (D-03: reference change, so persistence sees it).
        li.querySelector('.player-hc-input').addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            mutateList('liveRoundGroups', list => {
                const target = list.find(x => x.uid === p.uid);
                if (target) target.dailyHandicapOverride = Number.isFinite(v) ? v : null;
            });
            // Owner 2026-09-20: remember it ON the guest, so the next round
            // prefills. Fire-and-forget (F-11): a slow write must never hold
            // up the setup screen, and the round works either way.
            if (p.uid.startsWith('guest_')) {
                import('./guests.js')
                    .then(m => m.setGuestHandicap(p.uid, Number.isFinite(v) ? v : null))
                    .catch(err => console.warn('[Guests] handicap not remembered:', err));
            }
        });

        // Bind remove button
        li.querySelector('.remove-player-btn').addEventListener('click', () => {
            // Owner decision 2026-09-20: removing YOURSELF is the one way to
            // start a round you are not in (bindStartRound adds you otherwise).
            if (p.uid === AppState.currentUser?.uid) AppState.roundSelfOptOut = true;
            mutateList('liveRoundGroups', list => list.splice(index, 1));
        });
    });

    if (groups.length > 0 && UI.ocAddedPlayersList) {
        setTimeout(() => {
            UI.ocAddedPlayersList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }
}

let _trendChart = null;
/**
 * Renders the handicap trend chart using Chart.js.
 * @param {Array} rounds - Array of round objects.
 * @returns {void}
 */
export function renderTrendChart(rounds = AppState.currentRounds) {
    const canvas = document.getElementById('handicap-chart');
    const noData = document.getElementById('chart-no-data');
    if (!canvas) return;

    const counting = (rounds || [])
        .filter(isCountingRound)
        .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const db_ = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return da - db_;
        });

    if (counting.length < 3) {
        canvas.style.display = 'none';
        if (noData) {
            noData.innerHTML = coldStartPreview(counting, 'trend');
            noData.classList.remove('hidden');
        }
        return;
    }
    canvas.style.display = '';
    if (noData) noData.classList.add('hidden');

    const labels = counting.map(r => {
        const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
        return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    });
    const diffs = counting.map(r => roundHandicap(grossDifferentialDecimal(r)));

    if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

    _trendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Differential',
                data: diffs,
                borderColor: '#3867d6',
                backgroundColor: 'rgba(56,103,214,0.08)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3867d6',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` Differential: ${ctx.parsed.y}`
                    }
                },
            },
            scales: {
                y: {
                    reverse: false,
                    title: { display: true, text: 'Differential (lower = better)' },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

// ==========================================
// GLOBAL STATE LISTENER
// ==========================================

window.addEventListener('stateChange', (e) => {
    const { property, newValue } = e.detail;

    switch (property) {
        case 'currentRounds':
            renderRoundsHistory(newValue, AppState.usedIds);
            renderTrendChart(newValue);
            break;
        case 'handicapIndex':
            if (UI.handicapIndexEl) {
                // A negative index is a legitimate plus handicap — don't clamp it to 0.0.
                const hiNum = parseFloat(newValue);
                const established = newValue != null && Number.isFinite(hiNum);
                // PRODUCT SWEEP 2026-09-10 F-4: an unestablished index used to
                // render as 0.0, which reads as "scratch golfer" — the one
                // number this app exists to produce, shown wrong to every new
                // user. A dash says "we don't know yet". The index is text now
                // (no stray-thumb edits); "Set starting index" is the way in.
                UI.handicapIndexEl.textContent = established ? formatHandicap(hiNum) : '—';
                if (UI.indexSubtextEl) {
                    UI.indexSubtextEl.textContent = established
                        ? 'Your published Handicap Index'
                        // One line at 375px: two lines plus the Set starting
                        // index button pushed the banner past a third of an
                        // SE screen. The button already says how to set one.
                        : 'Not established yet — keep logging rounds';
                }
            }
            break;
        case 'usedIds':
            // Re-render history if we know which ones are used
            renderRoundsHistory(AppState.currentRounds, newValue);
            break;
        case 'liveRoundGroups':
            renderOcPlayersList(newValue);
            // If we're already in a round, we might need to refresh the current hole view
            // but that's handled by loadHole in oncourse.js (which we might also want to decouple)
            break;
        case 'activeTab':
            document.body.dataset.activeTab = newValue;
            // Mirror the visual highlight for assistive tech (BL-A11Y-01).
            document.querySelectorAll('.tab-btn').forEach(btn => {
                if (btn.getAttribute('data-target') === newValue) {
                    btn.setAttribute('aria-current', 'page');
                } else {
                    btn.removeAttribute('aria-current');
                }
            });
            break;
        case 'currentUser':
            if (newValue) {
                if (UI.loggedInUserNameEl) UI.loggedInUserNameEl.textContent = newValue.displayName || newValue.email;
            } else {
                if (UI.loggedInUserNameEl) UI.loggedInUserNameEl.textContent = '';
            }
            break;
    }
});

// ==========================================
// Practice Caddy UI Controller (v6.19.0)
// ==========================================

let _activeDrillData = null; // cache the active drill in memory

const PRACTICE_INPUT_ERRORS = new Set([
    'practice inputs must be an object',
    'focus must be a listed area',
    'goal must be text',
    'goal must not contain invisible or bidirectional control characters',
    'goal must be a single line',
    'goal must be at most 120 characters',
    'minutes must be 15, 30, 45 or 60',
]);

function practiceGenerationErrorMessage(error) {
    const code = error?.code;
    const message = typeof error?.message === 'string' ? error.message : '';

    // These are the exact validation messages produced by our input normaliser.
    // Never echo a different invalid-argument or arbitrary service message.
    if (code === 'functions/invalid-argument' && PRACTICE_INPUT_ERRORS.has(message)) return message;
    if (code === 'functions/permission-denied') {
        return 'Your account is awaiting approval. Ask an admin to approve it before using AI features.';
    }
    if (code === 'functions/resource-exhausted') {
        return "You've reached today's AI practice plan limit. Try again tomorrow.";
    }
    if (code === 'functions/unauthenticated') {
        return 'Your session has ended. Sign in again to generate a practice plan.';
    }
    return "We couldn't confirm whether your plan was created. Reload this page to check for an active plan before generating again.";
}

/**
 * Toggles the visibility of practice module state containers.
 * @param {string} state - The state to show ('empty', 'active', 'loading').
 * @returns {void}
 */
function setPracticeState(state) {
    const stateEmpty = document.getElementById('practice-state-empty');
    const stateActive = document.getElementById('practice-state-active');
    const stateLoading = document.getElementById('practice-state-loading');
    if (stateEmpty) stateEmpty.classList.toggle('hidden', state !== 'empty');
    if (stateActive) stateActive.classList.toggle('hidden', state !== 'active');
    if (stateLoading) stateLoading.classList.toggle('hidden', state !== 'loading');
}

/**
 * Renders the 3-step practice plan in the active drill container.
 * @param {Array} steps - Array of drill steps.
 * @param {Array} completedSteps - Array of indices of completed steps.
 * @param {string} drillId - The unique ID of the drill document.
 * @returns {void}
 */
export function renderPracticeSteps(steps, completedSteps, drillId) {
    const container = document.getElementById('practice-steps-list');
    if (!container) return;
    container.innerHTML = '';

    steps.forEach((step, idx) => {
        const isCompleted = (completedSteps || []).includes(idx);
        const div = document.createElement('div');
        div.className = `practice-step ${isCompleted ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="step-check">
                <input type="checkbox" ${isCompleted ? 'checked' : ''} data-idx="${idx}" data-id="${escapeHtml(drillId)}">
            </div>
            <div class="step-body">
                <h4>Step ${idx + 1}</h4>
                <p>${escapeHtml(step.description || '')}</p>
            </div>
        `;
        container.appendChild(div);
    });
}

/**
 * Binds events and logic for the AI Practice Caddy module.
 * @returns {void}
 */
/**
 * Binds events and logic for the AI Practice Caddy module.
 * @returns {void}
 */
/**
 * S8: one line saying which club gaps the plan was built from, e.g.
 * "Based on: Driver start line 4° right of plan; 7 Iron 12 m past plan".
 * Pure formatting over the function's `basis.clubs`; exported for the test.
 * Returns '' when there is nothing to say, and the caller hides the element.
 */
export function practiceBasisText(basis) {
    // Two shapes reach here: the callable returns `{ clubs: [...] }`, while the
    // plan document stores the bare array (functions/index.js writes `basis`).
    // Accept either rather than make the caller care.
    const clubs = Array.isArray(basis) ? basis
        : (basis && Array.isArray(basis.clubs)) ? basis.clubs : [];
    const parts = [];
    for (const c of clubs) {
        if (!c || !c.club || !c.gapType) continue;
        // The function pools shots that name no club under this label
        // (functions/lib/intent.js ALL_CLUBS). Reading "Your shots start line
        // …" is awkward, so drop the label and say so at the end instead.
        const pooled = c.club === 'Your shots';
        const who = pooled ? '' : `${c.club} `;
        const tail = pooled ? ' (all clubs)' : '';
        if (c.gapType === 'shape') {
            parts.push(`${who}shape differs from plan${tail}`);
        } else if (c.unit === 'deg') {
            parts.push(`${who}start line ${Math.abs(c.gapValue)}° off plan${tail}`);
        } else if (c.unit === 'm') {
            parts.push(`${who}${Math.abs(c.gapValue)} m off plan${tail}`);
        } else {
            parts.push(`${who}${c.gapType} differs from plan${tail}`);
        }
    }
    return parts.length ? `Based on: ${parts.join('; ')}` : '';
}

function renderPracticeBasis(basis) {
    const el = document.getElementById('practice-basis');
    if (!el) return;
    const text = practiceBasisText(basis);
    el.textContent = text;
    el.classList.toggle('hidden', !text);
}

export function bindPracticeCaddyUI() {
    const btnGenerate = document.getElementById('btn-generate-practice');
    const btnReset = document.getElementById('btn-reset-practice');
    const errorEl = document.getElementById('practice-generate-error');
    const ratingSection = document.getElementById('practice-rating-section');
    const btnDone = document.getElementById('btn-practice-done');
    const minutesInput = document.getElementById('practice-minutes');
    let minutesChanged = false;

    if (!btnGenerate) return;

    minutesInput?.addEventListener('change', () => {
        minutesChanged = true;
    });

    /**
     * Loads the current active practice plan for the user.
     */
    const loadActivePlan = async () => {
        if (!AppState.currentUser) return;
        setPracticeState('loading');
        try {
            const snap = await getDoc(doc(db, "users", AppState.currentUser.uid, "practice_plans", "active"));
            if (snap.exists() && snap.data().status === 'active') {
                const planData = snap.data();
                // Free-text goal content stays in the private plan; legacy and
                // goal-free plans load their generic content from the library.
                const drillSnap = !planData.drill && planData.drillId
                    ? await getDoc(doc(db, "global_drills", planData.drillId))
                    : null;
                _activeDrillData = normalizePracticePlan({
                    ...(planData.drill || (drillSnap && drillSnap.exists() ? drillSnap.data() : {})),
                    ...planData
                });
                showActiveDrill(_activeDrillData);
            } else {
                setPracticeState('empty');
            }
        } catch (err) {
            console.error("[Practice Caddy] Load active fail:", err);
            setPracticeState('empty');
        }
    };

    /**
     * Populates the UI with active drill data.
     * @param {Object} data - Drill data from Firestore.
     */
    /**
     * Shows the rating section only once every step is checked off.
     */
    const updateRatingVisibility = () => {
        if (!ratingSection) return;
        const total = _activeDrillData ? (_activeDrillData.steps || []).length : 0;
        const done = _activeDrillData ? (_activeDrillData.completedSteps || []).length : 0;
        ratingSection.classList.toggle('hidden', total === 0 || done < total);
    };

    const showActiveDrill = (data) => {
        if (!data) return;
        setPracticeState('active');
        const categoryEl = document.getElementById('practice-category-badge');
        const metricEl = document.getElementById('practice-target-metric');
        if (categoryEl) categoryEl.textContent = data.category || 'General';
        if (metricEl) metricEl.textContent = data.targetMetric || '—';
        renderPracticeBasis(data.basis);
        renderPracticeSteps(data.steps, data.completedSteps, data.id);
        document.getElementById('practice-preferences-notice')?.classList
            .toggle('hidden', !data.preferencesIgnored);
        updateRatingVisibility();
    };

    btnGenerate.addEventListener('click', async () => {
        if (!AppState.currentUser) return;
        btnGenerate.disabled = true;
        const originalText = btnGenerate.textContent;
        btnGenerate.textContent = 'Generating...';
        setPracticeState('loading');
        if (errorEl) errorEl.classList.add('hidden');

        try {
            const generatePlan = httpsCallable(functions, 'generatePracticePlan');
            // Rounds and handicap still come from the server; only preferences
            // are supplied by the player. These controls are ephemeral UI state.
            const preferences = {
                focus: document.getElementById('practice-focus').value,
                goal: document.getElementById('practice-goal').value.trim(),
            };
            if (minutesChanged && minutesInput) {
                preferences.minutes = Number(minutesInput.value);
            }
            const result = await generatePlan(preferences);
            _activeDrillData = normalizePracticePlan(result.data);
            showActiveDrill(_activeDrillData);
        } catch (err) {
            console.error('[Practice Caddy] Generation error:', err);
            setPracticeState('empty');
            if (errorEl) {
                errorEl.textContent = practiceGenerationErrorMessage(err);
                errorEl.classList.remove('hidden');
            }
        } finally {
            btnGenerate.disabled = false;
            btnGenerate.textContent = originalText;
        }
    });

    // Delegated listener for checkbox clicks
    const stepsList = document.getElementById('practice-steps-list');
    if (stepsList) {
        stepsList.addEventListener('click', async (e) => {
            if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
                const stepIdx = parseInt(e.target.getAttribute('data-idx'));
                const isChecked = e.target.checked;

                try {
                    const drillRef = doc(db, "users", AppState.currentUser.uid, "practice_plans", "active");
                    if (isChecked) {
                        await updateDoc(drillRef, {
                            completedSteps: arrayUnion(stepIdx)
                        });
                    } else {
                        await updateDoc(drillRef, {
                            completedSteps: arrayRemove(stepIdx)
                        });
                    }
                    // Refresh local state
                    if (_activeDrillData) {
                        if (isChecked) {
                            if (!_activeDrillData.completedSteps) _activeDrillData.completedSteps = [];
                            _activeDrillData.completedSteps.push(stepIdx);
                        } else {
                            _activeDrillData.completedSteps = _activeDrillData.completedSteps.filter(s => s !== stepIdx);
                        }
                        e.target.closest('.practice-step').classList.toggle('completed', isChecked);
                        updateRatingVisibility();
                    }
                } catch (err) {
                    console.error("[Practice Caddy] Step update fail:", err);
                    e.target.checked = !isChecked; // revert
                }
            }
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', async () => {
            if (!_activeDrillData) return;
            const btnText = btnReset.textContent;
            btnReset.disabled = true;
            btnReset.textContent = 'Archiving...';
            try {
                const drillRef = doc(db, "users", AppState.currentUser.uid, "practice_plans", "active");
                await updateDoc(drillRef, { status: 'completed' });
                _activeDrillData = null;
                setPracticeState('empty');
            } catch (err) {
                console.error("[Practice Caddy] Archive fail:", err);
            } finally {
                btnReset.disabled = false;
                btnReset.textContent = btnText;
            }
        });
    }

    // E38: one Done tap closes the plan. Not awaited: offline the write
    // never settles, and the plan doc is the golfer's own (F-9 pattern).
    if (btnDone) {
        btnDone.addEventListener('click', () => {
            if (!AppState.currentUser) return;
            const drillRef = doc(db, "users", AppState.currentUser.uid, "practice_plans", "active");
            updateDoc(drillRef, { status: 'completed' })
                .catch(err => console.error("[Practice Caddy] Done fail:", err));
            _activeDrillData = null;
            setPracticeState('empty');
        });
    }

    // Trigger initial load
    loadActivePlan();
}
