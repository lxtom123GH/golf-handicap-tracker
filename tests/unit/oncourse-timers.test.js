import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/functions', () => ({
    httpsCallable: vi.fn(() => vi.fn(async () => ({ data: { answer: 'Rules answer' } })))
}));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
vi.mock('../../src/persistence.js', () => ({ writeRoundBackup: vi.fn(), markRoundBackupUnsynced: vi.fn() }));
vi.mock('../../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(), calculateHoleStableford: vi.fn(),
    convertStablefordToAGS: vi.fn(), scoringUnavailableReason: vi.fn()
}));
vi.mock('../../src/modules/card-render.js', () => ({
    updateLiveLeaderboard: vi.fn(), renderDetailedReview: vi.fn(),
    renderBagButtons: vi.fn(), renderHoleJumper: vi.fn()
}));
vi.mock('../../src/modules/score-input.js', () => ({
    startNewShotInput: vi.fn(), loadExistingShotData: vi.fn(), syncShotWizardUI: vi.fn(),
    setWizardActive: vi.fn(), saveShotData: vi.fn(), deleteShotData: vi.fn(),
    showToast: vi.fn(), refreshTrackButtonLabel: vi.fn()
}));
vi.mock('../../src/modules/event-binders.js', () => Object.fromEntries([
    'bindSetupToggles', 'bindCourseSelect', 'bindAddPlayer', 'bindAddGuest',
    'bindShotWizard', 'bindStartRound', 'bindGlobalRoundActions', 'bindCompQuickAdd',
    'bindOcSubNav', 'bindHoleMapper', 'bindHolePlanCards', 'bindGpsAssist',
    'bindRotateMap', 'bindShotEntry', 'bindGuestManager'
].map(name => [name, vi.fn()])));

let UI, oncourse, speech, httpsCallable;
let subscriptions;
beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    subscriptions = vi.spyOn(window, 'addEventListener');
    document.body.innerHTML = '<div id="oncourse-setup"></div>'
        + '<div id="my-bag-card"><input class="bag-check" type="checkbox" data-cat="driver"></div>'
        + '<div id="bag-msg" class="hidden"></div>';
    ({ UI } = await import('../../src/ui.js'));
    ({ httpsCallable } = await import('firebase/functions'));
    for (const key of ['btnVoiceRules', 'btnCancelVoice', 'voiceOverlay',
        'voiceStatus', 'voiceTranscript', 'rulesResponseCard', 'rulesResponseContent']) {
        UI[key] = document.createElement('div');
    }
    UI.voiceOverlay.classList.add('hidden');
    UI.rulesResponseCard.classList.add('hidden');
    vi.stubGlobal('SpeechRecognition', class {
        constructor() { speech = this; }
        start() { this.onstart(); }
        stop = vi.fn(() => this.onend());
        fail(error) { this.onerror({ error }); this.onend(); }
    });
    const { bindBagSettings } = await import('../../src/bag-settings.js');
    bindBagSettings();
    oncourse = await import('../../src/oncourse.js');
    oncourse.initOnCourse();
});
afterEach(() => {
    subscriptions.mock.calls.forEach(([event, handler]) => window.removeEventListener(event, handler));
    vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

/** One bag tick: E35 saves on change, there is no Update button. */
function saveBag() {
    const chk = document.querySelector('#my-bag-card .bag-check');
    chk.checked = !chk.checked;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('T3-setTimeout shared-element lifetimes', () => {
    it.each(['bag', 'voice'])('clears the %s message timer when leaving its view', kind => {
        const scheduled = vi.spyOn(globalThis, 'setTimeout');
        const cleared = vi.spyOn(globalThis, 'clearTimeout');
        if (kind === 'bag') saveBag();
        else { UI.btnVoiceRules.click(); speech.fail('network'); }
        const hideTimer = scheduled.mock.results.at(-1).value;
        window.dispatchEvent(new CustomEvent('stateChange', { detail: {
            property: 'activeTab', newValue: 'tab-whs'
        } }));
        expect(cleared).toHaveBeenCalledWith(hideTimer);
        const message = kind === 'bag' ? document.getElementById('bag-msg') : UI.voiceOverlay;
        expect(message.classList.contains('hidden')).toBe(true);
    });
    // E35 (#246): the confirmation shows for two seconds after each tick.
    it('keeps the bag confirmation visible for two seconds after the latest save', () => {
        const message = document.getElementById('bag-msg');
        saveBag();
        vi.advanceTimersByTime(1500);
        saveBag();
        vi.advanceTimersByTime(1000);
        expect(message.classList.contains('hidden')).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(message.classList.contains('hidden')).toBe(true);
    });

    it.each(['network', 'not-allowed'])('does not hide a new voice session after a %s error', error => {
        UI.btnVoiceRules.click();
        speech.fail(error);
        vi.advanceTimersByTime(1000);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(false);
        UI.btnVoiceRules.click();
        vi.advanceTimersByTime(2000);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(false);
        expect(UI.voiceStatus.textContent).toBe('Listening...');
    });

    it.each([['network', 2000], ['not-allowed', 2500]])(
        'keeps a %s error readable after end until its %s ms deadline', (error, delay) => {
        UI.btnVoiceRules.click();
        speech.fail(error);
        expect(UI.voiceStatus.textContent).toBe(error === 'not-allowed'
            ? 'Mic access denied. Tap the mic again to retry.' : 'Error: network');
        vi.advanceTimersByTime(delay - 1);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(false);
        vi.advanceTimersByTime(1);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(true);
    });

    it('restarts the hide deadline when a retried voice session also errors', () => {
        UI.btnVoiceRules.click();
        speech.fail('network');
        vi.advanceTimersByTime(1000);
        UI.btnVoiceRules.click();
        speech.fail('network');
        vi.advanceTimersByTime(1000);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(true);
    });

    it.each(['cancel', 'round cleanup'])('cancels the voice hide timer on %s', action => {
        UI.btnVoiceRules.click();
        speech.fail('network');
        if (action === 'cancel') UI.btnCancelVoice.click();
        else oncourse.endRoundCleanup();
        expect(vi.getTimerCount()).toBe(0);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(true);
    });

    it('hides the overlay on a normal end without an error', () => {
        UI.btnVoiceRules.click();
        speech.onend();
        expect(vi.getTimerCount()).toBe(0);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(true);
    });

    it.each(['tab change', 'cancel', 'round cleanup'])(
        'stops listening and discards queued results on %s', action => {
        UI.btnVoiceRules.click();
        speech.onresult({ resultIndex: 0, results: [[{ transcript: 'Can I take relief?' }]] });
        if (action === 'tab change') window.dispatchEvent(new CustomEvent('stateChange', {
            detail: { property: 'activeTab', newValue: 'tab-whs' }
        }));
        else if (action === 'cancel') UI.btnCancelVoice.click();
        else oncourse.endRoundCleanup();
        expect(speech.stop).toHaveBeenCalledTimes(1);
        // Recognition can deliver queued result/error/end events after stop.
        speech.onresult({ resultIndex: 0, results: [[{ transcript: 'Late result' }]] });
        speech.fail('aborted');
        expect(httpsCallable).not.toHaveBeenCalled();
        expect(UI.rulesResponseCard.classList.contains('hidden')).toBe(true);
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(true);
        expect(UI.voiceTranscript.textContent).toBe('');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('submits a completed spoken question once', async () => {
        UI.btnVoiceRules.click();
        speech.onresult({ resultIndex: 0, results: [[{ transcript: 'Can I take relief?' }]] });
        speech.onend();
        speech.onend();
        expect(httpsCallable).toHaveBeenCalledTimes(1);
        expect(httpsCallable.mock.results[0].value).toHaveBeenCalledWith({ query: 'Can I take relief?' });
        await Promise.resolve();
        await Promise.resolve();
        expect(UI.rulesResponseContent.innerHTML).toContain('Rules answer');
    });

    it('cancels a requested session before its asynchronous start event', () => {
        vi.spyOn(window.SpeechRecognition.prototype, 'start').mockImplementation(() => {});
        UI.btnVoiceRules.click();
        window.dispatchEvent(new CustomEvent('stateChange', {
            detail: { property: 'activeTab', newValue: 'tab-whs' }
        }));
        expect(speech.stop).toHaveBeenCalledTimes(1);
        speech.onstart();
        speech.fail('aborted');
        expect(UI.voiceOverlay.classList.contains('hidden')).toBe(true);
        expect(httpsCallable).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
