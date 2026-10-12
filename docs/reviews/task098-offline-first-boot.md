# 098 — first-session offline reload

Date: 13 October 2026 (AEST). Synthetic local-emulator testing only.
Base: public main `0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`.

## Finding and fix

The first-session failure occurred **before authentication could start**. The
first page loaded its generated JavaScript and stylesheet before the service
worker controlled the page. The installer cached the HTML, manifest and favicon,
but not those boot assets. An online reload happened to warm the asset cache.

The build now emits a manifest of generated same-origin JS/CSS, including lazy
chunks. Service-worker installation caches that manifest's assets and `/`
atomically before activation. A missing required asset leaves the old shell
intact. Optional icon failures do not invalidate a complete shell. A malformed,
empty or cross-origin manifest is rejected. No user or API data enters this list.

A second failure emerged during testing: `Vary: Origin` distinguished an
install-time fetch from a module/link request. Cache lookup now ignores that
variation **only for generated public JS/CSS paths**. All other resources retain
normal matching. Merely adding precaching did not fix the browser regression;
that failed intermediate run was retained locally during diagnosis.

No authentication, approval, Firestore rules or account-admission logic changed.
The brief's suspected authentication await was not the observed cause.

## Checks

- Before: first-session offline reload failed on both phone and iphone-se;
  the online-reload-first control passed on both (2 failed, 2 passed).
- After: all four variants pass, with the loading cloak cleared, hub visible,
  and the previously entered score of 4 retained.
- Final combined browser run: **20/20 passed**, including six additional
  admission checks and all ten registration checks across the two phone projects. These cover verified invited signup, uninvited
  pending state, slow profile update, persisted sign-in and password-manager UI.
- New unit checks: **12 passed** (manifest generation, atomic install/failure,
  invalid manifests and narrow Origin matching); existing SW checks also pass.
- Final full unit run including merged #15: **139 files / 1,344 tests passed**
  (171.13 seconds), including the 16 demo-harness safety checks.

Commands inside the credential-free test checkout:

```
node scripts/run-e2e-isolated.mjs tests/e2e/offline-first-boot.spec.js tests/e2e/offline-admission.spec.js tests/e2e/registration.spec.js --project=phone --project=iphone-se
node node_modules/vitest/vitest.mjs run tests/unit tests/oncourse.test.js --maxWorkers=1
```

The browser run used the exact demo-only harness subsequently merged as #15;
all 341 source blobs of that harness head match the merged main tree. The local
runtime override only selects the installed Chrome Headless Shell executable;
it preserves the dead proxy and external-host denial. No signed-in tools, cloud
keys or GitHub token were available to repository code. Only local Auth and
Firestore emulators ran, against `demo-golf-tracker`.

## Screenshots and measurements

Each pair shows the same synthetic flow. CSS viewport sizes come from the
repository's `phone` and `iphone-se` projects; image pixels include device scale.

| Variant | Before | After |
|---|---|---|
| phone, no warm-up reload | [before](img/task098/before/phone/no-online-reload-first.png) | [after](img/task098/after/phone/no-online-reload-first.png) |
| iphone-se, no warm-up reload | [before](img/task098/before/iphone-se/no-online-reload-first.png) | [after](img/task098/after/iphone-se/no-online-reload-first.png) |
| phone, online warm-up | [before](img/task098/before/phone/online-reload-first.png) | [after](img/task098/after/phone/online-reload-first.png) |
| iphone-se, online warm-up | [before](img/task098/before/iphone-se/online-reload-first.png) | [after](img/task098/after/iphone-se/online-reload-first.png) |

Adjacent JSON contains only variant, cloak/score outcome and public cache paths/
Origin variation. Console logs, auth identifiers and browser traces are omitted.

## Limits

This verifies a completed first installation, not instant loss of connectivity
before the app finishes downloading. The generated manifest exists in built
preview/production output; Vite development mode does not advertise a complete
offline shell. No deployment or live-site test was performed. Real-device outdoor
acceptance remains with the owner/fleet. Required remote CI still needs review.

## Admission checks and test-run corrections

Verified accounts with false/missing approval stay pending online. Offline, an
uncached pending account may return to the existing Login error fallback; the
test explicitly requires a visible gate and a hidden main app. An unverified
password account stays at the verification gate even if the synthetic fixture
sets approval true. All six cases pass, with no admission-code changes. This
does not claim pending users can complete account verification while offline.

The first new admission-test run had a Fetch Response API typo and assumed the
existing offline gate always used the pending screen. Both test mistakes were
corrected against observed fail-closed behaviour; the final 20-case run passed.
An initial post-sync unit command selected auth/rules integration tests without
their separate emulators. Those loopback-refusal failures are not app regressions;
the corrected package-equivalent unit run passed. No full storage/rules suite
pass is claimed.
