// GA January2026 §§3B and5F(vii–viii). Derived data only: never write rounds.
import { isCountingRound } from './round-validity.js';
import { roundDifferential } from './differential.js';
import { HandicapDecimal, roundHandicap } from './handicap-decimal.js';

/** Input is newest first, matching the round listener. Pair in chronological
 * order; completion takes the newer component's position in the score record.
 * Return source references only for display, without modifying either input.
 */
export function gaScoreRecord(rounds = []) {
    const completed = [], pending = [], expired = [];
    let held = null, completedWhenHeld = 0;
    for (const round of [...rounds].reverse()) {
        if (!isCountingRound(round)) continue;
        const diff = roundDifferential(round);
        if (diff === null) continue;
        if (round.holesPlayed !== 9) {
            completed.push({ id: round.id, ids: [round.id], diff, date: round.date, rounds: [round] });
            if (held && completed.length - completedWhenHeld >= 20) {
                expired.push(held.id); held = null;
            }
        } else if (!held) {
            held = round; completedWhenHeld = completed.length;
        } else {
            completed.push({ id: round.id, ids: [held.id, round.id],
                diff: roundHandicap(new HandicapDecimal(roundDifferential(held)).plus(diff)),
                date: round.date, rounds: [held, round] });
            held = null;
        }
    }
    if (held) pending.push(held.id);
    return { completed: completed.reverse(), pending, expired };
}

export function nineHoleStatus(round, record) {
    if (round.holesPlayed !== 9) return '';
    if (round.notCounting) return 'Nine-hole score excluded';
    if (record.expired.includes(round.id)) return 'Unpaired nine outside the pairing window';
    if (record.pending.includes(round.id)) return 'Pending another nine';
    const pair = record.completed.find(entry => entry.ids.length === 2 && entry.ids.includes(round.id));
    return pair ? `Nine-hole component; combined differential ${pair.diff.toFixed(1)}` : 'Nine-hole score not eligible';
}
