// A played round's own gross differential. A nine remains a nine; completed
// pairs are constructed by ga-score-record.js. GA Jan2026 §§3B,5F(vii).
import { grossDifferentialDecimal, roundHandicap } from './handicap-decimal.js';

// Retained export for old imports only. No invented unplayed nine under GA.
export function expectedNineDifferential() { return null; }

export function roundDifferential(round) {
    if (!round || !Number.isFinite(round.slope) || round.slope <= 0) return null;
    if (!Number.isFinite(round.adjustedGross) || !Number.isFinite(round.rating)) return null;
    return roundHandicap(grossDifferentialDecimal(round));
}
