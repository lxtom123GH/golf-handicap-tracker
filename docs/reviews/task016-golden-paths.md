# Task016: repeatable phone golden journeys

Local acceptance complete, 13 October 2026; fleet PR opening and exact-head CI remain pending. Independent public-main baseline0c5a0fc. No production access, deployment, merge or live account.

## Scope and existing fleet work

Open fleet PR3 (port/golden-path-coverage, head6269c706) already adds three emulator journeys, including nine-hole differential, warm offline strokes and admin approval. Its branch is untouched. This independent task adds the missing eighteen-hole abandonment, five versioned screenshot baselines at both phone sizes and a repeatable synthetic-only fixture build. Fleet should consolidate the overlapping acceptance evidence rather than retain duplicate legacy tests indefinitely. Main's existing emulator helpers and isolated runner are reused.

## Fixture separation

The ordinary production build is unchanged. Only explicitly selecting playwright.golden.config.js selects tests/golden/vite.config.js, which refuses execution without the demo project and isolated emulator config. That test build substitutes a fully invented nine/eighteen-hole catalog and its static course dropdown. Scoring, auth, admission, persistence, UI and rules code are untouched. It does not inject answers into the scoring functions. Unit checks pin the ordinary-build boundary, guard, exact catalog and narrowly targeted HTML replacement.

All players, emails, course labels, ratings and scores are synthetic. GPS coordinates are0,0 so proximity detection does not select a real club. No map/real-GPS acceptance is claimed. CI uses the existing demo-only launcher and browser outbound guard. Auth/Firestore are local only; no Functions or paid AI calls. The independent029 golf-method work must revisit these UI expectations if its approved method changes.

## Journeys

- Register/verify a local fixture, logout, actually sign in, select Synthetic Nine/Fixture Tee, score all nine holes, finish/save once, verify exact Firestore scores and the visible differential after reload.
- Start eighteen holes, score a stroke, abandon through the actual confirmation, reload, verify no active round and no saved round/shots.
- Verify an unapproved user cannot reach scoring; approval is performed through the admin UI, then reload admits the user. Current main checks admission on entry, not live while waiting; this test does not hide that known UX limitation.
- Five screenshot comparisons: anonymous login, empty new-player Handicap view, round setup, scoring hub, Settings. Dynamic fixture identity, build stamp and the local emulator warning are masked. No app-control locator is deliberately masked; the emulator-warning mask still covers its existing overlay footprint, including any underlying pixels. This preserves the known main local-warning overlap rather than claiming it is fixed. CSS animation is disabled only for capture. 0.5% maximum differing pixels accommodates minor raster noise; it is not a blanket layout tolerance.

## Commands

Baseline authoring: node scripts/run-e2e-isolated.mjs --config playwright.golden.config.js --update-snapshots
Acceptance: node scripts/run-e2e-isolated.mjs --config playwright.golden.config.js --repeat-each=5
Unit: npx vitest run tests/unit tests/oncourse.test.js

Commit reviewed baseline changes intentionally; CI never updates snapshots. CI downloads official Chrome Headless Shell155.0.8059.39 and checks SHA25639dcb8c46550632a3d911850ab3b8af840b4e3f6d8622faa2018eb8756278786. Local users set GOLDEN_CHROME_EXECUTABLE to that executable; the suite refuses a different version. Cloud runs use the same Chrome Headless Shell155, the repo lock's Playwright and Linux fonts. The SE project is375×667 Chromium, not WebKit/iOS. Screenshots are regression references, not proof of accessibility or real-device usability.

## Results

Frozen test source789d146: five repeats of all four tests on each of two phone profiles, **40/40 pass**, zero retries,4.5minutes. The five screenshots per profile were compared in every repeat: **50 screenshot assertions pass** against ten committed baselines. Full unit138files/**1336tests pass**,170.80seconds. Ten baselines visually inspected; synthetic only. No application source changed. The two complete nine-hole tests independently passed before the five-repeat run (37.5seconds including launcher). Remote exact-head CI remains pending and is part of the task's Done when; this is ready for review, not fleet-accepted/done. Early drafts incorrectly assumed the runtime catalog populated the static dropdown and that admin users auto-refreshed after signup; the test fixture now replaces the dropdown and reopens the admin tab. An early expected Daily Handicap9 omitted the app's existing0.93 factor: the actual fictionalHI18/CR36/SR113/par36 nine-hole daily value is8. This is a corrected test expectation, not a change to app maths. Unit config loading initially used JSDOM, which broke esbuild's TextEncoder invariant; the build-config test runs in Node.

Fixture setup reloads after initial registration so the existing header changes from its synthetic email fallback to the display name. This does not claim the first-render header issue is fixed. The saved-round journey explicitly returns from the Locker Room before navigating to Handicap; hidden text alone is not accepted as evidence of a visible success screen.

The initial saved-round draft tried to navigate to a hidden tab without returning from the Locker Room. Corrected to assert visible success and use Return to Home first. An intermediate run also showed the header email fallback is not replaced by the display name until reload; fixture reload is explicit. These are harness/setup discoveries, not claimed application fixes. No failed/intermediate run is counted among the40final passes.
