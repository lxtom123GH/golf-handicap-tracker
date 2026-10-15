# Australian method transition (task 029)

Public-main baseline: 0c5a0fcc. Owner confirmed on 13 October 2026 that current records belong only to the test user and correctness takes priority over legacy calculation compatibility. This authorises changing calculation behaviour in the review branch; it does not authorise live data access, migration commands, deployment or merging.

Original round documents remain unchanged. Pairing is an in-memory derived record, with both source ids retained. A lone nine is shown as pending and is not an eighteen-hole score. The index, chart and coach summaries must consume completed derived records; the individual score table labels nine-hole components without pretending each is a full differential. Re-loading, exclusion and deletion deterministically rebuild the derived view. Historical values are not recalculated; an ordinary future app calculation can append the newly computed result through the existing publisher. Its existing 50-entry retention remains unchanged. No historical trail is backfilled.

New and historical inputs use the same corrected method. Unknown handicap category must not be guessed from a name, tee colour or the current viewer. Own-player category is an explicit form choice. Other players require their explicit category or existing manual Daily Handicap override; absent inputs retain the gross-only fallback. No new demographic profile field is stored remotely.

Source: [GA January 2026 guide](https://static.golf.com.au/clubs/1000/uploads/resources/whs%20reference%20guide%20for%20australian%20administrators%20%281-1-2026%29.pdf), opened 13 October: §§3B,3H,5F(vii–viii). Published rounding examples are tested verbatim numerically. Other regression fixtures are synthetic applications of the cited rules, not misrepresented as published worked examples.

Other formula differences will be documented, not silently expanded into this change. Full Australian certification is not claimed. Fleet must reconcile overlapping UI files with task018 and other independent golf branches.

## Calculation checklist

Statuses concern this app, not certification. Source sections refer to the linked January guide.

| Area | Status | App evidence / remaining work |
|---|---|---|
| Daily Handicap, §3H | differs: fixed here | Explicit category, consistency factor, decimal final rounding; 9-hole index halving retained. Missing category stays unknown. |
| Gross differential and pairing, §§3B/5F | differs: fixed here | Played nine stays separate; two components form one completed score. Pairing window and both source ids are tested. |
| PCC, §§3B/4E | differs: left for a follow-up task | No PCC input/feed; existing score calculation assumes zero. |
| Best-score table / average, §§3C–D | matches | Existing lookup retained; now consumes completed scores, not individual nine-hole rows. |
| Rounding / maximum index, §3E | matches | Existing decimal rounding tests and 54 ceiling retained. |
| Caps, §3C | differs: left for a follow-up task | Existing gate is >=20; guide says more than20. Low-history window uses current time rather than latest round date. Historical indexes retain their former method; no backfill is performed. |
| Exceptional score reduction, §3F | differs: left for a follow-up task | Not implemented by this branch or the current engine. |
| Stableford / AGS / net-double-bogey, §3G | matches | Established-player zero-point conversion retained; missing inputs stay gross-only. New-index initial-score adjustment remains a follow-up, not a claimed match. |
| Initial handicap, §6A | differs: left for a follow-up task | Three completed scores now required; full initial allocation policy is not implemented. |
| Partial rounds, §5F | differs: left for a follow-up task | App accepts9/18; no8/10–17-hole processing added. |
| Multi-tee adjustments, §3I | differs: left for a follow-up task | Not a complete competition-adjustment engine. |
| Other competition allowances, §10A | differs: left for a follow-up task | No format-specific allowance expansion here. |
| Stroke allocation / plus handicaps, §§3H/10B–C/12 | matches | Existing stroke allocation contracts retained for supported complete9/18 cards. Not a certification of every competition configuration. |
| Countback, §11 | differs: left for a follow-up task | No full Australian countback implementation added. |
| Course/par/rating administration, §§13–15 | differs: left for a follow-up task | App consumes supplied ratings; it does not administer course ratings or temporary-course policy. |

## Engineering details

The listener supplies newest-played-date-first records. Pairing reverses that order, completing each oldest unmatched nine with the next eligible nine. A completed pair sits at its newer component's record position. Exclusions/deletions rebuild this derived sequence. This follows the app's existing date-ordered history; backdated processing-order policy deserves explicit fleet review rather than a hidden migration assumption.

Chart implementations in both `ui.js` and `whs.js` use the same completed series. The coach trend also uses completed pairs, without clipping away a partner at the old ten-raw-row query boundary. Coach display/stat samples remain bounded to ten rows/completed scores after deriving the full record. This needs a future paging/performance review for very long records; it is not a new access permission.

Other-player category choices live in a WeakMap keyed to the setup object. They are neither profile fields nor serialized score/backup fields. Own-player choices are form values. Unknown choices do not fall back to a guessed category. A known Men/Women tee-label mismatch also refuses automatic calculation; custom/unlabelled ratings remain explicit user-supplied inputs. Existing explicit Daily Handicap overrides still take precedence, including zero.

The old expected-nine export is retained as a null-returning compatibility stub so external old imports fail closed; it is not used by the calculation. No formula estimates the unplayed nine.

## Test provenance

- `ga-rounding.test.js` retains the published positive/plus rounding examples from §§3B/3E, with synthetic neutral-slope adapters clearly labelled.
- `ga-method.test.js` initially failed all6 cases on main, then passed all6 after correction. These pairing/category cases are independently calculated rule-derived synthetic fixtures. The guide does not supply a full numerical pair-card example for every edge case; no invented example is described as published.
- `ga-pairing.test.js` covers odd/even records, exclusion, invalid values, independent component inputs, pre-pair rounding,19/20-score expiry boundaries, deletion, chronology and immutable originals.
- Category tests cover missing/explicit choices, no serialization, per-player separation and stale async preview responses.
- Two actual chart renderers and the history table are checked against the same pair record. Old expected-score and one-row-per-nine assertions are replaced with Australian expectations, not skipped.
- Real demo-emulator browser journeys test initial pending, three pairs, pending seventh, reload, current-profile publication, explicit category calculations and raw-document immutability. Only synthetic users/courses/rounds; no paid calls or production services.

## Review limits

No complete Australian-conformance claim: the checklist deliberately leaves other calculation differences outside this PR. Original score documents are untouched by the new code; ordinary app publication can update the current estimated index and append a new historical snapshot after integration. Existing history entries are not retrospectively recalculated. This is the owner's test-data correctness decision, not a production migration operation.

The pending018 copy branch removes unsupported official-record claims; its UI wording must be preserved when integrating this independent branch. Other accessibility/token branches also touch shared files. No deployment, merge or live-data operation occurred.

## Final verification, 13 October 2026

- Frozen full suite: **141 files, 1,365 tests passed, 154.66 s**, zero unhandled errors.
- Browser: **4/4 passed, 58.1 s**, two consecutive runs at each of 412×839 and 375×667, no retries; twelve inspected synthetic screenshots in `docs/reviews/task029/`.
- Test-first core: six failures on unchanged main, then six passes after correction.
- Earlier full runs exposed old expected-nine/category fixtures and an incomplete round-start test mock. The latter produced four unhandled deferred-shot UI errors despite green assertions; the final run isolates that unrelated UI dependency and has no unhandled errors. No failed run is represented as passing.
- Initial expanded browser fixture incorrectly assumed an index established later on a day could be used for that day's past-round conversion. The existing safety guard was retained; the corrected test supplies a separate prior-day history fixture.
- `git diff --check` and standard credential-pattern checks passed. These are targeted scans, not a guarantee that every security concern is eliminated.

No full-app accessibility or outdoor certification is claimed. Full-page screenshots show the existing fixed navigation at its viewport-relative location, and existing copy/accessibility debt remains assigned to the independent task018/013 branches.
