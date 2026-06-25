# BL-4.02 — On-Course setup rewiring (offload brief)

> Working artifact. **Implementer:** Google Antigravity 2.0 driving Gemini 3.5 Flash
> (encode the Sydney Protocol as an Antigravity skill/instruction file).
> **Independent check:** Claude (cross-family — do NOT check Gemini with Gemini).
> Produced by Opus 2026-06-25. Safe to delete after ship.
>
> Covers backlog **N2, F11/F1-root residue**. Touches the BL-4.01 WHS contract
> (`resolveRoundRatings` single-source resolver) — the Claude check has a dedicated
> WHS-integrity gate. Decompose into ~4-5 commits (≤150 lines each per Sydney
> Protocol): (1) index.html par input, (2) tee/course rating render + resolver
> repoint, (3) custom-course flow, (4) N2 alert gate, (5) DH override.

## The root cause (verified at HEAD)
`UI.ocCourseInfoLine` / `UI.ocDailyHandicapLine` (ui.js:98-99) map to element ids
`oc-course-info-line` / `oc-daily-handicap-line` that **do not exist in index.html**
→ both are `null`. So the entire dynamic setup injection in
event-binders.js:308-335 (course stats, `oc-manual-*` CR/SR/par inputs, DH) writes
into nothing (guarded by `if (UI.ocCourseInfoLine)`, so it silently no-ops).
Consequences at HEAD:
- No Par/CR/SR ever displayed after picking a course+tee.
- No Daily Handicap ever displayed.
- For an unratable tee, the `oc-manual-*` inputs are never created, so
  `resolveRoundRatings` (oncourse.js:1038-1040) reads `null` → the round is always
  `notCounting`.
- The well-styled STATIC panel that index.html already ships —
  `#oc-course-stats` (`#oc-stat-par`/`#oc-stat-cr`/`#oc-stat-sr`) and
  `#oc-dh-display` (`#oc-dh-value`/`#oc-dh-override`) — is orphaned: never shown,
  never populated, never read.

**Decision (backlog-mandated):** consolidate on the STATIC panel ("populate
`oc-stat-*`/`oc-dh-*`"). Delete the dead dynamic injection + the two null UI refs,
populate the static panel, and repoint `resolveRoundRatings` to read `#oc-stat-*`.

**Decision (user, 2026-06-25):** "Custom Course" = manual entry that COUNTS only if
the entered CR/SR/par are WHS-plausible (else `notCounting`) — reuse the existing
unratable-tee resolver path. Per-hole par/SI for custom courses fall back to the
existing `|| 4` / `|| (holeIdx+1)` defaults in the save loop (oncourse.js:1089-1090)
— accepted approximation, do NOT build per-hole entry.

---

## ① Implementation prompt (for Antigravity 2.0 / Gemini 3.5 Flash)

```
TASK: Rewire the on-course "Start New Round" setup in the Golf Handicap Tracker
(vanilla JS / Vite / Firebase). The setup currently injects course stats / manual
CR-SR-par inputs / daily-handicap into two container ids that DO NOT EXIST
(oc-course-info-line, oc-daily-handicap-line), so nothing renders and unratable/
custom rounds can never count. Move everything onto the static panel index.html
already ships, repoint the resolver, wire the custom-course flow, and fix a dead
alert gate. Branch fix/bl-4.02-oncourse-setup. Do NOT merge.

THIS TOUCHES THE BL-4.01 WHS CONTRACT. The single-source resolver
`resolveRoundRatings` must stay the ONLY place rating/slope/par/counting is decided,
read identically by start (bindStartRound) and save (saveRoundToDatabase). You may
ONLY change which element ids its manual branch reads — NOT its validation, its
ratable branch, or the counting logic.

FIX 1 — index.html: make the static Par a manual-capable input.
  Line ~379, change the Par display from a <div> to a number input matching the
  CR/SR inputs beside it:
    <input type="number" id="oc-stat-par"
      style="font-size:1.4rem; font-weight:800; color:#1e3c72; border:none; background:transparent; text-align:center; width:100%; padding:0;">
  (CR `#oc-stat-cr` and SR `#oc-stat-sr` are already inputs; leave them.)

FIX 2 — src/modules/event-binders.js: replace the dead injection with static-panel
  population, and repoint the resolver.
  (a) In the tee-select 'change' handler (~lines 298-341): DELETE the
      UI.ocCourseInfoLine and UI.ocDailyHandicapLine innerHTML blocks entirely.
      Replace with a call to a new helper renderSetupRatings(courseName, teeName)
      (define it in this file). It must:
        - teeData = COURSE_DATA[courseName]?.[teeName] || {};
          ratable = isRatableTee(teeData); (import from course-data.js)
        - Show the stats panel: document.getElementById('oc-course-stats')
          .classList.remove('hidden').
        - Populate inputs:
            #oc-stat-par.value = teeData.par ?? '';
            #oc-stat-cr.value  = teeData.rating ?? '';
            #oc-stat-sr.value  = teeData.slope ?? '';
        - Trust signal: if ratable, set all three inputs readOnly = true (the
          resolver sources ratable values from teeData regardless, so editing them
          must NOT change the counted round — readOnly makes that honest). If NOT
          ratable (manual needed), set readOnly = false so the user can enter CR/SR/
          par.
        - AppState.currentCoursePars = teeData.pars || [];
        - Daily handicap: show #oc-dh-display (remove 'hidden'); compute and render
          via a new updateDhPreview() (below).
      Bind 'input' listeners on #oc-stat-cr / #oc-stat-sr / #oc-stat-par ONCE (or
      use .oninput assignment, idempotent) so editing manual values re-runs
      updateDhPreview().
  (b) updateDhPreview(): read the CURRENT signed-in player's HI
      (m.getPlayerHandicap), resolve rating/slope/par via
      resolveRoundRatings(courseName, teeName) so the preview uses the SAME source
      as start/save, compute dh = Math.round(hi*((slope||113)/113)+((rating||72)-par))
      when par>0 else 0, set #oc-dh-value.textContent = dh and #oc-dh-override.value
      = dh. Keep the existing updateModeVisibility() call.
  (c) src/oncourse.js resolveRoundRatings (~1038-1040): change the THREE manual
      reads from getElementById('oc-manual-cr'|'oc-manual-sr'|'oc-manual-par') to
      'oc-stat-cr'|'oc-stat-sr'|'oc-stat-par'. Update the JSDoc (~1026) to say
      #oc-stat-*. Do NOT touch the isRatableTee branch, isPlausibleRating, or the
      counting return. ALSO repoint the lone read at oncourse.js:1588
      ('oc-manual-par' → 'oc-stat-par') for the review screen.
  (d) src/ui.js: remove the now-dead refs ocCourseInfoLine / ocDailyHandicapLine
      (lines 98-99) — they are referenced nowhere else (grep to confirm).

FIX 3 — Custom-course flow. src/modules/event-binders.js bindCourseSelect 'change'
  handler (~278-295):
    - When UI.ocCourseSelect.value === 'Custom Course':
        * Show #oc-custom-course-group (remove 'hidden').
        * The displayed course name = the #oc-custom-course-name input; set
          AppState.currentRoundCourseName from it, and add an 'input' listener that
          keeps currentRoundCourseName in sync as the user types.
        * There is no COURSE_DATA entry, so skip tee population; set
          #oc-tee-select to a single placeholder (e.g. one disabled "Custom" option)
          so the existing teeName reads don't crash.
        * Call renderSetupRatings('Custom Course', '') — teeData = {} → not ratable
          → editable blank #oc-stat-* inputs + DH preview. The user enters CR/SR/par;
          resolveRoundRatings validates them and sets counting/notCounting via the
          existing path.
    - For any non-custom course: hide #oc-custom-course-group (add 'hidden') and run
      the existing tee-population path.

FIX 4 — N2 dead alert gate. src/modules/event-binders.js:361. The invalid-par alert
  is gated on document.getElementById('tab-oncourse').classList.contains('active') —
  but tab visibility is state-driven via body[data-active-tab] (switchTab sets
  AppState.activeTab → the listener sets document.body.dataset.activeTab; nothing
  ever adds an 'active' CLASS to #tab-oncourse). So the alert never fires. Replace
  the condition with:
      document.body.dataset.activeTab === 'tab-oncourse'
  so the "Please specify a valid total Par for this course." alert actually shows
  when the user is on the on-course tab.

FIX 5 — DH override honoured at start. src/modules/event-binders.js bindStartRound
  per-player loop (~386-390): after computing p.dailyHandicap, for the CURRENT user
  only (p.uid === AppState.currentUser.uid) read #oc-dh-override; if its value is a
  finite number, use it as p.dailyHandicap (restores the manual DH override). Other
  players keep the computed value.

HARD CONSTRAINTS (Sydney Protocol — do not violate):
  - Show/hide #oc-course-stats, #oc-dh-display, #oc-custom-course-group via the
    `hidden` CLASS only. NO `.style.display`. No `!important`. Do NOT touch
    body[data-active-tab] semantics (FIX 4 only READS it).
  - resolveRoundRatings stays the single source of rating/slope/par/counting; only
    its manual-branch element ids change. The ratable (teeData) branch, validation
    predicates, and counting logic are untouched. Start and save must continue to
    call it and agree.
  - Firebase stays pinned to australia-southeast1; add no getFunctions/region calls.
  - Do NOT regress the F1/F2/F4 BL-4.01 behaviour: a ratable tee counts from teeData;
    an unratable/custom round counts only when CR/SR/par are WHS-plausible, else
    notCounting:true; par + notCounting persist on the saved doc.
  - readOnly is the correct trust signal for ratable inputs (NOT disabled — disabled
    inputs are skipped by some form reads; readOnly keeps them readable).

ACCEPTANCE:
  - `npm run build` clean; `npm run test:unit` baseline unchanged (mapped contract
    tests stay red, rest green, whs 10/10).
  - grep: no remaining reference to oc-course-info-line / oc-daily-handicap-line /
    oc-manual- anywhere in src/ (all repointed to oc-stat-*).
  - Manual flow (emulator): pick a ratable course+tee → Par/CR/SR show (readOnly) and
    DH shows; start → round counts. Pick an unratable tee → CR/SR/par editable; enter
    valid values → counts; leave blank → saves notCounting:true.
  - Custom Course: name input appears, CR/SR/par editable; valid → counts, invalid →
    notCounting. (Per-hole stableford uses the existing par-4 / sequential-SI
    fallback — expected.)
  - N2: on the on-course tab, starting with an invalid/zero par now shows the alert
    (previously silent).
  - DH override: editing #oc-dh-override before Start changes the current user's
    dailyHandicap for the round.
  - PR description maps FIX 1-5 to N2 / F1-root / custom-course, lists files, and
    confirms the WHS contract (resolver single-source) is intact.
```

## ② Independent check prompt (for Claude — cross-family, NOT Gemini)

```
You are reviewing an on-course setup rewiring in a vanilla-JS/Firebase golf app that
TOUCHES THE WHS HANDICAP CONTRACT. I will paste the diff (or files: index.html,
src/modules/event-binders.js, src/oncourse.js, src/ui.js). Answer PASS/FAIL per item
with file:line evidence. Be skeptical — a WHS regression here corrupts handicaps.

1. WHS CONTRACT (the critical gate). Confirm resolveRoundRatings is still the SOLE
   decider of rating/slope/par/counting, and that ONLY its manual-branch element ids
   changed (oc-manual-* → oc-stat-*). FAIL if: the isRatableTee(teeData) branch was
   altered; validation (isPlausibleRating) changed; counting logic changed; or start
   (bindStartRound) and save (saveRoundToDatabase) no longer both call it / could
   disagree. Confirm a ratable tee still sources from teeData (NOT from the editable
   inputs), so editing a readOnly CR cannot change the counted round.

2. DEAD CODE REMOVED. Confirm the injection into oc-course-info-line /
   oc-daily-handicap-line is gone and the null UI refs (ui.js) removed. grep-confirm
   no oc-course-info-line / oc-daily-handicap-line / oc-manual- remain in src/.

3. STATIC PANEL POPULATION. Confirm #oc-course-stats and #oc-dh-display are shown via
   the `hidden` class (NOT .style.display) and populated; #oc-stat-par is now an
   input; ratable → inputs readOnly, unratable/custom → editable; currentCoursePars
   set from teeData.pars.

4. CUSTOM COURSE. Confirm picking 'Custom Course' reveals #oc-custom-course-group,
   syncs currentRoundCourseName from the name input, doesn't crash on the empty tee
   (placeholder set), renders editable blank CR/SR/par, and routes through
   resolveRoundRatings so valid→counts / invalid→notCounting. Confirm it relies on
   the existing per-hole par-4/SI fallback and didn't add a divergent par path.

5. N2 ALERT GATE. Confirm the gate is now `document.body.dataset.activeTab ===
   'tab-oncourse'` (not the never-set `.active` class), so the invalid-par alert
   fires. Confirm no new write to body[data-active-tab].

6. DH OVERRIDE. Confirm #oc-dh-override is read at start for the current user only,
   applied only when finite, and other players keep the computed DH.

7. SYDNEY / REGION. No `.style.display`, no `!important`; no getFunctions/region call
   added; region stays australia-southeast1. Setup-panel reveals use `hidden` class.

Output: items 1-7 table with PASS/FAIL + evidence, a dedicated "WHS REGRESSION RISK"
line (NONE / FOUND: …), then a one-line verdict: SHIP / FIX-FIRST.
```
