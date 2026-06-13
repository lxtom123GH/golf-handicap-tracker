# Golf Handicap Tracker — Technical Debt Catalogue
**Last updated:** June 8 2026 | **Source:** Code audit + June 2026 feature audit session

---

## How to Read This Document
- 🔴 **Critical** — Causing active bugs or will cause bugs soon
- 🟡 **Important** — Slowing development, causing confusion, or masking issues
- 🟢 **Nice to Fix** — Cleanup, maintainability, future-proofing
- ✅ **Resolved** — Fixed and merged

---

## CSS Debt

### [CSS-01] ✅ Duplicate `.hidden` class definitions
**Resolved June 8 2026** — Consolidated to single `display: none !important` definition. Second instance (with `visibility: hidden !important`) deleted.

### [CSS-02] ✅ `.hidden` class previously had multiple properties
**Resolved prior session** — `.hidden` now uses `display: none !important` only. `visibility: hidden` and `pointer-events: none` removed.

### [CSS-03] ✅ Duplicate `.tab-content` definition
**Resolved June 8 2026** — Consolidated to single definition. `padding-bottom: 120px` preserved in surviving block.

### [CSS-04] ✅ Duplicate `.tabs-container` definition
**Resolved June 8 2026** — Consolidated to single `position: fixed !important` definition.

### [CSS-05] ✅ Duplicate active tab selector block
**Resolved June 8 2026** — Consolidated into one complete selector block covering all tabs including `tab-whs`, `tab-comp`, `tab-tempo`, and `oc-locker-room`.

---

## State Management Debt

### [STATE-01] 🔴 `setPracticeState()` not wired to AppState
**What:** `setPracticeState()` in `src/ui.js` directly manipulates DOM class names with no connection to `AppState`.
**Why it matters:** State can get out of sync with the UI. No single source of truth for active practice state.
**Fix:** Add `practiceState` property to `src/state.js`. Refactor `setPracticeState()` to drive from AppState. Add `stateChange` listener case.

### [STATE-02] 🟡 Multiple state containers toggled imperatively
**What:** `#practice-state-empty`, `#practice-state-active`, `#practice-state-loading` shown/hidden by toggling `.hidden` individually.
**Why it matters:** If a function throws between toggle calls, two containers can be visible simultaneously.
**Fix:** Centralise through AppState (see STATE-01).

---

## Firestore / Data Model Debt

### [DATA-01] 🔴 No centralised Firestore path definitions
**What:** Firestore paths defined as inline string literals throughout `src/ui.js` and `functions/index.js`.
**Why it matters:** Path changes require manual find-and-replace across files. Jules missed paths during the March 2026 migration. DATA-02 is a direct consequence.
**Fix:** Create `src/services/firestore-paths.js` and `functions/firestore-paths.js`. All path strings imported from these files only.

### [DATA-02] ✅ Stale path references in `bindPracticeCaddyUI()`
**Resolved 2026-06-10 · commits d3befec / 293ccc1 / 3658bf7 (closed under BL-3.05).** Verified at HEAD by NIGHT3 Part 1: zero root-level `practice_plans` references remain in `src/`, `functions/`, or `tests/`. All client references now point to `users/{uid}/practice_plans/active` (ui.js:821, 906, 942, 975); the function writer matches (functions/index.js:240); the BL-3.12 root-rule stopgap was removed (3658bf7). The line numbers in the prior entry (ui.js:825/894/929) described the pre-fix tree.

### [DATA-03] ✅ `/practice_rounds` vs `/users/{uid}/practice_plans` ambiguity
**Resolved June 2026 audit** — Documented distinction:
- `/practice_rounds` = historical log of completed/scored practice sessions (working correctly)
- `users/{uid}/practice_plans/active` = single AI-generated drill recommendation with completion tracking (broken frontend only, see DATA-02)

### [DATA-04] 🟢 No indexed followers subcollection
**What:** The follow schema only stores outgoing follows (`users/{A}/following/{B}`). Finding a user's followers requires a `collectionGroup` scan — all following documents fetched and filtered in-memory in the Cloud Function.
**Why it matters:** At current scale, fine. If the app grows significantly, this becomes an expensive scan.
**Fix:** When/if scale requires it — write `users/{B}/followers/{A}` alongside `followPlayer()` to enable direct lookup. Do not modify `followPlayer()` without careful testing.

---

## Broken Feature Debt (from June 2026 Audit)

### [BRK-01] 🔴 AI Practice Plan non-functional end-to-end
See DATA-02. Three compounding issues: wrong Firestore path, data shape mismatch, DOM ID mismatch. Full detail in `01_feature_map.md` Audit Finding #1 and BL-3.05.

### [BRK-02] ✅ Activity Feed broken by security rules mismatch
**Resolved June 8 2026** — Replaced cross-user `whs_rounds` query with write-time fan-out to `/feed` collection. `onRoundCreated`/`onRoundDeleted` Cloud Functions, locked Firestore rules, rewritten `loadFeed()`, composite index. See BL-3.03.

### [BRK-03] 🔴 Coach Assign Drill writes to path with no security rule
**What:** `bindCoachDashboard()` (`coach.js` L128-151) writes to `users/{uid}/assignedDrills`. `firestore.rules` has no `match` block for this path. Every write is rejected with `permission-denied`.
**Fix:** Add rule: coach can write, player can read/update `completed` status. See BL-3.06.

### [BRK-04] 🟡 Competition Invite Players — dead UI
**What:** `#comp-invite-container`/`#comp-invite-list` markup exists with no JS binding. `invitedUIDs` never written, so the `array-contains` query branch and its matching security rule can never be satisfied.
**Fix:** Wire event handler and write `invitedUIDs` on competition create. See BL-3.07.

### [BRK-05] 🟢 Tempo "Snap" vibe missing in `buildTone()`
**What:** UI offers "Snap" vibe option but `buildTone()` has no matching `case`. Silently falls through to default.
**Fix:** Add `case 'snap':` with appropriate oscillator config. See BL-3.08.

### [BRK-06] 🟢 Dead/unreachable code in `stateChange` listener
**What:** `case 'handicapIndex':` has code placed after its own `break` statement. Unreachable — likely a half-finished rogue agent edit.
**Fix:** Delete the unreachable lines. See BL-3.09.

---

## Test Debt

### [TEST-01] 🔴 3 test bodies completely empty — WORSE than catalogued
**Amended 2026-06-13 (NIGHT2):** the three bodies are **not** `test.skip()` — they have empty/tautological bodies that **pass green** ("Sub-Score Logic" and "Chip-in Validation" empty; "Fuzzing Scores" asserts a literal `return true`). Empty-body Playwright tests count as passes, so the false-signal risk is higher than "skipped" implied. Consistent with AUDIT-02.
**Fix:** Rewrite with real setup and assertions when on-course editor UI is confirmed stable.

### [TEST-02] 🔴 `live_audit.spec.js` runs against production with hardcoded credentials
**What:** Hardcodes real credentials and hits the live production URL. Should never run in CI.
**Fix:** Add `test.skip()` in CI environments or move to a separate manual-only workflow.

### [TEST-03] 🔴 Tests had no cleanup hooks — REOPENED (claimed fix never committed)
**Reopened 2026-06-13 (NIGHT3 Part 4).** The claimed Admin-SDK cleanup hooks do **not** exist at HEAD: `quota-guards.spec.js` has no `afterEach`/cleanup of any kind, and the cited utilities `tests/utils/clear-emulator.js` and `tests/firebase-admin-setup.js` exist on no ref (`git log --all` empty). The file was last touched 2026-03-06 (`a63e1f3`). Classification: claimed work **NEVER COMMITTED anywhere** — first confirmed instance of the claims-without-commits pattern (see PIR_LOG).
**Fix:** Actually add cleanup; or descope. Ship the seeding/cleanup utility with BL-4.01 (TEST-06).

### [TEST-04] 🟡 ui-ergonomics test — premise wrong; real defect is panel visibility
**Amended 2026-06-13 (NIGHT2 static + NIGHT3 Phase-1 dynamic):** "Ashgrove GC" **does** exist — static `<option>` (index.html:352) + `COURSE_DATA` key (course-data.js:98); the course list is static source, not emulator-seeded, so "course doesn't exist in emulator" was never the failure mode, and the test is not skip-marked. Observed dynamically (2026-06-13 e2e run): the test **fails** with `selectOption('#oc-course-select')` timing out because the element is *not visible* — the on-course setup panel visibility gap (BL-4.02), not a course-data problem.
**Fix:** Addressed by BL-4.02 (setup-panel visibility); test then asserts touch-target sizes against a started round.

### [TEST-05] 🔴 `round_flow.spec.js` — BROKEN and never executed
**Amended 2026-06-13 (NIGHT2 T9):** worse than "skips auth". The file is **not in the Playwright `testMatch` allowlist** (playwright.config.js:9), so `npm run test:e2e` never runs it — confirmed by the 2026-06-13 e2e run, which collected only the 6 allowlisted specs. It also targets four nonexistent IDs (`#tab-btn-oncourse`, `#btn-start-round`, `#oc-course-name`, `#active-round-ui` — real IDs are `btn-oc-start`/`oc-course-select`/data-target nav) and hardcodes `127.0.0.1:3000` against a `:5173` baseURL.
**Fix:** Rewrite against real IDs + emulator auth, then add to `testMatch`. Reclassify from "skips auth" to broken-and-dormant.

### [TEST-06] 🟡 No test data seeding strategy
**What:** Tests rely on empty emulator state or leftover data from previous runs.
**Fix:** Create `tests/utils/seed-emulator.js` with consistent test data (courses, users, rounds).

---

## CI/CD Debt

### [CI-01] ✅ CI was triggering on every push consuming 2 hours per run
**Resolved prior session** — CI now manual trigger (`workflow_dispatch`) only.

### [CI-02] 🔴 CI auto-deploys to production on every successful test run
**What:** `deploy` job in `test.yml` pushes to live Firebase Hosting automatically after tests pass.
**Fix:** Add manual approval step before deploy, or restrict to tagged releases. Do before first real-user release.

### [CI-03] 🟡 No separation between fast and slow tests in CI
**Fix:** Split into `test:unit` and `test:e2e` jobs. E2E on schedule or manual trigger only.

### [CI-04] 🟡 Playwright browser installation not cached
**Fix:** Add Playwright browser caching using `actions/cache` in the workflow.

---

## Architecture Debt

### [ARCH-01] ✅ Rogue agent damage — audit complete, successor work tracked
**Closed 2026-06-13 (NIGHT1–NIGHT3).** The full-codebase audit this item called for is complete across three sessions (blast-radius, unit-test, residue). `_GRAVEYARD_20260308_1403/` is now an **empty directory** (NIGHT3 H26) — the archived code it once held is gone. The specific damage is fully enumerated and re-homed: practice-plan disconnect closed (BL-3.05/DATA-02), and the live P1/P2 findings plus hygiene now live in the **BL-4.x remediation backlog**. No open investigative scope remains under ARCH-01.

### [ARCH-02] 🟡 `src/ui.js` is doing too much
**What:** `ui.js` contains event binding, state management, Firebase queries, and UI rendering all in one file.
**Fix:** Gradually extract into separate modules as features are confirmed stable. High effort, high risk — defer until broken features are fixed.

### [ARCH-03] 🟢 No schema documentation for Firestore collections
**Fix:** Add `FIRESTORE_SCHEMA.md`. Low priority — add when data model stabilises.

---

## Debt Priority Order

*Updated 2026-06-13: DATA-02 ✅, BRK-01 ✅ (practice-plan disconnect closed), BRK-03 re-scoped (rule exists — now BL-3.06 read path), ARCH-01 ✅. The P1/P2 remediation order now lives in the BL-4.x backlog; ship BL-4.00 (static contract suite) first.*

| Priority | Item | Effort | Risk | Tool |
|---|---|---|---|---|
| 1 | **BL-4.00**: Static contract suite (ship before any BL-4.x fix) | Low | None | Claude Code |
| 2 | **BL-4.01–4.08**: P1 cluster (WHS integrity, setup rewiring, comp logging incl. R-LIVE-1, coach linkage, askAiCoach pin, auth bypass removal, shots schema) | Med–High | Med | Claude Code |
| 3 | BRK-05/**BL-3.08**: Tempo Snap (reopened — `value="snare"` fix) | Low | None | Jules |
| 4 | BRK-06: Dead code in stateChange ✅ (BL-3.09) | — | — | — |
| 5 | DATA-01: Centralised Firestore paths | Medium | Low | Claude Code |
| 6 | CI-02: Deploy approval gate | Low | None | Jules |
| 7 | TEST rewrites (TEST-03 reopened, 04, 05, 06) + BL-4.x regression tests | Medium | Low | Claude Code |
| 8 | **BL-4.09–4.16**: P2/P3 (feed diff, notifications, archive/delete, hygiene sweep, review scorecard, mutateList, surveyor decide) | Med | Low | Claude Code |
| 9 | STATE-01/02: Practice state through AppState | High | Medium | Claude Code |
| 10 | ARCH-02: ui.js module extraction | High | High | Claude Code |
