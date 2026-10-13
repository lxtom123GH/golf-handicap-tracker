# Rendered accessibility evidence — 13 Oct 2026

Code tested: `cdae54d65d8d604a44cd5b87dad271af9ec8deb3`.

Command: `node scripts/run-e2e-isolated.mjs --reporter=list,json` with
`PLAYWRIGHT_JSON_OUTPUT_NAME=logs/e2e-full.json`.
Run started: 2026-10-13T06:14:21.701Z.
Full matrix: 246 passed, 29 skipped,
2 failed. See the PR comment for the WHS layout assertion failures.
Environment: Windows, Node 24.18.0, Playwright 1.61.1, axe-core 4.13.0;
loopback-only Firebase Auth/Firestore emulators using `demo-golf-tracker`.

- [axe-results.json](axe-results.json): emitted attachments for all three
  accessibility projects. Payloads are collected together and whitespace
  compacted; all emitted fields/values are preserved. Six screens plus both
  tracking-mode selections have zero violations. Computed on-course editable
  control sizes are included.
- [negative-control-axe-results.json](negative-control-axe-results.json): an
  earlier deliberately failing desktop run. Before each scan, temporary test
  code restored `maximum-scale=1, user-scalable=no`, version-badge opacity
  `0.6`, and inactive mode-button/past-round-note color `#64748b` in the DOM.
  This produced viewport and contrast violations. That temporary code was
  removed before the passing run and is not part of the shipped test.

These Chromium layout checks do not reproduce physical iOS focus/pinch gestures.
The test also attaches its emitted JSON files to the Playwright result. An
optional CI-upload step was removed after GitHub rejected the push because
the current OAuth credential lacks workflow scope. These committed reports
provide the review evidence without changing credentials or repository settings.
