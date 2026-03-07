// Sydney Protocol: src/ui.js
// Locale: en-AU (Australian Standard)
// Status: [HARDENED & FULL RECOVERY] - Version 8.2.2

import { toggleGPS } from './modules/gps.js';
import { AppState } from './state.js';
import Chart from 'chart.js/auto';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, setDoc, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, functions } from './firebase-config.js';

const ALL_SCREENS = ['tab-whs', 'tab-comp', 'tab-practice', 'tab-oncourse', 'tab-tempo', 'tab-feed', 'tab-coach', 'tab-admin', 'tab-settings'];

// ==========================================
// Centralized DOM Element Caching
// ==========================================
export const UI = {
    // Core App
    authOverlay: document.getElementById('auth-overlay'),
    mainApp: document.getElementById('main-app'), // FIX C2: Consolidated
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

    // Daily Handicap Calcs
    btnCalculateDaily: document.getElementById('btn-calculate-daily'),
    dailyHandicapResult: document.getElementById('daily-handicap-result'),
    dhPlayerName: document.getElementById('dh-player-name'),
    dhValue: document.getElementById('dh-value'),

    // Competitions
    tabBtnComp: document.getElementById('tab-btn-comp'),
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
    btnLogPracticeContainer: document.getElementById('practice-form-container'),
    logPracticeContainer: document.getElementById('practice-form-container'),
    logPracticeForm: document.getElementById('form-log-practice'),
    btnSavePractice: document.getElementById('btn-save-practice'),
    btnEmailCoach: document.getElementById('btn-email-coach'),
    btnExportPractice: document.getElementById('btn-export-practice'),
    drillLiveTotalEl: document.getElementById('drill-live-total'),
    btnCancelPractice: document.getElementById('btn-cancel-practice'),
    practiceDashboardResults: document.getElementById('practice-best-score') ? document.getElementById('practice-best-score').parentElement.parentElement : null,
    practiceRecentTbody: document.getElementById('practice-history-tbody'),

    // On-Course Tracker
    tabBtnOncourse: document.getElementById('tab-btn-oncourse'),
    btnModeSimple: document.getElementById('btn-mode-simple'),
    btnModeDetailed: document.getElementById('btn-mode-detailed'),
    ocModeDesc: document.getElementById('oc-mode-desc'),
    btnRound9: document.getElementById('btn-round-9'),
    btnRound18: document.getElementById('btn-round-18'),
    ocCourseSelect: document.getElementById('oc-course-select'),
    ocTeeSelect: document.getElementById('oc-tee-select'),
    ocCourseInfoLine: document.getElementById('oc-course-info-line'),
    ocDailyHandicapLine: document.getElementById('oc-daily-handicap-line'),
    ocPlayerSelect: document.getElementById('oc-player-select'),
    btnOcAddPlayer: document.getElementById('btn-oc-add-player'),
    ocAddedPlayersList: document.getElementById('oc-players-list'),
    ocLinkComp: document.getElementById('oc-link-comp'),
    btnOcStart: document.getElementById('btn-oc-start'),

    // Sequential Shots & Review
    btnWizardPrev: document.getElementById('btn-wizard-prev'),
    btnWizardNext: document.getElementById('btn-wizard-next'),
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
    aiPromptTextarea: document.getElementById('ai-prompt-textarea'),
    btnCopyAiPrompt: document.getElementById('btn-copy-ai-prompt'),
    btnCloseAiModal: document.getElementById('btn-close-ai-modal'),

    // My Bag and Overhauled Wizard
    bagChecks: document.querySelectorAll('.bag-check'),
    btnSaveBag: document.getElementById('btn-save-bag'),
    bagButtonsGrid: document.getElementById('bag-buttons-grid'),
    btnShotPrev: document.getElementById('btn-shot-prev'),
    btnShotNext: document.getElementById('btn-shot-next'),
    btnBackToHole: document.getElementById('btn-back-to-hole'),
    btnSaveShotFinal: document.getElementById('btn-save-shot-final'),
    btnWizardPenalty: document.getElementById('btn-wizard-penalty'),
    btnPuttOnGreen: document.getElementById('btn-putt-on-green'),
    btnPuttFringe: document.getElementById('btn-putt-fringe'),
    penaltyModal: document.getElementById('penalty-modal'),
    puttingSection: document.getElementById('section-putting-outcome'), // FIX M1: ADDED NULL-CHECK REF

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
    editorScoreVal: document.getElementById('editorScoreVal'),
    editorPuttsVal: document.getElementById('editorPuttsVal'),
    editorPenVal: document.getElementById('editorPenVal'),
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

    // v6.21.0: Surveyor Mode
    btnToggleSurveyor: document.getElementById('btn-toggle-surveyor'),
    surveyorContainer: document.getElementById('surveyor-container'),
    btnPinFront: document.getElementById('btn-pin-front'),
    btnPinBack: document.getElementById('btn-pin-back'),
    btnPinOverride: document.getElementById('btn-pin-override')
};

/**
 * Injects the application version from the meta tag into all matching displays.
 */
export function injectVersionFromMeta() {
    const appMeta = document.querySelector('meta[name="application-version"]');
    const version = appMeta ? appMeta.getAttribute('content') : 'vUnknown';

    document.querySelectorAll('.version-display').forEach(el => {
        el.textContent = version;
    });

    const footerVer = document.getElementById('footer-version');
    if (footerVer) footerVer.textContent = version;

    console.log(`[UI] Version Injected from Meta: ${version}`);
}

const DEFAULT_TAB_KEY = 'golfAppDefaultTab';

/**
 * Maps to a new dashboard view (v7.0.0 replacement for switchTab).
 */
export function MapsTo(viewId) {
    if (!viewId) return;

    const globalFab = document.getElementById('global-fab-home');
    if (globalFab) {
        if (viewId === 'view-home') {
            globalFab.style.display = 'none';
            AppState.selectedHoles = null;
            AppState.selectedTee = null;
            AppState.isStartingRound = false;
        } else {
            globalFab.style.display = 'flex';
        }
    }

    window.scrollTo(0, 0);

    const target = document.getElementById(viewId) || document.getElementById('view-home'); // Fallback Fix
    
    document.querySelectorAll('.view-container, .tab-content').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('active');
    });

    target.classList.remove('hidden');
    target.classList.add('active');

    localStorage.setItem(DEFAULT_TAB_KEY, viewId);
}
/**
 * Legacy alias for backwards compatibility.
 * Redirects older modules to the v7.0.0 MapsTo router.
 */
export function switchTab(targetId) {
    MapsTo(targetId);
}
/**
 * Initializes navigation event listeners.
 */
export function initNavigation() {
    console.log("[Navigation] Initializing Dashboard Router (v7.0.0)...");

    const globalFab = document.getElementById('global-fab-home');
    if (globalFab) {
        globalFab.addEventListener('click', () => MapsTo('view-home'));
    }

    // FIX C1: SINGLE BINDING with null-guard
    if (UI.btnToggleGps) {
        UI.btnToggleGps.addEventListener('click', () => {
            toggleGPS();
        });
    }

    document.querySelectorAll('.dash-btn, .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            if (target) MapsTo(target);
        });
    });

    let initialTab = AppState.activeRoundId ? 'tab-oncourse' : (localStorage.getItem(DEFAULT_TAB_KEY) || 'view-home');
    MapsTo(initialTab);
    
    // REMOVED DUPLICATE LISTENERS FROM BOTTOM (FIX C1)
}

export function setupTabs() {
    initNavigation();
    try { injectVersionFromMeta(); } catch (e) { console.error("[UI] Version injection failed:", e); }
}

/**
 * Renders the WHS round history table.
 */
export function renderRoundsHistory(rounds = AppState.currentRounds, usedIds = []) {
    if (!UI.historyTbody) return;
    UI.historyTbody.innerHTML = '';
    const uidMatches = AppState.currentUser && AppState.viewingPlayerId === AppState.currentUser.uid;
    const isAdmin = window.currentUserIsAdmin || false;

    if (rounds.length === 0) {
        if (UI.emptyState) UI.emptyState.classList.remove('hidden');
    } else {
        if (UI.emptyState) UI.emptyState.classList.add('hidden');
        rounds.forEach(round => {
            const tr = document.createElement('tr');
            if (round.notCounting) {
                tr.style.opacity = '0.5';
                tr.style.textDecoration = 'line-through';
            }

            const dif = ((113 / round.slope) * (round.adjustedGross - round.rating)).toFixed(1);
            let dateObj = round.date?.toDate ? round.date.toDate() : new Date(round.date);
            const dateStr = dateObj ? dateObj.toLocaleDateString() : 'Unknown';

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${round.course}</td>
                <td>${round.rating} / ${round.slope}</td>
                <td><strong>${round.adjustedGross}</strong></td>
                <td>${usedIds.includes(round.id) ? `<span class="asterisk-highlight">${dif} *</span>` : dif}</td>
                <td>
                    ${round.audioUrl ? `<button class="btn btn-secondary btn-sm briefing-btn" data-id="${round.id}">💡</button>` : ''}
                    <button class="btn btn-danger btn-sm del-round-btn" data-id="${round.id}">X</button>
                </td>
            `;
            
            const briefingBtn = tr.querySelector('.briefing-btn');
            if (briefingBtn) {
                briefingBtn.addEventListener('click', () => showAiBriefing(round, briefingBtn, tr));
            }

            UI.historyTbody.appendChild(tr);
        });
    }
}

/**
 * AI Briefing Logic (RECOVERED FULL)
 */
export async function showAiBriefing(round, btn, roundRow) {
    const originalText = btn.textContent.trim();
    const nextRow = roundRow.nextElementSibling;
    if (nextRow && nextRow.classList.contains('briefing-drawer')) { nextRow.remove(); return; }

    try {
        let aiSummary = round.aiSummary;
        if (!aiSummary) {
            btn.disabled = true; btn.textContent = '⏳';
            const generateAudioBriefing = httpsCallable(functions, 'generateAudioBriefing');
            const result = await generateAudioBriefing({ audioUrl: round.audioUrl });
            aiSummary = result.data;
            if (round.id) { await updateDoc(doc(db, "whs_rounds", round.id), { aiSummary: aiSummary }); }
            round.aiSummary = aiSummary;
        }

        const drawerRow = document.createElement('tr');
        drawerRow.className = 'briefing-drawer';
        drawerRow.innerHTML = `<td colspan="100%" style="background: #f8fafc; padding: 20px;">
            <h4>💡 AI Caddy Briefing</h4>
            <ul>${aiSummary.writtenSummary.split('\n').map(l => `<li>${l}</li>`).join('')}</ul>
            <button class="btn btn-secondary btn-sm close-briefing-btn">✖️ Close</button>
        </td>`;
        roundRow.after(drawerRow);
        drawerRow.querySelector('.close-briefing-btn').onclick = () => drawerRow.remove();
        if (aiSummary.verbalBriefing) speakBriefing(aiSummary.verbalBriefing);
    } catch (err) { console.error(err); } finally { btn.disabled = false; btn.textContent = originalText; }
}

export function speakBriefing(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    // FIX FROM PEER REVIEW: Handle Aussie voice timing
    const auVoice = voices.find(v => v.lang.includes('AU')) || voices[0];
    if (auVoice) utterance.voice = auVoice;
    window.speechSynthesis.speak(utterance);
}

/**
 * On-Course Player List (FIX M2: UID FILTER)
 */
export function renderOcPlayersList(groups = AppState.liveRoundGroups) {
    if (!UI.ocAddedPlayersList) return;
    UI.ocAddedPlayersList.innerHTML = groups.length === 0 ? '<li>No players added yet</li>' : '';

    groups.forEach((p) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.name}</span> <button class="btn btn-danger btn-sm remove-player-btn">Remove</button>`;
        UI.ocAddedPlayersList.appendChild(li);

        li.querySelector('.remove-player-btn').addEventListener('click', () => {
            // FIX M2: Use UID filter instead of stale index
            AppState.liveRoundGroups = AppState.liveRoundGroups.filter(player => player.uid !== p.uid);
            renderOcPlayersList();
        });
    });
}

/**
 * Handicap Trend Chart (FIX T1: dateB)
 */
let _trendChart = null;
export function renderTrendChart(rounds = AppState.currentRounds) {
    const canvas = document.getElementById('handicap-chart');
    if (!canvas) return;

    const counting = rounds
        .filter(r => !r.notCounting && r.slope && r.adjustedGross && r.rating)
        .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date); // FIX T1: Rename db_ to dateB
            return da - dateB;
        });

    if (counting.length < 3) { canvas.style.display = 'none'; return; }

    if (_trendChart) _trendChart.destroy();
    _trendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: counting.map(r => (r.date?.toDate ? r.date.toDate() : new Date(r.date)).toLocaleDateString()),
            datasets: [{ label: 'Differential', data: counting.map(r => r.adjustedGross), borderColor: '#3867d6', tension: 0.4 }]
        }
    });
}

/**
 * Practice Caddy Logic (RECOVERED FULL)
 */
export function bindPracticeCaddyUI() {
    const btnGenerate = document.getElementById('btn-generate-practice');
    if (!btnGenerate) return;
    btnGenerate.addEventListener('click', async () => {
        btnGenerate.disabled = true; btnGenerate.textContent = 'Generating...';
        try {
            const generatePlan = httpsCallable(functions, 'generatePracticePlan');
            const result = await generatePlan({});
            console.log("Plan generated:", result.data);
        } catch (err) { console.error(err); } finally { btnGenerate.disabled = false; btnGenerate.textContent = 'Generate Plan'; }
    });
}

window.addEventListener('stateChange', (e) => {
    const { property, newValue } = e.detail;
    if (property === 'currentRounds') { renderRoundsHistory(newValue, AppState.usedIds); renderTrendChart(newValue); }
    if (property === 'liveRoundGroups') { renderOcPlayersList(newValue); }
});

// Bridge Rule: Exporting to hazards module
export const update_ui_hazard_state = (loc) => import('./modules/ui-hazards.js').then(m => m.evaluate_hazard_proximity(loc));