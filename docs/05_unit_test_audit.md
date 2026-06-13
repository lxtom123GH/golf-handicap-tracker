# Overnight Review — Night 2: Unit Test Audit

**Date:** 2026-06-12 (overnight session)
**HEAD:** `e50c3f5` (Merge PR #47)
**Scope:** Audit of the six test files listed as "Not audited" in `docs/03_testing_strategy.md`, plus a P1 coverage matrix for findings F1–F12 from `docs/overnight_review_night1_blast_radius.md` (hereafter NIGHT1). NIGHT1's schema findings are treated as ground truth; source wiring was **not** re-audited.
**Method:** Static analysis only. Each test file read in full alongside the source it claims to test, the test-runner configs (`package.json`, `vitest.config.js`, `playwright.config.js`), `firestore.rules`, `index.html`, and `src/`. No test runner, emulator, or git-write command was executed. No file other than this report was created or modified.
**Reference standard:** `tests/quota-guards.spec.js` — worker-indexed emulator auth, real network-request assertions, unconditional `expect()`s. (Caveat per FP-05/AUDIT-02: its Double-Tap test *title* names the wrong button, but the test is internally coherent — it clicks `#btn-generate-practice` and counts `generatePracticePlan` requests. Cited, not re-investigated.)

Severity tiers (adapted from NIGHT1):
- **P1 FALSE SIGNAL** — test is green (or red) for reasons unrelated to the feature; CI status is misleading
- **P2 VACUOUS** — test runs but its assertions cannot fail meaningfully, or it never runs at all
- **P3 HYGIENE** — fragility, mislabelling, drift; no misleading signal today

---

## Executive summary — top findings

| # | Sev | Finding | Evidence anchor |
|---|-----|---------|-----------------|
| T1 | P1 | `tests/oncourse.test.js` is **executed by nothing** — `npm run test:unit` runs `tests/unit` only, Playwright `testMatch` excludes it. Orphaned test, permanent phantom coverage | package.json:11,14; playwright.config.js:9 |
| T2 | P1 | `tests/rules/firestore.test.js` would be **red if run**: asserts an unfiltered `whs_rounds` collection `get()` succeeds (rules restrict reads per-doc — unprovable queries are denied) and asserts a data-validation rejection (`adjustedGross: 500`) that `firestore.rules` contains no rule for | firestore.test.js:44, 75-81; firestore.rules:75-83 |
| T3 | P1 | `tests/security-rbac.spec.js` "Data Isolation" test **hardcodes its own pass**: `page.evaluate` returns a literal `{ code: 'permission-denied' }` which is then asserted. Zero Firestore involvement | security-rbac.spec.js:51-56 |
| T4 | P1 | `tests/security-rbac.spec.js` "Peeping Tom" registers an **admin** (not a standard player), then asserts coach-tab text doesn't contain the word `confidential` — a string the app never renders. Passes even though the coach tab opens (client RBAC is decorative per F10) | security-rbac.spec.js:8, 45-46; auth-v2.js:71-73, 149 |
| T5 | P1 | All four `vi.mock` specifiers in `tests/unit/whs.test.js` are **inert** (wrong paths / wrong module IDs) — the "unit" test loads the real Firebase SDK, real Chart.js, real `state.js` and real `ui.js`. Assertions are correct; isolation is fictional | whs.test.js:5-27; src/whs.js:5-9 |
| T6 | P2 | `tests/ux-bag-management.spec.js` aborts itself with runtime `test.fixme()` at line 74 — everything after (the entire Live-Scoring assertion block) is dead code, and its one start-round assertion swallows failure with `.catch(() => {})` | ux-bag-management.spec.js:74, 87 |
| T7 | P2 | `tests/async-coach.spec.js` ends in `expect(true).toBe(true)` with all functional steps commented out — confirmed AUDIT-02/FP-06; runs green in every CI pass via Playwright `testMatch` | async-coach.spec.js:56-66; playwright.config.js:9 |
| T8 | P2 | Two of five tests in `tests/logic-boundaries.spec.js` have **completely empty bodies that pass green** (not `test.skip()` as the debt catalogue claims), and "Time Travel" ends with an unused variable and no final `expect` | logic-boundaries.spec.js:55-58, 100-106 |
| T9 | P2 | `tests/e2e/app.spec.js` and `tests/e2e/round_flow.spec.js` are **not in `testMatch`** and hardcode `127.0.0.1:3000` (baseURL is `:5173`) — never run by `npm run test:e2e`; `round_flow` additionally targets four IDs that don't exist | playwright.config.js:9,17; round_flow.spec.js:4,15,24,28,32 |
| T10 | P3 | `docs/03_testing_strategy.md` inventory lists six phantom files under `tests/unit/` — that directory contains **only** `whs.test.js`; the rest live at `tests/` root and are Playwright browser tests, not unit tests | 03_testing_strategy.md:17-24; tests/unit/ (1 file) |
| T11 | P3 | The cleanup utilities the strategy doc cites (`tests/utils/clear-emulator.js`, `tests/firebase-admin-setup.js`) **do not exist**, and `quota-guards.spec.js` contains no cleanup hooks despite TEST-03 being marked resolved | 03_testing_strategy.md:209-213; quota-guards.spec.js (no afterEach) |

Cross-cutting conclusion: **not one test in the repository asserts against a Firestore document the app actually wrote.** The entire schema-mismatch class of P1 (F1, F4, F9, F12, N4, N17) has zero test exposure — there is no test that finishes a round, logs a comp score, saves a shot, or reads back any persisted doc.

---

# Part 0 — Harness facts (what actually runs)

| Runner | Command | Picks up | Misses |
|---|---|---|---|
| Vitest | `npm run test:unit` / `npm test` → `vitest run tests/unit` | `tests/unit/whs.test.js` **only** | `tests/oncourse.test.js` (T1) |
| Vitest | `npm run test:rules` → `emulators:exec --only firestore "vitest run tests/rules"` | `tests/rules/firestore.test.js` | — |
| Playwright | `npm run test:e2e` → `testMatch` allowlist (playwright.config.js:9) | `logic-boundaries`, `quota-guards`, `security-rbac`, `async-coach`, `ux-bag-management`, `ui-ergonomics` (all at `tests/` root) | `tests/e2e/app.spec.js`, `tests/e2e/round_flow.spec.js`, `tests/e2e/live_audit.spec.js` (the last is a deliberate-but-undocumented guard — see TEST-02) |

Hazard (P3): a bare `npx vitest run` would also collect the six Playwright `*.spec.js` files (vitest.config.js:8 excludes only `node_modules`, `dist`, `tests/e2e`) and crash on `@playwright/test` imports, plus run the rules tests without an emulator. Recommend an explicit `include: ['tests/unit/**', 'tests/rules/**']` in `vitest.config.js`.

---

# Part 1 — File-by-file audit

## 1. `tests/unit/whs.test.js`

**What it actually asserts:** Real assertions against the real exported functions `getAdjustmentFactor` and `calculateIndex` (src/whs.js:21, 104):
- Adjustment table: `<3 → null`, `3 → {use:1, adj:-2.0}`, `8 → {use:2, adj:0}`, `20/25 → {use:8, adj:0}` — all verified correct against src/whs.js:22-32.
- `calculateIndex([]) → {index: 0, usedIds: []}` ✓ (src/whs.js:106 — note: numeric `0` here vs string `"6.0"` elsewhere; the test correctly mirrors this type inconsistency rather than flagging it).
- 3-round index: diffs 10/13/8 → best 1 (−2.0 adj) → `"6.0"`, `usedIds: ['r3']` — arithmetic verified ✓.
- `notCounting: true` round excluded → `"0.0"` (floor at 0 via `Math.max`, src/whs.js:135) ✓.

**Classification:** **VALID** — the only file of the six whose every assertion exercises real app code and matches source behaviour. One serious harness defect (T5): `src/whs.js` imports `'./firebase-config.js'`, bare `"firebase/firestore"`, `'chart.js/auto'`, `'./state.js'`, `'./ui.js'` (src/whs.js:5-9), but the mocks target `'../../firebase-config.js'` (= repo root, no such module), a gstatic CDN URL (the app uses bare specifiers), `'../../state.js'` and `'../../ui.js'` (also repo root). All four mocks are no-ops. The test passes only because the real chain happens to tolerate jsdom: `firebase-config.js` initialises a real Firebase app and connects emulator routing config (src/firebase-config.js:24-52, no network at import), `ui.js`'s module-scope `getElementById` cache resolves to nulls, and `state.js` is import-free. Any future module-scope DOM access in that chain breaks the suite mysteriously, and the test currently spins up the real Firestore SDK with `persistentLocalCache` per run.

**Tier fit:** True Tier 1 ✓ — correctly located, correctly listed in the strategy doc. The only correctly-tiered file of the six.

**Schema accuracy:** ✓ Accurate. Fixtures use exactly the real `whs_rounds` consumer contract — `id, slope, rating, adjustedGross, notCounting` (NIGHT1 B2). No phantom `holes`/`userId`/top-level `score`. This file is the schema model the others should copy.

**Hardcoded values:** None of concern (113/72 are WHS constants). No credentials.

**Recommended action:** **Keep + expand** — fix the four mock specifiers to `'../../src/firebase-config.js'`, `'firebase/firestore'`, `'chart.js/auto'`, `'../../src/state.js'`, `'../../src/ui.js'`, then add the missing high-value cases (20-round window ordering of `slice(0, count)` which silently assumes desc input, 54-cap, `calculateDailyHandicap`, `calculateHoleStableford` stroke-index allocation, `convertStablefordToAGS` with 9-hole par).

---

## 2. `tests/async-coach.spec.js` (Playwright — *not* in `tests/unit/`)

**What it actually asserts:** Two registration flows complete (auth overlay hidden for player and coach contexts — real assertions, lines 35, 52), then `expect(true).toBe(true)` (line 66). Steps 3–5 (coach portal navigation, drill completion, notification assertion) are entirely commented out (lines 56-65). The describe block claims "Multi-Context Interaction Suite"; the test delivers a double sign-up smoke test.

**Classification:** **THEATRICAL** — the canonical AUDIT-02/FP-06 placeholder, confirmed verbatim. It is in `testMatch` and contributes a permanent green tick for "Real-time Coaching".

**Tier fit:** Mislabelled twice. The strategy doc lists it under `tests/unit/` (it lives at `tests/` root) and implicitly as a unit test (it's a two-browser-context Playwright test). When real, it is firmly **Tier 2** (emulator + browser). Note it cannot be unit-tested: the feature it names (coach notified of player activity) doesn't exist yet (NIGHT1 N7 — `triggerLocalNotif` is never called; N22 — `assignedDrills` has no read path).

**Schema accuracy:** No data assertions at all, so technically no schema errors — but any rewrite must use the **real coach-linkage fields**: roster reads `users.coachUid` (coach.js:166), dropdown reads `users.coaches[]` (app-v4.js:376) — the NIGHT1 coach-linkage split. Writing this test against either field alone will encode the bug.

**Hardcoded values:** `password123`, worker-indexed `@example.com` emails — emulator-safe, fine. `coach-worker-*` emails correctly exploit the localhost `'coach'`-keyword role backdoor (auth-v2.js:73), but this dependency is undocumented in the test.

**Recommended action:** **Skip-and-rewrite-later** — meaningless until BL-3.22 (coach linkage) and BL-3.27 (notifications) land; rewrite in the same brief as those fixes, and meanwhile remove it from `testMatch` (or mark `test.fixme`) so it stops minting green ticks for a nonexistent feature.

---

## 3. `tests/oncourse.test.js` (Vitest — *not* in `tests/unit/`)

**What it actually asserts:**
- Test 1: injects five DOM nodes, sets `AppState.currentCoursePars` to an 18-element fixture, calls the real `loadHole()` (src/oncourse.js:160), asserts `#oc-hole-display` = `'Hole 1'` and `#oc-par-display` = `'Par 4'` — both match source (oncourse.js:170-171). Then "verifies 18-hole math" by summing **its own fixture array** and asserting it equals 72 (lines 108-109) — tautological.
- Test 2 ("Par 71 alternate layout"): never calls any app code at all. It assigns a fixture array, sums it in the test, and asserts the sum — a test of `Array.prototype.reduce` (lines 114-123).

**Classification:** **SHALLOW** (test 1) **/ THEATRICAL** (test 2) — and **orphaned (T1, P1)**: located at `tests/` root, it is run by neither `vitest run tests/unit` nor Playwright `testMatch`. Whatever its merits, its effective coverage is zero. Mock hygiene is notably *better* than whs.test.js (all specifiers resolve correctly: `'../src/*'` from `tests/`), though the `firebase-config` mock omits `storage`, which `services/audioService.js:6` imports — tolerated only because the binding is never accessed during `loadHole`. Note also the injected `#oc-hole-dots` exercises the dead legacy dot-strip render path (NIGHT1 H13) — the test faithfully maintains dead code — and the injected DOM omits `#hole-jumper-container`, so `renderHoleJumper()` no-ops via its guard (card-render.js:140-141).

**Tier fit:** Tier 1-shaped (jsdom + mocks) but unregistered. If kept, it must move to `tests/unit/`. DOM-render verification of this kind is legitimate Tier 1 *only* if the injected DOM mirrors the real markup — the real `index.html` has `oc-hole-display/oc-par-display/oc-par-select/oc-group-scores` (NIGHT1 verified clean) but **not** `oc-hole-dots`.

**Schema accuracy:** `AppState` fields used (`currentCoursePars`, `currentHole`, `currentRoundHoles`, `liveRoundGroups`, `currentUser`) are real. No Firestore schema involvement. The mock `AppState` is a plain object where the real one is a Proxy — acceptable for this scope, but any test of state-change side effects through this mock would be theatrical (relevant to H21/BL-3.32).

**Hardcoded values:** Describe blocks claim "Keperra 18-hole Layout" but the par arrays are fabricated fixtures, not `COURSE_DATA` values (which is mocked to `{}`) — misleading naming, no breakage risk.

**Recommended action:** **Rewrite** — move to `tests/unit/`, delete test 2, drop the fixture-sum assertion and `oc-hole-dots` from test 1, add the genuinely valuable adjacent case: `loadHole` with a zero/empty pars array (asserts the `|| 4` fallback and `Par ?` branch, oncourse.js:166, 171 — the F11/N2 family's display seam).

---

## 4. `tests/security-rbac.spec.js` (Playwright — *not* in `tests/unit/`)

**What it actually asserts:**
- *Peeping Tom*: registers `admin-worker-N@example.com` — which on localhost grants `isAdmin: true` via the auth backdoor (auth-v2.js:71-72, 80-81) — so the "standard Player" persona in the test name is wrong from line 8. Force-clicks `#tab-btn-coach` (exists, hidden — index.html:175; the `evaluate` won't throw). Then: **if** the coach tab became visible, assert its text doesn't contain `'confidential'` (lines 41-46) — a word that appears nowhere in `index.html` or `src/`. The assertion cannot fail. Critically, per F10 the client gate is forced open anyway, and tab visibility is `body[data-active-tab]`-driven — a forced click on a hidden coach tab button *does* switch tabs for any role. The test passes while demonstrating the opposite of its title.
- *Data Isolation*: `page.evaluate` returns the hardcoded literal `{ code: 'permission-denied' }` with a comment admitting it ("Mock response since we can't easily inject the firebase db instance"), then asserts the literal equals itself (lines 51-56).

**Classification:** **THEATRICAL** — both tests. This is the most dangerous file of the six: it produces a green "Security & RBAC Suite ✓" over the exact territory of F10 and BL-3.06.

**Tier fit:** Doubly mislabelled. The strategy doc places `tests/unit/security-rbac.spec.js` in **Tier 1** (03_testing_strategy.md:44); the file is a Playwright browser test at `tests/` root. More fundamentally, the *Data Isolation* claim belongs in `tests/rules/` (rules-unit-testing against the emulator — the only place client-independent enforcement can be proven), and the *Peeping Tom* claim is a Tier 2 browser test that can only become meaningful **after** BL-3.24 removes the `if (true ||` bypass.

**Schema accuracy:** No real data touched. A rewrite must respect: per-doc `whs_rounds` read rules keyed on `uid` (firestore.rules:75-80), and the `coachUid`/`coaches[]` dual model in `isCoachOf` (firestore.rules:19-25).

**Hardcoded values:** `'admin'` keyword email — an undocumented coupling to the auth-v2 localhost backdoor; if BL-3.24's cleanup ever removes that backdoor, every beforeEach here silently demotes to an unapproved standard user. `password123`/`@example.com` fine.

**Recommended action:** **Skip-and-rewrite-later** — remove from `testMatch` now (its green tick is actively misleading on a security surface); rewrite Data Isolation as real rules tests in `tests/rules/firestore.test.js`, and Peeping Tom as a Tier 2 test in the BL-3.24 brief.

---

## 5. `tests/ux-bag-management.spec.js` (Playwright — *not* in `tests/unit/`)

**What it actually asserts (reachable code only):** login completes; `#btn-save-notif-prefs` is visible on the settings tab (line 33). That's all. Then:
- Injects a fake `7-Wood` checkbox via `innerHTML +=` into `document.querySelector('.dashboard-grid')` — the **first** `.dashboard-grid` in the document (index.html:950, the notifications panel area), not the bag card (index.html:1013) — injected fake HTML in the wrong container (lines 40-51).
- Conditionally unchecks "Short Woods" (`if visible` — vacuous if not).
- Reloads, then calls runtime `test.fixme('Real implementation needed…')` at line 74 — which **aborts the test on the spot**. Lines 76-88 (detailed-mode start, `#bag-buttons-grid` 7-Wood assertion) are permanently unreachable dead code; and even if reached, line 87's `await expect(...).toBeVisible().catch(() => {})` swallows its own failure.

**Classification:** **THEATRICAL** — its title promises persistence-across-reload and live-scoring propagation; it verifies a button renders, then self-aborts. The file at least *admits* it (`fixme`), unlike security-rbac.

**Tier fit:** Tier 2 (browser + emulator persistence) — strategy doc's `tests/unit/` listing is wrong. The underlying feature (playerClubs → `renderBagButtons`) crosses Firestore persistence and detailed-mode UI; not unit-testable as a journey, though `renderBagButtons` itself (card-render.js) is a legitimate Tier 1 target given a `playerClubs` fixture.

**Schema accuracy:** `.bag-check` / `data-cat` / `data-val` match real markup (index.html:1018-1076: `"Short Woods"` exists at 1027). `#btn-mode-detailed`, `#shot-command-center-body`, `#bag-buttons-grid` all exist (index.html:314, 627, 634). The dead block's flow (`selectOption('#oc-course-select', "Ashgrove GC")` → `#btn-oc-start`) is real and valid — Ashgrove GC is a static option (index.html:352) with `par: 35 > 0` (course-data.js:99), so it would clear the F11 zero-par gate.

**Hardcoded values:** `"Ashgrove GC"` — valid today (static markup + `COURSE_DATA`); contra TEST-04, the course list is **not** emulator-seeded, so "course doesn't exist in emulator" was never the failure mode. Brittle only against future course-list edits.

**Recommended action:** **Rewrite** — drop the wrong-container HTML injection entirely; test what the app actually supports (toggle existing `.bag-check` boxes, click `#btn-save-bag`, reload, assert checkbox state from Firestore-backed render, then start a detailed round and assert `#bag-buttons-grid` contents) — a genuine Tier 2 test that would also pin NIGHT1's verified-clean bag wiring.

---

## 6. `tests/rules/firestore.test.js`

*(Per brief: coverage and runnability only — no judgement on whether the rules themselves are correct.)*

**What it actually asserts:**
1. Unauthenticated `whs_rounds` collection read fails — real, meaningful, would pass.
2. Approved user: unfiltered `whs_rounds` collection `get()` **succeeds** (line 44); own-`uid` create succeeds (47-53); other-`uid` create fails (56-62).
3. Create with `adjustedGross: 500` fails, comment "Invalid, max 200" (75-81).

**Classification:** **BROKEN** (statically determined — would be red if run):
- Line 44: `firestore.rules:75-80` grants `whs_rounds` reads per-document (owner / coach / admin / public-visibility). Firestore's rules engine rejects queries it cannot prove safe — an **unfiltered** collection get against per-doc read rules is denied regardless of contents (even an empty collection). `assertSucceeds` on it should fail. The assertion the author wanted is a `where('uid','==','alice')` query.
- Lines 75-81: the `whs_rounds` create rule is `request.resource.data.uid == request.auth.uid` only (firestore.rules:81) — **no data validation exists anywhere in the file**. The 500-gross write would be *allowed*, so `assertFails` fails. The test asserts a validation layer that was evidently planned and never written (relevant input to the BL-3.06 security brief, not assessed further here).
- Harness itself is sound and runnable: `npm run test:rules` wraps it in `emulators:exec --only firestore`; vitest `globals: true` supplies `describe/beforeAll`; `@firebase/rules-unit-testing@^5` + compat `.firestore()` API usage is consistent; per-test `clearFirestore()` and `afterAll` cleanup are present (the best lifecycle hygiene of the six files).

**Coverage:** 3 tests over **1 of 15** rule surfaces (`whs_rounds` only — and only `read`/`create`). Zero coverage: `users`, `coachNotes`, `prefs`, `practice_plans`, `assignedDrills`, `global_drills`, `profiles`, `shots`, `practice_rounds`, `competitions`, `comp_rounds`, `preapproved_emails`, `tempo`, `feed`, `following`. Notably absent given the active backlog: no `isCoachOf` test (BL-3.06's exact surface, incl. the `coachUid` vs `coaches[]` dual model at firestore.rules:19-25), no `feed` create-denial test, no `assignedDrills` completed-only-update test (firestore.rules:50-55 — the most intricate rule in the file, untested).

**Tier fit:** Strategy doc places it in Tier 1 ("Firebase security rules", line 39). It **requires a running emulator**, which contradicts Tier 1's "every save locally, under 2 minutes, always run" contract. Recommend a dedicated lane (see Part 2d).

**Schema accuracy:** ✓ The write fixtures use the real manual-round shape — `uid, course, adjustedGross, rating, slope` (NIGHT1 B2) — no `holes`/`userId`/`score`. Alongside whs.test.js, the only schema-faithful file.

**Hardcoded values:** `127.0.0.1:8080` (matches the documented emulator port), `projectId: 'demo-golf-tracker'` (distinct from Playwright's `demo-chaos-test` — harmless, but two demo project IDs is drift). No credentials.

**Recommended action:** **Expand** (after fixing the two red assertions) — this is the right harness in the right place; fix line 44 to a `uid`-filtered query, move the validation expectation (test 3) into the BL-3.06 brief as a *proposed* rule + test pair, then grow one describe block per collection, prioritising `isCoachOf` and `assignedDrills`.

---

# Part 2 — P1 coverage matrix (F1–F12)

For each NIGHT1 P1: **(a)** existing test exercising the path, **(b)** why it slipped, **(c)** cheapest regression guard + tier.

| F | Finding (abbrev.) | (a) Existing coverage | (b) Why it slipped | (c) Cheapest guard |
|---|---|---|---|---|
| **F1** | Live rounds saved with rating 72 / slope 113 / par 72 constants | **None.** `ui-ergonomics.spec.js:42-43` and `logic-boundaries.spec.js:50-51` *start* rounds but no test ever **finishes** one; nothing reads back a `whs_rounds` doc. `whs.test.js` tests `calculateIndex` downstream — garbage-in is invisible to it | Save path (`oncourse.js:1028-1108`) only reachable via full-round E2E; no persisted-doc assertion exists anywhere in the repo | **Tier 2 (emulator Playwright):** finish a minimal 9-hole round on Keperra Yellow (rating 68/slope 121/par 35, course-data.js:93), read the `whs_rounds` doc via emulator REST/Admin, assert `rating===68 && slope===121`. Longer term: extract a pure `buildWhsRoundPayload(teeData, …)` for a Tier 1 unit test |
| **F2** | `handicapIndexEl` read via `.textContent` on an `<input>` → DH always errors | **Adjacent only:** `logic-boundaries.spec.js:61-77` fills `#handicap-index` — but asserts HTML5 `validity` only, never the JS that consumes the value (app-v4.js:217, 337) | Test stops at input constraints; the broken read path runs only on calculator click / manual-round submit, which no test performs | **Tier 2:** set HI via the input, click the Daily Handicap calculate button, assert a numeric result renders and **no** alert fires (the bug's symptom is the always-alert). Tier 1 possible only after extracting the read into a helper |
| **F3** | WHS Exclude/Delete buttons have no listeners | **None.** No test renders the WHS history table with data, let alone clicks a row button | Needs a seeded round (no seeding utility exists — TEST-06) + click + re-render assertion; pure browser territory | **Tier 2:** seed one round, click `.toggle-count-btn`, assert the row strikethrough/`notCounting` flip. Same test doubles as the F4 read-back vehicle |
| **F4** | `notCounting` computed then discarded; always saved `false` | **None.** `whs.test.js:66-75` tests that `calculateIndex` *honours* `notCounting` — but nothing tests that the save path *writes* it | Unit suite covers the consumer, not the producer; the producer (`whs.js:addRound` + app-v4.js:279-288) is untested | **Tier 1 (vitest):** mock `addDoc`, call `addRound(…)` with a not-counting flag, assert the captured payload — catches the hardcoded `notCounting: false` (whs.js:379) the moment the param is threaded through |
| **F5** | Duplicate `id="tab-practice"` — two screens stacked | **None.** No test parses or validates the static markup; quota-guards clicks into `tab-practice` but both stacked screens satisfy its locators | A duplicate ID breaks no selector — `getElementById` happily returns the first match; only a markup-level check can see it | **Tier 1 (static, no emulator):** jsdom-parse `index.html`, assert all `id` attributes unique. ~15 lines, catches every future duplicate too |
| **F6** | Add Coach reads nonexistent `coach-uid-input` → TypeError | **None.** No test touches the Manage Coaches form | The failure is a dead `getElementById` — invisible to everything except a click or a static cross-check | **Tier 1 (static):** the "DOM contract" test — extract literal `getElementById`/`'#…'` IDs from `src/`, assert each exists in `index.html` modulo a JS-created-ID allowlist (NIGHT1 Task A enumerated the allowlist already). One test catches F6, F8's `log-comp-dynamic`, and the dead `oc-manual-*` family at F1's root |
| **F7** | `askAiCoach` on unpinned `getFunctions()` (us-central1, no emulator) | **None.** quota-guards counts only `generatePracticePlan` requests (quota-guards.spec.js:40); no test invokes Ask AI Coach | Region pinning is an invisible construction detail; only a request-URL assertion or source check can see it | **Tier 1 (static):** assert `getFunctions(` appears only in `src/firebase-config.js`. One-line guard for the whole australia-southeast1 contract (CLAUDE.md architecture rule — arguably overdue regardless of F7) |
| **F8** | Comp custom-rule inputs never generated (two dead IDs) | **None.** No test visits the Competitions tab at all | Both halves are dead-ID lookups (competitions.js:93, 150-162) — same class as F6 | **Tier 1 (static):** the F6 DOM-contract test catches both IDs. Behavioural guard: **Tier 2** — create a comp with one custom rule, select it in the log form, assert a `.dynamic-rule-input` renders |
| **F9** | Live comp rounds write `totalCompScore`; leaderboard reads `totalPoints` | **None.** No test renders a leaderboard or writes a comp round via either writer | Classic two-writer schema fork: a unit test written against either writer's fixture passes; only a cross-contract or read-back test exposes it | **Tier 2 (emulator):** seed one manual + one live-shaped `comp_rounds` doc, render the leaderboard, assert **both** players show non-zero points. Tier 1 alternative once payload-builders are extracted: assert both writers emit `totalPoints` |
| **F10** | Approval gate `if (true ‖ …)`; catch-path grants admin | **None — inverted:** every Playwright test *depends* on F10's territory passing (registration → overlay hides). No negative-path test exists, and `security-rbac.spec.js` (T3/T4) green-stamps the gap. Note the emulator masks it further: localhost registration sets `isApproved: true` unconditionally (auth-v2.js:80) | Theatrical test + no unapproved-user fixture + the localhost backdoor means the gate is never even evaluated falsy in any test environment | **Tier 1 tripwire (static):** assert `if (true ||` / `if (true||` matches zero lines in `src/` — crude, but it pins exactly the debug-override class and costs nothing. **Tier 2 (proper):** seed `users/{uid}` with `isApproved: false` via rules-disabled context, sign in, assert `#auth-pending` shows. Ship with BL-3.24 |
| **F11** | Zero-par course start silently no-ops (dead `.active` gate) | **Adjacent only:** `ui-ergonomics.spec.js:42` starts Ashgrove (par 35) — exercises `bindStartRound` but never the zero-par branch (event-binders.js:350-355) | Happy-path-only coverage; the broken branch requires selecting one of the three zero-par tees, which no test does | **Tier 2:** select "McLeod GC" (par 0, course-data.js:102), click start, assert an error message is visible **and** the hub is not. Pre-fix this test correctly fails (silent no-op) — it's the regression guard for the BL-3.19/3.28 fix |
| **F12** | Auto-GIR checks `outcome === 'Green'` which nothing produces | **None.** No test enters the detailed-shot wizard; `shots` docs are written by zero tests | The producing UI (wizard data-groups) and the consuming check (score-input.js:111) disagree on vocabulary; only a write-then-inspect test sees it. Same blind spot covers N4 (`line/curve` vs `startLine/shape`) | **Tier 2:** detailed-mode round, complete one wizard shot to the green, read the round's `liveRoundGroups`/saved stats, assert GIR recorded. Cheapest *class* guard is **Tier 1**: extract shot-field vocabulary into shared constants and assert writer (score-input.js) and readers (analytics.js, ai.js) import the same keys — ship with BL-3.25 |

**Pattern across (b):** three root causes account for all twelve — (1) *no test persists or reads back data* (F1, F4, F9, F12), (2) *dead-ID/dead-branch failures are invisible to happy-path UI tests* (F2, F3, F5, F6, F8, F11), (3) *theatrical tests green-stamp the exact surface* (F10, plus async-coach over the coach features). None of the twelve would have been caught by fixing assertions alone; eight of twelve need either the static contract suite or a persisted-doc read-back, neither of which exists.

---

# Summary table — the six files

| File | Actual location | Runner status | Classification | Tier (actual) | Schema accuracy | Action |
|---|---|---|---|---|---|---|
| `whs.test.js` | `tests/unit/` ✓ | Runs (`test:unit`) | **VALID** (inert mocks — T5) | Tier 1 ✓ | ✓ real schema | Keep + expand |
| `async-coach.spec.js` | `tests/` root | Runs (`test:e2e`) — green | **THEATRICAL** (AUDIT-02/FP-06) | Tier 2 (doc says unit) | n/a (no data asserts) | Skip-and-rewrite-later (with BL-3.22/3.27) |
| `oncourse.test.js` | `tests/` root | **Never runs** (T1) | **SHALLOW** / half THEATRICAL | Tier 1-shaped, orphaned | AppState fields real; tests dead `oc-hole-dots` | Rewrite (move to `tests/unit/`, delete tautologies) |
| `security-rbac.spec.js` | `tests/` root | Runs (`test:e2e`) — green | **THEATRICAL** (both tests, T3/T4) | Tier 2 + rules tier (doc says Tier 1 unit) | fabricated `permission-denied` literal | Skip-and-rewrite-later (rules tests + BL-3.24) |
| `ux-bag-management.spec.js` | `tests/` root | Runs — aborts as fixme (T6) | **THEATRICAL** | Tier 2 (doc says unit) | selectors real; injects fake HTML into wrong container | Rewrite |
| `firestore.test.js` | `tests/rules/` ✓ | Runnable (`test:rules`) — **statically red** (T2) | **BROKEN** | Emulator-dependent (doc says Tier 1) | ✓ real schema | Expand (fix 2 red assertions first) |

Net honest coverage today: **one** valid unit file (2 pure functions), **one** valid-but-red rules file (1 of 15 collections), and the reference `quota-guards.spec.js`. Everything else is theatre, orphaned, or unreachable.

---

# Tests-to-write — prioritised, mapped to BL-3.18–3.32

Ordered so each regression test can ship inside the same brief as its fix:

| # | Test | Tier | Catches | Ship with |
|---|---|---|---|---|
| 1 | **Static contract suite** (new `tests/unit/contracts.test.js`): (a) unique HTML ids; (b) JS-referenced ids ⊆ HTML ids ∪ allowlist; (c) `getFunctions(` only in firebase-config.js; (d) no `if (true ‖` in src | Tier 1 | F5, F6, F7, F8(root), F10(tripwire), oc-manual-* (F1 root), and every future dead-ID regression | First — before any BL-3.18+ fix lands, so each fix shrinks its allowlist |
| 2 | `addRound` payload unit test (mock `addDoc`; assert `notCounting`, `date`, `stats` passthrough) | Tier 1 | F4, N13 | BL-3.18 |
| 3 | Round-finish integrity (finish 9-hole Keperra Yellow round; assert persisted `rating/slope/par`, `stats` fir/fwy, `notCounting`) | Tier 2 | F1, N17, F4(e2e) | BL-3.18 / BL-3.19 |
| 4 | Daily Handicap calculator happy path (set HI, calculate, assert value not alert) | Tier 2 | F2 | BL-3.18 |
| 5 | WHS history row actions (seeded round → exclude → assert; delete → assert) | Tier 2 | F3 | BL-3.18 |
| 6 | Zero-par start blocked-with-message (McLeod GC) | Tier 2 | F11, N2 seam | BL-3.19 / BL-3.28 |
| 7 | Comp leaderboard dual-writer read-back (manual + live-shaped docs both score) | Tier 2 | F9 | BL-3.21 |
| 8 | Comp custom-rule inputs render on selection | Tier 2 | F8 (behavioural half) | BL-3.21 |
| 9 | Add Coach happy path (fill `#coach-email`, submit, assert roster/array write, no console error) | Tier 2 | F6, coach-linkage seam | BL-3.22 |
| 10 | Approval gate negative path (seed `isApproved:false`, assert pending screen) | Tier 2 | F10 | BL-3.24 |
| 11 | Shots vocabulary contract (writer/reader share field constants) + detailed-shot GIR journey | Tier 1 + Tier 2 | F12, N4, N15 | BL-3.25 |
| 12 | Rules expansion: `isCoachOf` (both linkage fields), `assignedDrills` completed-only update, `feed` create-denial, `shots`/`practice_rounds` isolation — plus fix firestore.test.js:44 (filtered query) and relocate the validation expectation | Rules lane | T2; real version of security-rbac's claims | BL-3.06 / BL-3.22 / BL-3.24 |
| 13 | Bag persistence rewrite (real checkboxes → save → reload → detailed-round `#bag-buttons-grid`) | Tier 2 | replaces T6 | BL-3.30 or standalone |
| 14 | Async-coach rewrite (real assigned-drill / notification assertions) | Tier 2 | replaces T7 | BL-3.22 + BL-3.27 (blocked until both land) |
| 15 | `loadHole` rewrite + practice-plan normaliser unit tests (`normalizePracticePlan`, proposed `normalizePracticeRound`) | Tier 1 | T1 replacement; NIGHT1 normaliser drift | BL-3.30 |

---

# Proposed corrections to `docs/03_testing_strategy.md` (recommendations only — file not modified)

1. **Inventory table (lines 9-24):** `tests/unit/` contains only `whs.test.js`. Delete the six phantom `tests/unit/*` rows; re-list `async-coach`, `security-rbac`, `ux-bag-management` as `tests/` root **E2E** files, and `oncourse.test.js` as `tests/` root **Unit (orphaned — not run by any script)**.
2. **Tier 1 list (lines 41-45):** remove `tests/unit/logic-boundaries.spec.js` and `tests/unit/security-rbac.spec.js` (neither exists; both real files are browser tests). Add the proposed static contract suite as a first-class Tier 1 citizen.
3. **`firestore.test.js` tier:** move out of Tier 1 into its own lane — "Tier 1R — Rules (fast, emulator-required, run via `npm run test:rules` on every PR)". Its emulator dependency contradicts Tier 1's "every save locally" contract; everything else about it is Tier-1-like (fast, deterministic, no browser).
4. **quota-guards status (line 77-82):** amend "Cleanup hooks added this session" — no cleanup hooks exist in the file, and the referenced `tests/utils/clear-emulator.js` / `tests/firebase-admin-setup.js` do not exist (see TEST-03 below). Also note its Cache Hit test asserts inside an `if (visible)` guard — vacuous on the empty-state path.
5. **Add a harness section:** document the Playwright `testMatch` allowlist (and that `tests/e2e/*` is therefore dormant by design for `live_audit`, by accident for `app`/`round_flow`), and recommend a vitest `include` restriction to prevent bare `vitest run` from collecting Playwright specs.
6. **Test-user pattern (line 202-206):** document the localhost role backdoor (`admin`/`coach` email keywords, auth-v2.js:71-73) as the sanctioned way tests obtain roles — three suites already rely on it silently.

---

# TEST-01 — TEST-06: confirm / amend

| ID | Verdict | Detail |
|---|---|---|
| TEST-01 | **AMEND — worse than catalogued** | The three bodies are **not** marked `test.skip()`: "Sub-Score Logic" and "Chip-in Validation" are empty bodies that **pass green** (logic-boundaries.spec.js:100-106), and "Fuzzing Scores" injects fake HTML then asserts a literal `return true` (87-97). Empty-body Playwright tests count as passes — the catalogue's "skipped" framing understates the false-signal risk. Consistent with AUDIT-02. |
| TEST-02 | **CONFIRM + one new fact** | Credentials still committed at live_audit.spec.js:12-13 (flagged, not touched, per audit constraints — rotation still outstanding). New: the file is absent from Playwright `testMatch`, so `npm run test:e2e` can never hit production — an effective but **undocumented and accidental** guard; the recommended explicit `test.skip(CI)` is still unimplemented. |
| TEST-03 | **AMEND — reopen** | Marked ✅ resolved, but `quota-guards.spec.js` contains no `afterEach`/cleanup of any kind, and both utilities the strategy doc cites (`tests/utils/clear-emulator.js`, `tests/firebase-admin-setup.js`) do not exist anywhere in the repo. Either the fix never landed or it was reverted; same documentation-vs-reality class as AUDIT-02. |
| TEST-04 | **AMEND — premise wrong** | "Ashgrove GC" **does** exist: static `<option>` (index.html:352) and `COURSE_DATA` key (course-data.js:98). The course list is static source, not emulator-seeded data — so "course doesn't exist in emulator" was never the failure mode, and the test is not skip-marked. The real defects are the `if (isVisible)` guards making the touch-target assertions vacuous when the round fails to start, and (shared with ux-bag) reliance on a hardcoded course name that's merely brittle, not broken. |
| TEST-05 | **CONFIRM + widen** | round_flow.spec.js skips auth as described — and additionally targets four nonexistent IDs (`#tab-btn-oncourse`, `#btn-start-round`, `#oc-course-name`, `#active-round-ui` — real IDs are `btn-oc-start`/`oc-course-select`/the data-target nav per NIGHT1), hardcodes `127.0.0.1:3000` against a `:5173` baseURL, and is outside `testMatch`. Reclassify from "skips auth" to **BROKEN and never executed**. |
| TEST-06 | **CONFIRM** | No seeding utility exists (`tests/utils/` is empty/absent). Now blocking: matrix items F1, F3, F9, F10 all require seeded data; recommend the seeding utility ship inside the BL-3.18 brief since its first three consumers live there. |

---

*Report generated by overnight static test audit. No source or test files modified; no commands executed; no commits made. Sole artefact: this file.*
