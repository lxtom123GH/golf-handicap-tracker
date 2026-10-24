# Rendered accessibility evidence — 15 Oct 2026

Latest source: `8ef7cb5`, refreshed onto main `9eb9711` after its practice-status
update landed during verification. Fixes: default timeout `9f4f206` and shared
signup `2a3db0f`; initial base refresh `2853f4d`.
The latest negative control uses unchanged main `9eb9711`.
The current accessibility spec was copied into a detached main checkout as
the judge; main's application files were verified unmodified.

Windows; Node 24.19.0; Playwright 1.61.1; axe-core 4.13.0. Browser journeys
use loopback-only Auth/Firestore emulators and offline `demo-golf-tracker`.

- [main-axe-results.json](main-axe-results.json): all three main journeys
  reached all seven scans and failed the zoom assertion. The emitted results
  also show serious contrast findings for inactive mode buttons (4.34:1),
  the past-round note (4.41:1), and the desktop version badge. The guest-name
  field computes to 13.3333px.
- [axe-results.json](axe-results.json): all three PR journeys pass, with zero
  tagged axe violations across 21 scans. Visible setup inputs compute to at
  least 16px. These payloads come from the refreshed browser run on `8ef7cb5`.
  The earlier complete matrix on `2a3db0f` also passed all three accessibility cases.
  The score controls themselves are buttons.
- [fixture-before.json](fixture-before.json): complete Playwright error-context
  payloads from the old spec's first phone case on main `a43d7e5` and PR `2853f4d`.
  Its initial invite PATCH exceeded the shared helper's five-second request
  limit before registration began. Reusing `registerAndVerifySignup` removes
  the eager seed and duplicate Auth helper, verifies the issued email code,
  waits for the user document, and uses the existing emulator approval fixture.
  The real invitation contract remains covered by `registration.spec.js`.
- [phone-check.jsonl](phone-check.jsonl), [iPhone screenshot](phone-iphone11.png),
  [Pixel screenshot](phone-pixel7.png): on `2a3db0f`, the shared phone-check tool rendered
  sign-in in emulated WebKit/iPhone 11 and Chromium/Pixel 7. Both reported
  `ok: true`, no horizontal overflow and no stalled requests. Failed external
  font/Google API requests are retained in the emitted results.
- [refreshed browser summary](refreshed-browser-summary.json): all 21 affected
  browser cases pass on `8ef7cb5` (18 practice, 3 accessibility).
- [full-e2e-summary.json](full-e2e-summary.json): earlier `2a3db0f` stats, errors and accessibility
  results extracted from the full Playwright JSON report. The matrix is not
  green: phone coach context-close timeout, phone Map-first wizard/readout
  failures, iPhone-size duplicate guest option, and WebKit putt-plus click timeout.
- [follow-up selection](follow-up-test-list.txt), [main follow-up](main-follow-up-summary.json),
  [PR follow-up](pr-follow-up-summary.json): each failed case/viewport twice plus
  a warm-up, on identical private ports before the final base refresh. Main
  `a43d7e5`: 10 passed, 2 WebKit reload failures at a different point. PR `2a3db0f`:
  12 passed (4.8m), including both WebKit saved rounds.
  The original matrix failures remain unresolved; this does not prove their cause.

The complete matrix was not rerun after the final `9eb9711` base refresh.
Latest unit/build/emulator checks and affected browser journeys were rerun;
full current-head CI and fresh independent review remain landing gates.

Axe payloads are collected by project and whitespace-compacted; every emitted
field/value is retained. Playwright summaries contain the listed stats/error
subsets. All golfer accounts and round data in the browser runs are synthetic.
These results do not establish physical iPhone focus/pinch gestures, a manual
screen-reader experience, or complete WCAG conformance.

## Commands and outcomes

```text
npm ci --prefer-offline --no-audit
added 883 packages
npm run test:unit
144 files passed; 1413 tests passed (65.11s, default concurrency on D:)
npm run build
106 modules transformed; built in 4.52s
npm run test:rules
6 files passed; 164 tests passed
npm run test:auth
2 files passed; 14 tests passed
npm run test:offline
3 passed on the refreshed PR (D: verification checkout)
node scripts/run-e2e-isolated.mjs tests/e2e/rendered-a11y.spec.js
Latest main 9eb9711: 3 failed on accessibility assertions.
node scripts/run-e2e-isolated.mjs tests/e2e/rendered-a11y.spec.js tests/e2e/practice-inputs.spec.js --reporter=list,json
Refreshed PR 8ef7cb5: 21 passed (4.0m), including 3 accessibility cases / 21 clean scans.
node scripts/run-e2e-isolated.mjs --reporter=list,json
Full matrix: 267 passed, 29 skipped, 5 failed (1.2h); all 3 accessibility cases passed.
node scripts/run-e2e-isolated.mjs --test-list=<follow-up-test-list.txt> --repeat-each=2 --reporter=list,json
Main: 10 passed, 2 failed; PR: 12 passed (4.8m).
```

Initial cold worker/emulator startup attempts failed before browser checks.
A first four-worker unit run timed out in two existing DOM tests (1397 passed).
Both the complete one-worker run and default-concurrency run passed all 1399
tests, followed by all 1413 after the final refresh, without changing timeouts.
C: later exhausted space (`ENOSPC` during test collection); subsequent temp,
transform cache and browser artifacts use a dedicated D: verification folder.
The online-write offline-suite check failed twice on C: and passed unchanged
on both main and PR on D:. These failed attempts are not counted as passes.
Existing Vite mixed-import and large-chunk warnings remain.
