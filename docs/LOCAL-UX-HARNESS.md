# Local UX harness — task 011

A disposable, synthetic golf app for phone UX work. It uses the existing guarded
private-port Playwright launcher, local Auth/Firestore emulators and a built Vite
preview. It is not a production sign-in, deployment or hot-reload development
server. No Functions emulator or paid AI call is needed.

## Prerequisites

Use a fresh checkout without GitHub tokens, cloud keys or signed-in tools. Install
the exact lockfile dependencies with `npm ci`; install Playwright Chromium through
its official installer (`npx playwright install chromium`) and the Java runtime
required by the pinned Firebase tools. These setup steps need package-network
access. Test execution itself only needs loopback access and the downloaded
emulator/browser runtimes. No `firebase login` is needed.

## One command

```
npm run dev:emu
```

This starts the guarded emulator/preview servers on private ports and opens five
separate fresh browser contexts at Pixel 7 size, using en-AU and Brisbane time. After setup, keep the terminal
open and use the windows for a walkthrough. Ctrl+C stops the session and its
servers. Fixtures are disposable; no user profile/session is exported. The
harness does not remove the emulator warning. Do not use real credentials or click paid AI
features.

Headless check (captures the same five home screens, verifies fixtures and exits):

```
npm run dev:emu -- --check
npm run dev:emu -- --check --iphone-se
```

For a held 375×667 session, use `npm run dev:emu -- --iphone-se`. The default
interactive command needs a desktop/display and installed full Chromium. The
verified cloud runs used `--check` with installed Chrome Headless Shell; a headed
interactive window was not verified in that environment. `iphone-se` is a
Chromium layout profile, not an iOS/WebKit certification.

Default private ports: Auth39099, Firestore38080, preview34300, hub34400 and
logging34500. If another service is using one, stop that service yourself or set
`E2E_PORT_BASE` before running; the existing runner refuses to reuse a listener.
Its default base is30000; use an integer1024–55000. Do not open the normal app
hosting URL or a PR preview for these checks.

## Fixtures and assertions

| Persona | Fixture | Verification |
|---|---|---|
| Test Player A |26 fictional historical rounds:9 nines,17 eighteens |Read back all26 records and display a numeric app index |
| Test Player B |Approved, zero rounds |Read back zero records |
| Test Pending C |Email verified, not approved |Pending visible, app hidden, approval stillfalse |
| Test Coach D |Approved coach linked to A |Coach roster actually shows Test Player A |
| Test Admin E |Approved admin |Admin tab visible |

Addresses are generated under `example.invalid`; the fixed fixture password is
only for these throwaway emulator accounts. Never reuse it for a real account.
Dates, course names and scores are invented. These fixtures exercise UX states;
they are not independent WHS/GA arithmetic conformance examples.

Sources: `tests/e2e/helpers/ux-fixtures.js` and
`tests/e2e/local-ux-harness.spec.js`. Account creation uses the real app UI and the
existing emulator-only verification helpers. Coach/admin flags and round records
are fixture writes through the loopback-only demo emulator helper. No production
permission logic is bypassed or modified by the app itself.

## Evidence and reuse

The test saves five `<persona>-home.png` files, Player A's handicap view and a non-identifying fixture
summary under its `test-results/.../ux-personas/` directory. A normal Playwright
run may clear previous test results: copy selected evidence before rerunning.
Never publish browser storage state, auth traces, raw emulator logs or real data.
The committed [acceptance report](reviews/task011-local-harness.md) includes
reviewed synthetic captures and exact verification results.

The existing harness guards remain authoritative: a fixed `demo-` project,
loopback-only emulator hosts, no server reuse, no Functions, dead proxy and
Chromium external-host denial. Each manually created persona context explicitly
keeps the dead proxy. Existing safety tests plus new launcher/fixture tests pin
those constraints.

## Relationship to the open fleet harness port

Fleet PR #4 (`port/ux-harness-safety`, inspected at `dd61a3ff`) separately proposes
`ux:harness`, four role smoke fixtures and extra configuration guards. It is not
on this branch's main base. This task adds the brief's missing distinct new
player,26-round player history, verified pending account and actual coach link,
plus a held walkthrough mode. It reuses the existing main safety harness rather
than adding another application-side guard. The scripts can coexist; the fleet
may consolidate their entrypoints during review. This branch does not edit the
fleet branch or change `src/firebase-config.js`.
