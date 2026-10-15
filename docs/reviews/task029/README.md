# Task 029 browser evidence

Captured 13 October 2026 using Chrome Headless Shell and local demo Auth/Firestore emulators in a credential-free sandbox. No live sites, real accounts or production data.

Two consecutive runs per viewport (412×839 and 375×667), zero retries: **4/4 passed, 58.1 seconds**. The final capture from each repeat is retained. All twelve images were visually inspected. `screenshots.json` provides SHA-256 checksums.

Each viewport directory contains:
- pending-first-nine: index unavailable; component 5.0 pending another nine
- three-completed-pairs: six nines produce three completed scores; index 8.0
- pending-seventh-nine: unmatched seventh stays pending; index remains 8.0
- mens-daily-handicap: explicit men's category gives 7 for this fixture
- womens-daily-handicap: explicit women's category gives 8 for this fixture
- manual-conversion-category: category choice in past-round form; tests assert 36 points converts to AGS 79/80 and unknown category stays blank

The browser tests read original round documents back unchanged before and after reload and after category changes; they also verify the derived profile index. Manual conversion uses a separate synthetic prior-day index-history fixture, because the existing backdating guard correctly refuses an index first established later on the played day.

Full-page captures retain the fixed navigation at its viewport-relative position; this is not a claim that all content is simultaneously visible on a phone. Existing navigation clipping/target-size issues and unsupported official-record wording are covered by independent accessibility/copy branches. Preserve task018 wording when integrating. No new full-app WCAG, real-device Safari, GPS or outdoor acceptance claim is made.

Reproduce with the isolated repository emulator runner and `playwright.ga.config.js`, two repeats and one worker. The test-only catalog must not be used for a production build.
