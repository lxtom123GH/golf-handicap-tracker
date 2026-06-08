# Night 1 — Llama Lens Audit (claudeCLI)
**Focus:** Offline-first resilience · IndexedDB / localStorage state syncing

**Mutation Determinism Score:** 41 / 100
**State Coupling:** High (network-dependent)

> Rationale: exactly one slice of `AppState` survives a refresh
> (`playerClubs`, via `localStorage`). Everything that matters mid-session —
> an active round, live group scores, the practice log — lives only in memory
> and only in `AppState`, with no offline mirror.

## Offline-Resilience Findings

- **`src/state.js:38-53`** — only `playerClubs` is round-tripped through
  `localStorage.getItem('golfAppClubs')`. The other 30+ keys in `initialState`
  (`currentRounds`, `liveRoundGroups`, `activeRoundId`, `currentRoundHoles`,
  `currentShotData`, …) are memory-only.
- **`src/persistence.js:94-103`** — `document.body.classList.add('round-active')`
  and screen toggles fire when a round starts, but there's no corresponding
  write to `localStorage`/`IndexedDB` for `AppState.activeRoundId` or
  `liveRoundGroups` — a refresh or crash mid-round drops the in-progress card.
- **`src/oncourse.js`** (1,684 lines — the largest module) drives the entire
  live-tracking experience off `AppState.liveRoundGroups`/`currentHoleShots`
  with no persistence checkpoint between holes.
- **`src/whs.js:148-156`** and **`src/practice.js:360-372`** — `onSnapshot`
  listeners populate `AppState.currentRounds` / `currentPracticeRounds`
  directly from Firestore with no visible cached fallback for a cold/offline
  start (no `enableIndexedDbPersistence`/cache-first read observed in
  `firebase-config.js`).
- **`src/social.js:23-31`** — `AppState.allUsersCache` is built once via
  `getDocs` and held in memory; on reconnect after a drop there's no
  invalidation/refresh trigger tied to connectivity state.

## Recommended Sync Boundary (chunk ≤100 lines)

1. Add a thin persistence adapter that mirrors `activeRoundId`,
   `liveRoundGroups`, `currentHole`, and `currentRoundHoles` to
   `localStorage` (or `IndexedDB` for larger payloads) on every `stateChange`
   event where `property` is in an explicit allow-list — the existing
   `window.addEventListener('stateChange', …)` hook (`state.js:58`) is already
   the right seam, it's just unused for this purpose.
2. On boot, before the Firestore listeners attach, hydrate `AppState` from the
   mirror so a refresh mid-round resumes instead of resetting.
