// ==========================================
// ui.js
// Centralized DOM Element Caching & UI Helpers
// ==========================================

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
    ocAddedPlayersList: document.getElementById('oc-added-players-list'),
    ocLinkComp: document.getElementById('oc-link-comp'),
    btnOcStart: document.getElementById('btn-oc-start'),

    // Sequential Shots & Review
    btnWizardPrev: document.getElementById('btn-wizard-prev'),
    btnWizardNext: document.getElementById('btn-wizard-next'),
    btnWizardDelete: document.getElementById('btn-wizard-delete'),
    btnOcReviewRound: document.getElementById('btn-oc-review-round'),
    reviewRoundModal: document.getElementById('review-round-modal'),
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
