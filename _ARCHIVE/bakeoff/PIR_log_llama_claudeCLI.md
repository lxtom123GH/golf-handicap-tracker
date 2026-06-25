# PIR Log — Llama Lens (claudeCLI)
*Night 1 · 2026-06-08*

- **T+0:00** — Read `state.js:1-53` to enumerate `initialState` keys and
  determine which survive a refresh (only `playerClubs`, via `localStorage`).
- **T+0:09** — Traced the round-start path (`persistence.js:94-103`) to
  confirm no companion persistence write accompanies the `round-active` toggle.
- **T+0:16** — Reviewed Firestore listener setup in `whs.js:148-156` and
  `practice.js:360-372` for offline-cache fallback — none visible in
  `firebase-config.js`.
- **T+0:22** — Sized `oncourse.js` (1,684 lines) as the largest single point
  of offline exposure — entire live-round state is memory-only.
- **T+0:27** — Drafted the storage-mirror + boot-hydrate recommendation,
  anchored to the existing `stateChange` hook (`state.js:58`).
- **T+0:32** — Wrote `night1_llama_claudeCLI.md` and `backlog_llama_claudeCLI.md`.
- **Status:** Complete. Score: 41/100 Determinism, High Coupling (network-dependent).
