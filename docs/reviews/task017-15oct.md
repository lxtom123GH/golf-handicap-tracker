# PR 20: 15 Oct fresh pass

Builder: gpt-6.1-sol

Done means: the documented visual run works without AXE_CORE_PATH; the comparator rejects incomplete evidence; the refreshed CSS produces zero pixel and computed-style differences across both full phone journeys; and the full unit suite and build pass.

## Review inventory and before evidence

Read the PR body, both issue comments, all inline comments and all submitted reviews. The only review is the [13 Oct Codex verdict](https://github.com/lxtom123GH/golf-handicap-tracker/pull/20#issuecomment-6145933356), which contains two ACT ON P2 findings. No owner product/content ruling was present. Neither finding was fixed at incoming head `aabcead93c7edfcfdc61d8c0d96bc6f8669a8afa`.

These defects belong to the PR's new visual tooling: main at `a43d7e5533c92ad767b5b5f676abbbf2a701db87` contains no `tests/visual` files. Main's accessibility browser test already resolves its locked axe-core dependency directly. The PR's seven CSS aliases are absent from main, so this change is not superseded.

| Classification | Finding | Evidence before repair | Resolution |
|---|---|---|---|
| ACT ON, P2 | Undeclared axe prerequisite | Actual isolated phone census after base refresh: **1 failed**, `TypeError: The "path" argument must be of type string or an instance of Buffer or URL. Received undefined`, at `readFileSync(process.env.AXE_CORE_PATH, 'utf8')`. No screenshot captured. | `99f1a8e`: resolve main's locked axe-core 4.13.0; update fresh-checkout instructions. The same phone journey then passed (5.1 minutes) without the variable. |
| ACT ON, P2 | Comparator accepts incomplete evidence | New behavioural probes against the original comparator: **5 failed / 4 passed**. Empty, equally partial, missing-style, empty-style and unfinished journeys all incorrectly returned status 0. | `4b9f8c7`: fixed expected 100-screen coverage, per-profile completion markers, nonempty style arrays; clear each old profile before starting. All 11 probes pass, including alpha-channel, geometry and computed-style mutations. |

DISMISSED: none. Production CSS, application state, persistence, Auth policy and Firestore schema required no new changes.

## Integration and real artifact method

Merged `origin/main` at `a43d7e5` into the PR branch in `10b6d11`, without conflicts. This retains main's accessibility and on-course work. Expanding only the seven aliases still reproduces the refreshed base stylesheet byte-for-byte (LF-normalized working file versus git blob). The 96 uses remain 29 gaps, 23 radii and 44 font sizes. See [fresh source equivalence](task017-15oct-source-equivalence.json); the older source ledger is historical.

Both sides use the final harness at `4b9f8c7`, with the same application code and only `src/style.css` exchanged for the exact main git blob on the baseline side. Each run starts fresh auth/firestore emulators on private ports, captures both complete five-persona journeys, and must write both completion markers. `AXE_CORE_PATH` is empty. Browser external traffic remains blocked; all accounts, rounds, course labels and geometry are synthetic. No pixel masks or tolerance are used. The source stylesheet is restored in a `finally` block after the two runs.

Outside judges: Playwright's actual browser journeys and rendered captures; direct PNG RGBA comparison and computed-style arrays; the mutation probes; Vite and Vitest. Environment: Windows, Node 24.18.0, Java 27, locked Playwright Chromium 149.0.7827.55, 412×839 and 375×667 phone profiles, fallback fonts.

## Final results

| Command / artifact | Result |
|---|---|
| `npm ci` | Installed the locked dependencies successfully. |
| Initial `npm run test:unit` after base merge | `Test Files 146 passed (146)`; `Tests 1417 passed (1417)`. |
| Final `npm run test:unit` | `Test Files 147 passed (147)`; `Tests 1428 passed (1428)`; 82.33 seconds. |
| `node tests/visual/compare-selfcheck.mjs` | `Test Files 1 passed (1)`; `Tests 11 passed (11)`. The same probes also passed in the final full unit run. |
| `node scripts/run-e2e-isolated.mjs --config playwright.visual.config.js` with main CSS | `2 passed (10.4m)`; both completion markers and all 100 screenshot/style pairs present. |
| Same command with candidate CSS | `2 passed (10.6m)`; both completion markers and all 100 screenshot/style pairs present. |
| `node tests/visual/compare-results.mjs BEFORE AFTER OUTPUT.json` | `{"screenshots":100,"screenshotFailures":0,"computedStyleScreens":100,"computedStyleFailures":0}`. |
| Final `npm run build` | `106 modules transformed`; `built in 3.50s`. Existing mixed static/dynamic import and chunk-size warnings remain. |
| `git diff --check` | Passed. |

The [fresh ledger](task017-15oct-comparison.json) contains all 100 image hashes/dimensions/pixel counts and all 100 style-array comparisons. Every screenshot has zero changed RGBA pixels; all arrays match. Both image bytes and decoded pixels are identical. Finish-summary samples were inspected directly: [phone before](task017-15oct/phone-before-finish.png), [phone after](task017-15oct/phone-after-finish.png), [narrow before](task017-15oct/iphone-se-before-finish.png), [narrow after](task017-15oct/iphone-se-after-finish.png). The full paired raw captures remain in the local ignored scratch directories; the checked-in ledger and four samples are the published evidence.

## Limits

The normal E2E matrix, rules/auth/offline suites and GitHub CI are separate checks; this pass does not claim their results. No physical phone, WebKit/iOS rendering, downloaded-font or WCAG certification is claimed. Accessibility census violations are observations, not a claim of compliance. Fresh independent review must judge the pushed head; prior approvals do not carry forward.

| time (Brisbane, 15 Oct) | decision | why | evidence | result |
|---|---|---|---|---|
| 17:10 | Merge main | Refresh is pre-authorised; retain both branches' intent | `10b6d11` | Clean merge, source equivalence retained |
| 17:14 | Reuse locked axe | Main already pins the required library | `99f1a8e`, failed/passing browser runs | No environment prerequisite |
| 17:18 | Gate complete evidence | Matching partial captures cannot prove parity | `4b9f8c7`, negative probes | 11 behavioural checks pass |
| 17:39 | Regenerate integrated parity | Historical evidence predates main's accessibility work | Fresh ledger and both full paired runs | 100/100 pixels and style arrays identical |
