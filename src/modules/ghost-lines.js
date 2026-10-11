// Stored lines are [{x, y}...] objects (the Firestore shape, S3-era); the
// renderer wants [[x, y]...] pairs. Accept either — the trial's version only
// accepted pairs, so every real stored line failed validation and ghosts
// never rendered (checkpoint: field-shape mismatch, fixed by normalising).
function linePoints(line) {
  if (!Array.isArray(line) || line.length === 0) return null;
  const pts = [];
  for (const p of line) {
    if (
      Array.isArray(p) &&
      p.length === 2 &&
      p.every((c) => typeof c === 'number' && Number.isFinite(c))
    ) {
      pts.push([p[0], p[1]]);
    } else if (
      p &&
      typeof p === 'object' &&
      !Array.isArray(p) &&
      typeof p.x === 'number' &&
      Number.isFinite(p.x) &&
      typeof p.y === 'number' &&
      Number.isFinite(p.y)
    ) {
      pts.push([p.x, p.y]);
    } else {
      return null;
    }
  }
  return pts;
}

export function selectGhostShots(shots, currentShotNumber, activeRoundId) {
  const intended = [];
  const actual = [];

  if (!Array.isArray(shots)) {
    return { intended, actual };
  }

  for (const shot of shots) {
    if (
      shot === null ||
      typeof shot !== 'object' ||
      Array.isArray(shot) ||
      typeof shot.shotNumber !== 'number' ||
      !Number.isFinite(shot.shotNumber) ||
      typeof shot.roundId !== 'string' ||
      shot.roundId === activeRoundId
    ) {
      continue;
    }

    if (
      intended.length < 5 &&
      shot.shotNumber === 1 &&
      linePoints(shot.lineIntended)
    ) {
      intended.push(linePoints(shot.lineIntended));
    }

    if (
      currentShotNumber !== 1 &&
      actual.length < 5 &&
      shot.shotNumber === currentShotNumber &&
      linePoints(shot.lineActual)
    ) {
      actual.push(linePoints(shot.lineActual));
    }

    if (
      intended.length === 5 &&
      (currentShotNumber === 1 || actual.length === 5)
    ) {
      break;
    }
  }

  return { intended, actual };
}
