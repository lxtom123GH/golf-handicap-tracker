# Master Project Backlog

## Resolved Tasks
- [x] BL-2.01 Refactor Monolithic Core Layouts to Modular Architecture
- [x] BL-2.02 Smart Score Defaults & Reverse-Engineered GPS Distance Tracking
- [x] BL-2.03 Coach Roster and Social Feed State Isolation and Refactor
- [x] BL-2.04 Extract & Refactor Global Navigation into State-Driven Architecture
- [x] BL-3.15 🟠 T2-B: Competing Visibility Authorities — CSS + `auth-v2.js`
- [x] BL-3.16 Firestore document normalisation (normalizeRoundDoc / normalizeUserDoc)
- [x] BL-3.17 SSRF allowlist for `generateAudioBriefing` plus Model Spy removal and error-message hygiene
---

## Completed — June 8 2026 Session

- [x] BL-3.18 Manual Production Deployment Workflow — added `.github/workflows/deploy-production.yml` configured for `workflow_dispatch` to allow pushing to Firebase production directly from the GitHub UI (desktop or mobile) and added `runnpmbuild.md` for local testing instructions. PR merged via Jules.
- [x] BL-3.01 CSS Duplicate Cleanup — resolved CSS-01, CSS-03, CSS-04, CSS-05. Duplicate `.hidden`, `.tabs-container`, `.tab-content`, and `body[data-active-tab]` blocks consolidated. PR merged via Jules.
- [x] BL-3.02 Full Codebase Feature Audit — all ❓/⚠️ rows in `01_feature_map.md` resolved with file/line evidence. 9 new findings documented. Audit findings section appended to feature map.
- [x] BL-3.03 Activity Feed Fan-Out Implementation — replaced broken cross-user `whs_rounds` query with write-time fan-out to `/feed` collection. `onRoundCreated`/`onRoundDeleted` Cloud Functions added (australia-southeast1), Firestore rules locked down, `loadFeed()` rewritten, composite index added, service worker bumped to v6.24.0. PR merged via Claude Code.
- [x] BL-3.04 Repository Archive Cleanup — 50+ stale non-production files moved to `_ARCHIVE/` with `INDEX.md`. `MASTER_BACKLOG.md` and `PIR_LOG.md` preserved at root. PR merged via Jules.
- [x] BL-3.10 Supermagic Adversarial Audit — 12-ledger, 6-lens adversarial synthesis completed. Tiered Master Synthesis produced. Methodology critique adopted: correlated model bias identified, line-number fragility documented, static-vs-dynamic analysis gap formalised. False Positive Registry (FP-01 through FP-10) established as permanent appendix. See `docs/PIR_log_supermagic_charlie.md`. *(Note 2026-06-13, NIGHT3 Part 4: the previously-cited `docs/TIERED_MASTER_SYNTHESIS.md` was never committed on any ref — reference lost; `PIR_log_supermagic_charlie.md` is the surviving record.)*

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
- **DATA-02 ✅** *(Completed: 2026-06-09 · commit d3befec)* 3 stale path references in `src/ui.js` — `bindPracticeCaddyUI()` repointed to `users/{uid}/practice_plans/active`. Also fixed the `completedSteps` boolean/index-array schema mismatch (commit 293ccc1) and removed the now-superseded BL-3.12 rules stopgap (commit 3658bf7).
- **Data shape mismatch ✅** *(Completed: 2026-06-10 · commit 3367300)* Client-side adapter `normalizePracticePlan(raw)` added to `state.js` (alongside `normalizeRoundDoc`/`normalizeUserDoc`); Cloud Function output shape unchanged. Wired at both consumption points in `bindPracticeCaddyUI()`; `loadActivePlan` now merges `global_drills/{drillId}` with the personal `practice_plans/active` doc (which carries no drill content, so the page-reload render path was previously broken). Note: the `completedSteps` boolean/index claim in the original audit was stale — both sides already used index arrays (commit 293ccc1).
- **DOM ID mismatch ✅** *(Completed: 2026-06-10 · commit 753b842)* `ui.js` aligned to the IDs `index.html` provides: `practice-generate-error`, `btn-reset-practice`, `practice-category-badge`, `practice-target-metric`. Orphaned `practice-rating-section` wired (star rating → `userRating` + `status: 'completed'`).
- **Cross-ref BL-3.11:** Root-level `practice_plans` queries throw `FirebaseError: No matching allow statements` because the only security rule lives at the subcollection path. BL-3.11 adds a temporary rules stopgap; DATA-02 above is the permanent fix. Once DATA-02 lands the stopgap rule can be removed.
- **Root defect confirmed (overnight review 2026-06-09) — SOLE REMAINING SUB-TASK:** client never populates the personalisation input block when calling the Cloud Function — every plan is the generic fallback. `// TODO(BL-3.05)` marker left at the `generatePlan({})` call site in `ui.js`. Separate future PR.
- **Tool:** Claude Code (complex, multi-file, needs emulator test loop)

### BL-3.06 🟡 Coach Assign Drill — Client Read Path + Rules-Test Coverage (RE-SCOPED)
**Re-scoped 2026-06-13 (NIGHT3 Part 4 / Part 5):** the original premise is stale. The `assignedDrills` security rule **already exists** at `firestore.rules:48-56` (coach/admin write; player update limited to the `completed` field) — merged via `feature/assigned-drills-rules`. The `permission-denied` write failure is no longer the gap.
- **Remaining scope:** (1) the client **read path** — `users/{uid}/assignedDrills` is written (coach.js:137-143) but read by nothing, so players never see assigned drills and `notif-drill-assign` can never fire (NIGHT1 N22). (2) **rules-test coverage** for `isCoachOf`/`assignedDrills` — currently zero (NIGHT2 tests-to-write item 12).
- **Tool:** Claude Code (read path = feature work; rules tests in the `tests/rules` lane)

### BL-3.07 🟡 Competition Invite Players — Wire Dead UI
`#comp-invite-container`/`#comp-invite-list` markup exists with no JS binding. `invitedUIDs` is queried but never written. The `array-contains` branch of the Firestore query and security rule can never be satisfied through the UI.
- **Tool:** Claude Code (needs to wire event handlers + write invitedUIDs on competition create)

### BL-3.08 🟢 Tempo "Snap" Vibe — REOPENED (still silently broken)
**Reopened 2026-06-13 (NIGHT3 R4).** Marked complete (commits `bfc8b51`, `42ac23d`) but the user-facing bug persists: `buildTone()` has a real `'snap'` branch (tempo.js:62-68), yet the `<option>` labelled "Snap" emits `value="snare"` (index.html:2166), which matches no branch and falls through to the default 800 Hz sine. Both prior fixes patched the code half of a two-sided mismatch; the HTML half was **never committed on any ref**.
- **Fix direction (do NOT apply here — docs session):** change `value="snare"` → `value="snap"` at index.html:2166 (or alias both in `buildTone`). One word.
- **Tool:** Jules / single-line fix

---

## Supermagic Audit — Tiered Remediation Backlog
*Sourced from the 12-ledger adversarial synthesis completed 2026-06-08. Line numbers are orientation references against the audit-time tree — verify against current HEAD before each execution step. (The full-mechanism companion `docs/TIERED_MASTER_SYNTHESIS.md` was never committed on any ref — NIGHT3 Part 4; surviving record is `docs/PIR_log_supermagic_charlie.md`.)*

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
- **Stopgap removed:** 2026-06-09 · commit 3658bf7 — BL-3.05 DATA-02 repointed the client query, so the root-level rule block is gone.
- **Tool:** Claude Code
- **Closes:** T1-A

### BL-3.13 ✅ Audio Briefing Timer Leak Patch
*Completed: 2026-06-09 · commit aba4185 (bundled with BL-3.12) · docs `4e54f3c`*
- **Restored 2026-06-13 (NIGHT3 Part 4):** this entry was missing from the backlog though completion is claimed in CLAUDE.md and the `4e54f3c` docs commit. Confirmed on main: `aba4185` ("patch audio timer leak", oncourse.js +1) is an ancestor of HEAD.
- **Pattern:** uncancelled audio `setTimeout` handle. Note the broader `T3-setTimeout` (oncourse.js:724,727,1519; notifications.js:53) remains deferred — BL-3.13 patched only the single audio-briefing timer.

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

## BL-4.x — Audit Remediation Backlog (NIGHT1–NIGHT3)
*Added 2026-06-13. NIGHT1 proposed these as BL-3.18–BL-3.32, but BL-3.18 is already taken by the merged Manual Deployment Workflow (NIGHT3 R10 numbering collision). Renumbered to the BL-4.x series. Severity per NIGHT1 tiers (P1 broken / P2 silent no-op / P3 hygiene). "Ships with" = NIGHT2 tests-to-write item #. Line numbers are audit-time orientation — re-verify at HEAD.*

**Renumber map (NIGHT1 proposed → BL-4.x):**

| Old | New | Old | New | Old | New |
|---|---|---|---|---|---|
| BL-3.18 | BL-4.01 | BL-3.23 | BL-4.06 | BL-3.28 | BL-4.11 |
| BL-3.19 | BL-4.02 | BL-3.24 | BL-4.07 | BL-3.29 | BL-4.12 |
| BL-3.20 | BL-4.03 | BL-3.25 | BL-4.08 | BL-3.30 | BL-4.13 |
| BL-3.21 | BL-4.04 | BL-3.26 | BL-4.09 | BL-3.31 | BL-4.14 |
| BL-3.22 | BL-4.05 | BL-3.27 | BL-4.10 | BL-3.32 | BL-4.15 |

**Entries:**

| ID | Sev | Title | Bundles (NIGHT1) | Ships with (NIGHT2) |
|---|---|---|---|---|
| **BL-4.00** | — | **Static contract suite (FIRST — ship before any BL-4.x fix):** unique HTML ids; JS-referenced ids ⊆ HTML ids ∪ allowlist; `getFunctions(` only in firebase-config.js; no `if (true \|\|` in src | catches F5, F6, F7, F8-root, F10-tripwire, F1-root | item 1 |
| BL-4.01 | P1 | WHS data-integrity cluster: live-round rating/slope/par constants; HI `.textContent`; notCounting passthrough; dead Exclude/Delete; fir/fwy save key | F1, F2, F3, F4, N17 | items 2,3,4,5 |
| BL-4.02 | P1/P2 | On-Course setup rewiring: populate `oc-stat-*`/`oc-dh-*`; restore manual CR/SR/Par/DH; custom-course flow; fix dead `.active` alert gate | N2, F11, F1-root | items 3,6 |
| BL-4.03 | P1 | Resolve duplicate `id="tab-practice"` — merge/retire legacy Practice Drills screen (product decision) | F5, N18 | item 1 |
| BL-4.04 | P1 | Comp logging repair: dynamic rule inputs; live-round `totalPoints`; comp-empty-state; del-comp-round handler; starting-points display. **Folds NIGHT3 R-LIVE-1** (rule-less `competition_results` write at oncourse.js:1148 runs before `comp_rounds` in one try → denial aborts BOTH writes; drop the write or add a rule, write `comp_rounds` first) | F8, F9, N9, N10, N11, **R-LIVE-1** | items 7,8 |
| BL-4.05 | P1 | Coach linkage unification: `coaches[]` vs `coachUid`; Add-Coach input ID (F6); HI source; assignedDrills read path (see BL-3.06) | F6, N22, coach-HI | items 9,12,14 |
| **BL-4.06 ✅** | P1 | Pin `askAiCoach` to the shared Sydney Functions instance. *Completed: 2026-06-13 · commit 1a7972d (merged via PR #48 `fix/xs-contract-violations`).* `src/ai.js` previously built its own region-less `getFunctions()` (defaulted to `us-central1`, never emulator-connected); replaced with the pinned shared `functions` import from `firebase-config.js`. `getFunctions(` now appears in src/ only in `firebase-config.js`, which keeps contract group (c) green as the standing regression guard. Verified 2026-06-14: ai.js:6 imports shared `functions`, ai.js:233 calls `httpsCallable(functions, 'askAiCoach')`, no rogue instance remains. | F7 | item 1 |
| **BL-4.07 ✅** | P1 | Remove auth debug bypasses (`if (true \|\|`, catch-path admin grant) — security sign-off. *Completed: 2026-06-14 · commit 8ed20c3.* Both changes landed in `src/auth-v2.js`: forced-true gate removed (line 149); catch-path no longer grants admin/access — on a failed `users/{uid}` read it holds the user on the auth overlay with a retry message (operator-chosen behaviour (a)), 3-retry loop untouched. Contract group (d) flipped red→green; new sibling group (e) guards against any `currentUserIsAdmin = true` hard-grant in src/. `npm run test:unit`: (d)+(e) green, whs.test.js 7/7. | F10 | items 10,12 |
| BL-4.08 | P1 | Shots schema reconciliation: `line/curve` vs `startLine/shape`; `outcome:'Green'` GIR; `isOffGreen` setter; simpleStats sourcing | F12, N4, N5, N15 | item 11 |
| BL-4.09 | P2 | Feed differential: compute `handicapDifferential` at fan-out (after BL-4.01) or drop column | N6 | — |
| BL-4.10 | P2 | Notifications: wire `triggerLocalNotif` honouring saved prefs, or descope settings panel | N7 | item 14 |
| BL-4.11 | P2 | Legacy `.active`-class remnants: telemetry active-tab check + event-binders alert gate | N8, F11-part | item 6 |
| BL-4.12 | P2 | Comp archive/delete: implement or strip dead UI (incl. delete-comp modal) | N1 | — |
| BL-4.13 | P3 | Hygiene sweep: dead cache keys, whs.js render dups, admin template, `temp-submit-register`, `btn-sync-rounds`, `oc-hole-dots`, `oc-progress-bar` (+dead CSS), ai.js double-bind, mainApp dup key, normaliser realignment + `normalizePracticeRound`, `competition_results` write-only, `!important` (×44 — NIGHT3 H3), app-version, **NIGHT3 H22 dead CSS tab selectors, H23 sw.js version string, H24 package.json `main`, H25 unused tempo rule, H26 empty graveyard dir**. *Note: NIGHT1 H14 was INVALID (NIGHT3 R8) — exclude.* | H1–H21 (−H14) + NIGHT3 H22–H26 | items 13,15 |
| BL-4.14 | P2 | Mid-round review scorecard: restore `btn-oc-review-round` trigger or delete unreachable feature + modal | N3 | — |
| BL-4.15 | P2 | State-contract: route `liveRoundGroups` score/stat writes through `mutateList` so persistence auto-save fires | H21 | — |
| **BL-4.16** | P2 | **Surveyor persistence — DECIDE (NIGHT3 R-LIVE-2):** pin save is triple-broken (no `courses` rule → denied; `updateDoc` on docs nothing creates; zero readers — `surveyData` only read from AppState) while UI alerts "Pin saved successfully!". Descope to local-only (XS) or build the feature (rule + `setDoc merge` + boot read, M) | R-LIVE-2 | — |
| **BL-4.17** | P1 | **Stored XSS via unescaped innerHTML (displayName, round.course).** User-controlled strings are interpolated into `innerHTML` without escaping, so a crafted `displayName` or `round.course` persists to Firestore and executes when rendered for the victim. **Live sinks (evidence):** `round.course` → `whs.js:342`, `ui.js:371`; `displayName` → `admin.js:25`, `social.js:46`, `social.js:107`, `competitions.js:592-593`. Also `notifications.js:70` renders the viewer's *own* `displayName` (self-XSS only — lower risk, listed for completeness). **Fix direction:** introduce a shared escape helper (HTML-entity-encode untrusted text) and apply it at **every** sink, landing **with a regression test** asserting markup is neutralised. ⚠️ **SUPERVISED ONLY — multi-file output-escaping, not for unattended runs.** | docs/04_production_readiness_audit.md Area 2 #1–2 | — |

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

## Practice Caddy Upgrades (Adaptive Engine)
- [ ] Phase 1: Hybrid Session Configurator & State Persistence
  - [ ] Replace star ratings with a 1-5 Post-Drill Confidence Slider (Self-Efficacy Metric).
  - [ ] Add Time Available (Slider/Buttons) & Focus Toggle (Deep Dive vs. Circuit) UI inputs.
  - [ ] Bind state to AppState.activePracticeSession and serialize to IndexedDB for offline-first crash recovery.
- [ ] Phase 2: Contextual Scoring & "Drill Handicap" Normalization
  - [ ] Implement drill-specific scoring schemas (ratios, streaks, points).
  - [ ] Build math normalization layer to calculate a 0-100/Handicap baseline index per drill over time.
