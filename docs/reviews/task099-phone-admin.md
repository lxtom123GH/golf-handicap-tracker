# 099 — phone admin approval

13 October 2026 AEST. Independent branch from public main
`0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`, including the merged demo-only harness.
All users and fixtures are synthetic, confined to local Auth/Firestore emulators.

## Change

Below 600 CSS pixels, each registered user becomes a stacked table row: name,
email, role, Approved/Coach controls, then quota. The original table and every
existing id/handler remain. Each checkbox and quota input includes the user's
name and email in its accessible name; visible field captions explain the
controls. A missing sixth table heading for quota is supplied.

Phone Admin cards span the single available grid column explicitly. This also
prevents the old `span 2` rule creating an implicit column beside the import
card. No approval decision, role check, quota semantics, rules or data access
policy changes. The existing admin-only write guard is covered by a unit test.

## Red → green evidence

- On main, both real-browser cases fail: approval's right edge is 456.86 px,
  outside both 412 px and 375 px viewports, with scrollX still zero.
- After, the labelled control lies at x21–200 on phone and x21–181.5 on iphone-se.
  The entire page's scroll width equals the viewport width in both cases.
- The synthetic pending tester is verified but unapproved. A separately signed-in
  synthetic admin checks its actual checkbox; the test reads back `isApproved`
  from the local emulator, reloads the tester and verifies app access.
- Final browser result: **2/2 passed**, with the complete approval journey on
  both devices. The preview build passes as part of startup.
- Scoped axe `label` check on the Admin tab: **zero violations after**; before,
  four and eight unlabeled checkbox nodes respectively (two/four fixture users).
- Three new unit checks pass: specific names/visible labels and unchanged handlers,
  escaping of malicious-looking display names, and the admin-only update guard.
- Full package-equivalent unit suite: **138 files / 1,335 tests passed**, 162.83 seconds.

```
node scripts/run-e2e-isolated.mjs tests/e2e/admin-phone-approval.spec.js --project=phone --project=iphone-se
node node_modules/vitest/vitest.mjs run tests/unit tests/oncourse.test.js --maxWorkers=1
```

| Device | Before | After, pending | After, approved |
|---|---|---|---|
| phone (412 px) | [before](img/task099/before/phone/pending-before-approval.png) | [pending](img/task099/after/phone/pending-before-approval.png) | [approved](img/task099/after/phone/approved.png) |
| iphone-se (375 px) | [before](img/task099/before/iphone-se/pending-before-approval.png) | [pending](img/task099/after/iphone-se/pending-before-approval.png) | [approved](img/task099/after/iphone-se/approved.png) |

Adjacent JSON records measured boundaries and scoped label findings. Browser
traces, console logs and auth identifiers are not published. Emails visible in
screenshots are disposable `test-…@example.invalid` fixtures.

## Limits and safety

Chrome Headless Shell with the repository's dead proxy/external-host guard,
empty HOME/environment and no GitHub/cloud credentials. No live account,
production data, manual deploy or merge. This is the specified label check,
not a full Admin WCAG audit. Remote CI and independent fleet review remain due.
