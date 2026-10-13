# Task 017: exact-value CSS token consolidation

Independent baseline: public main `0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`. This branch does not include pending accessibility, tap-target, offline or admin-layout fixes.

## Scope

Seven new root aliases replace 96 exact literal declarations in `src/style.css`:

| Token | Value | Property uses |
|---|---|---|
| `--space-8` | 8px | gap |
| `--space-10` | 10px | gap |
| `--radius-8` | 8px | border-radius |
| `--radius-12` | 12px | border-radius |
| `--text-085` | 0.85rem | font-size |
| `--text-090` | 0.9rem | font-size |
| `--text-100` | 1rem | font-size |

The names describe exact existing values, rather than assigning a new semantic role to unrelated controls. There are 29 gap, 23 radius and 44 font-size substitutions. No selector, rule order, colour, dimension, `!important`, inline style, app JavaScript, access rule or product behaviour is changed. `tests/unit/jargon-hints.test.js` now asserts the variable reference and its unchanged literal definition instead of requiring an inline literal.

## Source equivalence

Expanding only the seven new variables and removing their definition block reproduces the original CSS byte for byte. Original and expanded SHA-256:

`9e4b059845bbe98ed2f0271ad71e525d24d683de2f4555e6552e991b628ac4e5`

Candidate CSS SHA-256:

`fd2beb04afc5faf4df7023dfb41b6e9ef21ec9cf341aa51cf0592ebfbb5cf19e`

No pre-existing app HTML/JS/CSS uses these names. See [the replacement ledger](../token-replacements.json) and [source equivalence record](../token-source-equivalence.json). The record is evidence for this patch, not a rule that all future stylesheet edits must retain the old hash.

## Visual method

`playwright.visual.config.js` runs the existing guarded demo-only launcher with a test-only Vite configuration. Two Chromium phone profiles, 412×839 and 375×667, visit five synthetic persona roles and every visible top-level tab, plus the recorded authentication, history and nine-hole states. The second profile's admin may see the preceding profile's synthetic records; fixed IDs make their order reproducible in both builds.

Course labels and mapped geometry are invented. The fixture build overwrites the four map JSON assets and replaces the settings selectors; the normal production configuration remains unchanged. Every capture rejects real-club names, brings its page to the foreground, starts at scroll origin and waits for fonts/settled rendering. Populated visible handicap charts must contain plotted blue pixels and return an identical canvas image on consecutive samples before capture; this reads the actual canvas without masking, replacing or redrawing it. Screenshots have no masks, zero pixel tolerance and no UI restyling; screenshot animation suppression is identical on both sides. The local emulator warning remains visible where the SDK shows it.

The account bootstrap uses fixed demo-only Auth IDs, not real accounts. It intercepts fixture signup to create the deterministic emulator account and return its emulator sign-in response; verification and admission UI still run. This is a visual fixture, not a signup-backend conformance claim. Historic rounds are 26 eighteen-hole cards seeded while the page is unloaded; the journey separately records a nine-hole round. Publishing a complete fixture history is awaited before reloading.

## Iterations retained honestly

- The initial unit run found one literal-font assertion; it was updated without weakening the required 0.9rem value.
- The first browser prototype used an inexact Return-to-Home button name; it now uses the existing `btn-post-home` selector.
- A first settings capture showed public real-course labels/geometry. Those captures were not published; the fixture was expanded to cover the mapper/plan controls and map assets.
- The first paired census passed its journeys but failed the actual comparison: 13 pixel cases and three computed-style cases. Incremental live history seeding changed the displayed handicap/history explanation, while random emulator IDs changed admin row order. The fixture was made deterministic and the paired run repeated. No failed comparison is counted as a zero-difference result.

- The next pair matched all 100 computed-style arrays and 99/100 screenshots. The remaining screenshot had a blank baseline chart versus a drawn candidate chart, with identical geometry/styles. A canvas-render completion check was added to both fixtures and the entire paired census repeated; the mismatch was not waived.

## Checks

- Exact-value and fixture safety checks, including local-only identity guards.
- Full unit suite: 140 files / 1,350 tests passed on the final application stylesheet and frozen fixture code.
- PNG comparison self-checks: equality, a one-channel pixel change, changed geometry and changed computed style all behave as expected. RGBA channels are compared directly; there is no perceptual threshold or alpha-only shortcut.
- Final paired census: baseline two journeys passed in 5.4 minutes; candidate two journeys passed in 5.2 minutes. All 100 screenshots are pixel-identical (zero differing RGBA pixels, zero masks, zero tolerance), and all 100 complete computed-style arrays match. See [the exact comparison ledger](task017-visual-comparison.json).
- Full guide suite: 139 files / 1,343 tests passed (180.90 seconds). Candidate: 140 files / 1,350 tests passed (181.12 seconds), on the final chart-readiness fixture.
- All 12 selected guide screenshots were visually inspected and remained byte-identical after the final readiness retest. The one earlier chart-readiness mismatch is recorded above, not hidden or counted as a pass.

## Reproduction

1. In a fresh credential-free checkout, install the locked dependencies and configure the pinned Chrome Headless Shell 155.0.8059.39. Keep all demo/loopback/deny-external guards.
2. Run the same visual fixture harness once with the baseline stylesheet and once with this stylesheet through `node scripts/run-e2e-isolated.mjs --config playwright.visual.config.js`. Keep the two `style-evidence` directories separately. No production account, real user data or preview is required.
3. Run `node tests/visual/compare-selfcheck.mjs`, then `node tests/visual/compare-results.mjs BEFORE AFTER comparison.json`. The latter fails if screenshot sets, pixel content, dimensions or any recorded computed-style arrays differ.
4. Run the unit suite. Review the full comparison ledger rather than a selected screenshot or percentage alone.

## Limits and integration

This is not Safari/iOS, a physical-device assessment, downloaded web-font validation, every possible modal/data permutation or a WCAG pass. Real external fonts are denied by the isolated browser, so both sides use the same available fallback. The existing app's layout/contrast/target-size debt is intentionally preserved here. Rebase and rerun the same proof after independent accessibility/layout branches land.

The guide and this consolidation are independent branches from the same current main. Their shared visual fixture files are byte-identical, so the fleet can retain one copy when integrating. No merge or deployment was performed.
