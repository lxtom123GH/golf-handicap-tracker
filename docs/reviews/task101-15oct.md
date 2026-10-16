# PR 28 — GPS accuracy containment, 15 October 2026

The Codex and Claude reviews identified the same P2: the mapless ring used
`position: static`, so its absolutely positioned accuracy label belonged to the
header instead. Commit `68f661a` keeps the row in flow with `position: relative`
and resets its inherited offsets with `inset: auto`.

Main `a43d7e5` was reproduced first. Both phone tests failed because the ring
overlapped the title and the mapless prompt requested drawing. The base refresh
is merge commit `5ec6484`; it preserved both the base changes and this fallback.

The final regression was also run against `5ec6484` without the CSS fix. Both
phones failed on label containment: label top 16, SVG top 56. The test supplies
GPS through Playwright, samples the populated `±6` label and geometry together,
checks containment and title clearance, and logs a shot through the real UI.

| Stage, both phones | Title bottom | SVG top/bottom | Accuracy top/bottom |
|---|---:|---:|---:|
| Main, original overlap | 45.96875 | 14 / 58 (outer ring) | Not sampled |
| Refreshed PR before fix | 45.96875 | 56 / 100 | 16 / 60 |
| Fixed PR | 45.96875 | 56 / 100 | 56 / 100 |

| Chromium profile | Main | Reviewed CSS | Fixed CSS |
|---|---|---|---|
| Pixel 7, 412 px | [capture](img/task101/15oct/main/phone/mapless-capture.png) | [capture](img/task101/15oct/pr-before/phone/mapless-capture.png) | [capture](img/task101/15oct/after/phone/mapless-capture.png) |
| iPhone SE size, 375 px | [capture](img/task101/15oct/main/iphone-se/mapless-capture.png) | [capture](img/task101/15oct/pr-before/iphone-se/mapless-capture.png) | [capture](img/task101/15oct/after/iphone-se/mapless-capture.png) |

Sibling `measurements.json` files contain the sampled values. JSON records the
live label and its bounds together; screenshots support the form-layout check.
Only synthetic local-emulator captures and measurements are published.

## Verification and limits

- Node 24.19.0; fresh lockfile install: 882 packages. Dependencies were installed
  on D: because C: had less than 1 GB free. The baseline used an existing tree
  whose lockfile SHA-256 matched; later runs used the fresh tree.
- Baseline full units: **144 files / 1,404 tests passed**; build passed.
- Post-change local serial units: **1,403 passed / 1 timeout** while importing
  the existing date-picker module. A two-worker run also encountered worker
  startup timeouts. These are failed runs; default CI remains required.
- Broader browser attempt: **22 passed / 1 skipped / 1 fixture timeout** across
  mapless, map-first, drawing, overlays and GPS capture on both phone profiles.
- Final strengthened mapless regression: **both phones passed**, including Log.
  iPhone drawing passed; the first Pixel drawing fixture write timed out before
  opening the page. A readiness write took **11.879 seconds** and its readback
  matched; the unchanged Pixel drawing test then **passed** in 16.1 seconds.

Runs use `scripts/run-e2e-isolated.mjs`, the offline demo project, private ports
and the existing browser network guards. An ignored local config allowed
300 seconds for service startup; application assertions and test timeouts were
unchanged. The drawing follow-up checks a disposable Firestore fixture write
and readback before running the existing test.

The PR comment contains exact commands and final CI/build results. Required
checks and fresh second-model review apply to the pushed head. These Chromium
profiles and mocked locations do not establish physical iOS or outdoor GPS
performance; that remains the bigger version and the existing owner check.
