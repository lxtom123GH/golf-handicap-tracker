# 100 — phone scoring controls

13 October 2026 AEST. Public main base: `0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`.
Synthetic local Auth/Firestore emulator fixtures; no live accounts or deployment.

## Result

Every visible button/role-button in the tested round hub is at least 44 × 44 CSS
pixels and stays inside the phone width. Coverage includes the form hub, map
side rail and expanded group scoring sheet, on `phone` and `iphone-se`.

Before, form/sheet putt controls were 25 × 26, FW/GIR were 32 px tall in this
fixture, and map-rail putt controls were 52 × 30. All four regression cases failed
against main. After, minima are 44 × 44 for the form/sheet and 48 × 44 for the
visible rail controls. The putt value stays on one line while keeping both tap
boxes intact. FW/GIR captions may wrap at the narrower width.

The GPS opener now derives its accessible name from the displayed distances,
with visually hidden action text appended. No event handlers or scoring logic
changed. Its existing ids, keyboard role and dialog association are preserved.

## Verification

- Final combined browser suite: **16/16 passed** (4 target checks, 10 existing
  simple-scoring journeys, 2 Keperra West complete-nine-hole journeys).
- Final full unit suite on merged main: **137 files / 1,332 tests passed**
  (171.82 seconds), including all 16 demo-harness safety checks.
- Build passed as part of the isolated browser startup.
- No added `!important`, `.style.display`, state mutation or auth/rules change.

```
node scripts/run-e2e-isolated.mjs tests/e2e/scoring-targets.spec.js tests/e2e/simple-scoring.spec.js tests/e2e/keperra-west-round.spec.js --project=phone --project=iphone-se
node node_modules/vitest/vitest.mjs run tests/unit tests/oncourse.test.js --maxWorkers=1
```

The installed Chrome Headless Shell executable is the only local browser-config
override. The merged demo-only harness's dead proxy/host restrictions remain.
Repository execution had an empty HOME/environment and no GitHub/cloud credentials.

## Contrast and accessible-name scope

All six measured states have **zero reported violations** for axe's
`color-contrast`, `color-contrast-enhanced` and `label-content-name-mismatch` rules.
This is not a whole-app AAA claim: axe still returns incomplete checks, especially
for image-backed map overlays and icon-only text. The measurement JSON retains
those selectors and reasons rather than silently treating them as passes.

Cheap fixes made: opaque course caption; lighter GPS status colours; darker gross
summary, scoring notice, past-round note and explainer text; darker GPS action
background. Representative solid-background contrast calculations: gross total
`#475569`/white 7.58:1; notice `#78350f`/`#fffbeb` 8.75:1; explainer `#1e40af`/white
8.72:1. Actual browser evaluations, rather than these examples, drive the counts.

Remaining limitations: map imagery/translucency and occlusion prevent a universal
7:1 guarantee; emoji glyph colours are platform-dependent; disabled Prev uses the
existing muted presentation. Active/miss feedback colours and arbitrary satellite
backgrounds are not exhaustively audited here. Map GPS/header crowding remains
visible in the evidence and is not claimed fixed by larger score controls.

## Before / after

| View | Before | After |
|---|---|---|
| phone form | [before](img/task100/before/phone/form-form.png) | [after](img/task100/after/phone/form-form.png) |
| iphone-se form | [before](img/task100/before/iphone-se/form-form.png) | [after](img/task100/after/iphone-se/form-form.png) |
| phone rail | [before](img/task100/before/phone/map-rail.png) | [after](img/task100/after/phone/map-rail.png) |
| iphone-se rail | [before](img/task100/before/iphone-se/map-rail.png) | [after](img/task100/after/iphone-se/map-rail.png) |
| phone sheet | [before](img/task100/before/phone/map-sheet.png) | [after](img/task100/after/phone/map-sheet.png) |
| iphone-se sheet | [before](img/task100/before/iphone-se/map-sheet.png) | [after](img/task100/after/iphone-se/map-sheet.png) |

Adjacent JSON records every measured button rectangle, public selector and axe
finding. Image pixels include device scale; dimensions are asserted in CSS pixels.
Remote CI and independent fleet review remain required before merge.

An initial post-sync command omitted the unit paths and consequently selected
auth/rules integration tests without their separate emulators; those failed on
loopback connection refusal. The corrected package-equivalent command above
passed. This report does not claim a full rules/storage-emulator run.
