# Night 1 — o1 Lens Audit (claudeCLI)
**Focus:** Deep logic mapping · ROI of refactoring · state determinism

**Mutation Determinism Score:** 38 / 100
**State Coupling:** High

> Rationale: `AppState` is a reference-equality proxy (`src/state.js:60-83`) — it only
> announces a change when `oldValue !== value`. Several call sites mutate arrays
> in place and never trigger that trap, so "state-driven" rendering silently
> degrades into manual DOM pokes elsewhere to compensate.

## Logic-Map Findings

- **`src/state.js:60-83`** — `set` trap compares by reference. `array.push()` /
  `array.splice()` on any `AppState.*` collection produces **no** `stateChange`
  event because `target[prop] === target[prop]` after mutation.
- **`src/practice.js:370-372`** — inside the `onSnapshot` callback:
  `AppState.currentPracticeRounds = []` then `.push({...})` in a loop. The reset
  fires the trap; every subsequent `push` is invisible to subscribers — renders
  must be re-pulled manually rather than reacting.
- **`src/ui.js:622-623`** — the *correct* counter-pattern exists right here:
  `AppState.liveRoundGroups.splice(index, 1);` followed by
  `AppState.liveRoundGroups = [...AppState.liveRoundGroups];` — a deliberate
  re-assignment to re-arm the proxy trap. This is the fix pattern; it's just not
  applied uniformly (see practice.js above).
- **`src/style.css:869-870`** vs **`:570-582`** — `body.round-active
  #tab-oncourse.hidden { display: block !important; }` directly contradicts the
  `body[data-active-tab="..."] #tab-x` exclusivity contract. Two CSS authorities
  can claim the same element simultaneously.
- **`src/app-v4.js:309,313`** — `UI.addRoundContainer.style.display = 'block'/'none'`
  driven by an inline `selectedUid === AppState.currentUser.uid` check — logic that
  belongs in a derived state flag, not an event-handler side effect.

## ROI Ranking (chunked ≤100 lines each)

1. **Highest ROI / lowest risk:** Standardize the `splice` → reassign pattern from
   `ui.js:622-623` into one helper (`mutateList(stateKey, mutatorFn)`); apply to
   `practice.js:370-372` and any other in-place array writers. ~30 lines, fixes the
   single largest determinism gap.
2. **Medium ROI:** Delete the `!important` override at `style.css:869-870`; replace
   the on-course "always visible during a round" requirement with an explicit
   `data-active-tab="tab-oncourse"` state transition when a round starts
   (`persistence.js:94`). ~15 lines across two files.
3. **Lower ROI but cheap:** Replace `app-v4.js:309/313` inline `style.display`
   writes with a derived `AppState.isViewingSelf` boolean and a CSS rule keyed off
   a data attribute. ~20 lines.
