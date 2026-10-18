# PR 25: 15 October follow-up

Done means: the built app restores a visible round with score 4 while still offline after its first controlled session, and an HTML fallback for any required asset rejects installation while preserving the previous shell; full unit tests and build pass.

Read the PR body, all three discussion comments, and the empty review/inline-comment lists. Both human review comments concern head `3554f9e`. No product/content owner ruling was present. Merged current main `a43d7e5` without conflicts in `1e4c679`; it does not contain this change.

## Complete ACT ON list

| Review | Finding | Disposition |
|---|---|---|
| [13 Oct 12:42 UTC](https://github.com/lxtom123GH/golf-handicap-tracker/pull/25#issuecomment-6145788860), P3 | Fixed 1.5-second delay can disconnect before installation completes | `78c2f72`: bounded poll for service-worker control; overlaps the second P2 below |
| [13 Oct 16:03 UTC](https://github.com/lxtom123GH/golf-handicap-tracker/pull/25#issuecomment-6149754852), P2 | Required JS/CSS can return a successful HTML Hosting fallback and replace the working shell | `591154e`: validate success, basic response type and MIME; store exact validated assets, then replace HTML last |
| Same review, P2 | Score/hub assertions run after reconnection and can miss broken offline restoration | `78c2f72`: require both while offline; reconnect in finally cleanup |

DISMISSED: none. Earlier approval applies only to its reviewed head; the refreshed head needs a fresh second-model review.

## Artifact evidence and outside judges

On current main, the revised cold-boot browser journey failed after service-worker control: entry JS/CSS were absent from CacheStorage, their offline requests failed, and the loading cloak remained visible. Before changing production code, this was reproduced with main's production build and demo Auth/Firestore emulators on private ports.

The fallback browser tests install the built worker on a local HTTP origin, successfully cache a previous shell and JS/CSS, then update the worker while the required asset returns `200 text/html`. Before the fix both candidates incorrectly reached `activated`. After the fix each candidate reaches `redundant`, and real Cache API reads confirm the previous HTML bytes and asset MIME survive. These are browser HTTP simulations of Hosting's rewrite, not live Hosting runs. New fallback unit cases also failed on the original implementation (3 failed / 11 passed), then all 14 worker tests passed.

The running app restores score 4 in both cold and warmed variants on phone and iPhone SE Chromium viewports, with the hub and score assertions before reconnection. False/missing approval and unverified email still fail closed. The judges are Playwright assertions against built output, Chromium's actual service-worker/Cache APIs, and Vitest. No self-assigned quality score is used.

A temporary browser mutation made the score display 0 while offline and restore 4 only on the online event. With the original reconnect-before-assertion ordering it passed. With the revised ordering it failed specifically on expected 4 / received 0 (one expected failure, one old-order pass). The mutation specs were removed; production code was not changed for this experiment.

| Artifact | Link |
|---|---|
| Current main, cold offline boot stuck at initialization | [before screenshot](task098-15oct/main-before.png) |
| Fixed cold offline boot, score 4 and offline banner | [phone](task098-15oct/phone-after.png), [iPhone SE viewport](task098-15oct/iphone-se-after.png) |
| Public cache paths and before/after outcomes | [sanitized JSON](task098-15oct/evidence.json) |

Shared evidence excludes raw console logs, session identifiers, emulator verification links, and traces.

## Verification

- Clean merged baseline: `npm run test:unit` — **145 files / 1,411 tests passed**.
- Fixed tree: `npm run test:unit` — **145 files / 1,415 tests passed**.
- `npm run build` — **built successfully**; existing mixed-import and large-chunk warnings remain.
- `npx vitest run tests/unit/sw-first-install.test.js tests/unit/offline-shell-manifest.test.js tests/unit/sw-shell-cache.test.js` — **3 files / 20 tests passed**.
- Browser command: `E2E_PORT_BASE=43800 node scripts/run-e2e-isolated.mjs tests/e2e/offline-first-boot.spec.js tests/e2e/offline-admission.spec.js tests/e2e/sw-install-validation.spec.js tests/e2e/registration.spec.js --project=phone --project=iphone-se` (PowerShell sets the environment variable separately) — **24 passed (3.3m)**.
- Supplementary emulator checks use `scripts/run-emulator-tests.mjs --config scratch/emulators-base.json --project demo-golf-tracker` with private hub/logging ports, then the package scripts' exact service selections and test commands: Auth **2 files / 14 passed**, rules **6 files / 164 passed**, offline **1 file / 3 passed**; all exit 0.

Discarded local runs: an initial unit invocation collected the reproduction worktree nested under the repository; it was moved outside before the clean baseline/final runs. An initial browser pass was interrupted after a concurrent standalone build replaced its private emulator ports; the complete isolated run was repeated without rebuilding its output. The stock auth wrapper initially collided on Firebase's unisolated logging port 4500 and returned connection-refused failures; the equivalent command passed with private hub/logging ports. These runs are not reported as passes.

## Limits and bigger version

No full E2E matrix, live Hosting, real iOS or outdoor acceptance is claimed by this local pass. Installation must finish online. The built inventory covers generated public JS/CSS; development-server mode does not emit it. No auth, Firestore schema, rules, admission policy or state-persistence behavior was changed. Existing FP-01/FP-04 round persistence was exercised, not reclassified as missing.

Bigger version: use the owner's real iPhone SE for loss-of-signal acceptance and test a deployment crossing the inventory and HTML requests. Recommendation: obtain fresh second-model review and inspect new-head CI before merging. No new product/content decision is needed.

| time | decision | why | evidence | result |
|---|---|---|---|---|
| 15 Oct, AEST | Retain PR and merge main | Base still fails cold offline boot | Main a43d7e5 controlled reload fails | Clean merge 1e4c679 |
| 15 Oct, AEST | Validate once and write HTML last | HTML fallback passes addAll; refetching would race deployments | Unit failures and two real-browser activated candidates before fix | Candidate rejected; old bytes preserved |
| 15 Oct, AEST | Require score restoration before reconnect | Online recovery can hide offline failure | Assertions run with network disabled | Offline round checks pass |
| 15 Oct, AEST | Isolate all local emulator ports | Shared logging port prevented auth startup | EADDRINUSE 4500, then private-port exit 0 | Auth/rules/offline pass |
