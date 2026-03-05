// ==========================================
// Centralized DOM Element Caching & UI Helpers
// ==========================================
import { AppState } from './state.js';
import Chart from 'chart.js/auto';
import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, getDoc, setDoc, increment } from 'firebase/firestore';
import { db, functions } from './firebase-config.js';

const ALL_SCREENS = ['tab-whs', 'tab-comp', 'tab-practice', 'tab-oncourse', 'tab-tempo', 'tab-feed', 'tab-coach', 'tab-admin', 'tab-settings'];

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

    // Daily Handicap Calcs
    btnCalculateDaily: document.getElementById('btn-calculate-daily'),
    dailyHandicapResult: document.getElementById('daily-handicap-result'),
    dhPlayerName: document.getElementById('dh-player-name'),
    dhValue: document.getElementById('dh-value'),

    // Competitions
    tabBtnComp: document.getElementById('tab-btn-comp'), // may be null if data-target is used
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
    btnCancelPractice: document.getElementById('btn-cancel-practice'), // Missing in HTML, safe if null
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
    mainApp: document.getElementById('main-app')
};

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

    // v6.20.0: Reset scroll position for tab switch comfort
    window.scrollTo(0, 0);

    const target = document.getElementById(targetId);
    if (!target) {
        console.error(`[Navigation] Target screen not found: #${targetId}`);
        return;
    }

    // Hide all tabs
    UI.tabContents.forEach(tab => {
        tab.classList.add('hidden');
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Show target tab
    target.classList.remove('hidden');
    target.classList.add('active');

    // Update active button state
    const btn = document.querySelector(`.tab-btn[data-target="${targetId}"]`);
    if (btn) btn.classList.add('active');

    // Persist as default
    localStorage.setItem(DEFAULT_TAB_KEY, targetId);

    console.log(`[Navigation] switching to: ${targetId}`);
}

/**
 * Refreshes the settings UI with current user information.
 * @returns {void}
 */
window.refreshSettingsUI = () => {
    const info = document.getElementById('settings-account-info');
    if (!info || !AppState.currentUser) return;

    info.innerHTML = `
        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p><strong>Name:</strong> ${AppState.currentUser.displayName || 'Guest User'}</p>
            <p><strong>Email:</strong> ${AppState.currentUser.email}</p>
            <p><strong>Role:</strong> ${window.currentUserIsAdmin ? 'Master Admin' : (window.currentUserIsCoach ? 'Coach' : 'Standard Player')}</p>
            <p style="margin-top:10px; font-size: 0.75rem; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 8px;">
                User ID: ${AppState.currentUser.uid}
            </p>
        </div>
    `;
};

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

    // Dynamic Version Injection
    try {
        const footerVer = document.getElementById('footer-version');
        const headerVer = document.getElementById('header-version');
        if (footerVer) footerVer.textContent = 'v6.20.2 - Housekeeping';
        if (headerVer) headerVer.textContent = 'v6.20.2 - Housekeeping';
        console.log(`[UI] Version Injected: v6.20.2 - Housekeeping`);
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

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${round.course}</td>
                <td>${round.rating} / ${round.slope}</td>
                <td><strong>${round.adjustedGross}</strong></td>
                <td>${diffSpan}</td>
                <td>
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
                    <button class="btn btn-secondary btn-sm toggle-count-btn" data-id="${round.id}" title="Toggle Counting Rules">
                        ${round.notCounting ? 'Include' : 'Exclude'}
                    </button>
                    ${(uidMatches || isAdmin) ? `<button class="btn btn-danger btn-sm del-round-btn" data-id="${round.id}">X</button>` : ''}
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
            .map(line => `<li style="margin-bottom:6px;">${line.replace(/^[*\-•]\s+/, '')}</li>`)
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
        alert("Could not generate AI briefing. Ensure your internet is connected.");
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
        li.innerHTML = `
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:600; color:var(--text-dark);">${p.name}</span>
                <span style="font-size:0.75rem; color:var(--text-muted);">ID: ${p.uid.substring(0, 8)}...</span>
            </div>
            <button class="btn btn-danger btn-sm remove-player-btn" data-uid="${p.uid}">Remove</button>
        `;
        UI.ocAddedPlayersList.appendChild(li);

        // Bind remove button
        li.querySelector('.remove-player-btn').addEventListener('click', () => {
            AppState.liveRoundGroups.splice(index, 1);
            AppState.liveRoundGroups = [...AppState.liveRoundGroups];
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

    const counting = rounds
        .filter(r => !r.notCounting && r.slope && r.adjustedGross && r.rating)
        .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const db_ = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return da - db_;
        });

    if (counting.length < 3) {
        canvas.style.display = 'none';
        if (noData) noData.classList.remove('hidden');
        return;
    }
    canvas.style.display = '';
    if (noData) noData.classList.add('hidden');

    const labels = counting.map(r => {
        const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
        return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    });
    const diffs = counting.map(r => +((113 / r.slope) * (r.adjustedGross - r.rating)).toFixed(1));

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
            if (UI.handicapIndexEl && document.activeElement !== UI.handicapIndexEl) {
                UI.handicapIndexEl.value = newValue > 0 ? newValue : '0.0';
            }
            break;
            if (UI.indexSubtextEl) {
                UI.indexSubtextEl.textContent = AppState.currentRounds.filter(r => r.notCounting !== true).length < 3 ? "Need 3 scores to establish index" : "Current WHS Index";
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
let _selectedRating = 0;

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
                <input type="checkbox" ${isCompleted ? 'checked' : ''} data-idx="${idx}" data-id="${drillId}">
            </div>
            <div class="step-body">
                <h4>Step ${idx + 1}: ${step.title}</h4>
                <p>${step.description}</p>
                <div class="step-meta">Target: ${step.goal} | Reps: ${step.reps}</div>
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
export function bindPracticeCaddyUI() {
    const btnGenerate = document.getElementById('btn-generate-practice');
    const btnArchive = document.getElementById('btn-archive-drill');
    const errorEl = document.getElementById('practice-gen-error');

    if (!btnGenerate) return;

    /**
     * Loads the current active practice plan for the user.
     */
    const loadActivePlan = async () => {
        if (!AppState.currentUser) return;
        setPracticeState('loading');
        try {
            const q = query(
                collection(db, "practice_plans"),
                where("userId", "==", AppState.currentUser.uid),
                where("status", "==", "active")
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                const docData = snap.docs[0].data();
                docData.id = snap.docs[0].id;
                _activeDrillData = docData;
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
    const showActiveDrill = (data) => {
        if (!data) return;
        setPracticeState('active');
        const titleEl = document.getElementById('active-drill-title');
        const descEl = document.getElementById('active-drill-desc');
        if (titleEl) titleEl.textContent = data.title || "Your Custom Drill";
        if (descEl) descEl.textContent = data.description || "Based on your recent performance.";
        renderPracticeSteps(data.steps, data.completedSteps, data.id);
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
            const result = await generatePlan({});
            _activeDrillData = result.data;
            showActiveDrill(_activeDrillData);
        } catch (err) {
            console.error('[Practice Caddy] Generation error:', err);
            setPracticeState('empty');
            if (errorEl) {
                errorEl.textContent = `Error: ${err.message}`;
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
                const drillId = e.target.getAttribute('data-id');
                const isChecked = e.target.checked;

                try {
                    const drillRef = doc(db, "practice_plans", drillId);
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
                    }
                } catch (err) {
                    console.error("[Practice Caddy] Step update fail:", err);
                    e.target.checked = !isChecked; // revert
                }
            }
        });
    }

    if (btnArchive) {
        btnArchive.addEventListener('click', async () => {
            if (!_activeDrillData || !_activeDrillData.id) return;
            const btnText = btnArchive.textContent;
            btnArchive.disabled = true;
            btnArchive.textContent = 'Archiving...';
            try {
                const drillRef = doc(db, "practice_plans", _activeDrillData.id);
                await updateDoc(drillRef, { status: 'completed' });
                _activeDrillData = null;
                setPracticeState('empty');
            } catch (err) {
                console.error("[Practice Caddy] Archive fail:", err);
            } finally {
                btnArchive.disabled = false;
                btnArchive.textContent = btnText;
            }
        });
    }

    // Trigger initial load
    loadActivePlan();
}
