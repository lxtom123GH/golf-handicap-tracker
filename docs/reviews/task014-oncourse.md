# Task 014: on-course interruptions and one-thumb scoring

13 October 2026. Independent public-main base `0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`; branch `dot/golf-oncourse-flow`. Own cloud Chrome Headless Shell, demo Auth/Firestore, fresh credential-free checkout and synthetic data only.

## Three priority fixes, without duplicating branches

1. **Major: a first-session offline reload cannot load the application shell.** Task098 already provides an independent service-worker/cache fix and cold/warm offline plus admission regressions. The investigation established missing first-install JS/CSS cache entries and `Vary: Origin`, rather than relying on the earlier suspected hanging profile read. See `dot/golf-offline-reload-after-signup` at `3554f9ebfdab9e9a34fb165b4931ef923bd3ed8b`. Its 20 browser and 1,344 unit tests passed; this branch does not duplicate that change.
2. **Major: small scoring targets make accidental input harder to avoid.** Task100 independently fixes the putt/FW/GIR/navigation target sizes and scoring contrast, with 16 browser and 1,332 unit passes. See `dot/golf-scoring-tap-targets` at `738f130c6c33bf47565b7ad1a5498455a80c63e9`. Enlarging a target does not reduce the number of intentional taps; no human-speed improvement is inferred.
3. **Major: a late keep-awake response can override the golfer's newer choice.** This branch fixes pending On→Off, On→Off→On with out-of-order grants, and a stale rejection after a successful newer request. Before: all three new tests fail. After: retired grants release their own sentinel and cannot replace the newer lock, UI state or remembered preference. The existing default and remembered-choice policy remain unchanged.

Task013's separately published contrast/reflow candidate complements these fixes. None of these sibling branches has been merged by dot, and their combined integration is not represented as already accepted.

## Correction to the earlier retest report

Simple mode **does have** a Keep screen awake toggle: open the round strip's More (⋯) sheet. The actual rendered control is visible at both 375 and 412 CSS px. The earlier statement that it exists only in Detailed mode was incorrect. This work preserves that existing location instead of adding a duplicate control.

## Benchmark protocol

The real UI registers and verifies an invented player against local emulators, starts a custom `Synthetic Nine` course with par 36, enters scores `[5,4,6,3,5,4,5,6,4]` and two putts per hole. Hole 3 intentionally enters 7 and corrects it with one minus tap. Scores start at zero. Next is tapped after holes 1–8. More, Finish and Save are outside the per-hole timing window and add three taps.

Total scoring-entry taps: **70**, including the deliberate mistake and correction; **68** without that error. Finish/save adds **3**. Timings measure Playwright commands and rendering on this cloud machine, not human decision time, walking, thumb reach or sun glare. No speedup claim is based on sub-second differences between runs.

The custom course intentionally has no published stroke-index/rating data. The saved round is gross-only/non-counting. This is a persistence and flow test, not a handicap-method validation. Saved readback asserts gross 42, nine holes, 18 putts and all nine per-hole gross scores.

## Interruption and acceptance boundaries

- Online reload and warmed-cache offline reload compare the complete locally persisted round state before/after.
- Offline recovery restores network and confirms the same state, then continues scoring and saving.
- A CDP renderer crash is followed by closing that dead page and reopening the application in the same browser context. This tests persisted-state recovery after renderer death, not an OS force-stop, browser-profile eviction or phone power loss. Direct `page.reload()` on the crashed target is rejected by Playwright; that draft harness failure was corrected rather than called an application defect.
- Delayed wake grants use a deterministic browser API substitute through the actual Simple-mode toggle. They prove application response ordering and release calls, not an OS-level screen lock.
- The physical screen-off/return, battery saver, iOS/WebKit, GPS continuation and outdoor glare checks remain manual. A resolved browser wake request is advisory, and manually turning the screen off is not something the app should override. [W3C Screen Wake Lock specification](https://w3c.github.io/screen-wake-lock/) and [MDN usage and release guidance](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) were opened for this review.

## Scope and source checks

`docs/ON-COURSE-CHECKLIST-2026-10.md` is absent from public main. Its historical archive copy (blob `ca5193d4e24339559c3d26423e4f6efb1a60c361`) was read for context only; no branch was based on the archive. Its one-handed shot map, club chips, home-bar reach, sun/glare, undo timing and GPS checks remain in the outdoor acceptance list. The automated scoring benchmark uses a synthetic unmapped course and does not claim those mapped-course or physical-device checks.

No score defaults, save schema, auth/admission, access rules, AI calls or production settings change here. Reducing score-entry taps by pre-filling par would change product behaviour and needs a separate owner decision; it has not been implemented.

## Measured before/after scoring timings

Milliseconds below are robot timings. Tap counts are identical before/after. The interrupted actions themselves are outside these per-hole times.

| Hole | Taps | 412 px before ms | 412 px after ms | 375 px before ms | 375 px after ms |
|---|---:|---:|---:|---:|---:|
| 1 | 8 | 415 | 504 | 519 | 546 |
| 2 | 7 | 397 | 568 | 475 | 471 |
| 3 | 11 | 831 | 955 | 842 | 817 |
| 4 | 6 | 390 | 400 | 398 | 454 |
| 5 | 8 | 708 | 746 | 578 | 617 |
| 6 | 7 | 479 | 467 | 441 | 482 |
| 7 | 8 | 670 | 473 | 637 | 617 |
| 8 | 9 | 666 | 574 | 601 | 571 |
| 9 | 6 | 375 | 449 | 373 | 449 |

## Final verification record

- Application freeze: local `6e5645e`; no application source changes afterwards.
- New interrupted-toggle unit cases: **3/3 fail before**, **3/3 pass after**. Existing remembered-choice and GPS-start checks plus the new cases: **29/29 pass**.
- Full unit gate: **138 files / 1,335 tests pass**, 164.10 seconds.
- Final phone/SE Playwright gate: **4/4 pass**, including complete nine-hole save/readback, online reload, warm offline reload, renderer crash/reopen and actual toggle-handler interleavings.
- Identical expanded browser spec on original source: **2/4 pass**, with only the two delayed-toggle cases failing. Both baseline nine-hole interruption journeys pass.
- Build passes inside the browser launcher; existing Vite chunk-size and static/dynamic import warnings remain.
- First custom-course draft omitted mandatory Par and correctly could not start; filling synthetic Par36 fixed the test. First crash draft tried to reload the dead target and failed in Playwright; reopening a fresh page fixes that harness assumption. Neither is represented as an application regression.
- Commands: `node scripts/run-e2e-isolated.mjs tests/e2e/oncourse-flow-014.spec.js --project=phone --project=iphone-se`; `vitest run --maxWorkers=1 tests/unit tests/oncourse.test.js`. Own-cloud runner supplies pinned demo-only browser/runtime configuration and no credentials.
- The initial offline/cold case is independently covered by task098; this branch does not quietly include its service-worker change. No physical phone, OS process kill, real GPS, signed-in preview, live account or production acceptance is claimed.

## Synthetic evidence

All figures show invented people/course/scores. JSON excludes fixture identifiers and emails. No raw trace or emulator log is published.

| View | 412 px | 375 px |
|---|---|---|
| Late grant after Off, before | [before](task014/phone-before-late-grant.png) | [before](task014/iphone-se-before-late-grant.png) |
| Late grant after Off, fixed | [after](task014/phone-after-late-grant.png) | [after](task014/iphone-se-after-late-grant.png) |
| Simple-mode More sheet | [phone](task014/phone-simple-round-options.png) | [SE](task014/iphone-se-simple-round-options.png) |
| Nine-hole finish | [phone](task014/phone-finish.png) | [SE](task014/iphone-se-finish.png) |
| Latest On choice preserved | [phone](task014/phone-wake-latest-choice.png) | [SE](task014/iphone-se-wake-latest-choice.png) |
