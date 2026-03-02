// ==========================================
// Centralized DOM Element Caching & UI Helpers
// ==========================================
import { AppState } from './state.js';
import Chart from 'chart.js/auto';

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
    btnCloseAiModal: document.getElementById('btn-close-ai-modal')
};

// ==========================================
// TABS & NAVIGATION HELPER
// ==========================================
const DEFAULT_TAB_KEY = 'golfAppDefaultTab';

export function setupTabs() {
    const savedTabId = localStorage.getItem(DEFAULT_TAB_KEY);
    if (savedTabId) {
        const savedBtn = Array.from(UI.tabBtns).find(b => b.getAttribute('data-target') === savedTabId);
        if (savedBtn) {
            UI.tabBtns.forEach(b => b.classList.remove('active'));
            UI.tabContents.forEach(c => {
                c.classList.add('hidden');
                c.classList.remove('active');
            });

            savedBtn.classList.add('active');
            const targetContent = document.getElementById(savedTabId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
                targetContent.classList.add('active');
            }
        }
    }

    UI.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            UI.tabBtns.forEach(b => b.classList.remove('active'));
            UI.tabContents.forEach(c => {
                c.classList.add('hidden');
                c.classList.remove('active');
            });

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
                targetContent.classList.add('active');
                localStorage.setItem(DEFAULT_TAB_KEY, targetId);
            }
        });
    });
}

// ==========================================
// REACTIVE UI RENDERING FUNCTIONS
// ==========================================

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
                    <button class="btn btn-secondary btn-sm toggle-count-btn" data-id="${round.id}" title="Toggle Counting Rules">
                        ${round.notCounting ? 'Include' : 'Exclude'}
                    </button>
                    ${(uidMatches || isAdmin) ? `<button class="btn btn-danger btn-sm del-round-btn" data-id="${round.id}">X</button>` : ''}
                </td>
            `;
            UI.historyTbody.appendChild(tr);
        });
    }
}

export function renderOcPlayersList(groups = AppState.liveRoundGroups) {
    if (!UI.ocAddedPlayersList) return;
    UI.ocAddedPlayersList.innerHTML = '';
    groups.forEach((p, index) => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px; background:#f1f5f9; margin-bottom:5px; border-radius:5px;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;

        const btnRemove = document.createElement('button');
        btnRemove.textContent = 'Remove';
        btnRemove.className = 'btn-text';
        btnRemove.style.cssText = 'color:#ef4444; padding:0;';
        btnRemove.addEventListener('click', () => {
            // This is a bit tricky since we're decoupling, but for now we'll allow spliced state updates
            AppState.liveRoundGroups.splice(index, 1);
            // Trigger state change manually since splice doesn't trigger Proxy 'set'
            AppState.liveRoundGroups = [...AppState.liveRoundGroups];
        });

        div.appendChild(nameSpan);
        div.appendChild(btnRemove);
        UI.ocAddedPlayersList.appendChild(div);
    });
}

let _trendChart = null;
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
                }
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
            if (UI.handicapIndexEl) UI.handicapIndexEl.textContent = newValue > 0 ? newValue : 'N/A';
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
