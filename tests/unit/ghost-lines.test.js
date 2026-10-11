import { describe, it, expect } from 'vitest';
import { selectGhostShots } from '../../src/modules/ghost-lines.js';

function line(id) {
  return [
    [id, 0],
    [id + 1, 1],
  ];
}

function shot(id, overrides = {}) {
  return {
    shotNumber: 1,
    roundId: `round-${id}`,
    lineIntended: line(id),
    lineActual: line(id + 100),
    ...overrides,
  };
}

describe('selectGhostShots', () => {
  it('selects the five most recent valid tee-shot intended lines in input order', () => {
    const tees = Array.from({ length: 7 }, (_, index) => shot(index));
    const shots = [
      shot(90, { shotNumber: 2 }),
      tees[0],
      shot(91, { lineIntended: [] }),
      tees[1],
      shot(92, { lineIntended: null }),
      ...tees.slice(2),
    ];

    expect(selectGhostShots(shots, 3, null)).toEqual({
      intended: tees.slice(0, 5).map((entry) => entry.lineIntended),
      actual: [],
    });
  });

  it('selects the five most recent valid same-shot-number actual lines', () => {
    const matching = Array.from({ length: 7 }, (_, index) =>
      shot(index, { shotNumber: 3 }),
    );
    const shots = [
      shot(90, { shotNumber: 2 }),
      matching[0],
      shot(91, { shotNumber: 3, lineActual: [] }),
      matching[1],
      shot(92, { shotNumber: 3, lineActual: null }),
      ...matching.slice(2),
      shot(93, { shotNumber: 4 }),
    ];

    expect(selectGhostShots(shots, 3, null)).toEqual({
      intended: [],
      actual: matching.slice(0, 5).map((entry) => entry.lineActual),
    });
  });

  it('excludes every current-round shot from both lists before applying caps', () => {
    const historicalTees = Array.from({ length: 6 }, (_, index) => shot(index));
    const historicalActuals = Array.from({ length: 6 }, (_, index) =>
      shot(index + 20, { shotNumber: 2 }),
    );
    const shots = historicalTees.flatMap((tee, index) => [
      shot(index + 40, { roundId: 'active' }),
      tee,
      shot(index + 60, { roundId: 'active', shotNumber: 2 }),
      historicalActuals[index],
    ]);

    expect(selectGhostShots(shots, 2, 'active')).toEqual({
      intended: historicalTees.slice(0, 5).map((entry) => entry.lineIntended),
      actual: historicalActuals.slice(0, 5).map((entry) => entry.lineActual),
    });
  });

  it('skips malformed entries without throwing', () => {
    const validTee = shot(1, { lineActual: undefined });
    const validActual = shot(2, {
      shotNumber: 2,
      lineIntended: null,
    });
    const malformed = [
      null,
      undefined,
      false,
      42,
      'shot',
      [],
      {},
      { roundId: 'missing-shot-number', lineIntended: line(3) },
      { shotNumber: 1, lineIntended: line(4) },
      shot(5, { shotNumber: '1' }),
      shot(6, { shotNumber: NaN }),
      shot(7, { shotNumber: Infinity }),
      shot(8, { roundId: 123 }),
      shot(9, { roundId: null }),
      shot(10, { lineIntended: 'not an array' }),
      shot(11, { lineIntended: [[1]] }),
      shot(12, { lineIntended: [[1, '2']] }),
      shot(13, { lineIntended: [null] }),
      shot(14, { lineIntended: [[1, Infinity]] }),
      shot(15, { shotNumber: 2, lineActual: {} }),
      shot(16, { shotNumber: 2, lineActual: [[1, 2, 3]] }),
      shot(17, { lineIntended: undefined }),
      shot(18, { shotNumber: 2, lineActual: undefined }),
    ];
    const shots = [...malformed, validTee, validActual];

    expect(() => selectGhostShots(shots, 2, null)).not.toThrow();
    expect(selectGhostShots(shots, 2, null)).toEqual({
      intended: [validTee.lineIntended],
      actual: [validActual.lineActual],
    });
  });

  it('returns empty lists for empty input', () => {
    expect(selectGhostShots([], 2, null)).toEqual({
      intended: [],
      actual: [],
    });
  });

  it('returns no actual lines when currentShotNumber is 1', () => {
    const tee = shot(1);

    expect(selectGhostShots([tee, shot(2, { shotNumber: 2 })], 1, null)).toEqual({
      intended: [tee.lineIntended],
      actual: [],
    });
  });

  it('does not mutate the input or its nested lines', () => {
    const tee = shot(1);
    const approach = shot(2, { shotNumber: 2 });
    const shots = [tee, approach];

    for (const entry of shots) {
      for (const entryLine of [entry.lineIntended, entry.lineActual]) {
        entryLine.forEach(Object.freeze);
        Object.freeze(entryLine);
      }
      Object.freeze(entry);
    }
    Object.freeze(shots);

    expect(selectGhostShots(shots, 2, null)).toEqual({
      intended: [tee.lineIntended],
      actual: [approach.lineActual],
    });
    expect(shots).toEqual([tee, approach]);
  });

describe('S7 rebase: stored {x,y} object lines are accepted (firestore shape)', () => {
  it('normalises object points to pairs and keeps the shot', () => {
    const shots = [
      { shotNumber: 1, roundId: 'r-old', lineIntended: [{ x: 0, y: 0 }, { x: 0, y: 40 }] },
    ];
    const out = selectGhostShots(shots, 1, 'r-current');
    expect(out.intended).toEqual([[[0, 0], [0, 40]]]);
  });
});
});
