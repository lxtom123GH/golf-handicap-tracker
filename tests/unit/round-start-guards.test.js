import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    appState: {
        currentUser: { uid: 'host-uid' },
        liveRoundGroups: [],
        currentRoundHoles: 9,
        currentTrackingMode: 'simple',
        currentHole: 1,
        currentRoundTee: null,
        currentRoundRatings: null,
        currentRoundDate: null,
        currentSideGame: null,
        currentLiveCompId: null,
        currentLiveCompRules: [],
        currentHoleShots: [],
        currentCoursePars: [],
        activeRoundId: null,
        roundSelfOptOut: false,
    },
    mutateList: vi.fn(),
    ui: {},
    calculateDailyHandicap: vi.fn((handicapIndex) => handicapIndex === null ? null : 11),
    oncourse: {
        resolveRoundRatings: vi.fn(() => ({ rating: 72, slope: 113, par: 72, counting: true })),
        getPlayerHandicap: vi.fn(async () => null),
        bindHoleNav: vi.fn(),
        loadHole: vi.fn(),
        startGpsForRound: vi.fn(),
    },
}));

vi.mock('../../src/state.js', () => ({ AppState: mocks.appState, mutateList: mocks.mutateList }));
vi.mock('../../src/ui.js', () => ({ UI: mocks.ui }));
vi.mock('../../src/oncourse.js', () => mocks.oncourse);
vi.mock('../../src/whs.js', () => ({ calculateDailyHandicap: mocks.calculateDailyHandicap }));
vi.mock('../../src/course-data.js', () => ({
    holesForPar: vi.fn(() => 18),
    holesForCourse: vi.fn(() => 18),
}));
vi.mock('../../src/dates.js', () => ({
    localToday: vi.fn(() => '2026-09-28'),
    isRoundDateInFuture: vi.fn(() => false),
}));
vi.mock('../../src/guests.js', () => ({ isGuestId: vi.fn(() => false) }));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: vi.fn(),
    loadCourseOverlay: vi.fn(),
}));
vi.mock('../../src/shot-entry.js', () => ({
    normaliseShotEntry: vi.fn(),
    shotEntryVisibility: vi.fn(),
}));
vi.mock('../../src/modules/card-render.js', () => ({ renderHoleJumper: vi.fn() }));

import { bindStartRound, rememberRoundSetup, updateDhPreview } from '../../src/modules/event-binders.js';
import { isGuestId as guestIds } from '../../src/guests.js';

// Codex review of the quick-start PR (owner 2026-10-05): the guards around
// Start Round that the one-tap Play again card depends on.

const group = (uid, name = uid, extra = {}) => ({
    uid, name, scores: {}, compStats: {}, simpleStats: {}, ...extra
});

beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = `
        <div id="oncourse-setup"></div><div id="oncourse-hub"></div>
        <select id="oc-course-select"><option value="A">A</option><option value="B">B</option></select>
        <select id="oc-tee-select"><option value="T">T</option></select>
        <div id="oc-dh-value"></div><input id="oc-dh-override" value="">`;
    mocks.ui.btnOcStart = document.createElement('button');
    mocks.ui.ocPlayerSelect = null;
    mocks.ui.ocCourseSelect = { value: 'test-course' };
    mocks.ui.ocTeeSelect = { value: 'test-tee' };
    mocks.ui.ocLinkComp = null;
    mocks.appState.currentUser = { uid: 'host-uid' };
    mocks.appState.liveRoundGroups = [group('host-uid', 'Host')];
    mocks.appState.currentTrackingMode = 'detailed';
    mocks.oncourse.getPlayerHandicap.mockReset();
    mocks.oncourse.updateModeVisibility = vi.fn();
    mocks.mutateList.mockReset();
    mocks.mutateList.mockImplementation((key, fn) => {
        const copy = [...mocks.appState[key]];
        fn(copy);
        mocks.appState[key] = copy;
    });
    mocks.calculateDailyHandicap.mockReset();
    mocks.calculateDailyHandicap.mockImplementation((hi) => (hi === null ? null : 11));
    globalThis.alert = vi.fn();
    localStorage.clear();
});

describe('Start Round runs one at a time', () => {
    it('a second tap while the first is resolving handicaps does not start a second round', async () => {
        let release;
        mocks.oncourse.getPlayerHandicap.mockImplementation(() => new Promise(r => { release = r; }));
        const startRound = bindStartRound();
        const first = startRound();
        const second = startRound();
        expect(second).toBe(first);
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(startRound()).toBe(first); // still in flight
        release(10);
        await first;
        expect(mocks.oncourse.getPlayerHandicap).toHaveBeenCalledTimes(1);
        // …and once settled, the next tap works again.
        mocks.oncourse.getPlayerHandicap.mockResolvedValue(10);
        await startRound();
        expect(mocks.oncourse.getPlayerHandicap).toHaveBeenCalledTimes(2);
    });
});

// Simplify C19: Start Round always includes you, even with a guest showing
// in the player dropdown that was never added.
describe('Start Round with nobody added yet', () => {
    beforeEach(() => guestIds.mockImplementation(uid => String(uid).startsWith('guest_')));
    afterEach(() => guestIds.mockImplementation(() => false));
    const dropdownShowing = (uid, name) => {
        const sel = document.createElement('select');
        sel.innerHTML = `<option value="host-uid">Host</option><option value="${uid}">${name}</option>`;
        sel.value = uid;
        mocks.ui.ocPlayerSelect = sel;
    };

    it('starts the round with you, not the guest the dropdown shows', async () => {
        mocks.appState.liveRoundGroups = [];
        mocks.appState.roundSelfOptOut = false;
        dropdownShowing('guest_sam', 'Sam');
        await bindStartRound()();
        expect(mocks.appState.liveRoundGroups.map(p => p.uid)).toEqual(['host-uid']);
        expect(mocks.appState.liveRoundGroups[0].name).toBe('Host');
        expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it('a coach who picked a student account (not a guest) still starts that student\'s round', async () => {
        mocks.appState.liveRoundGroups = [];
        mocks.appState.roundSelfOptOut = false;
        dropdownShowing('student-uid', 'Student');
        await bindStartRound()();
        expect(mocks.appState.liveRoundGroups.map(p => p.uid)).toEqual(['student-uid']);
    });

    it('asks for a player when you removed yourself and nobody else is in', async () => {
        mocks.appState.liveRoundGroups = [];
        mocks.appState.roundSelfOptOut = true;
        mocks.oncourse.resolveRoundRatings.mockClear();
        dropdownShowing('guest_sam', 'Sam');
        try {
            await bindStartRound()();
        } finally {
            mocks.appState.roundSelfOptOut = false;
        }
        expect(mocks.appState.liveRoundGroups).toEqual([]);
        expect(globalThis.alert).toHaveBeenCalledWith('Please add at least one player to track.');
        expect(mocks.oncourse.resolveRoundRatings).not.toHaveBeenCalled();
    });
});

describe('rememberRoundSetup', () => {
    it('stores course, tee, length, mode and the other players — never a handicap', () => {
        mocks.appState.liveRoundGroups = [
            group('host-uid', 'Host', { dailyHandicap: 11 }),
            group('guest_sam', 'Sam', { isGuest: true, dailyHandicapOverride: 18 }),
        ];
        rememberRoundSetup('Keperra - Old (1-18)', 'Blue (Men)', 18);
        const raw = localStorage.getItem('golf.lastSetup.host-uid');
        const saved = JSON.parse(raw).setups[0];
        expect(saved).toMatchObject({
            course: 'Keperra - Old (1-18)', tee: 'Blue (Men)', holes: 18, mode: 'detailed', selfIncluded: true,
            players: [{ uid: 'guest_sam', name: 'Sam', isGuest: true }],
        });
        expect(raw).not.toMatch(/[Hh]andicap/);
    });

    it('records that you sat out', () => {
        mocks.appState.liveRoundGroups = [group('friend', 'Jo')];
        rememberRoundSetup('Ashgrove GC', 'Blue (Men)', 18);
        expect(JSON.parse(localStorage.getItem('golf.lastSetup.host-uid')).setups[0].selfIncluded).toBe(false);
    });
});

describe('daily handicap preview', () => {
    it("a preview for the old course never lands after the course changed (it would read as today's override)", async () => {
        let release;
        mocks.oncourse.getPlayerHandicap.mockImplementation(() => new Promise(r => { release = r; }));
        const sel = document.getElementById('oc-course-select');
        sel.value = 'A';
        const pending = updateDhPreview();
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        sel.value = 'B'; // Play again (or the player) moved on
        release(20);
        await pending;
        expect(document.getElementById('oc-dh-override').value).toBe('');
        expect(mocks.oncourse.resolveRoundRatings).not.toHaveBeenCalledWith('A', 'T');
    });

    it('still writes when nothing changed', async () => {
        mocks.oncourse.getPlayerHandicap.mockResolvedValue(20);
        document.getElementById('oc-course-select').value = 'A';
        await updateDhPreview();
        expect(document.getElementById('oc-dh-override').value).toBe('11');
    });
});
