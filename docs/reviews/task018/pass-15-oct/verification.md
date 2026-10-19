# PR 18 — 15 October follow-up

Done means: all four outstanding ACT ON findings have fixes or evidenced disputes;
the regressions fail with the old behavior and pass with the fixes; browser states
and mapper read-back confirm recovery; the full unit suite and build pass.

## Finding census

Read the PR body, all three issue comments, and both review APIs (no submitted
reviews or inline review comments). The [13 October review](https://github.com/lxtom123GH/golf-handicap-tracker/pull/18#issuecomment-6146023148)
contains three ACT ON findings. The [14 October owner comment](https://github.com/lxtom123GH/golf-handicap-tracker/pull/18#issuecomment-6166646278)
adds practice validation and repeats mapper acknowledgement. Four distinct findings;
none disputed. The repeated mapper CI report is the same finding, not a fifth defect.

| ACT ON | Resolution and behavioral check |
|---|---|
| P2 oversized video | Preserve main's safe code-specific recovery. For a known 20 MiB clip rejected with failed-precondition, show the 19 MB analysis limit and trim/upload instructions. Renderer and browser tests reject retry/connection advice and private diagnostics. |
| P3 rules microphone | Denial directs the player to browser settings or the competition committee; network failure points to the Rules of Golf or committee. Existing timer tests and a browser journey cover both. |
| P3 mapper acknowledgement | Pending until the server promise resolves, then confirmed saved. Save stays usable offline. Late completions cannot overwrite a newer save or another mount. Browser saves online, queues offline, reconnects, and reads the stored document. |
| Practice invalid-argument | Local advice asks the player to retype the goal and check focus/time. No server-message pass-through. Unit and browser tests preserve the rejected input and complete a corrected retry. |

## Main comparison and before evidence

Main was checked first at `a43d7e5533c92ad767b5b5f676abbbf2a701db87` in a
detached worktree. It is not a superseding change: its rules error handlers still
say `Error: network` / retry microphone permission, its mapper reports saved
before acknowledgement, and practice displays the backend validation message.
Its video recovery from #6 already preserves code-specific guidance, quota reset
time, saved-result lookup and a live region. The merge retains those behaviors.

- Main's existing practice goal-validation journey: **1 passed (39.2s)**.
- Main's existing mapper save/read-back journey: **1 passed (34.8s)**.
- New renderer/timer/mapper/practice regressions run against unchanged main source:
  **7 failed / 44 passed**. This distinguishes main's existing behavior from this
  PR's regressions; it does not claim main had the PR's connection/reconnect text.
- Merged PR baseline `89cf3a5`: **148 files / 1,431 unit tests passed**, build passed.
- New regressions before fixes: **6 failed / 45 passed** across four files.
- Existing browser journeys before fixes: **2 failed**. The mapper remains on
  `2 map area(s) queued. Reconnect to finish syncing.` after online acknowledgement;
  practice shows connection advice for invalid input.

[Mapper before](mapper-before.png) · [Practice before](practice-before.png)

## After evidence and outside judges

The outside judges are Vitest assertions, Playwright's rendered-state assertions
at 375×667, the real Firebase Auth/Firestore emulators, and Firestore REST read-back.
Chromium's mobile viewport is not a physical phone or Safari run. Only the billable
AI callables and browser speech recognition are scripted; no live AI request is made.
The oversized-video fixture seeds metadata; it does not upload an actual 20 MiB file.

- Focused unit regressions: **4 files / 54 tests passed**.
- Mutation check: removing the mapper save-order guard gives **2 failed / 5 passed**;
  both late success and late rejection overwrite the newer pending save. Restored.
- Final-review check: an early version of the mount guard cancelled a requested
  save if the mapper closed while imports loaded. The added regression failed
  once, then passed after limiting the guard to status updates; writes still finish.
- `npm run test:unit`: **149 files / 1,441 tests passed**.
- `npm run build`: passed; existing large-chunk warning remains.
- `E2E_PORT_BASE=42000 node scripts/run-e2e-isolated.mjs tests/e2e/practice-inputs.spec.js tests/e2e/hole-mapper.spec.js tests/e2e/actionable-recovery.spec.js --project=iphone-se`:
  **7 passed**, zero retries, including both microphone failures, all practice-input
  journeys and online/offline/reconnect mapper save.
- Read-back: two features, `green` and `water_hazard`, first ring length seven,
  author UID present. The save payload/schema is unchanged.
- `git diff --check`: passed.

[Online save](mapper-online.png) · [Offline pending](mapper-offline.png) ·
[Reconnected](mapper-reconnected.png) · [Practice correction](practice-validation.png) ·
[Oversized video](oversized-video.png) · [Mic denied](rules-not-allowed.png) ·
[Mic network failure](rules-network.png)

Full E2E, rules/auth/offline standalone suites, and physical iOS testing were not
rerun in this pass. Dependency installation reports 49 audit findings; dependency
upgrades are outside these recovery-copy fixes. Fresh exact-head CI and dot review
are still required. No new product/content ruling is needed for these fixes.

## Bigger version

Run the complete browser/security matrix and physical iOS checks. Structured
backend validation reasons could support more precise per-field correction advice;
this pass keeps local safe guidance within the existing API contract.
