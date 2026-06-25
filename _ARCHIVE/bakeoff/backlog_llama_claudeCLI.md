# Backlog — Llama Lens (claudeCLI)
*Offline-first / sync focus. Each fix sized to fit a ≤100-line PR chunk.*

| # | Target | Violation | Impact | Fix (chunk) |
|---|---|---|---|---|
| 1 | `state.js:38-53` | Only `playerClubs` is mirrored to `localStorage`; ~30 other `initialState` keys are memory-only | Refresh/crash mid-session loses everything except club config | Add an explicit allow-list (`activeRoundId`, `liveRoundGroups`, `currentHole`, `currentRoundHoles`, `currentRoundCourseName`) mirrored on `stateChange` (~50 lines, uses existing hook at `state.js:58`) |
| 2 | `persistence.js:94-103` | `round-active` DOM class set on round start with no companion persistence write | An in-progress round has zero durability | Hook the round-start transition to write the allow-listed keys from #1 to storage (~20 lines) |
| 3 | App boot path (no file owns this today) | No hydrate-from-storage step before Firestore listeners attach | Cold/offline start always begins from `initialState` defaults, ignoring any locally mirrored round | Add a `hydrateFromStorage()` call before `whs.js`/`practice.js` listener setup (~25 lines) |
| 4 | `whs.js:148-156`, `practice.js:360-372` | `onSnapshot` populates state directly with no cached-read fallback | Cold start with no network shows empty lists instead of last-known data | Confirm/enable Firestore's offline persistence in `firebase-config.js`; verify the snapshot's `fromCache` metadata is handled (~30 lines) |
| 5 | `social.js:23-31` | `allUsersCache` built once via `getDocs`, no connectivity-aware refresh | Stale roster after a reconnect; no signal to re-fetch | Add an `online`/`stateChange` listener that invalidates `allUsersCache` on reconnect (~20 lines) |

## Sequencing
1 → 2 → 3 (these three form one coherent "resume mid-round" feature) → 4 → 5
