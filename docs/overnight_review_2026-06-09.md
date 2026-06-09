# Overnight Deep Review — 2026-06-09

*Author: Claude Code (Opus) · Analysis only — no code changed in this report.*
*Scope: full `src/` tree, `tests/`, `functions/`, `firestore.rules`, `index.html`, `MASTER_BACKLOG.md`.*
*Baseline: HEAD after BL-3.16 (`5476ac2` code, `0ecc2ee` docs). Sydney Protocol per `CLAUDE.md`.*

---

## TL;DR for the morning

1. **BL-3.16 landed cleanly** (Phase A): two pure normalisers in `state.js`, three callbacks wired, 50-line diff, no Protocol regressions.
2. **The Sydney Protocol is not yet satisfied repo-wide.** After tonight: **20** `.style.display` assignments, **46** `!important` declarations in `style.css`, and **~22** in-place `AppState` mutation sites across 6 files that bypass `mutateList`. BL-3.14 only migrated its 4 named sites; the rest were never in scope. None are *new* tonight — BL-3.16 was additive and compliant.
3. **BL-3.05 (AI Practice Plan) is worse than the backlog states.** Beyond the documented query-path / shape / DOM-ID breakage, the **Cloud Function reads `users/{uid}/rounds` (functions/index.js:257) — a subcollection the client never writes** (rounds live in root `whs_rounds`). So the "personalised" plan input is *always* the generic fallback. This is the root data-integrity defect under BL-3.05 and must be fixed server-side too.
4. **BL-3.06 appears already resolved.** `firestore.rules:48-56` contains the `assignedDrills` match block the ticket says is missing. Recommend verify-and-close.
5. **Test suite is largely theatre.** Of the 8 Playwright spec files, most real-looking assertions are tautological, conditional, or point at **stale selectors / the production URL**. Genuine safety nets: `tests/unit/whs.test.js` and `tests/oncourse.test.js` (vitest) and `tests/rules/firestore.test.js` (one of which encodes a validation the rules don't enforce).
6. **Functions security:** one real concern — `generateAudioBriefing` server-side-fetches a client-supplied `audioUrl` (SSRF surface, functions/index.js:152).

---

## 1. Sydney Protocol Compliance Audit

Method: ripgrep across `src/` for each banned pattern, then manual classification. Counts are post-BL-3.16.

### 1a. `.style.display` assignments — 20 total, 9 files

| File:line | Context | Assessment |
|---|---|---|
| `whs.js:209`, `whs.js:213` | `<canvas>` trend chart show/hide | Should be `.hidden` class toggle. Violation. |
| `ui.js:653`, `ui.js:657` | `<canvas>` chart show/hide (duplicate of whs logic) | Violation. Same fix as above. |
| `ai.js:70`, `ai.js:71`, `ai.js:73`, `ai.js:75` | Role-based AI button gating | **FP-09**: mechanism is role-gating, not tab-nav — but still a literal `.style.display` write, so still violates the "no `.style.display`" rule. |
| `app-v4.js:309`, `app-v4.js:313` | `addRoundContainer` self-vs-other view | **Known — T3-styleDisplay flagship.** Drive via derived `AppState.isViewingSelf` + `data-*` CSS. |
| `oncourse.js:848`, `oncourse.js:920` | `btnAudio` show/hide (`flex`/`block`) | Violation. Candidate for `.hidden`. |
| `auth-v2.js:26/27`, `auth-v2.js:43/44` | Login↔Register button toggle | **Deliberately retained** per BL-3.15 B2 note (single-lever-per-element, not dual-lever). Leave. |
| `tempo.js:122`, `tempo.js:135` | `tempoRing` animation reflow | **Known — T3-tempo.** Replace reflow idiom with rAF/class swap. |
| `practice.js:321` | `label.style.display='block'` on a freshly-created element | Benign layout on a node that has never been in the DOM; not a visibility-state lever. Low priority. |
| `coach.js:68` | `li.style.display='flex'` on freshly-created element | Benign layout (same rationale). Low priority. |

**Breakdown:** ~4 deliberately retained (auth-v2), ~2 benign layout (practice/coach), ~2 known/ticketed (app-v4 T3-styleDisplay, tempo T3-tempo), leaving **~12 genuine un-ticketed visibility violations** (whs ×2, ui ×2, ai ×4, oncourse ×2 + the chart canvases). The ai.js four are FP-09-annotated but still technically in-scope for the "no `.style.display`" rule.

### 1b. `!important` in `style.css` — 46 declarations

Grouped by line cluster (all 46 confirmed via `rg -c`):

- **Utility/text classes:** 111 (`.hidden` `display:none`), 114–116 (`.text-success/warning/danger` colours).
- **Auth overlay forced visibility:** 583–586 (`display/opacity/visibility/z-index`), 609 (`display:none`).
- **Active-tab / button-active skins:** 688–690, 703–705, 710–712, 1060–1061.
- **State badges:** 1042–1044, 1048–1050, 1054–1056.
- **Misc layout:** 854, 913, 1065–1066.
- **Fixed bottom-nav bar:** 1070–1082 — the single densest block, **13** `!important` declarations.

The Protocol bans `!important` outright. These are pre-existing (BL-3.15 B1 only removed the one dead `body.round-active #tab-oncourse.hidden` rule). This is a population statistic, not a single fix — recommend a dedicated epic (see §4). The bottom-nav block (1070–1082) and the auth-overlay block (583–586) are the highest-value cleanups because they are the loudest specificity hammers.

### 1c. Direct `AppState` array/object mutation bypassing `mutateList` — ~22 sites, 6 files

The Proxy `set` trap fires on **reference change only** (`state.js:66`). The sites below keep the same reference, so `stateChange` never dispatches. Most currently "work" only because the caller *manually* re-renders right after — i.e. they re-introduce exactly the parallel-imperative pattern BL-3.14 was meant to retire.

**Array in-place mutations:**
| File:line | Code | Note |
|---|---|---|
| `competitions.js:204,206` | `currentCompRounds = []` then `.push()` in loop | Reset reassign fires trap; the pushes do not. `renderCompLeaderboard()` called manually after. |
| `modules/score-input.js:103` | `currentHoleShots.push({...})` | |
| `modules/score-input.js:100` | `currentHoleShots[idx] = {...}` | |
| `oncourse.js:987` | `currentCoursePars[holeIdx] = val` | |

**Nested object-property writes (also bypass the trap):**
| File:line | Code |
|---|---|
| `modules/event-binders.js:152` | `currentShotData.club = val` |
| `modules/event-binders.js:182` | `currentShotData[group] = val` |
| `modules/event-binders.js:202` | `currentShotData.routines = {}` (+ key write) |
| `oncourse.js:1460–1469` | `currentShotData.penalty/outcome = ...` (6 writes) |
| `modules/telemetry.js:34,36,37,43` | `currentHoleTelemetry.teeLat/teeLon/inferredDrive/inferredApproach` |
| `modules/telemetry.js:55,56` | `currentHoleTelemetry.teeLat/teeLon` |
| `surveyor.js:127,128,182,186,189,194` | `surveyData[...]` nested writes |

**Two latent inconsistencies surfaced here:**
- `AppState.surveyData` and `AppState.currentHoleTelemetry` are **not declared in `initialState`** (`state.js:6-36`). They are lazily created on first write. The creating reassignment fires the trap, but they are undocumented, not persisted, and not reset on round end — drift risk.

**Caveat (important for triage):** not all 22 sites *need* reactive dispatch. `currentShotData`, `currentHoleTelemetry`, and `surveyData` are write-then-persist scratchpads; the arrays (`currentCompRounds`, `currentHoleShots`, `currentCoursePars`) are followed by manual re-render. So these are **Protocol violations, not necessarily live bugs.** Migration to `mutateList` is correctness/consistency work, not a fire.

### Total remaining violations after tonight
- `.style.display`: **20** (≈12 actionable, 4 retained-by-design, 2 benign, 2 ticketed)
- `!important`: **46**
- In-place `AppState` mutation: **~22 sites / 6 files**
- **BL-3.16 introduced zero new violations** and removed none (it was additive normalisation; the three callbacks it touched all remain reference-reassignments or `mutateList`).

---

## 2. BL-3.05 Readiness Assessment — AI Practice Plan rebuild

There are **two unrelated "practice" systems**; do not conflate them:
- **Manual drills** (`practice.js` → `practice_rounds` collection, `DRILL_TEMPLATES`). Working.
- **AI Practice Caddy** (`ui.js bindPracticeCaddyUI` ↔ Cloud Function `generatePracticePlan` ↔ `practice_plans`/`global_drills`). **Broken — this is BL-3.05.**

### 2a. Query-path map (current vs. correct)

| Layer | Current | Should be |
|---|---|---|
| UI load (`ui.js:819-823`) | `collection(db,"practice_plans")` root, `where userId == uid, status == active` | `users/{uid}/practice_plans/active` (doc), or keep callable return only |
| UI step-toggle (`ui.js:889`) | `doc(db,"practice_plans", drillId)` | `users/{uid}/practice_plans/active` |
| UI archive (`ui.js:924`) | `doc(db,"practice_plans", _activeDrillData.id)` | `users/{uid}/practice_plans/active` |
| CF write (`functions/index.js:335,342`) | `users/{uid}/practice_plans/active` + `global_drills/{id}` | (correct) |
| CF input read (`functions/index.js:257`) | `users/{uid}/rounds` (orderBy date, limit 5) | **`whs_rounds` where uid == uid** — client never writes `users/{uid}/rounds` |

**Root defect (new finding):** the CF's personalisation input at `functions/index.js:257` queries `users/{uid}/rounds`, a subcollection that **no client code ever populates** (rounds are written to root `whs_rounds` by `whs.js addRound`). The loop therefore finds no `aiSummary` and always uses the generic fallback string (`functions/index.js:271`). Every "AI" plan is currently impersonal. There is also no `firestore.rules` block for `users/{uid}/rounds` (the Admin SDK bypasses rules, so no error — it just returns empty).

### 2b. Data-shape mismatches (CF output → UI expectation)

CF returns: `{ source, drillId, steps: string[], category, targetMetric, completedSteps: boolean[] }` (functions/index.js:344-351).

UI expects:
- `showActiveDrill` (ui.js:846-850) reads `data.title`, `data.description` → CF returns **neither** → always falls back to "Your Custom Drill" / generic.
- `renderPracticeSteps` (ui.js:779-794) reads `step.title`, `step.description`, `step.goal`, `step.reps` — i.e. **step as object** → CF returns **strings** → renders `undefined` for every step field.
- `completedSteps`: CF returns **boolean[]** `[false,false,false]`; UI step-toggle writes via `arrayUnion(stepIdx)/arrayRemove(stepIdx)` (ui.js:892,896) — i.e. an **index array**. Two incompatible representations of the same field.
- `data.id`: UI uses it as a `practice_plans` doc id (ui.js:889,924); CF returns `drillId` = the `global_drills` id, not a `practice_plans` doc id. Cross-collection id confusion.

### 2c. DOM-ID mismatches (ui.js ↔ index.html)

| ui.js reference | index.html actual | Status |
|---|---|---|
| `btn-generate-practice` (806) | `btn-generate-practice` (204) | ✅ match |
| `practice-steps-list` (880) | `practice-steps-list` (231) | ✅ match |
| `practice-state-empty/active/loading` (759-761) | present (referenced by quota spec) | ✅ assume match |
| `btn-archive-drill` (807) | `btn-reset-practice` (226) | ❌ mismatch → archive handler never binds |
| `practice-gen-error` (808) | `practice-generate-error` (208) | ❌ mismatch → errors never shown |
| `active-drill-title` (846) | *absent* (html has `practice-category-badge`) | ❌ missing |
| `active-drill-desc` (847) | *absent* (html has `practice-target-metric`) | ❌ missing |
| — | `practice-category-badge` (220), `practice-target-metric` (223), `practice-rating-section` (237) | ❌ rendered-to by nothing in `bindPracticeCaddyUI` |

### 2d. Concrete, chunked fix plan for a future session

**Chunk 1 — Cloud Function input path (server, isolated):** in `functions/index.js:257` change `.collection('rounds')` → query root `whs_rounds` `where('uid','==',uid)`; pull `aiSummary` from those docs. Add a `users/{uid}/rounds` OR `whs_rounds` read note. ~6 lines. Independently testable in emulator.

**Chunk 2 — Decide the canonical schema, then align CF output:** choose object-steps `{title,description,goal,reps}` (UI already expects it) OR string-steps (simpler). Recommend **object steps** + add `title`/`description` to the CF JSON contract (functions/index.js:284-293 systemInstruction + return shape). Make `completedSteps` a single representation (recommend **index array** to match the UI toggle). ~25 lines, one commit.

**Chunk 3 — Repoint UI queries to subcollection:** `ui.js:820/889/924` → `users/{uid}/practice_plans/active`. Once done, the BL-3.12 root `practice_plans` stopgap rule (firestore.rules:110-113) can be deleted (DATA-02 supersedes it). ~15 lines.

**Chunk 4 — Fix DOM IDs:** either rename `index.html` ids to match `ui.js` (`active-drill-title/desc`, `practice-gen-error`, `btn-archive-drill`) or rename the `ui.js` getElementById calls to the html ids and bind `practice-category-badge`/`practice-target-metric`/`practice-rating-section`. Recommend updating `ui.js` to the richer html (category/metric/rating exist for a reason). ~20 lines.

**Chunk 5 — E2E:** rewrite `quota-guards.spec.js` "Cache Hit" to assert against the now-working active state; un-skip the relevant flows. (Ties to AUDIT-02.)

Each chunk is ≤ the 150-line guardrail and independently testable against the emulator.

---

## 3. Test Suite Health (AUDIT-02)

Runner split (`package.json`): `test`/`test:unit` → vitest `tests/unit`; `test:rules` → emulator + vitest `tests/rules`; `test:e2e` → Playwright (everything else). Last Playwright run (`test-results/.last-run.json`): **status `failed`, 3 failed test IDs** (IDs only, names not recoverable without the HTML report). MASTER_BACKLOG records "10/14 passing" post-BL-3.15.

| Spec file | Tests | Real `expect()` | Verdict |
|---|---|---|---|
| `tests/unit/whs.test.js` | 6 | 8 genuine | ✅ **Real safety net.** Pure WHS math. Caveat: mock paths (`'../../state.js'`, gstatic firestore URL) don't match `whs.js`'s actual `firebase/firestore` import — works because tested fns are pure, but mocks are dead. |
| `tests/oncourse.test.js` | 2 | 4 genuine | ✅ **Real.** `loadHole()` DOM assertions + par math. Mock path `'../src/state.js'` is correct. |
| `tests/rules/firestore.test.js` | 3 | real (`assertFails/Succeeds`) | ⚠️ **Mostly real but encodes an unmet contract.** Test 3 ("deny bad round data", adjustedGross 500) expects a **max-200 validation the rules don't have** (`whs_rounds` create rule is only `uid == auth.uid`). This test should **fail** against current rules → either the rules need field validation, or the test is aspirational. Real finding either way. Needs emulator on :8080. |
| `tests/e2e/app.spec.js` | 1 | 4 genuine | ✅ Real smoke test (title + auth inputs visible). |
| `tests/async-coach.spec.js` | 1 | `expect(true).toBe(true)` (line 66) | ❌ **Tautological placeholder.** Confirms FP-06. (2 setup `toBeHidden` are auth gating, not the feature.) |
| `tests/logic-boundaries.spec.js` | 5 | 1 test real | ⚠️ Only "WHS Limits" (66/71/75-76) is genuine. "Time Travel" has **no `expect()`** on date validity (FP-07). "Fuzzing Scores" asserts a hardcoded `return true` (tautological). "Sub-Score Logic" and "Chip-in Validation" have **empty bodies**. 4/5 are vacuous. |
| `tests/quota-guards.spec.js` | 2 | 1 real-ish | ⚠️ "Double-Tap" asserts `requestCount<=1` but targets `#btn-generate-practice`, not the briefing it names (FP-05). "Cache Hit" only asserts **inside `if (activeState.isVisible())`** — and active state never shows (BL-3.05 broken) → vacuous pass. |
| `tests/security-rbac.spec.js` | 2 | tautological/conditional | ❌ "Data Isolation" returns a **hardcoded** `{code:'permission-denied'}` then asserts it equals `'permission-denied'` — tests nothing. "Peeping Tom" asserts only inside `if (isVisible)`. |
| `tests/ui-ergonomics.spec.js` | 3 | 2 real, 1 conditional | ⚠️ "no horizontal scroll" and "tag-balance" are real; "44px touch target" only runs `if (plusButton.isVisible())`. |
| `tests/ux-bag-management.spec.js` | 1 | none hard | ❌ Contains `test.fixme(...)` mid-body and a `.catch(()=>{})` that swallows the final assertion. Mocked DOM injection. No real persistence assertion. |
| `tests/e2e/live_audit.spec.js` | 1 | real but **obsolete** | ❌ **Points at production** `https://golf-handicap-tracker-b677c.web.app/` with hardcoded creds, and uses **stale selectors** (`#login-email`, `#main-hub`, `#tab-btn-oncourse`, `#oncourse-setup`, `#btn-start-round`, `#oncourse-wizard`, `#btn-wiz-driver`) that don't exist in the current app (`#auth-email`, `#btn-oc-start`, `[data-target]`). Will fail/time out. Test rot. |
| `tests/e2e/round_flow.spec.js` | 1 | 1 real + dead block | ⚠️ Stale selectors (`#btn-start-round`, `#active-round-ui`). The round-flow body is gated on `if (onCourseBtn.isVisible())` which is false when logged out → only `expect(authOverlay).toBeVisible()` runs → **vacuous pass**. |

**Bottom line:** trustworthy = `whs.test.js`, `oncourse.test.js`, `app.spec.js`, and (modulo the unmet-contract test 3) `firestore.test.js`. Everything in the Phase 2–5 Playwright corpus is placeholder, conditional, or rotted. Green CI on those is **not** signal. Prioritise rewrites alongside BL-3.05 (the broken feature is why several specs can only pass vacuously).

---

## 4. Remaining Backlog Reassessment

### Now resolved / obsolete (verify-and-close)
- **BL-3.13** ✅ done — `endRoundCleanup()` calls `stopAudioTimer()` as its first line (`oncourse.js:99-100`). Audio-timer leak closed.
- **BL-3.06** — **appears already resolved.** The ticket says `firestore.rules` has no `assignedDrills` match block, but `firestore.rules:48-56` defines exactly that (coach create/delete, player update-`completed`-only, owner/coach/admin read). `coach.js:137` writes there as the coach. Recommend a quick emulator confirmation, then close. **Do not re-implement.**
- **BL-3.12** — stopgap rule live at `firestore.rules:110-113`. Still required until BL-3.05 Chunk 3 repoints the query; then delete it.
- **BL-3.16** ✅ done tonight.

### Unblocked / changed priority by tonight's work
- **BL-3.05** is now fully mapped (see §2) including the server-side `users/{uid}/rounds` defect the backlog didn't capture. It is executable in 5 chunks. Highest priority.
- The normaliser layer from BL-3.16 gives BL-3.05 a place to harden CF→UI shape coercion (`normalizeRoundDoc` could absorb the `course`/`courseName`, `adjustedGross`/`adjustedGrossScore` aliasing the feed CF already does manually).

### New findings to add to the backlog
1. **NEW — `mutateList` migration round 2.** ~22 in-place `AppState` mutation sites across `competitions.js`, `oncourse.js`, `modules/score-input.js`, `modules/event-binders.js`, `modules/telemetry.js`, `surveyor.js` (see §1c). Multi-PR, triage scratchpad-vs-reactive per site. Sibling to T2-A.
2. **NEW — undeclared state keys.** `surveyData` and `currentHoleTelemetry` are written but absent from `initialState` (`state.js`). Declare + decide reset-on-round-end semantics. ~6 lines.
3. **NEW — CF reads dead path.** `functions/index.js:257` `users/{uid}/rounds` never populated → impersonal AI plans. Folded into BL-3.05 Chunk 1 but worth its own line.
4. **NEW — rules data-validation gap.** `whs_rounds` create has no field validation; `tests/rules/firestore.test.js` test 3 expects `adjustedGross<=200`. Either add validation or retire the test expectation.
5. **NEW — E2E test rot.** `live_audit.spec.js` (prod URL + stale selectors) and `round_flow.spec.js` (stale selectors, vacuous) should be deleted or rewritten against the emulator. Fold into AUDIT-02.
6. **NEW — SSRF surface.** `generateAudioBriefing` fetches client-supplied `audioUrl` server-side (see §5).

### Recommended next 3–5 items, in priority order
1. **BL-3.05 AI Practice Plan rebuild** (Chunks 1→5 in §2). Highest user-facing value; now fully specified. Start with Chunk 1 (CF input path) — it is the true root cause and is independently testable.
2. **BL-3.06 verify-and-close** + **BL-3.07 comp-invite wiring**. Cheap wins; 3.06 may just need a closing note. 3.07 is isolated UI wiring.
3. **`mutateList` migration round 2 (new #1)** — restore the reactive layer's credibility; pairs naturally with whichever modules BL-3.05 touches (`oncourse`, `event-binders`, `score-input`).
4. **AUDIT-02 / test-rot cleanup (new #5 + §3)** — delete `live_audit`/`round_flow`, de-tautologise `security-rbac` & `async-coach`, fix `quota-guards` once 3.05 makes active state reachable. Restores CI as signal before any release.
5. **Functions hardening (new #6 + §5)** — validate `audioUrl` origin; stop the per-call model-list spy; stop leaking `error.message` to clients.

Defer as before: ARCH-02 (`ui.js` extraction), T3-epic (`classList` sprawl), CI gates — all pre-release, post-feature-stability.

---

## 5. Functions/ Directory Audit (AUDIT-01)

`functions/index.js` is the only source file (459 lines). Seven exports.

### 5a. Region pinning — ✅ all pinned to `australia-southeast1`
`const REGION = "australia-southeast1"` (line 12), applied to every export:
- `askAiCoach` (27), `processRulesQuery` (49), `analyzeRoundStats` (74), `generateAudioBriefing` (130), `generatePracticePlan` (230) — all `onCall({ region: REGION, ... })`.
- `onRoundCreated` (384), `onRoundDeleted` (434) — `onDocument*({ document, region: REGION })`.

Client side matches: `firebase-config.js:41` `getFunctions(app, 'australia-southeast1')`. No region drift anywhere.

### 5b. Security
- **Auth:** every `onCall` rejects unauthenticated (`if (!request.auth) throw 'unauthenticated'`). ✅
- **Secrets:** `GEMINI_API_KEY` via `secrets: ["GEMINI_API_KEY"]`, read from `process.env`. ✅ Not hardcoded.
- **⚠️ SSRF — `generateAudioBriefing` (line 152):** `await fetch(audioUrl)` where `audioUrl` comes straight from `request.data`. An authenticated user can point the function at arbitrary URLs (internal metadata endpoints, other tenants' signed URLs, etc.). **Recommend** validating `audioUrl` is within the project's Storage bucket (prefix-check `https://firebasestorage.googleapis.com/.../golf-handicap-tracker-b677c...`) before fetching.
- **Minor — info disclosure:** the "Model Spy" (lines 140-147) enumerates and logs all available models on **every** audio-briefing call. Latency + noise; remove or gate behind a debug flag.
- **Minor — error leakage:** `processRulesQuery` (67) and `analyzeRoundStats` (119) return `"AI Error: " + error.message` / `"Coach Error: " + error.message` to the client. Prefer a generic message + server-side log.
- **Note (not a bug):** all Firestore access uses the Admin SDK, which **bypasses `firestore.rules`** — correct for trusted server code, but it means rule correctness is not exercised by these functions. Keep that in mind for AUDIT-02 rules tests.

### 5c. Data integrity at the client/server boundary
- **🔴 Dead input path (root BL-3.05 defect):** `generatePracticePlan` reads `users/{uid}/rounds` (line 257) for `aiSummary`. The client writes rounds to root **`whs_rounds`** (`whs.js addRound`, `firestore.rules:73`). The subcollection is never populated → `aiSummary` always null → always the generic fallback (line 271). The "AI" plan is impersonal by construction. (Also: no rule exists for `users/{uid}/rounds`, but Admin SDK bypasses, so it fails silent-empty rather than erroring.)
- **Shape contract vs. UI:** CF returns string-steps + boolean `completedSteps` + no title/description; UI expects object-steps + index `completedSteps` + title/description (see §2b). Boundary mismatch.
- **Defensive aliasing (good):** the feed fan-out handles field drift well — `courseName ?? course` (413), `adjustedGrossScore ?? adjustedGross` (414). Worth mirroring in BL-3.16's `normalizeRoundDoc` so client and server agree on canonical names.
- **`handicapDifferential` never persisted:** feed stores `roundData.handicapDifferential ?? null` (415), but `whs_rounds` docs never carry that field (it's computed client-side in `calculateIndex`, not written per-round). So every feed card shows Diff `—` (`social.js feedDifferential`). Cosmetic data gap, not a crash.

### 5d. Path consistency vs `firestore.rules`
| CF path | Rule | Consistent? |
|---|---|---|
| `global_drills/{id}` write (322,335) | `firestore.rules:59-62` (write: admin) | ✅ (Admin SDK bypass; rule sane) |
| `users/{uid}/practice_plans/active` (335) | `firestore.rules:44-46` | ✅ |
| `users/{uid}/rounds` read (257) | **no rule** + client never writes | 🔴 orphaned path (see 5c) |
| `feed` writes (421) | `firestore.rules:149-154` (client create/update/delete = false) | ✅ server-only by design |
| `collectionGroup('following')` (398) | `firestore.rules:156-158` | ✅ |
| `users/{uid}` read (395) | `firestore.rules:31-33` | ✅ |

**Net:** functions are well-regioned, authenticated, and the feed fan-out is solid. The two things to act on are the **SSRF surface** (5b) and the **dead `users/{uid}/rounds` input path** (5c, which is also the true heart of BL-3.05).

---

*End of report. Untracked by design — do not commit; for morning review and sprint planning.*
