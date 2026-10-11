import { countCountingRounds, countPerformanceRounds, countCountingHoles, INITIAL_INDEX_HOLES } from './round-validity.js';

const UNLOCK_ROUNDS = 3;

const FEATURE_COPY = {
    trend: 'A handicap trend chart showing your differentials over time.',
    index: 'A plain-language breakdown of which scores count, adjustments, and caps.',
    performance: 'Your putts, greens in regulation and fairways compared with typical figures for your handicap.'
};

const FEATURE_PROGRESS_LABEL = {
    trend: 'counting rounds',
    index: 'counting rounds',
    performance: 'rounds with putts logged'
};

export function coldStartPreview(rounds = [], feature) {
    if (feature === 'index') {
        // The index unlocks on holes (54), the same count calculateIndex uses.
        const holes = Math.min(INITIAL_INDEX_HOLES, countCountingHoles(rounds));
        return `<div class="explainer cold-start-preview">
        <p><strong>${holes} of ${INITIAL_INDEX_HOLES} counting holes</strong> · ${INITIAL_INDEX_HOLES - holes} to go</p>
        <p><strong>What this unlocks · after ${INITIAL_INDEX_HOLES} counting holes (any mix of 9s and 18s)</strong><br>${FEATURE_COPY.index}</p>
    </div>`;
    }
    const count = feature === 'performance' ? countPerformanceRounds : countCountingRounds;
    const logged = Math.min(UNLOCK_ROUNDS, count(rounds));
    const progressLabel = FEATURE_PROGRESS_LABEL[feature] || 'eligible rounds';
    const unlockCopy = FEATURE_COPY[feature] || 'More personal analytics based on your logged rounds.';
    return `<div class="explainer cold-start-preview">
        <p><strong>${logged} of ${UNLOCK_ROUNDS} ${progressLabel}</strong> · ${UNLOCK_ROUNDS - logged} to go</p>
        <p><strong>What this unlocks · after ${UNLOCK_ROUNDS} ${progressLabel}</strong><br>${unlockCopy}</p>
    </div>`;
}
