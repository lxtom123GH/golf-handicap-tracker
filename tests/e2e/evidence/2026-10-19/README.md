# PR #1 base refresh verification, 19 October 2026

Done means: branch has current main merged; unit suite, build, WHS record spec
and rendered accessibility checks pass locally; push starts fresh CI and one
PR comment records the output.

Tested application/test tree: `e331c86ea339ceba85639b8a7d6dc4a27aec1f8e`.
This merges main `592e120e1858f6d84fb9c8bcf095148587408fb4` into the PR.
The subsequent evidence commit changes only this evidence directory.

## Review finding #1

The [old CI run](https://github.com/lxtom123GH/golf-handicap-tracker/actions/runs/38717298345)
on `edf88cd` failed at `whs-record.spec.js:89` with
`Cannot read properties of null (reading 'x')`: 1 failed, 29 skipped,
277 passed. Main's `1c63b9f` (#30), now merged here, replaces the two
geometry reads with an atomic browser read and polling. Alignment tolerances
and the Diff visibility/value assertions remain intact. The WHS spec is
identical to current main (`git diff --quiet origin/main -- tests/e2e/whs-record.spec.js`).

The failure does not reproduce after the merge: all 15 WHS record cases pass,
including the scoring-record alignment case on all three viewports. No
additional app or test changes were needed. Under the requested conditional
workflow, a separate main browser run was unnecessary because this run passed.

## Local verification

Windows, Node 24.18.0, Java 27; `npm ci --no-audit --no-fund` installed 883 packages.
`npm run test:unit`: 172 files, 1650 tests passed (64.93s).
`npm run build`: 116 modules transformed; built in 9.27s.
`E2E_PORT_BASE=41000 node scripts/run-e2e-isolated.mjs tests/e2e/whs-record.spec.js tests/e2e/rendered-a11y.spec.js --reporter=list`:
18 passed (4.1m), comprising 15 WHS and 3 accessibility cases.
Private loopback Auth/Firestore emulators used the offline `demo-golf-tracker` project.

[Output excerpts](verification-output.txt) retain actual test summary/case lines.
[Axe reports](axe-results.jsonl) retain all emitted report fields, compacted
to one JSON object per project: 21 scans, zero tagged violations. Viewports:
412x839, 375x667, 1280x720. Setup editable controls are at least 16px.

The full E2E matrix, rules/auth/offline suites, physical iPhone gestures and
screen readers were not rerun in this pass. Fresh CI and independent dot review
remain landing gates. Existing jsdom canvas/navigation diagnostics, npm
deprecation/install-script warnings and Vite mixed-import/large-chunk warnings
remain. No physical-device or complete WCAG conformance claim is made.
