# 101 — intentional mapless shot entry

13 October 2026 AEST. Independent branch from public main
`0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`.

## Fix

The resolved hole's map availability now controls a `map-unavailable` class.
Without a map, the GPS capture ring occupies its own normal-flow header row,
10 CSS pixels below the shot title. The step prompt reads:

> No map for this hole yet - pick the club and result

Mapped-hole canvas geometry remains unchanged. Every existing id remains. No
GPS policy, shot persistence, map-first preference or default is changed. The
fallback is based on the resolved overlay, not just the saved map preference.
The pure prompt function keeps its original behaviour when availability is
unspecified, so existing callers retain their text.

## Evidence

- Before: both phone regressions fail because the visible GPS ring intersects
  the Shot title. Both also record the inappropriate drawing prompt.
- After: on both 412 px and 375 px viewports, title bottom = 45.94 px and ring
  top = 55.94 px. Ring/header boxes do not intersect; plain fallback copy is
  asserted, a club is picked and the actual Log action succeeds.
- Final combined browser suite: **14/14 passed** across phone and iphone-se:
  mapless-shot, map-first, draw-mode and all hole-overlay cases. This includes
  mapped drawing, plan/log behaviour, existing no-overlay behaviour, Details,
  cancel/reopen and next-shot map-first cleanup.
- New pure unit cases: four no-map shot states and mapped/legacy compatibility.
- Full package-equivalent unit suite: **138 files / 1,337 tests passed**, 174.99 seconds.
- Preview build and diff check pass. No new `!important` or `.style.display`.

```
node scripts/run-e2e-isolated.mjs tests/e2e/mapless-shot.spec.js tests/e2e/map-first.spec.js tests/e2e/draw-mode.spec.js tests/e2e/hole-overlay.spec.js --project=phone --project=iphone-se
node node_modules/vitest/vitest.mjs run tests/unit tests/oncourse.test.js --maxWorkers=1
```

| Device | Before | After |
|---|---|---|
| phone (412 px) | [before](img/task101/before/phone/mapless-capture.png) | [after](img/task101/after/phone/mapless-capture.png) |
| iphone-se (375 px) | [before](img/task101/before/iphone-se/mapless-capture.png) | [after](img/task101/after/iphone-se/mapless-capture.png) |

Adjacent JSON records actual geometry and step text. Screenshots use synthetic
users and retain the emulator warning. No auth logs/traces are published.

## Readiness and limits

Together with the fleet's 13 October distance/offline/GPS-denied evidence, these
checks close the two identified no-map presentation blockers on this candidate.
Conditional Go for the tested browser criteria after independent review and
integration; the owner's real-device outdoor check is still required. The
existing default is not changed here. Neither the iPhone-sized Chromium run nor
mocked GPS is a real iOS/WebKit or outdoor-GPS result.

The run used a fresh credential-free checkout and local demo Auth/Firestore only,
with the merged harness's dead proxy/external-host guard. Remote CI and fleet
review remain pending. No manual deploy, live-site access or merge was performed.
