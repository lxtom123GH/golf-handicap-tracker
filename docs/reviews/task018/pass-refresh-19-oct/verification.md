# PR 18: fresh 15 October pass, executed 19 October

Done means: every reviewer finding has a fix or evidenced dispute, the branch includes current main, the full unit suite and build pass, and the app's recovery journeys pass against local emulators.

## Review census and scope

Read AGENTS.md, CLAUDE.md and README.md (no CONTRIBUTING file), the complete PR body,
all five issue comments, submitted reviews and inline review comments (both review APIs
returned empty arrays). No pending owner ruling. The latest review at f032a17 closes
all four findings; the repeated mapper CI report is counted once.

| Reviewer ACT ON finding | Existing fix retained and freshly checked |
|---|---|
| P2 oversized uploaded video | b496427: known clip size maps to local 19 MB limit and trim/upload advice; renderer and phone journey |
| P3 rules microphone | c1eaf2e: browser settings / Rules of Golf / competition committee; timer and phone journeys |
| P3 mapper acknowledgement (two reports) | c1463ad: pending until acknowledged, stale/destroyed status guards; unit races plus online/offline/reconnect browser writes and Firestore REST read-back |
| P2 practice invalid-argument | f1a58f5, preserved through 94ad2c9: local goal/focus/time correction; input retention and successful retry |

No outstanding finding was disputed. Adversarial review covered the application diff,
local-error trust boundary, actual callable validation and size limits, mapper write/status
lifetimes, failed list recovery, no-write guards and visibility/state contracts. No new
production defect found within scope. FP-01/FP-04 persistence and FP-09 pressed-state/role
toggles are excluded by AGENTS.md, not raised again.

The PR is not superseded: current main 0faeee6 lacks user-messages.js and retains the
old golf-record claims, microphone messages and optimistic mapper acknowledgement.
Merged main without rebasing in 94ad2c9. The sole conflict was src/ui.js practice
failure handling. Preserved main's saved-plan lookup failure, quota/auth guidance and
reload-before-regenerating recovery while retaining this branch's local input advice.
Removed the redundant validation-message allowlist. No Firestore write schema changes.

## Before / after and outside judges

- Unchanged main 0faeee6 in a detached worktree, with the existing branch's practice
  behavior test: **1 failed / 8 passed**. Unknown invalid-argument displayed uncertain
  outcome/reload advice rather than input correction. Main application source unchanged.
- Full merged baseline retaining main's helper: **2 files failed / 170 passed;
  4 tests failed / 1,646 passed**. All failures were invalid-input recovery assertions.
  Baseline build passed.
- Real app before resolution, built with the main helper: production input normalization
  rejected invisible text and the phone journey failed on the displayed technical
  validation message. **1 failed**, no retries. [Before screenshot](practice-before.png).
- Resolved helper gives local correction for known and unknown invalid-argument reasons;
  original goal remains editable and corrected retry succeeds. [After screenshot](practice-after.png).
  These same assertions failed with the main helper and pass after resolution, establishing
  that they detect the behavior rather than merely mirroring source text.
- Main's saved-plan lookup errors and lost-response recovery remain covered. The browser
  lost-response case writes a real stored active plan, reads it back, reloads, and recovers
  completed steps without another generation call.
- Mapper browser read-back checks two features (green, water_hazard), a seven-point
  closed first ring, and an author UID after online/offline/reconnect saves.

Outside judges: Vitest, Playwright visible-state checks at both phone sizes, real demo
Auth/Firestore emulators and REST read-back. AI callables and speech recognition are
scripted; no paid AI or physical iOS/Safari testing is claimed. Before/after screenshots
were opened and inspected. Current phone copy screenshots also reject private diagnostic
markers and exercise empty, loading, validation, service-error and offline states.

## Commands and results

| Command | Summary |
|---|---|
| npm ci | added 882 packages; audited 883; 49 existing audit findings; no dependency changes |
| node node_modules/vitest/vitest.mjs run tests/unit tests/oncourse.test.js (baseline) | 4 failed / 1,646 passed; only the main-helper incompatibility |
| npm run test:unit (resolved) | Test Files 172 passed (172); Tests 1650 passed (1650); Duration 148.83s |
| npm run build (resolved) | built in 14.88s; existing dynamic/static import and large-chunk warnings |
| E2E_PORT_BASE=33000 node scripts/run-e2e-isolated.mjs tests/e2e/practice-inputs.spec.js tests/e2e/hole-mapper.spec.js tests/e2e/actionable-recovery.spec.js --project=iphone-se | 9 passed (3.0m), zero retries |
| E2E_PORT_BASE=34000 node scripts/run-e2e-isolated.mjs --config=playwright.copy.config.js | 2 passed (2.7m), zero retries |
| npm run test:auth | 2 files / 14 tests passed |
| npm run test:rules | 7 files / 184 tests passed |
| npm run test:offline | 1 file / 3 tests passed |
| git diff --check; git diff --cached --check | passed |

## Linux golden integration

[Exact-head Linux CI for 94ad2c9](https://github.com/lxtom123GH/golf-handicap-tracker/actions/runs/39142782459)
passed unit, auth and rules checks, then reported **2 failed / 6 passed** in the new
golden gate. Both failures are the 02-new-player-home screenshot: 3,571 differing pixels
on phone and 3,503 on iphone-se. The other four captured screens per size matched;
the six non-screenshot golden journeys passed, including scored-round read-back,
abandonment cleanup and pending-account admission.

The two new images were generated by the repository's Playwright golden script under
its pinned Linux Chrome Headless Shell 155.0.8059.39. Downloaded the CI artifact, opened
both actual images and the phone diff, and promoted only those two generated actuals
to baselines. They show the intended replacement of the unsupported official-WHS claim
with the app's handicap estimate wording. No Windows baselines, threshold changes,
mask changes or hand-edited images. A fresh CI run must validate the new baseline head.

The full browser matrix did not run in that first CI job because the golden gate stopped
it. Full browser matrix and physical-device testing remain outside the local run.
No deployment or merge was performed manually.

## Bigger version

Complete browser matrix and physical iOS/Safari testing. Structured validation reasons
could allow finer field-specific guidance without exposing service diagnostics.


## Decision log (Australia/Brisbane, 19 October)

| time | decision | why | evidence | result |
|---|---|---|---|---|
| 01:40?01:47 | Retain all four earlier fixes and reproduce the merge-sensitive case on main | Previous findings are fixed; base refresh must preserve both intents | Complete review census; unchanged-main 1 failed / 8 passed | No outstanding reviewer item or owner ruling |
| 01:50 | Consolidate input advice into main's recovery helper | Invalid input needs correction; a lost response needs saved-plan recovery | Baseline 4 unit failures and 1 browser failure; resolved 1,650 passes and nine browser journeys | Both recovery paths retained in 94ad2c9 |
| 01:53?01:58 | Verify real emulator writes and both phone sizes | Green unit tests alone cannot establish rendered recovery or stored data | Mapper/plan REST read-back; 11 browser journeys; auth/rules/offline suites | Local checks pass |
| 02:02 | Refresh only two Linux homepage goldens | New main added a screenshot gate with the old official-WHS claim | Pinned Linux CI actuals, six golden journeys pass, both actuals and diff inspected | Two generated baselines updated; fresh CI and dot review requested |
