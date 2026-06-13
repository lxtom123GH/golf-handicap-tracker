# Golf Handicap Tracker — Testing Strategy
**Last updated:** June 2026 | **Source:** Test audit from debugging session

---

## Current Test Inventory

*Corrected 2026-06-13 (NIGHT2): `tests/unit/` contains **only** `whs.test.js`. The previously-listed six `tests/unit/*` rows were phantom — those files live at `tests/` root and are Playwright browser (E2E) tests, except `oncourse.test.js` (a Vitest unit test orphaned at `tests/` root, run by no script). See `docs/05_unit_test_audit.md` for the authoritative file-by-file status.*

### Test Files
| File | Location | Type | Current State (NIGHT2) |
|---|---|---|---|
| `whs.test.js` | `tests/unit/` | Unit | ✅ VALID (only schema-faithful unit file; mocks inert — T5). Runs green: 7/7 (2026-06-13) |
| `firestore.test.js` | `tests/rules/` | Rules | 🔴 BROKEN — 2 of 3 fail when run (lines 44, 75-81); confirmed red 2026-06-13 |
| `quota-guards.spec.js` | `tests/` | E2E | ✅ Reference standard (FP-05 title caveat) |
| `logic-boundaries.spec.js` | `tests/` | E2E | 🔴 empty bodies pass green (T8/TEST-01) |
| `ui-ergonomics.spec.js` | `tests/` | E2E | ⚠️ touch-target test fails on hidden setup panel (2026-06-13) |
| `async-coach.spec.js` | `tests/` | E2E | 🔴 THEATRICAL — `expect(true)` (AUDIT-02/FP-06) |
| `security-rbac.spec.js` | `tests/` | E2E | 🔴 THEATRICAL — both tests (T3/T4) |
| `ux-bag-management.spec.js` | `tests/` | E2E | 🔴 THEATRICAL — runtime `test.fixme()` aborts (T6) |
| `oncourse.test.js` | `tests/` | Unit (orphaned) | 🔴 run by no script (T1); shallow/tautological |
| `app.spec.js` | `tests/e2e/` | E2E | ⚠️ not in `testMatch` — dormant |
| `round_flow.spec.js` | `tests/e2e/` | E2E | 🔴 BROKEN & never executed (T9) |
| `live_audit.spec.js` | `tests/e2e/` | E2E (PROD) | 🔴 hits live app + committed creds — not in `testMatch` |

---

## Test Harness — What Actually Runs
*Added 2026-06-13 (NIGHT2 Part 0).*

| Runner | Command | Picks up | Misses |
|---|---|---|---|
| Vitest (unit) | `npm run test:unit` / `npm test` → `vitest run tests/unit` | `tests/unit/whs.test.js` only | `tests/oncourse.test.js` (orphaned) |
| Vitest (rules) | `npm run test:rules` → `emulators:exec --only firestore "vitest run tests/rules"` | `tests/rules/firestore.test.js` | — |
| Playwright | `npm run test:e2e` → `playwright test` (`testMatch` allowlist) | `logic-boundaries`, `quota-guards`, `security-rbac`, `async-coach`, `ux-bag-management`, `ui-ergonomics` (all `tests/` root) | **all of `tests/e2e/*`** — `app`, `round_flow`, `live_audit` are dormant (the last by design, the first two by accident) |

- **2026-06-13 e2e baseline:** 14 tests → 10 passed / 3 failed / 1 skipped. The 3 failures (logic-boundaries Time-Travel, quota-guards Double-Tap, ui-ergonomics touch-target) match the BL-3.15 "3 pre-existing failures" note.
- **Hazard:** a bare `npx vitest run` would also collect the six Playwright `*.spec.js` files (vitest.config.js excludes only node_modules/dist/tests/e2e) and crash on `@playwright/test` imports. Recommend an explicit `include: ['tests/unit/**', 'tests/rules/**']` in `vitest.config.js`.

## Test Tier Strategy

Tests should be organised into three tiers with different run triggers.

### Tier 1 — Unit Tests (Fast, Always Run)
**Run on:** Every save locally, every commit in CI
**Max runtime:** Under 2 minutes total
**What belongs here:**
- Pure JavaScript logic (WHS handicap calculations, scoring algorithms)
- State management functions
- Utility functions (date validation, score validation)
- **Static contract suite** (proposed — BL-4.00): jsdom-parse `index.html` for unique ids; JS-referenced ids ⊆ HTML ids ∪ allowlist; `getFunctions(` only in firebase-config.js; no `if (true ||` in src. No emulator.

**Current files that belong here:**
- `tests/unit/whs.test.js` (the only real Tier 1 file today)
- *(removed 2026-06-13: `tests/unit/logic-boundaries.spec.js` and `tests/unit/security-rbac.spec.js` were phantom paths — the real files are browser E2E tests at `tests/` root)*

### Tier 1R — Rules Tests (Fast, Emulator-Required, Run on Every PR)
**Run on:** Every PR via `npm run test:rules` (`emulators:exec --only firestore`).
**Why a separate lane:** `tests/rules/firestore.test.js` is fast and deterministic like Tier 1 but **requires a running emulator**, which contradicts Tier 1's "every save locally, no infra" contract. Moved out of Tier 1 (2026-06-13).
**Status:** statically red and confirmed red when run 2026-06-13 — 2 of 3 fail (unfiltered collection `get()` at line 44 is denied by per-doc rules; the `adjustedGross:500` create at lines 75-81 is allowed because no validation rule exists). Covers 1 of 15 rule surfaces.

### Tier 2 — Integration Tests (Medium, Run on PR)
**Run on:** Pull requests to main, manual trigger
**Max runtime:** Under 15 minutes
**What belongs here:**
- Playwright tests against the local emulator
- Auth flows, tab navigation, form submission
- Feature-specific tests (quota guards, round creation)
- Requires Firebase emulator running

**Current files that belong here:**
- `tests/quota-guards.spec.js` ✅
- `tests/app.spec.js` (after improvement)
- `tests/round_flow.spec.js` (after improvement)
- `tests/logic-boundaries.spec.js` (after rewrite)
- `tests/ui-ergonomics.spec.js` (after rewrite)

### Tier 3 — E2E Production Tests (Slow, Manual Only)
**Run on:** Manual trigger only, before major releases
**What belongs here:**
- Tests against the live Firebase app
- Full user journeys
- Performance checks

**Current files that belong here:**
- `tests/e2e/live_audit.spec.js` — MANUAL ONLY, never in CI

---

## Test Status: File by File

### ✅ `tests/quota-guards.spec.js` — VALID, USE AS-IS
**What it tests:** Rate limiting on AI practice plan generation
**Tests:**
- Double-Tap: 5 rapid clicks produce ≤1 API request ✅
- Cache Hit: Active practice plan doesn't trigger new request ✅
**Notes:** ⚠️ *Corrected 2026-06-13 (NIGHT3/TEST-03): the "cleanup hooks added this session" claim is false — the file contains no `afterEach`/cleanup, and the cited `tests/utils/clear-emulator.js` / `tests/firebase-admin-setup.js` exist on no ref. Claimed work never committed.* `{ force: true }` on the rapid-click loop is intentional and acceptable — simulating forced rapid clicks to test the `isGeneratingPlan` guard. Its Cache-Hit test asserts inside an `if (visible)` guard — vacuous on the empty-state path.

---

### ⚠️ `tests/app.spec.js` — VALID BUT SHALLOW
**What it tests:** Basic app load, title, auth overlay
**Tests:**
- App load and basics ✅
**Notes:** Only tests that the page loads and auth overlay appears. Useful as a smoke test but needs expanding to cover post-auth state.
**Action:** Keep as-is for now. Expand when auth flow is stable.

---

### 🔴 `tests/round_flow.spec.js` — NEEDS REWRITE
**What it tests:** Intended to test on-course round start flow
**Current problems:**
- Skips actual Firebase auth with a comment saying it's too hard
- Only checks tab visibility if elements "happen to be visible"
- No assertions that actually validate the round flow
**Action:** Rewrite after on-course tab is confirmed stable. Use auth pattern from `quota-guards.spec.js`.

**Rewrite template:**
```javascript
test.beforeEach(async ({ page }, testInfo) => {
    // Use same auth pattern as quota-guards.spec.js
    // Seed test course data via Firebase Admin SDK
});

test('Start a round and track a hole', async ({ page }) => {
    await page.click('[data-target="tab-oncourse"]');
    await expect(page.locator('#oc-course-select')).toBeVisible();
    // Select seeded test course (not hardcoded string)
    await page.selectOption('#oc-course-select', { index: 1 });
    await page.click('#btn-oc-start');
    await expect(page.locator('#oncourse-hub')).toBeVisible();
});
```

---

### 🔴 `tests/logic-boundaries.spec.js` — PARTIALLY VALID
**What it tests:** Golf math constraints and validation
**Tests:**
- Time Travel (future date rejection) ⚠️ — navigates correctly but has incomplete assertion
- WHS Limits (handicap range) ✅ — valid test, tests HTML5 input constraints
- Fuzzing Scores 🚫 — injects fake HTML, doesn't test real app. Marked skip.
- Sub-Score Logic 🚫 — empty body. Marked skip.
- Chip-in Validation 🚫 — empty body. Marked skip.

**Action:** Keep WHS Limits test. Fix Time Travel assertion. Rewrite the three skipped tests properly when on-course editor is stable.

**Time Travel fix needed:**
```javascript
// Current: no meaningful final assertion
// Fix: add this after clicking start
await expect(page.locator('#some-error-message')).toBeVisible();
// OR assert the round didn't start
await expect(page.locator('#oncourse-hub')).not.toBeVisible();
```

---

### ⚠️ `tests/ui-ergonomics.spec.js` — PARTIALLY VALID
**What it tests:** UI layout and interaction quality
**Tests:**
- No horizontal scroll on WHS tab ✅ — valid and simple
- Touch target size ≥44px 🚫 — skipped (hardcoded course name). Needs test data seeding.
- Add Club modal tag balance ✅ — valid smoke test
- (4th test varies) ❓

**Action:** Keep passing tests. Fix touch target test by seeding a test course in `beforeEach` instead of hardcoding "Ashgrove GC".

---

### 🔴 `tests/e2e/live_audit.spec.js` — NEVER RUN IN CI
**What it tests:** Full user journey against live production app
**Problems:**
- Hardcoded real email: `testuser@alexgittest.com`
- Hardcoded real password (same as email — security risk)
- Hits `https://golf-handicap-tracker-b677c.web.app/` directly
- 2-minute timeout per test
- If production data changes, test breaks

**Action:**
1. Add `test.skip()` guard for CI environment immediately
2. Rotate the hardcoded credentials — they're committed to the repo
3. Long term: replace with emulator-based equivalent

**Immediate fix:**
```javascript
test.skip(process.env.CI === 'true', 
  'Live audit skipped in CI — run manually only');
```

---

### ❓ Unit Tests — NOT YET AUDITED
The following files exist but haven't been reviewed:
- `tests/unit/whs.test.js`
- `tests/unit/async-coach.spec.js`
- `tests/unit/oncourse.test.js`
- `tests/unit/security-rbac.spec.js`
- `tests/unit/ux-bag-management.spec.js`
- `tests/rules/firestore.test.js`

**Action for next audit session:** Review each file and categorise as valid, needs-fix, or skip.

---

## Infrastructure Requirements

### Firebase Emulator Setup
All Tier 2 tests require the Firebase emulator. The following must be running:
- Firestore emulator (port 8080)
- Auth emulator (port 9099)
- Functions emulator (port 5001)

Start with: `firebase emulators:start`

### Test User Pattern
All Tier 2 tests should use the established pattern:
```javascript
const testEmail = `test-worker-${testInfo.workerIndex}@example.com`;
```
This prevents worker collisions in parallel test runs.

**Localhost role backdoor (documented 2026-06-13 — NIGHT2):** on localhost, registration grants roles by **email keyword** — an address containing `admin` is created with `isAdmin: true`, one containing `coach` with the coach role (auth-v2.js:71-73). This is the sanctioned way tests obtain elevated roles, and three suites already rely on it silently (`security-rbac`, `async-coach`). Tests needing a plain player must avoid those keywords. Note: if BL-4.07 removes the auth debug bypass/backdoor, every `beforeEach` depending on it silently demotes to an unapproved standard user — update those tests in the same brief.

### Data Cleanup Pattern
All tests that write to Firestore must use `beforeEach` + `afterEach` cleanup:
```javascript
// See tests/utils/clear-emulator.js for the utility
// See tests/firebase-admin-setup.js for Admin SDK setup
```

---

## What Good Test Coverage Looks Like

When the audit is complete, the target test coverage should be:

| Area | Target Tests |
|---|---|
| WHS handicap calculation | Unit: correct differential, best 8 of 20 |
| Round validation | Unit: future dates, score ranges, hole counts |
| Firebase rules | Rules: each collection, each permission tier |
| Auth flow | E2E: login, register, logout |
| Tab navigation | E2E: all tabs render, no horizontal scroll |
| On-course flow | E2E: start round, track hole, finish round |
| Practice plan | E2E: empty state, generate, active state |
| Rate limiting | E2E: quota-guards (done ✅) |
| Coaching access | E2E: coach can see player data, player can't see other players |
| AI generation | E2E: function called, response rendered |
