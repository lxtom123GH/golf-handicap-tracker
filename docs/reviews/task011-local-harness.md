# 011 — repeatable local UX fixture harness

13 October 2026 AEST. Public main base: `0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`.
This candidate adds development/test files only; application source and its
permission rules are unchanged. The package file adds the `dev:emu` alias.

## Verified commands

- `npm run dev:emu -- --check`: **passed**, 34.0 seconds including build/startup.
- `npm run dev:emu -- --check --iphone-se`: **passed**, 31.7 seconds.
- Full package-equivalent unit suite: **138 files / 1,339 tests passed**,171.50s.
- Focused launcher/fixture plus existing demo-safety tests: **23 passed**.
- `git diff --check`: clean. No new production dependencies or lockfile changes.

Both actual npm commands ran inside a fresh credential-free sandbox on dot's
cloud computer, using the existing demo-only emulator harness and installed
Chrome Headless Shell. Only the browser executable is overridden locally; dead
proxy/host denial remain. The two commands independently start and stop local
Auth/Firestore and built-preview servers. No production, sign-in, paid API,
manual deploy or merge was involved.

## Assertions beyond screenshots

Five separate browser contexts register synthetic identities through the real
UI. Player A's26 fictional rounds are written/read back from the demo emulator,
and the app renders a numeric handicap index. Player B has zero rounds. Pending C
is email-verified but remains unapproved/outside the app. Coach D's actual roster
shows A. Admin E has the Admin tab. The contexts use en-AU and Brisbane time.
The fixture summaries omit auth ids, session state and credentials.

| Persona | Pixel 7-size home | iPhone SE-size home |
|---|---|---|
| Test Player A,26 rounds | [phone](img/task011/phone/player-a-home.png) | [small phone](img/task011/iphone-se/player-a-home.png) |
| Test Player B,0 rounds | [phone](img/task011/phone/player-b-home.png) | [small phone](img/task011/iphone-se/player-b-home.png) |
| Test Pending C | [phone](img/task011/phone/pending-c-home.png) | [small phone](img/task011/iphone-se/pending-c-home.png) |
| Test Coach D | [phone](img/task011/phone/coach-d-home.png) | [small phone](img/task011/iphone-se/coach-d-home.png) |
| Test Admin E | [phone](img/task011/phone/admin-e-home.png) | [small phone](img/task011/iphone-se/admin-e-home.png) |

Additional Player A [phone handicap view](img/task011/phone/player-a-handicap.png)
and [small-phone handicap view](img/task011/iphone-se/player-a-handicap.png) prove
that the app actually consumes the mixed-round data. The displayed number is
observed UX output, not an independent mathematical certification.

## Limits / fleet coordination

The default held `npm run dev:emu` mode opens headed browser windows and waits for
Ctrl+C; its command construction is unit-tested but a headed interactive display
was not verified on this Headless Shell machine. The verified `--check` mode is
the same fixture journey without the final hold. These phone profiles do not
establish real WebKit/iOS behaviour or outdoor GPS.

Open fleet PR#4 independently adds a four-persona smoke harness and extra guards.
This branch does not edit that work: it fills the brief's missing26-round/zero-round
split, verified pending state, coach linkage and walkthrough entrypoint on current
main. The fleet can consolidate entrypoints during review. See
[setup, safety and command details](../LOCAL-UX-HARNESS.md).

No task098–101 application fixes are silently included. These are baseline
screens, not evidence those independent candidates are merged. Remote CI and
independent fleet review remain pending.
