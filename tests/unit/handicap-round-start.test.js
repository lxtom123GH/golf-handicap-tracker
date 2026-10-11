import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    wake: vi.fn(() => Promise.resolve(null)),
    toast: vi.fn(),
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
vi.mock('../../src/wakelock.js', () => ({ applyRememberedWakeLock: mocks.wake }));
vi.mock('../../src/modules/score-input.js', () => ({ showToast: mocks.toast, startNewShotInput: vi.fn() }));

import { bindStartRound } from '../../src/modules/event-binders.js';
import { isRoundDateInFuture } from '../../src/dates.js';

const group = (uid, name = uid, extra = {}) => ({
    uid, name, scores: {}, compStats: {}, simpleStats: {}, ...extra
});

describe('on-course round-start handicap resolution', () => {
    beforeEach(() => {
        document.body.className = '';
        document.body.innerHTML = `
            <div id="oncourse-setup"></div>
            <div id="oncourse-hub"></div>
        `;
        mocks.ui.btnOcStart = document.createElement('button');
        mocks.ui.ocPlayerSelect = null;
        mocks.ui.ocCourseSelect = { value: 'test-course' };
        mocks.ui.ocTeeSelect = { value: 'test-tee' };
        mocks.ui.ocLinkComp = null;
        mocks.appState.liveRoundGroups = [group('host-uid', 'New Golfer')];
        mocks.appState.currentUser = { uid: 'host-uid' };
        mocks.appState.currentTrackingMode = 'simple';
        mocks.appState.currentRoundTee = null;
        mocks.appState.currentRoundRatings = null;
        mocks.appState.currentSideGame = null;
        mocks.appState.activeRoundId = null;
        mocks.oncourse.getPlayerHandicap.mockReset();
        mocks.oncourse.getPlayerHandicap.mockResolvedValue(null);
        mocks.mutateList.mockReset();
        mocks.mutateList.mockImplementation((key, fn) => {
            const copy = [...mocks.appState[key]];
            fn(copy);
            mocks.appState[key] = copy;
        });
        mocks.calculateDailyHandicap.mockReset();
        mocks.calculateDailyHandicap.mockImplementation((handicapIndex) => handicapIndex === null ? null : 11);
        isRoundDateInFuture.mockReset();
        isRoundDateInFuture.mockReturnValue(false);
        globalThis.confirm = vi.fn(() => true);
        globalThis.alert = vi.fn();
    });

    it('starts gross-only without prompting or inventing scratch for an unknown index', async () => {
        const startRound = bindStartRound();
        await startRound();

        expect(globalThis.confirm).not.toHaveBeenCalled();
        expect(document.body.classList.contains('round-active')).toBe(true);
        expect(mocks.appState.liveRoundGroups[0]).toMatchObject({
            handicapIndex: null,
            dailyHandicap: null,
            dailyHandicapHoles: 18,
        });
    });

    it('decision 12: keep-awake is requested inside the tap, and a refused "on" is told', async () => {
        mocks.wake.mockClear();
        mocks.wake.mockReturnValueOnce(Promise.resolve(false));
        mocks.toast.mockClear();
        const startRound = bindStartRound();
        const done = startRound();
        expect(mocks.wake).toHaveBeenCalledTimes(1); // synchronously, before any await
        expect(mocks.wake).toHaveBeenCalledWith({ gesture: true }); // may ask again in the tap
        await done;
        await new Promise(r => setTimeout(r, 0));
        expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/keep the screen awake/));
    });

    it('decision 12: Start Round starts GPS for the course of the round, after the hole loads', async () => {
        mocks.oncourse.startGpsForRound.mockClear();
        const startRound = bindStartRound();
        await startRound();
        expect(mocks.oncourse.startGpsForRound).toHaveBeenCalledTimes(1);
        expect(mocks.oncourse.startGpsForRound).toHaveBeenCalledWith('test-course');
        expect(mocks.oncourse.loadHole.mock.invocationCallOrder.at(-1))
            .toBeLessThan(mocks.oncourse.startGpsForRound.mock.invocationCallOrder[0]);
    });

    it('does not prompt once per group member when every index is unavailable', async () => {
        mocks.appState.liveRoundGroups = [
            group('host-uid', 'Host'),
            group('partner-uid', 'Partner'),
            group('guest_abc', 'Guest'),
        ];

        const startRound = bindStartRound();
        await startRound();

        expect(globalThis.confirm).not.toHaveBeenCalled();
        expect(mocks.oncourse.getPlayerHandicap).toHaveBeenCalledTimes(3);
        expect(mocks.appState.liveRoundGroups).toEqual(expect.arrayContaining([
            expect.objectContaining({ uid: 'host-uid', handicapIndex: null, dailyHandicap: null }),
            expect.objectContaining({ uid: 'partner-uid', handicapIndex: null, dailyHandicap: null }),
            expect.objectContaining({ uid: 'guest_abc', handicapIndex: null, dailyHandicap: null }),
        ]));
    });

    it('calculates an established index through round start', async () => {
        mocks.oncourse.getPlayerHandicap.mockResolvedValue(12.4);

        const startRound = bindStartRound();
        await startRound();

        expect(mocks.calculateDailyHandicap).toHaveBeenCalledWith(12.4, 113, 72, 72, 18);
        expect(mocks.mutateList).toHaveBeenCalledWith('liveRoundGroups', expect.any(Function));
        expect(mocks.appState.liveRoundGroups[0]).toMatchObject({
            handicapIndex: 12.4,
            dailyHandicap: 11,
        });
    });

    it('lets the self Daily Handicap override win without changing the index', async () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="oc-dh-override" value="0">');
        mocks.oncourse.getPlayerHandicap.mockResolvedValue(12.4);

        const startRound = bindStartRound();
        await startRound();

        expect(globalThis.confirm).not.toHaveBeenCalled();
        expect(mocks.appState.liveRoundGroups[0]).toMatchObject({
            handicapIndex: 12.4,
            dailyHandicap: 0,
        });
    });

    it('keeps an explicit player Daily Handicap of zero distinct from an unknown index', async () => {
        mocks.appState.liveRoundGroups = [group('host-uid', 'Host', { dailyHandicapOverride: 0 })];

        const startRound = bindStartRound();
        await startRound();

        expect(mocks.appState.liveRoundGroups[0]).toMatchObject({
            handicapIndex: null,
            dailyHandicap: 0,
        });
    });

    it('rejects a future date before changing round metadata', async () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="oc-round-date" value="2026-10-01">');
        mocks.appState.currentRoundTee = 'old-tee';
        mocks.appState.currentRoundRatings = { rating: 70, slope: 120, par: 72, counting: true };
        mocks.appState.currentSideGame = 'skins';
        mocks.appState.activeRoundId = 'old-round';
        mocks.oncourse.getPlayerHandicap.mockResolvedValue(12.4);
        isRoundDateInFuture.mockReturnValue(true);

        const startRound = bindStartRound();
        await startRound();

        expect(globalThis.alert).toHaveBeenCalledWith("Round date can't be in the future.");
        expect(mocks.appState.currentRoundTee).toBe('old-tee');
        expect(mocks.appState.currentRoundRatings).toEqual({ rating: 70, slope: 120, par: 72, counting: true });
        expect(mocks.appState.currentSideGame).toBe('skins');
        expect(mocks.appState.activeRoundId).toBe('old-round');
        expect(mocks.appState.liveRoundGroups).toEqual([group('host-uid', 'New Golfer')]);
        expect(mocks.oncourse.getPlayerHandicap).not.toHaveBeenCalled();
        expect(mocks.calculateDailyHandicap).not.toHaveBeenCalled();
        expect(mocks.mutateList).not.toHaveBeenCalled();
        expect(document.body.classList.contains('round-active')).toBe(false);
    });

    it('keeps self and per-player Daily Handicap overrides in the documented order', async () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="oc-dh-override" value="3">');
        mocks.appState.liveRoundGroups = [group('host-uid', 'Host', { dailyHandicapOverride: 7 })];
        mocks.oncourse.getPlayerHandicap.mockResolvedValue(12.4);

        const startRound = bindStartRound();
        await startRound();

        expect(mocks.appState.liveRoundGroups[0]).toMatchObject({
            handicapIndex: 12.4,
            dailyHandicap: 7,
        });
    });

    it.each(['matchplay', 'nassau'])('rejects %s unless the group has exactly two players', async sideGame => {
        document.body.insertAdjacentHTML('beforeend', `
            <select id="oc-side-game"><option value="${sideGame}" selected>${sideGame}</option></select>
        `);
        const originalGroups = [group('host-uid', 'Host')];
        mocks.appState.liveRoundGroups = originalGroups;

        const startRound = bindStartRound();
        await startRound();

        expect(globalThis.alert).toHaveBeenCalledWith('Match Play and Nassau need exactly 2 players in the group.');
        expect(mocks.appState.liveRoundGroups).toBe(originalGroups);
        expect(mocks.oncourse.getPlayerHandicap).not.toHaveBeenCalled();
        expect(mocks.mutateList).not.toHaveBeenCalled();
        expect(document.body.classList.contains('round-active')).toBe(false);
    });

    it('normalises a player added while handicap resolution is awaiting Firestore', async () => {
        let releaseLookup;
        const lookupPending = new Promise(resolve => { releaseLookup = resolve; });
        mocks.oncourse.getPlayerHandicap.mockImplementationOnce(async () => {
            await lookupPending;
            return null;
        });

        const startRound = bindStartRound();
        const startPromise = startRound();
        await vi.waitFor(() => expect(mocks.oncourse.getPlayerHandicap).toHaveBeenCalledWith('host-uid'));
        mocks.appState.liveRoundGroups = [
            group('host-uid', 'Host'),
            group('late-player', 'Late Player'),
        ];
        releaseLookup();
        await startPromise;

        expect(mocks.appState.liveRoundGroups[1]).toMatchObject({
            uid: 'late-player',
            handicapIndex: null,
            dailyHandicap: null,
            dailyHandicapHoles: 18,
        });
    });
});
