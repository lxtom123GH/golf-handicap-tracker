# Master Project Backlog

## Resolved Tasks
- [x] BL-2.01 Refactor Monolithic Core Layouts to Modular Architecture
- [x] BL-2.02 Smart Score Defaults & Reverse-Engineered GPS Distance Tracking
- [x] BL-2.03 Coach Roster and Social Feed State Isolation and Refactor
- [x] BL-2.04 Extract & Refactor Global Navigation into State-Driven Architecture

---

## Completed — June 8 2026 Session

- [x] BL-3.01 CSS Duplicate Cleanup — resolved CSS-01, CSS-03, CSS-04, CSS-05. Duplicate `.hidden`, `.tabs-container`, `.tab-content`, and `body[data-active-tab]` blocks consolidated. PR merged via Jules.
- [x] BL-3.02 Full Codebase Feature Audit — all ❓/⚠️ rows in `01_feature_map.md` resolved with file/line evidence. 9 new findings documented. Audit findings section appended to feature map.
- [x] BL-3.03 Activity Feed Fan-Out Implementation — replaced broken cross-user `whs_rounds` query with write-time fan-out to `/feed` collection. `onRoundCreated`/`onRoundDeleted` Cloud Functions added (australia-southeast1), Firestore rules locked down, `loadFeed()` rewritten, composite index added, service worker bumped to v6.24.0. PR merged via Claude Code.
- [x] BL-3.04 Repository Archive Cleanup — 50+ stale non-production files moved to `_ARCHIVE/` with `INDEX.md`. `MASTER_BACKLOG.md` and `PIR_LOG.md` preserved at root. PR merged via Jules.

---

## Active Tasks

### BL-3.05 🔴 AI Practice Plan — Full Rebuild (HIGH PRIORITY)
Three layers of breakage from rogue agent session (ARCH-01). All specific, all fixable:
- **DATA-02**: 3 stale path references in `src/ui.js` — `bindPracticeCaddyUI()` at lines 825, 894, 929 still query root-level `practice_plans` instead of `users/{uid}/practice_plans/active`
- **Data shape mismatch**: Cloud Function returns `drillId`/`category`/`targetMetric`/string-array `steps`/boolean-array `completedSteps`; UI expects `id`/`title`/`description`/object `steps`/index-array `completedSteps`
- **DOM ID mismatch**: `ui.js` references `active-drill-title`/`active-drill-desc`/`practice-gen-error`/`btn-archive-drill`; `index.html` has `practice-category-badge`/`practice-target-metric`/`practice-generate-error`/`btn-reset-practice`/`practice-rating-section`
- **Tool:** Claude Code (complex, multi-file, needs emulator test loop)

### BL-3.06 🔴 Coach Assign Drill — Add Missing Security Rule
`bindCoachDashboard()` (`coach.js` L128-151) writes to `users/{uid}/assignedDrills` but `firestore.rules` has no matching `match` block. Every write is currently rejected with `permission-denied`.
- **Fix:** Add rule allowing coach to write, player to read/update `completed` status
- **Tool:** Claude Code (one rule block, needs rules context)

### BL-3.07 🟡 Competition Invite Players — Wire Dead UI
`#comp-invite-container`/`#comp-invite-list` markup exists with no JS binding. `invitedUIDs` is queried but never written. The `array-contains` branch of the Firestore query and security rule can never be satisfied through the UI.
- **Tool:** Claude Code (needs to wire event handlers + write invitedUIDs on competition create)

### BL-3.08 🟢 Tempo "Snap" Vibe — Add Missing buildTone() Case
UI offers "Snap" vibe option but `buildTone()` in `tempo.js` has no matching `case`. Silently falls through to default oscillator.
- **Tool:** Jules (one case block, contained)

### BL-3.09 🟢 Dead Code Cleanup — stateChange Listener
`case 'handicapIndex':` in the `stateChange` listener in `ui.js` has code placed after its own `break` statement — unreachable. Likely a half-finished edit from the rogue agent session.
- **Tool:** Jules (two-line delete, mechanical)

---

## Deferred / Future

- DATA-01: Centralised Firestore path definitions (`firestore-paths.js`) — medium effort, low risk, high long-term value. Do after practice plan rebuild.
- DATA-04: Indexed followers subcollection — the current `collectionGroup('following')` scan works at current scale. Add `users/{B}/followers/{A}` write-time alongside `followPlayer()` if/when the app scales.
- ARCH-02: `src/ui.js` module extraction — high effort, high risk. Defer until after all broken features are fixed.
- ARCH-03: `FIRESTORE_SCHEMA.md` documentation — low priority, add when the data model stabilises.
- TEST rewrites (TEST-02, TEST-05, TEST-06) — do after practice plan rebuild confirms the UI is stable.
- CI-02: Add deploy approval gate — before first real-user release.
- CI-03/04: Split and cache CI jobs — before first real-user release.

## [2026-06-08] Log Deduplication (Task Complete)
**Status**: Secured
- **Action**: Consolidated dispersed PIR logs from 7 lenses into `docs/PIR_log_supermagic_charlie.md`.
- **Reason**: Disparate footprints needed a single, cohesive timeline mapping E2E test failures to multi-lens execution steps for clarity and unified state coupling assessments.
