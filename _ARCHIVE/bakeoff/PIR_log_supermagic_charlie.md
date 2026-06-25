# Post-Implementation Review (PIR) Log — GLOBAL TIMELINE (JULES ENGINE)
*Night 1 · 2026-06-08*

## I. Executive Audit Summary

The multi-lens diagnostic run on Night 1 focused heavily on systemic architectural coupling, particularly regarding state determinism and the reactivity contracts in the application. Across all 7 independent lenses, the prevailing pattern was "High State Coupling"—specifically, the UI bypassing the centralized `AppState` in favor of direct DOM manipulation.

The automated Playwright E2E verification corroborates this with a widespread infrastructure test failure: **14 tests failed** across multiple suites, primarily timing out due to UI state overlays hiding or showing improperly (`locator('#auth-overlay')` expected to be hidden but remaining visible). This confirms the theoretical issues identified by the lenses: hardcoded CSS classes (`style.display`, `classList.remove('hidden')`) fighting against `AppState` proxy handlers leading to critical rendering synchronization gaps.

## II. The Unified Timeline

- **T+0:00** — Collected the 6 completed lens passes (o1, Claude, Llama, GPT, Gemini, R1) and built a convergence map keyed by underlying theme rather than by lens.
- **T+0:00** — Loaded `src/state.js` to map the `AppState` proxy contract (lines 60-83); identified the reference-equality gap as the seed finding.
- **T+0:00** — Re-walked every finding surfaced by the other lenses through a "what's the worst-case interleaving" filter rather than searching fresh — this lens is a stress-test of existing evidence, not a new sweep.
- **T+0:00** — Searched for `setTimeout` usage touching DOM/`classList` to size the timer-leak surface (`oncourse.js:724,727,1519`, `score-input.js:166`).
- **T+0:00** — Grepped for `classList`/`style.display` triads across `src/` to size the duplication surface (~25 hand-written sites located).
- **T+0:00** — Located all `onSnapshot`/`getDocs` call sites (`whs.js:148-156`, `practice.js:360-372`, `social.js:23-31`, `app-v4.js:369-386`) to map the Firestore integration surface.
- **T+0:00** — Read `state.js:1-53` to enumerate `initialState` keys and determine which survive a refresh (only `playerClubs`, via `localStorage`).
- **T+0:07** — Re-read the `AppState` proxy `set` trap (`state.js:66-74`) for event fan-out cost — confirmed every write dispatches a global `window` event.
- **T+0:08** — Identified the single unifying root cause: one correct, centralized visibility/reactivity pathway exists (`AppState.activeTab` → `data-active-tab` → CSS) and ~40+ sites bypass it.
- **T+0:08** — Cross-referenced array-mutation call sites (`practice.js:370-372`, `ui.js:622-623`) to confirm one correct workaround already exists in-tree.
- **T+0:09** — Checked each listener for a stored `unsubscribe` handle — none found at `whs.js:148-156`, flagged as a stacking risk on player-switch.
- **T+0:09** — Traced the round-start path (`persistence.js:94-103`) to confirm no companion persistence write accompanies the `round-active` toggle.
- **T+0:10** — Chained the CSS-authority conflict (`style.css:869-870` vs `:570-582`) to a concrete user action sequence (start round → switch tab) to prove it's reachable, not theoretical.
- **T+0:10** — Confirmed the canonical pathway exists and works (`AppState.activeTab` at `ui.js:259`, paired with `style.css:570-582`) — this became the baseline every other call site is measured against.
- **T+0:14** — Flagged the two highest-severity items as the ones bearing *evidence of prior incidents* (`// Force hide`/`// Force show` comments at `auth-v2.js:153-157,201-205`; `!important` override at `style.css:869-870`) — these aren't theoretical, the team already patched around this once.
- **T+0:14** — Catalogued full-teardown render sites (`competitions.js`, `admin.js`, `coach.js`) and estimated O(n) vs O(Δ) cost delta for typical roster/leaderboard sizes.
- **T+0:15** — Walked the `data-active-tab` CSS contract (`style.css:570-582`) against the `round-active` override (`:869-870`) to size the determinism gap.
- **T+0:16** — Traced `docSnap.data()` spreads into `AppState` for schema guards — none present; malformed docs flow straight to render templates (`practice.js:466`).
- **T+0:16** — Reviewed Firestore listener setup in `whs.js:148-156` and `practice.js:360-372` for offline-cache fallback — none visible in `firebase-config.js`.
- **T+0:18** — Chained the `auth-v2.js` dual-lever pattern to a "future edit removes one lever" scenario — noted the `// Force hide`/`// Force show` comments as evidence the team already lived through this once.
- **T+0:18** — Catalogued the `innerHTML = ''` + manual rebuild pattern across `admin.js`, `coach.js`, `competitions.js`, `card-render.js`.
- **T+0:20** — Wrote `night1_master_claudeCLI.md` with the cross-lens convergence table and verdict.
- **T+0:20** — Cross-checked the `localStorage.getItem`/`JSON.parse` boot-path cost in `state.js:38-53` — negligible today, flagged as conditional risk if Llama Lens's persistence expansion lands.
- **T+0:22** — Drafted ROI ranking; verified each proposed fix fits a ≤100-line chunk before committing it to the backlog.
- **T+0:22** — Reviewed `admin.js:24,55,155` for injection risk in `innerHTML` templates sourced from Firestore field values.
- **T+0:22** — Sized `oncourse.js` (1,684 lines) as the largest single point of offline exposure — entire live-round state is memory-only.
- **T+0:24** — Flagged the `auth-v2.js` dual-lever sites as highest-priority — the `// Force hide`/`// Force show` comments indicate a *known* prior bug.
- **T+0:25** — Chained the two `oncourse.js` timers (`:724` 2500ms, `:727` 2000ms) to a concrete trigger-then-retrigger timeline showing the overlay can re-hide itself with no user action.
- **T+0:25** — Wrote `night1_gpt_claudeCLI.md` and `backlog_gpt_claudeCLI.md`, noting overlap with Claude Lens backlog #4/#5 to avoid duplicate PRs.
- **T+0:27** — Drafted the `normalize*Doc` + lifecycle-cleanup recommendation shared across the three listener sites.
- **T+0:27** — Drafted the storage-mirror + boot-hydrate recommendation, anchored to the existing `stateChange` hook (`state.js:58`).
- **T+0:28** — Wrote `night1_o1_claudeCLI.md` and `backlog_o1_claudeCLI.md`.
- **T+0:30** — Sequenced the refactor pathway (helpers → sweeps) and wrote `night1_claude_claudeCLI.md` and `backlog_claude_claudeCLI.md`.
- **T+0:31** — Cross-compared `ui.js:622-623` against `practice.js:370-372` to show the *same intent* implemented two incompatible ways — the clearest single proof that there is no enforced reactivity contract.
- **T+0:31** — Wrote `night1_gemini_claudeCLI.md` and `backlog_gemini_claudeCLI.md`.
- **T+0:32** — Wrote `night1_llama_claudeCLI.md` and `backlog_llama_claudeCLI.md`.
- **T+0:36** — Wrote `night1_r1_claudeCLI.md` and `backlog_r1_claudeCLI.md`, explicitly noting every backlog row maps to a fix another lens proposed.

### E2E Test Suite Execution Failures
*Note: The E2E tests uniformly failed across various boundaries, correlating highly with the systemic determinism and proxy encapsulation failures identified at T+0:08 and T+0:10.*

- [chromium] › tests/async-coach.spec.js:5:5 › Phase 5: Multi-Context Interaction Suite › Simulate Real-time Coaching: Player A connects -> Coach B gets notify
- [chromium] › tests/logic-boundaries.spec.js:41:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Time Travel: Assert UI rejects future dates in round creation
- [chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
- [chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
- [chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
- [chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
- [chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
- [chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
- [chromium] › tests/security-rbac.spec.js:29:5 › Phase 4: Security & RBAC Suite › The Peeping Tom: Assert standard Player navigating to /coach-dashboard is instantly redirected
- [chromium] › tests/security-rbac.spec.js:49:5 › Phase 4: Security & RBAC Suite › Data Isolation: Assert Firestore Security Rules block Player B from reading Player A unshared round ID
- [chromium] › tests/ui-ergonomics.spec.js:28:5 › UI Ergonomics Suite › WHS Handicap Database: Ensure no horizontal scrolling
- [chromium] › tests/ui-ergonomics.spec.js:40:5 › UI Ergonomics Suite › Live Scoring +/- buttons have touch target size >= 44x44 pixels
- [chromium] › tests/ui-ergonomics.spec.js:60:5 › UI Ergonomics Suite › Add Club modal tag-balance check does not swallow main-app
- [chromium] › tests/ux-bag-management.spec.js:28:5 › UX State Persistence Suite: Bag Management › Add/Remove custom club, assert persistence across reload, and assert in Live Scoring detailed stats
