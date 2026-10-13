import { describe, it, expect, vi } from 'vitest';
import { calculateDailyHandicap, calculateIndex } from '../../src/whs.js';
import { roundDifferential } from '../../src/differential.js';
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {} }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
vi.mock('chart.js/auto', () => ({ default: vi.fn() }));
// GA Jan2026 §3B p9, §3H pp11–12, §5F(vii–viii) p23.
// Rounding outputs are published examples; course adapters/pairing cases are
// synthetic rule-derived fixtures, not claimed as official worked cards.
const nine = (id, d=5.35) => ({id, slope:113, rating:0, adjustedGross:d, holesPlayed:9});
const full = (id, d=20) => ({id, slope:113, rating:0, adjustedGross:d, holesPlayed:18});
describe('GA method, not expected unplayed scores', () => {
 it('keeps a nine on its own scale independently of the current index', () => {
  expect(roundDifferential(nine('a'), 10)).toBe(5.4);
  expect(roundDifferential(nine('a'), 40)).toBe(5.4);
 });
 it('six nines create three completed scores, not six scores', () => {
  const rounds = Array.from({length:6}, (_,i)=>nine(String(i),5));
  expect(calculateIndex(rounds).index).toBe('8.0');
  expect(calculateIndex(rounds).details.of).toBe(3);
 });
 it('a seventh unpaired nine cannot lower an established index', () => {
  const rounds=[nine('pending',0),...Array.from({length:6},(_,i)=>nine(String(i),5))];
  const result=calculateIndex(rounds,null,30,true);
  expect(result.index).toBe('8.0');
  expect(result.usedIds).not.toContain('pending');
 });
 it('a pair retains both original ids without mutating saved rounds', () => {
  const rounds=[full('c',30),full('b',30),nine('second',5),nine('first',5)];
  const before=structuredClone(rounds); const result=calculateIndex(rounds);
  expect(result.index).toBe('8.0');
  expect(new Set(result.usedIds)).toEqual(new Set(['first','second']));
  expect(rounds).toEqual(before);
 });
 it('category is required, rather than guessed', () => {
  expect(calculateDailyHandicap(20,113,72,72)).toBeNull();
 });
 it('applies both published consistency factors before final rounding', () => {
  expect(calculateDailyHandicap(20,113,72,72,18,'men')).toBe(19);
  expect(calculateDailyHandicap(20,113,72,72,18,'women')).toBe(19);
  expect(calculateDailyHandicap(40,113,72,72,18,'men')).toBe(37);
  expect(calculateDailyHandicap(40,113,72,72,18,'women')).toBe(39);
  expect(calculateDailyHandicap(40,113,36,36,9,'women')).toBe(19);
 });
});
