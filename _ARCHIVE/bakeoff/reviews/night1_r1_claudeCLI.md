# Night 1 — R1 Lens Audit (claudeCLI)
**Focus:** Raw reasoning · edge-case structural failures · boundary logic

**Mutation Determinism Score:** 33 / 100
**State Coupling:** Critical

> Rationale: this lens chases each finding to its worst-case interleaving. Three
> separate "two authorities controlling one outcome" patterns surfaced — each
> one is fine in isolation and breaks only at a specific timing boundary, which
> is exactly the kind of bug that survives manual testing and fails in the field.

## Boundary-Failure Chains

- **CSS specificity race.** `style.css:570-582` defines the `data-active-tab`
  exclusivity contract; `style.css:869-870` adds
  `body.round-active #tab-oncourse.hidden { display: block !important; }`.
  *Walk the edge case:* user starts a round (→ `body.round-active` set,
  `persistence.js:94`), then taps a different tab (→ `AppState.activeTab`
  changes, `ui.js:259`, but `round-active` persists until the round ends).
  Result: `#tab-oncourse` is forced visible by `!important` **while** the
  `data-active-tab` contract says a different tab owns the screen. Two
  authorities, one element, no tie-breaker.
- **Redundant-lever desync.** `auth-v2.js:25-28` and `:42-45` set *both*
  `classList.add/remove('hidden')` **and** `style.display = 'block'/'none'`
  for `btnLogin`/`btnRegister`/`registerFields` in the same branch. *Walk the
  edge case:* a future edit removes the `classList` call (looks redundant) but
  leaves `style.display` — the element now silently ignores the `.hidden` CSS
  class everywhere else in the app, because the inline style always wins.
  Same double-lever pattern repeats at `:153-157` and `:201-205` for
  `authOverlay`/`mainApp` (with the developer's own `// Force hide` /
  `// Force show` comments — i.e. the redundancy is *known* and shipped anyway).
- **Competing timers on one element.** `oncourse.js:724` schedules
  `UI.voiceOverlay.classList.add('hidden')` after 2500ms; `:727` schedules the
  *same* mutation after 2000ms from a different call path. *Walk the edge
  case:* trigger path A, then trigger path B 600ms later — B's 2000ms timer
  fires at T+2600ms and A's 2500ms timer fires at T+3100ms; the overlay hides,
  the user re-opens it, and A's stale timer hides it again 500ms later with no
  user action in between.
- **Inconsistent reactivity contract for the same operation.** `ui.js:622-623`
  does `splice` then reassigns `AppState.liveRoundGroups = [...]` to re-arm the
  proxy trap; `practice.js:370-372` does `push` with **no** reassignment.
  *Walk the edge case:* a maintainer copies the practice.js pattern into a new
  feature (it "works" because the initial `= []` reset does fire) — the bug is
  invisible until someone calls `.push` again on an already-populated array and
  wonders why the UI doesn't update.

## Structural Verdict

All four chains share one root cause: **the same intent (toggle visibility /
re-render on data change) is expressed through two different mechanisms in
different parts of the codebase**, and nothing enforces which one is canonical.
Fixing any single instance doesn't fix the class — only collapsing to one
mechanism per intent (tracked in the supermagic backlog) does.
