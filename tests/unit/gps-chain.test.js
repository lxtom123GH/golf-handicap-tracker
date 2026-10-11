// ==========================================
// gps-chain.test.js
// S4/S10 — the capture decision chains onto shot documents
// ==========================================
// Template: tests/unit/offline-writes.test.js (the F-11 stub set). Writes
// never settle offline; what we assert is what the tap path does, not the
// server ack.
//
// S10 rewires the S4 chain: startNewShotInput seeds a hold-still capture,
// the wizard opens immediately, and positions apply only when the capture
// decides (accepted / lowConfidence). The test drives fixes through the
// onGpsFix subscription and walks the fake clock past the 4 s window.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let autoId = 0;
// The mocked seed fix (getLastGpsFix) and the live-fix listeners (onGpsFix).
let mockedFix = null;
let gpsListeners = [];

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {} }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    doc: vi.fn((_db, col, id) => (typeof col === 'string'
        ? { _path: `${col}/${id}`, id }
        : { _path: `${_db?._path || 'auto'}/${++autoId}`, id: `auto-${autoId}` })),
    query: vi.fn((c) => c),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    getDoc: vi.fn(() => new Promise(() => { })),
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })),
    addDoc: vi.fn(() => new Promise(() => { })),
    setDoc: vi.fn(() => new Promise(() => { })),
    // The S4 finish patch rides on updateDoc — spied per test.
    updateDoc: vi.fn(() => new Promise(() => { })),
    deleteDoc: vi.fn(() => new Promise(() => { })),
    writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => new Promise(() => { })) })),
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

vi.mock('../../src/ui.js', () => ({
    UI: { ocTeeSelect: null, ocAddedPlayersList: null, ocHoleEditorModal: null, penaltyModal: null, btnWizardDelete: null }
}));

vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

vi.mock('../../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(() => 0),
    calculateHoleStableford: vi.fn(() => 2),
    convertStablefordToAGS: vi.fn(() => 45),
    scoringUnavailableReason: vi.fn(() => null)
}));

vi.mock('../../src/course-data.js', () => ({
    COURSE_DATA: {}, KEPERRA_GPS: {}, getStrokeIndex: vi.fn(() => null),
    isRatableTee: vi.fn(() => false), isPlausibleRating: vi.fn(() => true)
}));

vi.mock('../../src/oncourse.js', () => ({
    // The GPS fix is the test's lever: getLastGpsFix returns `mockedFix`
    // (the capture's seed), and onGpsFix hands new fixes to `gpsListeners`.
    // The watcher counts as active so the capture runs in every case.
    getLastGpsFix: vi.fn(() => mockedFix),
    onGpsFix: vi.fn((cb) => { gpsListeners.push(cb); return () => { gpsListeners = gpsListeners.filter(x => x !== cb); }; }),
    isGpsWatchActive: vi.fn(() => true),
    loadHole: vi.fn(),
    updateGPSDistances: vi.fn(),
    bindHoleNav: vi.fn(),
}));

import { AppState, mutateList } from '../../src/state.js';
import { updateDoc } from 'firebase/firestore';
import { startNewShotInput, saveShotData } from '../../src/modules/score-input.js';

function pushFix(accuracyM, { lat = -27.4140, lon = 152.9470, speedMps = null, at = Date.now() } = {}) {
    const fix = { lat, lon, accuracyM, speedMps, at };
    for (const cb of [...gpsListeners]) cb(fix);
    return fix;
}

function startRound() {
    AppState.currentUser = { uid: 'u1' };
    AppState.currentRoundHoles = 9;
    AppState.currentRoundCourseName = 'Keperra - Old Course (9 holes)';
    AppState.currentRoundTee = 'White (Men)';
    AppState.currentTrackingMode = 'detailed';
    AppState.currentHole = 1;
    AppState.activeRoundId = 'round_gps_test';
    AppState.currentLiveCompId = null;
    // Shot 1 already logged and saved (it has an id) with a drawn actual line.
    AppState.currentHoleShots = [{
        id: 'shot_1',
        hole: 1,
        shotNumber: 1,
        club: 'Dr',
        lineActual: [{ x: 0, y: 0 }, { x: 4, y: 30 }, { x: 12, y: 60 }],
        lineIntended: [{ x: 0, y: 0 }, { x: 0, y: 60 }],
        lineFrame: { origin: { lat: -27.4136, lon: 152.9465 }, bearing: 10, courseSlug: 'ashgrove', physicalHole: 1 },
    }];
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    autoId = 0;
    mockedFix = null;
    gpsListeners = [];
    startRound();
    document.body.innerHTML = `
        <div id="oncourse-wizard">
            <div id="wizard-title"></div>
            <button id="btn-wizard-delete"></button>
            <div id="section-line"><p id="line-readout"></p><span id="line-attribution"></span></div>
            <div id="section-putting-outcome"></div>
            <details id="section-swing-detail"></details>
            <div id="section-miss-pattern"></div>
            <div id="section-lie"></div>
            <div id="section-shape"></div>
            <button id="wiz-toggle-flight-unseen"></button>
            <button id="wiz-toggle-offgreen"></button>
        </div>
        <div id="gps-lock-ring" class="gps-lock-ring hidden">
            <svg width="44" height="44" viewBox="0 0 44 44">
                <circle class="gps-lock-track" cx="22" cy="22" r="18" fill="none" stroke-width="4"></circle>
                <circle class="gps-lock-arc" cx="22" cy="22" r="18" fill="none" stroke-width="4"
                    stroke-dasharray="113.1" stroke-dashoffset="113.1"></circle>
            </svg>
            <span class="gps-lock-acc"></span>
            <span class="gps-lock-hint">hold the phone still</span>
        </div>`;
});

afterEach(() => {
    vi.useRealTimers();
});

describe('S10 GPS capture chain (startNewShotInput)', () => {
    it('two good fixes accept at once: startPos set, previous shot patched, updateDoc called once with finishPos', async () => {
        mockedFix = { distM: 140, lat: -27.4140, lon: 152.9470, accuracyM: 10, at: Date.now() };
        startNewShotInput(2);
        // The wizard opens immediately; positions come when the capture decides.
        expect(AppState.currentShotData.startPos).toBeUndefined();
        pushFix(10);            // seed-class fix lands (usable, waits)
        pushFix(6);             // second good fix → convergence → accepted
        const d = AppState.currentShotData;
        expect(d.startPos).toMatchObject({ lat: -27.4140, lon: 152.9470, accuracyM: 6 });
        // Previous shot patched locally through mutateList (D-03).
        expect(AppState.currentHoleShots[0].finishPos).toEqual(d.startPos);
        // Firestore update called once with finishPos, fire-and-forget.
        await vi.advanceTimersByTimeAsync(20);
        expect(updateDoc).toHaveBeenCalledTimes(1);
        const [ref, patch] = updateDoc.mock.calls[0];
        expect(ref.id).toBe('shot_1');
        expect(patch.finishPos).toEqual(d.startPos);
        // S10: the capture metadata rides on the shot.
        expect(d.gpsCapture).toMatchObject({ state: 'accepted', platform: 'other' });
        // The lock ring is hidden again after the decision.
        expect(document.getElementById('gps-lock-ring').classList.contains('hidden')).toBe(true);
    });

    it('a lone 40 m fix refuses at window end: no positions, the readout says why', async () => {
        mockedFix = { distM: 140, lat: -27.4140, lon: 152.9470, accuracyM: 40, at: Date.now() };
        startNewShotInput(2);
        pushFix(40);
        vi.advanceTimersByTime(4000);
        expect(AppState.currentShotData.startPos).toBeUndefined();
        expect(AppState.currentShotData.startXY).toBeUndefined();
        expect(AppState.currentHoleShots[0].finishPos).toBeUndefined();
        expect(AppState.currentShotData.gpsCapture).toBeUndefined();
        await vi.advanceTimersByTimeAsync(20);
        expect(updateDoc).not.toHaveBeenCalled();
        expect(document.getElementById('line-readout').textContent).toMatch(/GPS refused/);
    });

    it('no fix at all refuses (GPS off): nothing chains, distanceToPinM unchanged', async () => {
        mockedFix = null;
        startNewShotInput(2);
        vi.advanceTimersByTime(4000);
        expect(AppState.currentShotData.startPos).toBeUndefined();
        expect(AppState.currentHoleShots[0].finishPos).toBeUndefined();
        expect(AppState.currentShotData.distanceToPinM).toBeUndefined();
        await vi.advanceTimersByTimeAsync(20);
        expect(updateDoc).not.toHaveBeenCalled();
    });

    it('a previous shot that already has finishPos is left alone', async () => {
        AppState.currentHoleShots[0].finishPos = { lat: -27.42, lon: 152.94, accuracyM: 8, at: 1 };
        mockedFix = { distM: 140, lat: -27.4140, lon: 152.9470, accuracyM: 10, at: Date.now() };
        startNewShotInput(2);
        pushFix(10);
        pushFix(6);
        expect(AppState.currentHoleShots[0].finishPos.lat).toBe(-27.42);
        await vi.advanceTimersByTimeAsync(20);
        expect(updateDoc).not.toHaveBeenCalled();
    });

    it('a moving fix (speed above the policy) is ignored; the window then refuses', () => {
        mockedFix = null;
        startNewShotInput(2);
        pushFix(6, { speedMps: 1.2 });
        vi.advanceTimersByTime(4000);
        expect(AppState.currentShotData.startPos).toBeUndefined();
        expect(AppState.currentShotData.gpsCapture).toBeUndefined();
    });

    it('a low-confidence capture (12-30 m) still chains, flagged lowConfidence', () => {
        mockedFix = { distM: 140, lat: -27.4140, lon: 152.9470, accuracyM: 25, at: Date.now() };
        startNewShotInput(2);
        pushFix(25);
        pushFix(20);
        vi.advanceTimersByTime(4000); // window ends → lowConfidence decision
        const d = AppState.currentShotData;
        expect(d.startPos).toBeDefined();
        expect(d.gpsCapture).toMatchObject({ state: 'lowConfidence', accuracyM: 20 });
        expect(AppState.currentHoleShots[0].finishPos).toEqual(d.startPos);
    });

    it('startPos and gpsCapture ride on the saved shot document', async () => {
        mockedFix = { distM: 140, lat: -27.4140, lon: 152.9470, accuracyM: 10, at: Date.now() };
        startNewShotInput(2);
        pushFix(10);
        pushFix(6);
        AppState.currentShotData.club = '3 W';
        AppState.currentShotData.missPattern = 'Short Right';
        await saveShotData();
        // The payload spread carried the chain fields (setDoc stub got them).
        const { setDoc } = await import('firebase/firestore');
        const payloadCall = setDoc.mock.calls.find(c => c[1]?.startPos);
        expect(payloadCall).toBeTruthy();
        expect(payloadCall[1].startPos.accuracyM).toBe(6);
        expect(payloadCall[1].gpsCapture.state).toBe('accepted');
        expect(payloadCall[1].startLineManual).toBeUndefined();
        // No overlay mounted in jsdom → no startXY, and that is allowed.
        expect(payloadCall[1].startXY).toBeUndefined();
    });
});
