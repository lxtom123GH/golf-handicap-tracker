// Sydney Protocol: src/services/scoring-service.js
// Locale: en-AU (Australian Standard)
// Status: [NEW] Atomic scoring sync for personal + competition rounds.

import { db } from '../firebase.js';
import { writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { COURSE_DATA } from '../course-data.js';
import { calculateHoleStableford } from '../whs.js';

/**
 * Resolves par and stroke index for a given hole based on COURSE_DATA.
 * Handles Keperra 27-hole combinations via the precomputed strokeIndex arrays.
 */
export function getHoleContext(courseKey, teeName, holeNumber) {
  const course = COURSE_DATA[courseKey];
  if (!course) return null;

  const teeData = course[teeName];
  if (!teeData) return null;

  const idx = holeNumber - 1;
  const par = Array.isArray(teeData.pars) ? (teeData.pars[idx] || 4) : (teeData.par || 4);
  const strokeIndex = Array.isArray(teeData.strokeIndex)
    ? (teeData.strokeIndex[idx] || (idx + 1))
    : (idx + 1);

  return { par, strokeIndex, teeData };
}

/**
 * Calculates Stableford and prepares a payload for a single hole.
 */
export function buildHolePayload(opts) {
  const {
    uid,
    roundId,
    holeNumber,
    strokes,
    putts,
    courseKey,
    teeName,
    dailyHandicap,
    gps
  } = opts;

  const ctx = getHoleContext(courseKey, teeName, holeNumber);
  if (!ctx) {
    throw new Error(`[Scoring] Invalid course/tee combination for ${courseKey} / ${teeName}`);
  }

  const points = calculateHoleStableford(
    strokes,
    ctx.par,
    ctx.strokeIndex,
    dailyHandicap
  );

  return {
    uid,
    roundId,
    hole: holeNumber,
    strokes,
    putts,
    par: ctx.par,
    strokeIndex: ctx.strokeIndex,
    stableford: points,
    dailyHandicap,
    courseKey,
    teeName,
    gps: gps || null,
    updatedAt: serverTimestamp()
  };
}

/**
 * Atomically commits a scored hole to both the personal and competition collections.
 * Paths:
 *  - users/{uid}/rounds/{roundId}/holes/{holeNumber}
 *  - competitions/{compId}/leaderboard/{uid}
 */
export async function commitHoleScoreAtomic(options) {
  const { uid, roundId, compId, holeNumber } = options;
  if (!uid || !roundId || !holeNumber) {
    throw new Error('[Scoring] Missing uid, roundId or holeNumber for commit.');
  }

  const holeDocId = String(holeNumber);
  const holePayload = buildHolePayload(options);

  const batch = writeBatch(db);

  const personalRef = doc(
    db,
    'users',
    uid,
    'rounds',
    roundId,
    'holes',
    holeDocId
  );

  batch.set(personalRef, holePayload, { merge: true });

  if (compId) {
    const compRef = doc(
      db,
      'competitions',
      compId,
      'leaderboard',
      uid
    );

    batch.set(
      compRef,
      {
        uid,
        roundId,
        lastHole: holeNumber,
        lastStableford: holePayload.stableford,
        totalStrokes: strokesSafe(options.strokes),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  await batch.commit();
}

function strokesSafe(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Offline Resilience Note:
// Firestore has already been initialised with persistentLocalCache + IndexedDB
// in firebase.js, so these writes will queue locally when offline and
// automatically synchronise once connectivity returns (including Keperra's back 9).

