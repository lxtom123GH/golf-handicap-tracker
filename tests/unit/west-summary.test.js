import { beforeEach, expect, it, vi } from 'vitest';
import { COURSE_DATA } from '../../src/course-data.js';
import { AppState } from '../../src/state.js';
import { roundDifferential } from '../../src/differential.js';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
import { UI } from '../../src/ui.js';
import { openFinishModal } from '../../src/oncourse.js';

const course = 'Keperra – West Course (9 holes)';
const pars = [4, 4, 4, 4, 5, 4, 3, 4, 3];
const si = [8, 3, 6, 1, 4, 2, 7, 9, 5];
// DH 10: hole 4 receives two strokes. Blob on hole 1, net par on hole 4.
const scores = [11, 5, 5, 6, 6, 5, 4, 5, 4];

beforeEach(() => {
    document.body.innerHTML = '<div id="oc-finish-modal"></div><input id="oc-finish-holes"><span id="points"></span>';
    UI.sumTotalPoints = document.getElementById('points');
    UI.ocTeeSelect = { value: '' }; // reset by a reload
    AppState.currentUser = { uid: 'west-player' };
    AppState.currentRoundCourseName = course;
    AppState.currentRoundTee = 'Blue (Men)';
    AppState.currentRoundHoles = 9;
    AppState.currentCoursePars = [...pars];
    AppState.currentHoleShots = [];
    AppState.liveRoundGroups = [{ uid: 'west-player', dailyHandicap: 10,
        scores: Object.fromEntries(scores.map((s, i) => [i + 1, s])), simpleStats: {} }];
});

it('uses the saved West stroke chart in the finish summary after reload', () => {
    openFinishModal();
    expect(UI.sumTotalPoints.textContent).toBe('16');
});

it('detects moving the extra stroke from the net-par hole to the blob', () => {
    const tee = COURSE_DATA[course]['Blue (Men)'];
    const original = tee.strokeIndex;
    try {
        tee.strokeIndex = [1, 3, 6, 8, 4, 2, 7, 9, 5];
        openFinishModal();
        expect(UI.sumTotalPoints.textContent).toBe('15');
    } finally { tee.strokeIndex = original; }
});

it('pins the West pars and nine-hole stroke chart without assuming JSON has scoring metadata', () => {
    const tee = COURSE_DATA[course]['Blue (Men)'];
    expect(tee.pars).toEqual(pars);
    expect(tee.strokeIndex).toEqual(si);
});

it('asserts raw nine-hole components without inventing an unplayed half', () => {
    const round = { adjustedGross: 44, rating: 35, slope: 131, holesPlayed: 9 };
    expect(roundDifferential(round, null)).toBe(7.8);
    expect(roundDifferential({ ...round, adjustedGross: 47 }, 18)).toBe(10.4);
});
