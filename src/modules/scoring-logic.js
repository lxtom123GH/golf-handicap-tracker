import { AppState } from '../state.js';
import { calculateHoleStableford } from '../whs.js';
import { getHoleContext, commitHoleScoreAtomic } from '../services/scoring-service.js';

export const ScoringState = {
    strokes: 0,
    putts: 0,
    holeNum: 1,
    par: 4,
    si: 1,
    dailyHandicap: 0,
    teeName: 'White'
};

export function updateSmartDefaults(holeNum, par) {
    const p = AppState.liveRoundGroups.find(g => g.uid === AppState.currentUser?.uid);
    const existing = p?.scores?.[holeNum];
    if (existing && existing > 0) {
        ScoringState.strokes = existing;
        ScoringState.putts = p?.simpleStats?.[holeNum]?.putts || 0;
    } else {
        ScoringState.strokes = par + 2;
        ScoringState.putts = 2;
    }
}

export function getLiveStableford() {
    return calculateHoleStableford(
        ScoringState.strokes,
        ScoringState.par,
        ScoringState.si,
        ScoringState.dailyHandicap
    );
}

export function adjustField(field, delta) {
    if (ScoringState[field] !== undefined) {
        ScoringState[field] = Math.max(0, ScoringState[field] + delta);
    }
}

export async function commitScore(callbacks = {}) {
    const { showToast, loadHole, closeOverlay } = callbacks;
    const uid = AppState.currentUser?.uid;
    if (!uid || !AppState.activeRoundId) return;

    try {
        await commitHoleScoreAtomic({
            uid,
            roundId: AppState.activeRoundId,
            compId: AppState.currentLiveCompId,
            holeNumber: ScoringState.holeNum,
            strokes: ScoringState.strokes,
            putts: ScoringState.putts,
            courseKey: AppState.currentRoundCourseName,
            teeName: ScoringState.teeName,
            dailyHandicap: ScoringState.dailyHandicap,
            gps: AppState.currentPos
        });

        const p = AppState.liveRoundGroups.find(x => x.uid === uid);
        if (p) {
            p.scores[ScoringState.holeNum] = ScoringState.strokes;
            if (!p.simpleStats[ScoringState.holeNum]) p.simpleStats[ScoringState.holeNum] = {};
            p.simpleStats[ScoringState.holeNum].putts = ScoringState.putts;
        }

        if (loadHole) loadHole();
        if (closeOverlay) closeOverlay();
        if (showToast) showToast('Hole saved ✓');
    } catch (e) {
        console.error('[Scoring] Commit failed:', e);
        if (showToast) showToast('Save failed.');
    }
}