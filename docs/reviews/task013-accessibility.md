# Task 013: golf accessibility audit and focused fixes

Date: 13 October 2026 (Brisbane). Public repository only. Base: `0c5a0fcc1dd4f8ee3ba36199fe2e3ff73685c6c7`. Candidate: `dot/golf-accessibility`.

## Verdict

The remaining low-contrast secondary content, mobile Feed grid overflow and local registration hit obstruction have focused fixes. This is **not a whole-application WCAG AA certificate**. Main still needs the separately reviewed viewport/header fixes in PR #1, the admin input labels in task099 and scoring-target work in task100. Do not interpret a scoped zero-violation result as a clean whole-app scan.

No admission, sharing, Firestore rules, handicap calculation, save handler, AI feature or production setting is changed here. The emulator warning remains visible and legible. It no longer captures taps, and the authentication card can scroll clear of it.

## Reproduction and coverage

- Own cloud Chrome Headless Shell 155, demo Auth/Firestore emulators, synthetic accounts and rounds only. Fresh credential-free checkout; no signed-in browser, GitHub credential or cloud key mounted. External browser traffic remains blocked by the existing dead proxy/resolver harness.
- Phone 412 × 839 and iPhone-SE-sized Chromium 375 × 667. These are Chromium layout profiles, **not a real iPhone/WebKit or VoiceOver test**.
- All five task012 personas: regular player with 26 mixed rounds, zero-round newcomer, verified pending account, linked coach and admin. Primary tabs, history actions, past-round form, real admin approval, first nine-hole score entry, finish modal and saved-round readback are exercised by the repeated task012 walkthrough.
- Automated broad scan: axe-core 4.13.0, WCAG 2.0/2.1 A/AA tags. Incomplete checks are retained. The original task012 baseline used 4.10.3, so raw totals across those versions are not used as a causal comparison.
- Dedicated regression spec: `tests/e2e/accessibility-reflow.spec.js`. It checks real pointer hit testing, 200% authentication and Feed text, actual keyboard Tab from search input to Search, empty/error states, role-tab text, and enhanced contrast on Finish/Back/Confirm & Save controls.
- Text-size probe doubles each visible element's computed font size, including pixel-sized labels, then restores its original inline size. This is a text-resize simulation, not a claim to have tested the browser's zoom setting or a physical soft keyboard. Raw leaf overflow is diagnostic: scrollable data tables, clipped status labels and offscreen descendants need contextual inspection.

## Findings and ownership

| Finding | Reproduce / evidence | Resolution |
|---|---|---|
| Major: pale secondary text | Open Practice videos, Insights strategy, Feed empty/error state or admin quota. `#94a3b8` on white is about 2.56:1. | Shared readable muted token `#475569` (7.58:1 on white); dynamic templates use it too. |
| Major: role labels | Coach/admin bottom navigation had about 3.58:1 and 3.48:1 contrast on their coloured backgrounds. | Coach `#24468f` on `#d1d8e0` ≈6.22:1; admin `#8a3500` on `#ffeaa7` ≈6.79:1. |
| Major: pale gradient headers | Coach, Admin and Feed use image-like gradients that axe marks incomplete. | Darkened both colour stops and made their subtitle text opaque white. New tests bound the brightest possible RGB combination to at least 4.5:1 against white; this supplements, not erases, axe incompletes. |
| Major: enlarged navigation labels truncated | Doubled font sizes caused almost every destination label to ellipsize. | Keep the existing one-row horizontal scroller, disable flex shrink, retain natural label widths. Actual 200% label-width assertions pass on phone, SE and desktop. |
| Major: excluded scores fade away | A non-counting WHS row faded all descendants with opacity 0.5; another non-counting style used 0.6. | Remove opacity, retain strikethrough and explicit exclusion tag. No eligibility/math change. |
| Major: green/red actions below contrast target | Import, Confirm & Save and Finish/Back colours were too faint. | Readable success `#166534` (7.13:1 with white); danger `#991b1b` (8.31:1 on white, 7.01:1 on `#e9ecef`). Solid Finish/Back/Save controls also get the axe enhanced-contrast check. |
| Major: Feed cards off the right edge | Open Feed on a narrow phone: a span-two child creates an implicit extra grid track. | Every Feed card spans the real mobile track; min-width zero for cards/search and wrapping for long text. Tested at normal and doubled text. |
| Minor: local warning steals registration taps | At 375 × 667, Back to Login's centre hit target was the Firebase emulator warning. | Warning stays visible, never intercepts a pointer; auth scroll/padding and bounded card width keep the link reachable, including doubled text. Local emulator defect, not a production warning claim. |
| Major: zoom disabled / header and setup-hint contrast | Whole-app scan still finds `meta-viewport`, `#header-version`, `#btn-mode-detailed`, `#oc-past-round-note`. | Existing public PR #1 owns these. Not duplicated here. |
| Major: admin checkboxes lack names | Two Admin states per device; ten checkboxes on phone and twenty on SE because synthetic users persist across project runs. | task099 candidate owns labels, quota header and mobile admin layout. |
| Major: scoring chips too small and Next contrast | Existing scoring baseline from task100 plus remaining Next control in broad scan. | task100 candidate owns these. Preserve its independent functional tests. |
| Unverified: whole-course AAA in sunlight | Images/translucent gradients and all course map combinations cannot be established by a scoped solid-colour test. | Outdoor physical-device check required; do not describe this as complete AAA conformance. |
| Unverified: assistive-technology experience | Accessible-name automation does not establish spoken order, modal announcement or focus restoration in VoiceOver/TalkBack. | Fleet/manual checklist below. |

The Feed permission-error contract and pending-approval refresh discovered in task012 remain functional follow-ups. Improving their colour does not fix the underlying state/query. Any change to who can read or use an app remains **needs Alex**.

## Evidence

Screenshots contain fictional data only. Paired normal-size screenshots are under `task013/`, with `phone-` and `iphone-se-` prefixes:

- `before-registration.png` / `after-registration.png`: original warning obstruction versus scrollable safe space.
- `before-tab-feed.png` / `after-tab-feed.png`: implicit-grid overflow versus stacked cards.
- `before-tab-practice.png` / `after-tab-practice.png`: secondary text contrast.
- `before-feed-text-200.png` / `after-feed-text-200.png`: enlarged Feed content.
- `after-registration-text-200.png`: enlarged registration remains operable.
- `after-finish-contrast.png`: final solid-colour summary actions.

`*-before-axe.json` / `*-after-axe.json` retain targets and incomplete counts, not private account data or raw browser traces. Full census and text-resize diagnostics are saved separately alongside this report.

## Fleet acceptance checklist

1. Review this branch against current public main; consolidate the one axe-core dev dependency with PR #1 by package identity. This branch pins 4.13.0 and does not rely on PR #1 being merged.
2. Integrate/retest PR #1, task099 and task100 alongside this candidate. Confirm whole-app label/viewport/contrast findings are resolved rather than merely excluded from a scoped check.
3. Physical iPhone: text size/zoom, open and dismiss keyboard, register/back, rotate, score, Next/Previous, Finish/Back and saved-round confirmation. Keep all test data synthetic.
4. VoiceOver/TalkBack: form labels/errors, pending status, role tabs, score plus/minus/FWY/GIR/putts, modal focus trap/return, and saved-status announcement.
5. Bright sunlight: inspect score text and map chips on both light/dark imagery, including GPS warning and missing-map states. An automated image-background incomplete is not a pass.
6. Do not fix the Feed read failure by relaxing access rules. Reproduce query/rule agreement separately under the approved privacy model.

## Test record

Frozen application checkpoint: `e810367`. All 76 application files in the separate census checkout were verified byte-identical to the candidate. No application changes after this freeze.

- Final unit run: **138 files / 1,338 tests passed**, 154.38 s (`golf-013-frozen-unit.log`). Includes six new colour/gradient/excluded-row guards.
- Final focused browser run: **6/6 passed**, 52.5 s, phone/SE/desktop (`golf-013-release-focused.log`). Zero scoped AA violations in the checked content states; zero enhanced-contrast violations or incompletes on Finish/Back/Save. Image/gradient incompletes elsewhere are retained in JSON.
- Same-version axe 4.13.0 baseline: **4/4 phone/SE cases failed** on original application source (`golf-013-baseline-axe413.log`), covering the warning/200% auth failures and contrast/reflow failures. The later navigation assertion is additionally backed by the broad before/after text-size census.
- Final five-persona census: **2/2 complete journeys passed**, 3.1 min (`golf-013-frozen-census.log`), **49 axe states per device / 98 total**, each also probed at doubled visible font sizes. The normal-size screenshots are captured before temporary text-size mutation. Neither viewport develops document-wide horizontal overflow; this alone does not prove every descendant is readable.
- Remaining complete-app automated targets are exactly: viewport zoom restriction; header version; detailed-mode hint; past-round note; admin checkbox names; Next button contrast. Their ownership is mapped above. All 98 broad states still contain the inherited viewport violation, so the app as a whole does **not** pass this audit yet.
- The final 200% probe leaves two clipped-leaf diagnostics in three round states per device: `oc-exit-course-label` and `btn-oc-more`. Inspect those in task014's on-course work; the course label may intentionally ellipsize and the dots button requires a contextual check. This is explicitly **not** a claim of complete 200% conformance.
- Build succeeded as part of every accepted Playwright run, retaining existing Vite chunk-size/static-dynamic import warnings. No live-site, paid-AI, real-account, remote CI, physical-device or assistive-technology acceptance is claimed. Failed setup/test-development attempts are not reported as application regressions: the first local census extraction retained an archive root folder; the next used an incorrect axe file path; a draft regression used a nonexistent strategy tab; the draft doubled-text selector matched both visible and hidden auth cards. Those were corrected before final runs.
