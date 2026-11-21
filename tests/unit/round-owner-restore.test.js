import { beforeEach, expect, it, vi } from 'vitest';
import { bindStartRound } from '../../src/modules/event-binders.js';
import { AppState } from '../../src/state.js';
import { initializeAppRouting, presentRestoredRound } from '../../src/persistence.js';
import { initNavigation, UI } from '../../src/ui.js';
import { GOLF_APP_STATE_KEY as KEY } from '../../src/round-snapshot.js';

vi.mock('../../src/firebase-config.js', () => ({ auth: {}, db: {}, functions: {} }));

const shots = [{ id: 'shot-1', hole: 3, shotNumber: 1, club: 'Driver' }];
function snapshot(owner, player) {
    return JSON.stringify({
        activeRoundId: 'round_1000', roundOwnerUid: owner, currentHole: 3,
        currentHoleShots: shots, currentRoundCourseName: 'Keperra', currentLiveCompId: 'comp-old',
        currentLiveCompRules: [{ name: 'Birdie', pts: 2 }],
        liveRoundGroups: [{ uid: player, scores: { 1: 5 }, simpleStats: {}, compStats: {} }],
    });
}

beforeEach(() => {
    AppState.activeRoundId = null;
    AppState.roundOwnerUid = null;
    AppState.currentHole = 1;
    AppState.currentHoleShots = [];
    AppState.liveRoundGroups = [];
    AppState.currentLiveCompId = null;
    AppState.currentLiveCompRules = [];
    AppState.activeTab = null;
    localStorage.clear();
    localStorage.setItem('golfAppDefaultTab', 'tab-whs');
    document.body.className = '';
    document.body.innerHTML = '<div id="tab-whs"></div><div id="tab-oncourse"></div>';
    window.scrollTo = vi.fn();
});

// Same order as the approved auth callback and bootstrapApplication.
function bootAs(uid, json) {
    AppState.currentUser = { uid };
    localStorage.setItem(KEY, json);
    initializeAppRouting();
    initNavigation();
    presentRestoredRound(uid);
}

it.each([
    ['opted-out scorer', 'scorer', 'guest_sam'],
    ['coach who picked a student', 'coach', 'student'],
])('restores the card and current-hole shots for the %s', (_, owner, player) => {
    bootAs(owner, snapshot(owner, player));
    expect(AppState.activeRoundId).toBe('round_1000');
    expect(AppState.currentHole).toBe(3);
    expect(AppState.liveRoundGroups).toMatchObject([{ uid: player, scores: { 1: 5 } }]);
    expect(AppState.currentHoleShots).toEqual(shots);
    expect(AppState.activeTab).toBe('tab-oncourse');
    expect(document.body.classList.contains('round-active')).toBe(true);
    AppState.currentHole = 4;
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ currentHole: 4, roundOwnerUid: owner });
});

it.each([
    ['a participant in another scorer’s round', 'coach', 'student', 'student'],
    ['an ambiguous legacy round', undefined, 'guest_sam', 'scorer'],
])('leaves %s on disk and boots the preferred tab', (_, owner, player, uid) => {
    const json = snapshot(owner, player);
    bootAs(uid, json);
    expect(AppState.activeRoundId).toBeNull();
    expect(AppState.currentLiveCompId).toBeNull();
    expect(AppState.currentLiveCompRules).toEqual([]);
    expect(AppState.liveRoundGroups).toEqual([]);
    expect(AppState.currentHole).toBe(1);
    expect(AppState.activeTab).toBe('tab-whs');
    expect(document.body.classList.contains('round-active')).toBe(false);
    expect(localStorage.getItem(KEY)).toBe(json);
});

it('restores a legacy round for a member without claiming it for them', () => {
    bootAs('member', snapshot(undefined, 'member'));
    expect(AppState.activeRoundId).toBe('round_1000');
    expect(document.body.classList.contains('round-active')).toBe(true);
    expect(AppState.roundOwnerUid).toBeNull();
});

it('drops a foreign round already in memory without erasing its snapshot', () => {
    AppState.currentUser = { uid: 'coach' };
    localStorage.setItem(KEY, snapshot('coach', 'student'));
    initializeAppRouting();
    const saved = localStorage.getItem(KEY);
    presentRestoredRound('student');
    expect(AppState.activeRoundId).toBeNull();
    expect(AppState.roundOwnerUid).toBeNull();
    expect(AppState.currentLiveCompId).toBeNull();
    expect(AppState.currentRoundCourseName).toBe('');
    expect(localStorage.getItem(KEY)).toBe(saved);
});

it('keeps a replacement made in another tab through a stale autosave, pagehide and cleanup', () => {
    bootAs('coach', snapshot('coach', 'student'));
    const other = JSON.stringify({ activeRoundId: 'round_2000', roundOwnerUid: 'other' });
    localStorage.setItem(KEY, other);
    AppState.currentHole = 4;
    expect(localStorage.getItem(KEY)).toBe(other);
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEY)).toBe(other);
    AppState.activeRoundId = null;
    expect(localStorage.getItem(KEY)).toBe(other);
});

it('writes the confirmed replacement and restores it for the coach who started it', async () => {
    document.body.insertAdjacentHTML('beforeend', `
        <div id="oncourse-setup"></div><div id="oncourse-hub"></div>
        <input id="oc-stat-par" value="72">
        <select id="player"><option value="student">Student</option></select>`);
    UI.btnOcStart = document.createElement('button');
    UI.ocPlayerSelect = document.getElementById('player');
    UI.ocCourseSelect = { value: 'Custom Course' };
    UI.ocTeeSelect = { value: '' };
    AppState.currentUser = { uid: 'coach' };
    AppState.currentLiveCompId = 'stale-link';
    localStorage.setItem(KEY, snapshot('previous-scorer', 'other-player'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
        await bindStartRound()();
        expect(confirm).toHaveBeenCalledOnce();
    } finally {
        confirm.mockRestore();
    }
    const saved = localStorage.getItem(KEY);
    expect(JSON.parse(saved)).toMatchObject({
        roundOwnerUid: 'coach', currentLiveCompId: null, currentLiveCompRules: [],
        liveRoundGroups: [{ uid: 'student' }],
    });
    const newId = AppState.activeRoundId;
    expect(newId).toMatch(/^round_\d+$/);
    expect(newId).not.toBe('round_1000');
    AppState.activeRoundId = null;
    AppState.roundOwnerUid = null;
    AppState.liveRoundGroups = [];
    document.body.className = '';
    bootAs('coach', saved);
    expect(AppState.activeRoundId).toBe(newId);
    expect(document.body.classList.contains('round-active')).toBe(true);
});
