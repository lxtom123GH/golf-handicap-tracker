# BL-DD Tranche 2 — decided cuts + xlsx→CSV (offload brief)

> **Implementer:** Antigravity 2.0 / Gemini. **Independent check:** Claude (cross-family).
> Produced by Opus 2026-06-26 from the verified backlog (`MASTER_BACKLOG.md`) — all line
> numbers read at HEAD (`origin/main` @ `bfeba85`).
> Follow `HANDOFF-antigravity-bl-4.x.md` + `LESSONS.md` (read LESSONS **first**; paste the grep
> gates + the four-field Brief-feedback block into the PR). Branch `fix/bl-dd-tranche-2`.
> PR to main, **DO NOT MERGE**.
>
> Four independent, source-verified changes — all **deletions / honest-UI fixes**, no new
> features and no new deps. Each is its own commit. These execute decisions already recorded in
> MASTER_BACKLOG (BL-4.16 / BL-4.10 / BL-4.11+BL-DD-11 / BL-DD-02), so the *what* is settled;
> this brief pins the *exact* edits.

## Why these four are safe to cut (verified at HEAD)
- **BL-4.16** — surveyor pin "persistence" is broken end-to-end: `saveSurveyToFirestore`
  (`surveyor.js:230-238`) does `updateDoc(courses/{id}/holes/{n}, {surveyData})` but there is
  **no `courses` Firestore rule** (denied) and `updateDoc` fails if the doc doesn't exist; the
  `catch` swallows the error and `capturePin` **always** shows `"Pin saved successfully!"`
  (`surveyor.js:207-211`) regardless. **Nothing reads the persisted data back** — the only
  reader of `surveyData` is `oncourse.js:623/632/634`, which reads it **from in-memory AppState
  in the same session** (GPS green-centre bar). So the honest fix is: keep the in-session
  capture, drop the fake persistence, and tell the truth in the toast. `surveyData` is **not**
  in `PERSIST_FIELDS` (`persistence.js:11`), so removing the Firestore write changes nothing
  that survives a refresh today.
- **BL-4.10** — the Notification Preferences panel writes prefs to Firestore but the only
  emitter, `triggerLocalNotif` (`notifications.js:113`), is **never called anywhere in `src/`**
  (grep-verified). The panel is a broken promise: toggles that gate nothing. Decision: remove
  the panel now (honest UI); build notifications deliberately later. The most useful notif
  (drill-assign) depends on BL-3.06 first.
- **BL-4.11 + BL-DD-11** — `src/modules/telemetry.js` is **double-dead**: its listener only
  acts on a `gpsLocation` `stateChange` that is **never dispatched** (grep: the only
  `gpsLocation` occurrence is the guard itself), and it gates on the legacy `.tab-content.active`
  class (`telemetry.js:19`) — the last D-01 `.active` remnant. Its other exports
  (`inferApproachDistance`, `recordTeeBoxLocation`, `currentHoleTelemetry`) are used **nowhere**
  outside the module. Deleting the module resolves both BL-4.11 (telemetry remnant) and
  BL-DD-11. `currentHoleTelemetry` is **not** in `PERSIST_FIELDS`.
- **BL-DD-02** — `xlsx@0.18.5` (proto-pollution/ReDoS, no fix) is bundled to the browser via
  `admin.js:9`. The CSV import path already exists and is independent. Drop the Excel block →
  CSV-only. **⚠️ Capability note:** the Excel block is *multi-user* (one sheet per user email);
  the CSV path is *single-user*. Removing it drops admin multi-user bulk import — accepted per
  the recorded decision (CVE out of the browser > convenience). Do **not** try to make CSV
  multi-user in this brief; that's a separate (server-side) feature if wanted.

---

## ① Implementation prompt (Antigravity 2.0 / Gemini)

```
TASK: Four decided cuts (BL-4.16, BL-4.10, BL-4.11/BL-DD-11, BL-DD-02). Branch
fix/bl-dd-tranche-2. PR to main, DO NOT MERGE. Read docs/agent-briefs/LESSONS.md first.
Each fix = its own commit. No new features, no new deps. Removals only (plus one honest toast).

FIX 1 — BL-4.16 (src/surveyor.js): make the surveyor honest; drop the fake persistence.
  (a) In capturePin(), DELETE the Firestore-persist call (currently ~line 199):
        await saveSurveyToFirestore(AppState.currentRoundCourseName, AppState.currentHole, AppState.surveyData[AppState.currentHole]);
  (b) DELETE the now-unused saveSurveyToFirestore function entirely (~lines 230-238).
  (c) Fix the lying toast (~lines 207-211): change BOTH the showToast and the alert fallback
      text from "Pin saved successfully!" to an honest, this-round-only message, e.g.:
        "Pin set for this round."
      (Keep the showToast-or-alert fallback structure; only the string changes.)
  (d) Remove any now-unused imports left dangling by deleting saveSurveyToFirestore — check the
      top of surveyor.js: if `doc`/`updateDoc`/`db` are no longer referenced anywhere else in
      the file, remove them from the import(s). DO NOT remove imports still used by other code.
  KEEP everything else: the in-memory AppState.surveyData writes, the 80m sanity check, the
  greenCenter midpoint calc, updateGPSDistances — all stay (oncourse.js reads surveyData live).
  DO NOT add a `courses` Firestore rule (that would be "build the feature", explicitly deferred).

FIX 2 — BL-4.10 (remove the decorative Notification Preferences panel):
  (a) index.html: DELETE the entire Notification Preferences section — the
      `<!-- Notification Preferences -->` comment + the `<section class="card two-span">`
      that follows it, through its closing `</section>` (the block containing
      id="notif-permission-banner" ... id="btn-save-notif-prefs" ... id="notif-prefs-msg",
      ~lines 1090-1144). Leave the sibling "My Bag Config" section and the grid intact.
  (b) src/app-v4.js: remove the `import { initNotifications } from './notifications.js';` line
      (~line 28) AND the `initNotifications();` call (~line 60, inside its try/catch — remove
      the whole try line for it).
  (c) src/oncourse.js: remove the DEAD `import { initNotifications } from './notifications.js';`
      (~line 11) — it is imported but never called.
  (d) DELETE src/notifications.js entirely (its only live export, initNotifications, is now
      unreferenced; triggerLocalNotif was already never called).
  (e) If removing the panel leaves the screen header text stale, you MAY change the header
      blurb "Notifications & account preferences." (~index.html:1085) to "Account preferences."
      — optional, cosmetic; do nothing else.
  GREP-CONFIRM nothing else imports notifications.js or references initNotifications/
  triggerLocalNotif after the change.

FIX 3 — BL-4.11 + BL-DD-11 (delete the dead telemetry module):
  (a) DELETE src/modules/telemetry.js entirely.
  (b) src/app-v4.js: remove the `import { initializeTelemetryListener } from
      './modules/telemetry.js';` line (~line 25) AND the `initializeTelemetryListener();` call
      (~line 53 — it shares a try with initOnCourse(); keep initOnCourse(), drop only the
      telemetry call).
  CONFIRM no other file imports from modules/telemetry.js and that
  inferApproachDistance/recordTeeBoxLocation/currentHoleTelemetry appear nowhere in src/ after.

FIX 4 — BL-DD-02 (drop xlsx → CSV-only import):
  (a) src/admin.js: remove `import * as XLSX from 'xlsx';` (line 9).
  (b) index.html via admin.js template string: DELETE the "Bulk Excel Import" section
      (`<section class="card" style="border: 2px solid #10b981;"> ... </section>`,
      admin.js ~lines 117-122 — the block with id="excel-file-input" and id="btn-import-excel").
  (c) src/admin.js: DELETE the "--- Automated Excel Bulk Import ---" handler block
      (~lines 332-426, the `const btnExcelImport = ...` through its closing `}`).
  (d) package.json: remove the `"xlsx"` dependency line. Run `npm install` so package-lock
      updates (commit the lockfile change). Do NOT add any replacement dep.
  KEEP the entire CSV import path (admin.js ~104-115 UI, ~198-202 template, ~264-330 handler)
  untouched. Do NOT try to make CSV multi-user.

HARD CONSTRAINTS (Sydney Protocol):
  - No new `!important` / `.style.display`; no `getFunctions`/region call.
  - This is a removal tranche: net lines should DROP. Don't add features or rules.
  - 4 commits: (1) FIX 1 surveyor, (2) FIX 2 notifications, (3) FIX 3 telemetry, (4) FIX 4 xlsx.

ACCEPTANCE:
  - `npm run build` clean (Vite resolves no missing imports — deleted modules must have NO
    remaining importers).
  - `npm run test:unit` baseline unchanged (whs 10/10; only contract (b) red). Note: contract
    (b)'s id-offender count may DROP as dead ids (notif-*, excel-*) leave the JS — that's fine
    and expected; report the new count, it must not RISE.
  - GREP GATES (paste output):
      `grep -rn "saveSurveyToFirestore\|Pin saved successfully" src/`  -> NOTHING
      `grep -rn "notifications.js\|initNotifications\|triggerLocalNotif" src/`  -> NOTHING
      `git ls-files src/notifications.js src/modules/telemetry.js`  -> NOTHING (both deleted)
      `grep -rn "xlsx\|XLSX" src/ package.json`  -> NOTHING
      `grep -rn "initializeTelemetryListener\|currentHoleTelemetry\|recordTeeBoxLocation" src/`  -> NOTHING
  - PR description: grep-gate output + the four-field Brief-feedback block (Clarity gaps /
    Rationale / Deviations / Coverage method). State the new contract-(b) offender count.
```

## ② Independent check prompt (Claude — cross-family, NOT Gemini)

```
You are reviewing BL-DD Tranche 2 (4 decided cuts) in a vanilla-JS/Firebase/Vite app. I'll
paste the diff (src/surveyor.js, index.html, src/app-v4.js, src/oncourse.js, src/admin.js,
src/notifications.js [deleted], src/modules/telemetry.js [deleted], package.json,
package-lock.json). PASS/FAIL per item with file:line; run your OWN greps.

1. BL-4.16 (surveyor): saveSurveyToFirestore CALL and FUNCTION both removed; the
   "Pin saved successfully!" toast text replaced with an honest this-round-only message in BOTH
   the showToast and the alert-fallback branches; in-memory surveyData capture + greenCenter +
   updateGPSDistances + 80m check all PRESERVED (oncourse.js:623/632/634 still has its reader);
   no `courses` rule was added; any import made unused by the deletion (doc/updateDoc/db) was
   removed and no still-used import was dropped. FAIL if persistence is faked elsewhere, if the
   toast still claims a save, or if oncourse's surveyData reader broke.
2. BL-4.10 (notifications): the Notification Preferences <section> is gone from the admin/
   settings markup; src/notifications.js is DELETED; initNotifications import+call removed from
   app-v4.js; the dead initNotifications import removed from oncourse.js. FAIL if anything still
   imports notifications.js, if a dangling id reference remains, or if a sibling section
   (My Bag Config) was damaged.
3. BL-4.11/BL-DD-11 (telemetry): src/modules/telemetry.js DELETED; its import + the
   initializeTelemetryListener() call removed from app-v4.js while initOnCourse() is preserved;
   no remaining references to its exports. FAIL if the build would have a missing import, or if
   initOnCourse() was accidentally removed.
4. BL-DD-02 (xlsx): `import * as XLSX` gone from admin.js; the Bulk Excel Import UI section and
   its click handler removed; "xlsx" removed from package.json (+ lockfile updated); CSV path
   (UI + template + handler) fully intact and unchanged. Confirm `xlsx`/`XLSX` appears nowhere
   in src/ or package.json. FAIL if the CSV path regressed or a replacement dep was added.
5. SYDNEY/SCOPE/BUILD: no new `.style.display`/`!important`, no region/getFunctions call, no new
   features/rules, net lines DROP; `npm run build` clean (no missing-import errors from the two
   deleted modules); test:unit baseline unchanged except a possibly-LOWER (never higher)
   contract-(b) offender count.

Output: items 1-5 PASS/FAIL + evidence, verdict SHIP/FIX-FIRST, then a "Doc/Process update"
line (read the four feedback fields; capture a tagged LESSONS entry if a real defect/recurring
miss, else "nothing new").
```

---
*On completion: mark BL-4.16 / BL-4.10 / BL-4.11 / BL-DD-11 / BL-DD-02 ✅ in MASTER_BACKLOG with
the merge hash (Commit-Hash Mandate); BL-4.11 note that the telemetry delete also closed the
last D-01 `.active` remnant (update D-01's Re-test line in DECISIONS.md — it currently cites
`telemetry.js:19`). Next after Tranche 2: the **needs-design** security cluster — BL-DD-01
(AI rate-limit) + BL-DD-04/05/06 — surface the design choices to the user before briefing.*
