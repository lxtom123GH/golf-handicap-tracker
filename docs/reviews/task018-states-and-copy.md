# Task 018: clearer state copy and safe error messages

Baseline: public `main` at `0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`. Independent branch; pending accessibility, offline, admin-layout and token PRs are not included. No calculation, database rule, role or access policy is changed.

## What changed

- Replaced direct service-error output in AI advice, practice plans, coach assignment, password reset, map saving, audio/video, guest creation and pending-card approval. Backend messages may carry technical details; they are not suitable default UI copy.
- `userErrorMessage` maps known service codes to local copy. Only a locally constructed `InputMessage` preserves its message, so video-type/size/quota and guest/card input corrections stay useful. A serialized object with the same name does not qualify. This is a rendering boundary, not authorization or a replacement for backend validation.
- AI approval and quota messages remain meaningful, without passing arbitrary text through merely because it has a permission/quota code. A recognized approval response gets the approval explanation; other permission failures are not misreported as pending approval.
- Added concrete next steps to empty, loading, error and offline wording. The offline banner no longer certifies that every write succeeded merely because the browser is offline. The map status says queued rather than implying a server acknowledgement.
- Failed coach-list and admin approved-email reads now replace Loading with recovery copy. Adding/removing a coach gives feedback on failure.
- Removed three unsupported “official WHS record/profile/handicap” claims. These writes are to the app's own Firestore record, not an official Golf Australia score-submission integration.
- Corrected the handicap explainer: a new score can change which old scores count; standard Stableford totals differ for nine and eighteen holes; AGS is expanded and distinguished from raw strokes. The simplified formula was removed from introductory copy rather than being presented as the complete current Australian calculation. The calculation implementation is unchanged.

## Inventory and retained wording

The [source census](task018/state-copy-census.json) records 239 lexical candidates and covers `index.html` and all `src/**/*.js`. It is a lexical review aid, excludes standalone comments and console calls, and includes some non-UI/dynamic fragments. It is not an AST proof that every possible runtime state was exercised. The [90-row before/after table](task018/before-after.md) and [replacement ledger](task018/copy-changes.json) record the main explicit substitutions; the branch diff is authoritative for final wording and the additional glossary/recovery changes.

Reviewed and retained where already useful:

- Auth email/password errors, verification/resend feedback and account-approval guidance: existing `auth-messages.js`, `auth-google.js`, `auth-v2.js` already provide safe next steps. The old fleet raw-error finding in auth is superseded on this baseline; password-reset's exceptional rejection path still needed repair.
- Cold-start previews: existing progress counts, explanation of what unlocks and start-round actions remain. This patch does not change establishment thresholds or handicap maths.
- Course/tee placeholders and “No Coach/Competition/Side Game” select options are choices, not failed requests. Missing hole details now point to Manual AGS; missing stroke-index warnings still preserve gross-only behaviour.
- Storage-full warnings, update-check offline feedback and existing round-save recovery copy already give next steps. They are not replaced by an unconditional “saved” promise.
- Background weather, observer cleanup and diagnostic console messages are not rendered UI copy. They are outside the direct-error-output guard.
- Brief score/readout summaries, such as no completed holes or no current strategy period, retain their adjacent controls rather than repeating a full instruction inside every small status label.

## Terminology sources actually opened, 13 October 2026

- [R&A Rules of Handicapping definitions](https://www.randa.org/roh/definitions): Handicap Index describes demonstrated ability against standard difficulty. Used for terminology, not a claim that this app is certified.
- [R&A Rule 3: adjustment of hole scores](https://www.randa.org/roh/the-rules-of-handicapping/rule-3): handicap-purpose hole adjustments and adjusted gross score differ from simply summing raw strokes; treatment depends on whether an index is established. No universal net-double-bogey rule was applied to beginners in this copy change.
- [R&A Rule 21.1: Stableford](https://www.randa.org/rog/the-rules-of-golf/rule-21): points are awarded relative to the target score; the explanation explicitly describes standard handicap Stableford, not every modified competition format.
- [Golf Australia archived Slope explanation](https://archive.golf.org.au/2021/02/slope/), dated 4 February 2014: confirms the Australian term Daily Handicap and its course/tee role. Historical terminology evidence only; its old formula is not used as current authority.
- [Current Golf Australia Daily Handicap Lookup](https://daily-handicap-table.golf.com.au/): opened, but the text reader receives only a client-rendered shell. The [official app page](https://golf.com.au/golf-australia-official-app/) and [welcome page](https://golf.com.au/news/welcome-to-golfcomau) similarly exposed a shell. No current formula or account feature is inferred from search snippets. Task 029 remains the separate mathematical conformance review.

## Tests and evidence

- Final full unit suite: 142 files / 1,364 tests pass, 168.36 seconds.
- Two raw-error regressions reproduced failures before the fix, then passed; separate coach and admin loading regressions also reproduced failures before their fixes.
- Earlier full-suite failures were exact old-copy expectations (guest validation, card ownership, voice error and the removed introductory formula). Updated assertions still pin no-write guards, timer lifetimes and the new wording. No test was skipped.
- Final isolated browser/build result: 4/4 journeys pass, zero retries, two repetitions at each phone size. Four loopback-intercepted synthetic AI failures in total, no paid calls.
- git diff --check passes. Explicit changed/new text scanned for credential patterns; screenshots use only synthetic fixture data.

The browser harness uses Auth/Firestore demo emulators, synthetic users and the test-only synthetic course/maps fixture. It starts no Functions server. The one AI-plan request per viewport is intercepted at the loopback demo URL and given a held synthetic failure; no paid AI call occurs.

Final browser run: 4/4 journeys pass with two repetitions per viewport (52.8 seconds), with 28 visible-state captures. The final repetition per viewport supplies the 14 committed images. Seven visible states per viewport: empty rounds, empty coaches, empty video library, invalid-file correction, held plan loading, failed plan generation and offline/reconnected banner. The browser must assert visibility before checking text. The returning-user fixture performs one online reload after signup; first-signup cold-start rendering is not certified by this census.

[Screen manifest](task018/screenshots.json) records all 14 captures. Full-page screenshots retain fixed navigation at its viewport position. All were inspected for synthetic data and readable wrapping. Existing contrast, small controls, field overflow and overlay placement are not claimed fixed by this copy-focused work.

## Limits and follow-ups

- No live accounts, paid AI, production data, external preview, manual deployment or merge. Tests run in a fresh credential-free checkout.
- Chromium at 412×839 and 375×667 is not a physical phone or Safari/iOS check. External fonts are blocked. No whole-app WCAG claim.
- Unit tests reproduce error mapping, validation guards, coach loading and timer behaviour. The browser exercises representative states, not every backend failure or every role.
- The first browser draft checked hidden text and captured an unsettled first-signup dashboard. Manual inspection caught that weakness; visibility assertions and an explicit returning-user setup replaced it. This is not evidence that first-signup rendering itself was fixed.
- Some background/listener failures and multi-step persistence flows still only log diagnostics or have separate recovery work. In particular, an audio upload followed by a failed round-document link can still claim it is discoverable in history; correcting that requires an acknowledgement/state change, not merely substituting a nicer generic error. Keep this distinct from the now-sanitized upload rejection message.
- Reconcile overlapping `index.html`/UI files with pending accessibility and layout branches before integration. Do not drop either branch's tests. Existing authorization and scoring regressions remain required.
