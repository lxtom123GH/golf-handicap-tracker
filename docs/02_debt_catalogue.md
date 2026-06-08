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

### [DATA-02] 🔴 Stale path references in `bindPracticeCaddyUI()`
**What:** Confirmed by June 2026 audit. Exactly 3 live references to root-level `practice_plans` remain in `src/ui.js`:
- `src/ui.js:825` — `loadActivePlan()` queries wrong root-level `practice_plans` collection
- `src/ui.js:894` — drill-step checkbox handler writes to wrong root-level path
- `src/ui.js:929` — archive-drill handler targets wrong root-level path (also references non-existent `#btn-archive-drill`)

The Cloud Function (`functions/index.js` `generatePracticePlan`) was correctly migrated. The frontend was not.
**Fix:** Update all three references to `users/${uid}/practice_plans/active`. Part of BL-3.05 (AI Practice Plan Rebuild).

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

### [TEST-01] 🔴 3 test bodies completely empty
**What:** In `tests/logic-boundaries.spec.js`, three tests have no assertions. Marked `test.skip()`.
**Fix:** Rewrite with real setup and assertions when on-course editor UI is confirmed stable.

### [TEST-02] 🔴 `live_audit.spec.js` runs against production with hardcoded credentials
**What:** Hardcodes real credentials and hits the live production URL. Should never run in CI.
**Fix:** Add `test.skip()` in CI environments or move to a separate manual-only workflow.

### [TEST-03] ✅ Tests had no cleanup hooks causing data pollution
**Resolved prior session** — Firebase Admin SDK cleanup hooks added to `quota-guards.spec.js`.

### [TEST-04] 🟡 Hardcoded course name in ui-ergonomics test
**What:** `selectOption('#oc-course-select', "Ashgrove GC")` — course doesn't exist in emulator. Marked `test.skip()`.
**Fix:** Seed emulator with test course data, or select first available option dynamically.

### [TEST-05] 🟡 `round_flow.spec.js` skips auth entirely
**What:** Skips actual round flow because "can't easily perform a real Firebase login."
**Fix:** Add proper emulator auth setup matching `quota-guards.spec.js` pattern.

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

### [ARCH-01] 🟡 Rogue agent damage — audit complete, specific damage documented
**What:** March 2026 AI agent session made uncontrolled changes. `_GRAVEYARD_20260308_1403/` contains archived code from that event.
**Status updated June 2026:** Full feature audit complete. Specific damage identified: AI practice plan frontend-backend disconnect (BL-3.05/BRK-01), dead coach drill security rule (BRK-03), dead competition invite UI (BRK-04). All other features confirmed working or partially working.

### [ARCH-02] 🟡 `src/ui.js` is doing too much
**What:** `ui.js` contains event binding, state management, Firebase queries, and UI rendering all in one file.
**Fix:** Gradually extract into separate modules as features are confirmed stable. High effort, high risk — defer until broken features are fixed.

### [ARCH-03] 🟢 No schema documentation for Firestore collections
**Fix:** Add `FIRESTORE_SCHEMA.md`. Low priority — add when data model stabilises.

---

## Debt Priority Order

| Priority | Item | Effort | Risk | Tool |
|---|---|---|---|---|
| 1 | BRK-01/DATA-02: AI Practice Plan rebuild | High | Medium | Claude Code |
| 2 | BRK-03: Coach Assign Drill security rule | Low | Low | Claude Code |
| 3 | BRK-04: Competition Invite Players UI | Medium | Low | Claude Code |
| 4 | BRK-05: Tempo Snap vibe | Low | None | Jules |
| 5 | BRK-06: Dead code in stateChange | Low | None | Jules |
| 6 | DATA-01: Centralised Firestore paths | Medium | Low | Claude Code |
| 7 | CI-02: Deploy approval gate | Low | None | Jules |
| 8 | TEST rewrites (02, 05, 06) | Medium | Low | Claude Code |
| 9 | STATE-01/02: Practice state through AppState | High | Medium | Claude Code |
| 10 | ARCH-02: ui.js module extraction | High | High | Claude Code |
