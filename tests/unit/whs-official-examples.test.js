import { describe, it, expect, vi } from 'vitest';
import {
  calculateIndex, calculateDailyHandicap, calculateHoleStableford,
  convertStablefordToAGS, expectedNineDifferential,
} from '../../src/whs.js';
import { strokesReceived } from '../../src/stroke-allocation.js';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {} }));
vi.mock('../../src/ui.js', () => ({ UI: {} }));
vi.mock('chart.js/auto', () => ({ default: vi.fn() }));

// Official numerical examples only. These are synthetic adapters for published
// DIFFERENTIALS, not invented official course ratings or real player records.
// With slope=113 and rating=72, the production formula reproduces the given SD.
const roundsFromDiffs = ds => ds.map((diff, i) => ({
  id: `official-example-${i}`, slope: 113, rating: 72,
  adjustedGross: 72 + diff, holesPlayed: 18,
}));
const twentyAt = diff => roundsFromDiffs(Array(20).fill(diff));

// Sources checked 2026-10-10. USGA numerical text was available in the search
// index; direct fetches returned HTTP 403. GA PDFs were downloaded/read.
// A: USGA 2024 nine-hole FAQ, "example ... converted" (HI14, SD7.2 ->15.7).
// https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/2024-revision/2024-treatment-of-9-hole-scores-FAQ.html
// B: GA WHS changes, updated 25 Sep 2019, p2, daily-handicap worked example.
// https://archive.golf.org.au/wp-content/uploads/2020/11/00045961-source.pdf
// C: GA Jan2026 guide, section10C p45, plus DH+2: give back on SI18 and17.
// https://static.golf.com.au/clubs/1000/uploads/resources/whs%20reference%20guide%20for%20australian%20administrators%20%281-1-2026%29.pdf
// D: USGA 2024 Rules, Diagram3.1b, printed p38: DH16, gross88, AGS86.
// https://www.usga.org/content/dam/usga/pdf/2024-revision/2024-Rules-of-Handicapping-USGA.pdf
// E: USGA cap worked examples (Rule5.8), soft and hard sections.
// https://www.usga.org/content/usga/home-page/handicapping/roh/Content/rules/Committee%20Content/USGA/LG_R5b.htm
// F: USGA Rule5.2a, clarifications5.2a/1 and5.2a/2 (printed p55 in D).
// https://www.usga.org/content/usga/home-page/handicapping/roh/Content/rules/5%202a%20For%20Fewer%20Than%2020%20Scores.htm

// Scope: this does NOT certify Australian jurisdiction compatibility. Current
// GA2026 section3H p11 adds a consistency factor absent from this app; section
// 5F(vii) p23 combines two nines, unlike the USGA expected-nine approach below.
// A single matching example does not establish 0.52*HI+1.2 as the official
// expected-score algorithm. Missing-HI doubling also remains unverified.
// PCC is intentionally not exercised or changed. src/ is untouched.
describe('Official worked examples — limited conformance, not certification', () => {
  it('A: HI14 expected nine rounds to8.5; played7.2 yields15.7', () => {
    const expected = expectedNineDifferential(14.0);
    expect(Math.round(expected * 10) / 10).toBe(8.5);
    expect(Math.round((7.2 + expected) * 10) / 10).toBe(15.7);
  });

  it('B: historical GA daily example HI15.2/slope124/rating72/par70 ->17', () => {
    // Historical 2020 convention, not the complete current GA2026 formula.
    expect(calculateDailyHandicap(15.2, 124, 72, 70)).toBe(17);
  });

  it('C: plus2 gives strokes only on SI17 and18', () => {
    const allocated = Array.from({ length: 18 }, (_, i) => strokesReceived(-2, i + 1));
    expect(allocated).toEqual([...Array(16).fill(0), -1, -1]);
  });

  it('D: official18-hole card converts Stableford to AGS86 (gross88)', () => {
    const pars = [4,4,4,3,4,5,3,4,4,3,4,5,3,4,5,3,4,4];
    const si = [7,13,3,15,11,1,17,5,9,18,12,4,14,8,2,16,6,10];
    const gross = [5,5,6,4,5,5,3,5,5,3,4,6,4,5,5,3,9,6];
    const points = gross.reduce((sum, score, i) =>
      sum + calculateHoleStableford(score, pars[i], si[i], 16), 0);
    // 36 points is derived from this published card, not a separate example.
    expect(gross.reduce((a, b) => a + b, 0)).toBe(88);
    expect(points).toBe(36);
    expect(convertStablefordToAGS(points, 16, 70, 18)).toBe(86);
  });

  it('D: hole17 gross9 is limited to NDB7 through zero Stableford', () => {
    // Same published card: par4, SI6, DH16 => one stroke; NDB=4+2+1=7.
    expect(strokesReceived(16, 6)).toBe(1);
    expect(calculateHoleStableford(9, 4, 6, 16)).toBe(0);
    expect(calculateHoleStableford(7, 4, 6, 16)).toBe(0);
  });

  it('E: soft cap average11.6/low6.5 rounds10.55 to10.6', () => {
    // All20 supplied SDs equal the official published best8 average.
    // No exceptional-score/committee override is part of this example.
    expect(calculateIndex(twentyAt(11.6), 6.5).index).toBe('10.6');
  });

  it('E: hard cap average18.2/low10.2 ->15.2', () => {
    expect(calculateIndex(twentyAt(18.2), 10.2).index).toBe('15.2');
  });

  it('F: initial15.3/15.2/16.6 ->13.2 before committee discretion', () => {
    expect(calculateIndex(roundsFromDiffs([15.3, 15.2, 16.6])).index).toBe('13.2');
  });

  it('F: initial40.7/42.4/36.1 ->34.1', () => {
    expect(calculateIndex(roundsFromDiffs([40.7, 42.4, 36.1])).index).toBe('34.1');
  });

  it('F: six-score example ->37.4 before discretionary removal of adjustment', () => {
    expect(calculateIndex(roundsFromDiffs([45.0, 43.6, 45.9, 36.1, 42.4, 40.7])).index).toBe('37.4');
  });
});
