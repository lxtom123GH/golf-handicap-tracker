# Golf Handicap Tracker — Testing Strategy
**Last updated:** June 2026 | **Source:** Test audit from debugging session

---

## Current Test Inventory

### Test Files
| File | Location | Type | Current State |
|---|---|---|---|
| `app.spec.js` | `tests/` | E2E | ⚠️ Basic only — auth overlay check |
| `round_flow.spec.js` | `tests/` | E2E | 🔴 Skips auth, incomplete |
| `live_audit.spec.js` | `tests/e2e/` | E2E (PROD) | 🔴 Hits live app — never run in CI |
| `quota-guards.spec.js` | `tests/` | E2E | ✅ Fixed this session |
| `logic-boundaries.spec.js` | `tests/` | E2E | 🔴 3 of 5 tests empty/skipped |
| `ui-ergonomics.spec.js` | `tests/` | E2E | ⚠️ 1 of 4 tests skipped |
| `whs.test.js` | `tests/unit/` | Unit | ❓ Not audited |
| `async-coach.spec.js` | `tests/unit/` | Unit | ❓ Not audited |
| `logic-boundaries.spec.js` | `tests/unit/` | Unit | ❓ Not audited |
| `oncourse.test.js` | `tests/unit/` | Unit | ❓ Not audited |
| `security-rbac.spec.js` | `tests/unit/` | Unit | ❓ Not audited |
| `ui-ergonomics.spec.js` | `tests/unit/` | Unit | ❓ Not audited |
| `ux-bag-management.spec.js` | `tests/unit/` | Unit | ❓ Not audited |
| `firestore.test.js` | `tests/rules/` | Rules | ❓ Not audited |

---

## Test Tier Strategy

Tests should be organised into three tiers with different run triggers.

### Tier 1 — Unit Tests (Fast, Always Run)
**Run on:** Every save locally, every commit in CI
**Max runtime:** Under 2 minutes total
**What belongs here:**
- Pure JavaScript logic (WHS handicap calculations, scoring algorithms)
- State management functions
- Utility functions (date validation, score validation)
- Firebase security rules (`firestore.test.js`)

**Current files that likely belong here:**
- `tests/unit/whs.test.js`
- `tests/unit/logic-boundaries.spec.js`
- `tests/unit/security-rbac.spec.js`
- `tests/rules/firestore.test.js`

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
**Notes:** Cleanup hooks added this session. `{ force: true }` on rapid-click loop is intentional and acceptable — simulating forced rapid clicks to test the `isGeneratingPlan` guard.

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
