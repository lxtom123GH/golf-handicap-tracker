# Master Project Backlog

## Resolved Tasks
- [x] BL-2.01 Refactor Monolithic Core Layouts to Modular Architecture
- [x] BL-2.02 Smart Score Defaults & Reverse-Engineered GPS Distance Tracking
- [x] BL-2.03 Coach Roster and Social Feed State Isolation and Refactor
- [x] BL-2.04 Extract & Refactor Global Navigation into State-Driven Architecture
- [x] BL-3.15 🟠 T2-B: Competing Visibility Authorities — CSS + `auth-v2.js`
---

## Completed — June 8 2026 Session

- [x] BL-3.01 CSS Duplicate Cleanup — resolved CSS-01, CSS-03, CSS-04, CSS-05. Duplicate `.hidden`, `.tabs-container`, `.tab-content`, and `body[data-active-tab]` blocks consolidated. PR merged via Jules.
- [x] BL-3.02 Full Codebase Feature Audit — all ❓/⚠️ rows in `01_feature_map.md` resolved with file/line evidence. 9 new findings documented. Audit findings section appended to feature map.
- [x] BL-3.03 Activity Feed Fan-Out Implementation — replaced broken cross-user `whs_rounds` query with write-time fan-out to `/feed` collection. `onRoundCreated`/`onRoundDeleted` Cloud Functions added (australia-southeast1), Firestore rules locked down, `loadFeed()` rewritten, composite index added, service worker bumped to v6.24.0. PR merged via Claude Code.
- [x] BL-3.04 Repository Archive Cleanup — 50+ stale non-production files moved to `_ARCHIVE/` with `INDEX.md`. `MASTER_BACKLOG.md` and `PIR_LOG.md` preserved at root. PR merged via Jules.
- [x] BL-3.10 Supermagic Adversarial Audit — 12-ledger, 6-lens adversarial synthesis completed. Tiered Master Synthesis produced. Methodology critique adopted: correlated model bias identified, line-number fragility documented, static-vs-dynamic analysis gap formalised. False Positive Registry (FP-01 through FP-10) established as permanent appendix. See `docs/PIR_log_supermagic_charlie.md` and `docs/TIERED_MASTER_SYNTHESIS.md`.

### BL-3.15 ✅ T2-B: Competing Visibility Authorities — CSS + `auth-v2.js`
*Completed: 2026-06-09 · B2 commit 225b98c · B1 commit f535c6d*
- **B1 — `style.css`:** `body.round-active #tab-oncourse.hidden { display: block !important; }` deleted. Rule was confirmed dead code — `round-active` is always removed before `.hidden` is ever applied to `#tab-oncourse` (explicit ordering in `showLockerRoom`/`endRoundCleanup`). `data-active-tab` state machine is now the sole visibility authority.
- **B2 — `auth-v2.js`:** Four `style.display` assignments and their `// Force hide`/`// Force show` comments removed from both approved-user branches. `classList`-only is now the single authority for auth overlay visibility. Collapsed from 4 dual-lever pairs to 0. (Note: `btnLogin`/`btnRegister` style.display lines in the login↔register toggle are a separate, single-lever-per-element pattern — left untouched.)
- **E2E result:** 10/14 tests passing post-fix (was 0/14 before B2). Remaining 3 failures are pre-existing feature gaps (T3-dateValidation, FP-05, on-course setup panel visibility).

### BL-3.16 ✅ T2-C: Firestore Document Normalisation
*Completed: 2026-06-09 · commit 5476ac2*
- **Pattern:** `onSnapshot`/`getDocs` callbacks spread raw Firestore doc data directly into `AppState` with no shape validation. Missing or malformed fields (`date`, `score`, `displayName`, `uid`, etc.) propagate silently into render-bound state.
- **Fix:** `normalizeRoundDoc(raw)` and `normalizeUserDoc(raw)` added to `state.js` (alongside `mutateList`) — pure functions supplying typed defaults for expected fields while preserving all other fields via spread. Placed in `state.js` (not a new file) because all three consumers already import from it, so only existing import lines were extended.
- **Wiring:** `whs.js` `onSnapshot` → `normalizeRoundDoc({ id, ...doc.data() })`; `practice.js` `onSnapshot` (inside the BL-3.14 `mutateList` call) → `normalizeRoundDoc(...)`; `social.js` `getDocs` `snap.docs.map` → `normalizeUserDoc({ uid: d.id, ...d.data() })`. Existing `mutateList` calls and the Proxy set trap left untouched.
- **Diff:** 44 insertions, 6 deletions across 4 files (`state.js` +38, three consumers ±2 each) — within the 100-line budget.
- **Closes:** T2-C


---

## Active Tasks

### BL-3.05 🔴 AI Practice Plan — Full Rebuild (HIGH PRIORITY)
Three layers of breakage from rogue agent session (ARCH-01). All specific, all fixable:
- **DATA-02:** 3 stale path references in `src/ui.js` — `bindPracticeCaddyUI()` at lines 825, 894, 929 still query root-level `practice_plans` instead of `users/{uid}/practice_plans/active`
- **Data shape mismatch:** Cloud Function returns `drillId`/`category`/`targetMetric`/string-array `steps`/boolean-array `completedSteps`; UI expects `id`/`title`/`description`/object `steps`/index-array `completedSteps`
- **DOM ID mismatch:** `ui.js` references `active-drill-title`/`active-drill-desc`/`practice-gen-error`/`btn-archive-drill`; `index.html` has `practice-category-badge`/`practice-target-metric`/`practice-generate-error`/`btn-reset-practice`/`practice-rating-section`
- **Cross-ref BL-3.11:** Root-level `practice_plans` queries throw `FirebaseError: No matching allow statements` because the only security rule lives at the subcollection path. BL-3.11 adds a temporary rules stopgap; DATA-02 above is the permanent fix. Once DATA-02 lands the stopgap rule can be removed.
- **Tool:** Claude Code (complex, multi-file, needs emulator test loop)

### BL-3.06 🔴 Coach Assign Drill — Add Missing Security Rule
`bindCoachDashboard()` (`coach.js` L128-151) writes to `users/{uid}/assignedDrills` but `firestore.rules` has no matching `match` block. Every write is currently rejected with `permission-denied`.
- **Fix:** Add rule allowing coach to write, player to read/update `completed` status
- **Can be batched with BL-3.11** — both are isolated `firestore.rules` additions, combined diff stays well under 150 lines
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

## Supermagic Audit — Tiered Remediation Backlog
*Sourced from the 12-ledger adversarial synthesis completed 2026-06-08. Line numbers are orientation references against the audit-time tree — verify against current HEAD before each execution step. Full mechanistic descriptions and dynamic verification protocols in `docs/TIERED_MASTER_SYNTHESIS.md`.*

### BL-3.11 🔴 PREREQUISITE: Create `CLAUDE.md` — Project Architectural Contract
*Must exist before any Claude Code CLI session is started. Prevents every future session from re-discovering retired findings or violating the Sydney Protocol.*
- **Contents:** Sydney Protocol rules, Firebase region pin, commit size policy, state layer rules, pointer to False Positive Registry
- **Tool:** Chat (draft content exists from 2026-06-08 session — copy into repo root)
- **Commit message:** `chore: add CLAUDE.md project architectural contract`

### BL-3.12 🔴 T1-A: Firestore Rules — `practice_plans` Root-Level Stopgap
- **Pattern:** Client queries root-level `collection(db, "practice_plans")`; the only matching security rule lives at the subcollection path. Runtime error: `FirebaseError: No matching allow statements`.
- **Verify first (emulator):** Start emulator → authenticate → navigate to Practice Caddy → confirm error fires in console. If no error, this may already be fixed — do not add the rule.
- **Fix:** Add root-level `match /practice_plans/{planId}` rule block to `firestore.rules`. Documents already carry `userId` field. Do NOT touch the JS query — that is DATA-02 in BL-3.05. ~8 lines.
- **Can be batched with BL-3.06** — both are `firestore.rules` additions
- **Superseded by:** BL-3.05 DATA-02 (once query path is corrected to subcollection, this root rule can be removed)
- **Tool:** Claude Code
- **Closes:** T1-A

### BL-3.13 🔴 T1-B: Audio Timer Leak — `endRoundCleanup` Never Calls `stopAudioTimer`
- **Pattern:** `audioTimerInterval` (1-second tick firing `updateAudioUI`) is only ever cleared by the manual stop-recording toggle. `endRoundCleanup()` has no `stopAudioTimer()` call. If a round ends or aborts while audio diary is recording, the interval runs indefinitely.
- **Verify first (edge case):** Start round → begin audio recording → end round without stopping recording → open DevTools Performance or add `console.log` inside `updateAudioUI` → confirm interval keeps firing post-round-end.
- **Fix:** Add `stopAudioTimer();` as the first line of `endRoundCleanup()`. Already a no-op when no timer is running — zero blast radius. ~3 lines.
- **Tool:** Claude Code
- **Closes:** T1-B

### BL-3.14 ✅ T2-A: `mutateList` Primitive + Proxy Consumer Migration
*Completed: 2026-06-09 · Phase 1 commit 20ea34c · Phase 2 commit a7b70b5*
- **Pattern:** `AppState` Proxy `set` trap fires on reference change only (`oldValue !== value`). In-place mutations — `.push()`, `.splice()`, and nested object key writes (`obj[k] = v`) — keep the same reference, so `stateChange` is never dispatched. Engineers stopped trusting the reactive layer for arrays and built a parallel imperative layer instead; this is why the `classList`/`style.display` sprawl exists at scale.
- **Phase 1 — `state.js` only:** ✅ `mutateList(key, fn)` exported from `state.js`. Handles both arrays (`[...copy]`) and objects (`{...copy}`). Proxy set trap untouched.
- **Phase 2 — consumers:** ✅ All four proxy-bypass sites migrated:
  - `practice.js` — `onSnapshot` reset-then-push loop → `mutateList('currentPracticeRounds', ...)`
  - `social.js` — `allUsersCache` population via `.push()` → direct `snap.docs.map(...)` assignment (Option A: full rebuild, single reference change)
  - `app-v4.js` — two `profileUsersMap[key] = val` nested writes → `mutateList('profileUsersMap', ...)`
  - `ui.js:622-623` — bespoke `splice` + spread-reassign idiom → `mutateList('liveRoundGroups', ...)`
- **Closes:** T2-A

---

## Deferred / Future

- **DATA-01:** Centralised Firestore path definitions (`firestore-paths.js`) — medium effort, low risk, high long-term value. Do after BL-3.05 practice plan rebuild.
- **DATA-04:** Indexed followers subcollection — current `collectionGroup('following')` scan works at current scale. Add write-time mirror if/when scale demands.
- **ARCH-02:** `src/ui.js` module extraction — high effort, high risk. Defer until all broken features are fixed.
- **ARCH-03:** `FIRESTORE_SCHEMA.md` documentation — add when data model stabilises.
- **AUDIT-01:** `functions/` directory review — the entire 12-ledger audit corpus is client-side static analysis only. Cloud Functions pinned to `australia-southeast1` have not been audited. Treat as a separate targeted review before first real-user release.
- **AUDIT-02:** Commit `a63e1f3` test suite integrity — this "100% E2E pass" commit converted at least three specs to `expect(true).toBe(true)` tautological placeholders (`async-coach.spec.js`, `logic-boundaries.spec.js`, `quota-guards.spec.js`). Current green CI is not a reliable safety net for these features. Audit `tests/` for hollow assertions before relying on CI for Phase 3 work.
- **AUDIT-03:** `coach.js` real-time notification investigation — zero `onSnapshot`/`listenTo*` wiring for student-activity notifications found. Not a confirmed bug (the only test supposed to prove it is AUDIT-02's placeholder). Requires fresh investigation: read `coach.js` in full, map existing notification pathways, determine whether the feature was deferred or removed.
- **T3-onStateChange:** `onStateChange(keys, handler)` filtered subscription wrapper for `state.js` — real optimisation but negligible cost at current listener counts. Do after BL-3.14 is stable. Do NOT bundle with the `mutateList` commit.
- **T3-setTimeout:** Fix uncancelled `setTimeout` handles on shared elements — `oncourse.js:724,727,1519` and `notifications.js:53`. Cache handles in module-scope variables, `clearTimeout` before rescheduling and on relevant view teardown. ~20 lines. Note: `score-input.js:166` is excluded — function-local disposable toast, not a shared element (see FP-10).
- **T3-renderList:** Extract shared `renderList(container, items, toRowFn, emptyMsg)` utility across 9 files (`admin.js`, `coach.js`, `competitions.js`, `card-render.js`, `analytics.js`, `social.js`, `notifications.js`, `wakelock.js`, `ai.js`). **Coordination gate: must be designed and implemented exactly once — multiple lenses independently proposed incompatible signatures.** Agree the API (parameter order, `DocumentFragment` vs `replaceChildren`, `emptyMsg` type) before opening any PR. Prerequisite: `card-render.js` DocumentFragment batching fix first (~15 lines, standalone).
- **T3-tempo:** `tempo.js` synchronous reflow — `void UI.tempoRing.offsetWidth` forces a main-thread layout flush. Replace with `requestAnimationFrame` double-rAF or dual-class swap. ~25 lines, fully isolated.
- **T3-dateValidation:** Future-date guard on round creation — `#oc-round-date` has no `max` attribute and no server-side guard in the `#btn-oc-start` click handler. ~15 lines.
- **T3-styleDisplay:** `app-v4.js:309,313` inline `style.display` sprawl — flagship template for a 5-file pattern (`ai.js`, `auth-v2.js`, `oncourse.js`, `ui.js`, `app-v4.js`). Derive `AppState.isViewingSelf`, drive via `data-attribute` CSS rule. Land after BL-3.15 (T2-B) establishes the pattern.
- **T3-epic:** Repo-wide `classList.add/remove('hidden')` sprawl — ~155 instances across 13 files (`oncourse.js` ×55, `auth-v2.js` ×26, `competitions.js` ×15, `ai.js` ×11, `app-v4.js` ×11). Population statistic, not a single ticket. Track as multi-PR epic. Open one ≤150-line chunk per file starting with `oncourse.js` after T2-B and T3-styleDisplay are proven. Triage each site: "drive via `data-active-tab`/derived-state attribute" vs "genuine ephemeral UI state — leave as-is."
- **TEST rewrites (TEST-02, TEST-05, TEST-06):** Do after BL-3.05 practice plan rebuild confirms UI is stable. Address AUDIT-02 hollow assertions at the same time.
- **CI-02:** Deploy approval gate — before first real-user release.
- **CI-03/04:** Split and cache CI jobs — before first real-user release.

---

## [2026-06-08] Log Deduplication (Task Complete)
**Status:** Secured
- **Action:** Consolidated dispersed PIR logs from 7 lenses into `docs/PIR_log_supermagic_charlie.md`.
- **Reason:** Disparate footprints needed a single, cohesive timeline mapping E2E test failures to multi-lens execution steps for clarity and unified state coupling assessments.

---

## Appendix: Permanent False Positive Registry
*Findings verified false across multiple reconciliation passes. Do not re-investigate, re-fund, or carry forward in any future audit round. If a future agent surfaces one of these claims, cite the FP-ID and close without action.*

| ID | Claim | Why It's False |
|---|---|---|
| FP-01 | "Only `playerClubs` survives refresh — ~24-30 `initialState` keys are memory-only" | `persistence.js:11-25` persists 13 round-state keys via `PERSIST_FIELDS` + `GOLF_APP_STATE_KEY` (`liveRoundGroups`, `currentHole`, `currentShotData`, `activeRoundId`, etc.). Mid-round state is the *most* thoroughly persisted state in the app. The premise is the opposite of true. Infected two separate lens lineages before being caught — the most-repeated hallucination in the entire corpus. |
| FP-02 | "`whs.js`/`practice.js` have no stored unsubscribe handle / no listener teardown" | Both correctly declare, defensively guard, and reassign `unsubscribeWHS`/`unsubscribePractice`. Textbook subscribe/teardown. Appeared in 6 of 12 lenses — corroboration count is not evidence when the premise is wrong. |
| FP-03 | "`practice_plans` Firestore rules path mismatch is a hallucination" (Llama-charlie retraction) | Self-contradictory — the retraction's own explanation describes the exact root-vs-subcollection mismatch that produces the runtime error. The retraction is the false positive; the finding is real and is tracked as BL-3.12 (T1-A). |
| FP-04 | "Resume mid-round" feature-gap trilogy: missing persistence write, no boot-time hydration, unpersisted round transition | All three sub-claims inverted by source. Persistence write exists at `persistence.js:119-133`. `initializeAppRouting()` hydrates before Firestore listeners attach (`app-v4.js:47` before `:50`). Round transition is persisted. Originated in Llama-charlie; is the seed of FP-01. |
| FP-05 | "`Generate AI Briefing` double-tap rate limiting is non-functional" (E2E test failure) | Spec targets `#btn-generate-practice`, not the briefing feature. Both candidate buttons carry synchronous `disabled = true` guards before the first `await`. |
| FP-06 | "Async coach notification dropped" (E2E test failure) | `async-coach.spec.js` is a `expect(true).toBe(true)` placeholder in both its current and prior form (rewritten in `a63e1f3`). Incapable of detecting the claimed failure. A genuine architecture question about `coach.js` real-time wiring may exist separately — tracked as AUDIT-03. |
| FP-07 | "Future-date validation currently failing" (E2E test failure) | `logic-boundaries.spec.js` contains no `expect()` on date validity and cannot fail. The underlying code gap is real and tracked as T3-dateValidation. Test-evidence framing is permanently retired. |
| FP-08 | "Event listener memory leaks in `card-render.js`/`coach.js`" | `innerHTML = ''` clears containers before re-binding. Detached nodes and their listeners are GC'd together. Zero `removeEventListener` calls is a deliberate repo-wide convention, not an active leak. |
| FP-09 | "`wakelock.js:50/55`, `score-input.js:68-69`, `ai.js:70-75` circumvent `body[data-active-tab]`" | Location-accurate, mechanism-false. `wakelock.js` toggles a pressed-state skin; `score-input.js` highlights a selected pre-shot routine chip; `ai.js` performs role-based feature gating. None has any relationship to tab navigation. Canonical example of template-stamped analysis. |
| FP-10 | "`score-input.js:166` `setTimeout` is a shared-element race condition" | The `toast` element is function-local, created via `document.body.appendChild(toast)`, and discarded after one use. It cannot be re-triggered against a stale handle and carries none of the shared-element race risk. Excluded from T3-setTimeout. |

---
*Last updated: 2026-06-09 — BL-3.14 complete (Phase 1: 20ea34c, Phase 2: a7b70b5); BL-3.15 complete (B2: 225b98c, B1: f535c6d); BL-3.16 complete (5476ac2)*
