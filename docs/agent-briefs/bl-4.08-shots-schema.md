# BL-4.08 — Shots schema reconciliation (offload brief)

> Working artifact. **Implementer:** Google Antigravity 2.0 driving Gemini 3.5 Flash
> (encode the Sydney Protocol as an Antigravity skill/instruction file).
> **Independent check:** Claude (cross-family — do NOT check Gemini with Gemini).
> Produced by Opus 2026-06-25. Safe to delete after ship.
>
> Status when written: BL-4.01 closed on code; PR #55 (F3 + Keperra + docs) still
> OPEN — not yet on main. BL-4.17 brief shipped. Queue after this:
> **BL-4.04** (comp logging + R-LIVE-1) → **BL-4.02** (on-course rewiring).
>
> Covers backlog notes **F12, N4, N5, N15**.
>
> ## Two behavioural decisions baked into this spec (user may veto before run)
> Most of this brief is pure field-name reconciliation (rename consumers to the
> field the writer already produces — zero migration, lowest risk). TWO items are
> behavioural and were *decided* here, not just renamed:
> - **GIR auto-detection (STEP 4)** — there is no "ball reached the green" signal
>   in the wizard, so `outcome === 'Green'` can never be true. Spec replaces it with
>   a **first-putt inference**: logging the first real putt on a hole means the
>   approach reached the green. No new green-outcome UI.
> - **isOffGreen setter (STEP 5)** — adds ONE toggle button to the putting section
>   so a putter-from-the-fringe stroke can be excluded from putt count AND from the
>   GIR inference. This is the only DOM addition in the brief.
> If you'd rather defer either, tell me and I'll cut STEP 4/5 to a follow-up.

---

## Authoritative field map (verified at HEAD)

The shot document written to Firestore `shots/` is assembled from:
- `src/modules/event-binders.js:182` — `AppState.currentShotData[group] = val` for
  `group ∈ { startLine, trajectory, strikeQuality, shape, puttControl }`
  (data-group buttons in `index.html`).
- `src/modules/score-input.js` — `hole, shotNumber, roundId, timestamp, uid, club`,
  plus `routines`.
- penalty modal (`src/oncourse.js:1485-1496`) — `outcome ∈ {OB, Hazard, Fairway}`,
  `penalty`.

| Field          | Written? | Allowed values                          |
|----------------|----------|-----------------------------------------|
| `startLine`    | yes      | `Left`, `Straight`, `Right`             |
| `trajectory`   | yes      | `Low`, `Medium`, `High`                 |
| `strikeQuality`| yes      | `Fat`, `Pure`, `Thin`                   |
| `shape`        | yes      | `Hook`, `Draw`, `Straight`, `Fade`, `Slice` |
| `puttControl`  | yes      | `Short`, `Holed`, `Past`                |
| `club`         | yes      | bag value incl. `Putter`                |
| `outcome`      | partial  | only `OB`/`Hazard`/`Fairway` (penalty modal) — **never `Green`** |
| `line`         | **NEVER**| — (consumer typo for `startLine`)       |
| `curve`        | **NEVER**| — (consumer typo for `shape`)           |
| `isOffGreen`   | **NEVER**| — (read at score-input.js:117, no setter)|

`simpleStats[hole]` (per-player, on `liveRoundGroups`) holds only:
`fwy`/`fir`, `gir`, `putts`. It does **not** hold `shape`, `penalties`, or
`routines` — anything reading those off simpleStats reads undefined.

---

## ① Implementation prompt (for Antigravity 2.0 / Gemini 3.5 Flash)

```
TASK: Reconcile the shot-tracking schema in the Golf Handicap Tracker
(vanilla JS / Vite / Firebase). Several analytics consumers read field names the
writer never produces (`line` vs `startLine`, `curve` vs `shape`), one reads shot
shape off the wrong object (simpleStats instead of the shot doc), and the
auto-GIR / putter-exclusion logic depends on fields (`outcome==='Green'`,
`isOffGreen`) that nothing ever sets. The shot WRITE path is canonical and stays
unchanged — fix the READERS to the real field names, and add the two missing
signals (GIR inference + isOffGreen toggle). Open a PR to main on a branch
fix/bl-4.08-shots-schema. Do NOT merge.

CANONICAL SHOT FIELDS (do not rename these — they have UI and stored data):
  startLine {Left,Straight,Right}, trajectory {Low,Medium,High},
  strikeQuality {Fat,Pure,Thin}, shape {Hook,Draw,Straight,Fade,Slice},
  puttControl {Short,Holed,Past}, club, outcome (OB/Hazard/Fairway only).

STEP 1 — src/analytics.js (aggregateShotPatterns)
  - Line ~32: read `s.startLine` (NOT `s.line`). The `direction` buckets
    {Left,Straight,Right} already match — leave them.
  - Lines ~26 & ~34 & ~73: the shot-shape bucket is keyed `curve` and reads
    `s.curve`. Rename the stats key `curve` -> `shape`, read `s.shape`, and EXPAND
    the buckets to all five real values: { Hook:0, Draw:0, Straight:0, Fade:0,
    Slice:0 }. Update the render block (~line 73) `stats.curve` -> `stats.shape`.
    The "Shot Shape" heading already fits.

STEP 2 — src/ai.js (~line 210)
  - `misses[s.curve]` -> `misses[s.shape]`. ALSO: a `Straight` shot is not a miss —
    skip it in the tally: `if (s.shape && s.shape !== 'Straight') { ... }`.
    The "Most common miss" prompt line then reports a real miss tendency.

STEP 3 — src/oncourse.js (the stat-analysis modal fn, ~lines 1284-1366)
  - `shotShapeTendency` is computed from `simpleStats[hole].shape`, which is never
    populated (shape lives on shot docs). Fix the SOURCE:
    * Before building `payload`, fetch this round's shots and aggregate shape from
      them. Mirror the existing pattern at oncourse.js:1591 (query `shots` by
      roundId, filter uid client-side — do NOT add a composite where(); avoid a new
      index):
        const sq = query(collection(db,"shots"),
                          where("roundId","==",AppState.activeRoundId));
        const snap = await getDocs(sq);
        const shapeCounts = {};
        snap.forEach(d => { const s = d.data();
          if (s.uid === p.uid && s.shape) shapeCounts[s.shape] =
            (shapeCounts[s.shape]||0)+1; });
      (query/collection/getDocs/where are already imported in this file.)
    * Replace the `hStats.shape` branch in the simpleStats loop (~line 1339) so it
      no longer reads shape from simpleStats. Compute `dominantShape` from the
      shapeCounts above. Keep the rest of that loop untouched.
  - OUT OF SCOPE — do NOT touch: penaltyTotal / routinePassCount in that same loop.
    They are independently broken (also read off simpleStats) but are NOT part of
    BL-4.08. Leave them exactly as they are.

STEP 4 — src/modules/score-input.js, auto-GIR (~lines 108-114, inside saveShotData)
  - `payload.outcome === 'Green'` is dead (outcome is only ever OB/Hazard/Fairway).
    REPLACE the GIR block with a first-putt inference. The just-logged shot is
    already pushed to AppState.currentHoleShots (line ~103). Logic:
      A real putt = club 'Putter' AND NOT isOffGreen. The FIRST real putt on a hole
      implies the approach reached the green at stroke (shotNumber - 1). GIR =
      reached green within regulation = (shotNumber - 1) <= (par - 2), i.e.
      shotNumber <= par - 1.
    Implement, reusing the existing `par`/`holeIdx` already computed at lines
    ~109-110:
      const realPutts = AppState.currentHoleShots.filter(s =>
        s.hole === AppState.currentHole && s.club === 'Putter' && !s.isOffGreen);
      if (payload.club === 'Putter' && !payload.isOffGreen &&
          realPutts.length === 1 && payload.shotNumber <= (par - 1)) {
        if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
        p.simpleStats[AppState.currentHole].gir = true;
      }
    KEEP the existing putter putt-count block (lines ~116-120) as-is — it already
    guards on `!payload.isOffGreen`. Both blocks now share the same exclusion.
    NOTE (accepted limitation, document in PR, do not "fix"): penalty strokes
    inflate shotNumber and can deny GIR on a penalty hole; that matches simple
    trackers and is fine.

STEP 5 — isOffGreen setter (the only DOM addition)
  - index.html, inside `#section-putting-outcome` (~lines 693-704): add ONE toggle
    button after the puttControl grid:
      <button id="wiz-toggle-offgreen" class="oc-toggle-btn"
              style="margin-top:8px; width:100%;">From Fringe / Off Green</button>
  - src/modules/event-binders.js: add a click handler (near the wizard intent-grid
    delegation, ~line 169) that flips the boolean and reflects pressed state:
      const offGreenBtn = document.getElementById('wiz-toggle-offgreen');
      if (offGreenBtn) offGreenBtn.addEventListener('click', () => {
        AppState.currentShotData.isOffGreen = !AppState.currentShotData.isOffGreen;
        offGreenBtn.classList.toggle('active', !!AppState.currentShotData.isOffGreen);
      });
  - src/modules/score-input.js, syncShotWizardUI (~lines 46-80): reflect the stored
    value when re-opening a shot:
      const offGreenBtn = document.getElementById('wiz-toggle-offgreen');
      if (offGreenBtn) offGreenBtn.classList.toggle('active', !!data.isOffGreen);
    ALSO reset it when the putter section hides for a non-putter shot is NOT
    required (the field simply stays unset for non-putters and is ignored).

HARD CONSTRAINTS (Sydney Protocol — do not violate):
  - State-driven visibility only. The new toggle is a pressed-state class toggle
    (like the existing routine/intent buttons) — do NOT use `.style.display`, and
    do NOT touch `body[data-active-tab]`. No `!important`.
  - Firebase services/functions stay pinned to australia-southeast1; do NOT add a
    getFunctions/region call. Reuse the db/query imports already in each file.
  - simpleStats mutation: MATCH the existing in-place pattern already used at
    score-input.js:112-119 (`p.simpleStats[hole].gir = true`). Do NOT introduce
    mutateList here — that would change live-round reactivity semantics for the
    whole on-course path and is out of scope.
  - Do NOT change the shot WRITE payload field names, the penalty-modal outcome
    values, or the putt-count block's behaviour.
  - Keep each logical change reviewable; group by STEP in the PR description.

ACCEPTANCE:
  - `npm run build` clean.
  - `npm run test:unit` baseline unchanged: the two mapped contract tests stay
    intentionally red, the rest green, whs 10/10. (No emulator needed for unit.)
  - No remaining reference to `s.line`, `s.curve`, or `outcome === 'Green'` in
    src/. (grep proves it.)
  - PR description lists every file touched and the STEP it satisfies, plus the
    GIR-penalty limitation note.
```

## ② Independent check prompt (for Claude — cross-family, NOT Gemini)

```
You are reviewing a schema-reconciliation fix in a vanilla-JS/Firebase golf app.
The shot WRITE path is canonical and must be unchanged; consumers were reading
wrong field names. I will paste the diff (or files: src/analytics.js, src/ai.js,
src/oncourse.js, src/modules/score-input.js, src/modules/event-binders.js,
index.html). Verify against this checklist; answer PASS/FAIL per item with
file:line evidence. Be skeptical — assume a reader was missed or a value typo'd.

CANONICAL FIELDS (the writer produces these; readers must match exactly):
  startLine {Left,Straight,Right}, trajectory {Low,Medium,High},
  strikeQuality {Fat,Pure,Thin}, shape {Hook,Draw,Straight,Fade,Slice},
  puttControl {Short,Holed,Past}. `line`, `curve`, outcome 'Green', and a default
  isOffGreen are NOT produced by the writer.

1. FIELD RENAMES: Confirm src/analytics.js reads `s.startLine` (not `s.line`) and
   `s.shape` (not `s.curve`); that the shape bucket is keyed `shape` and contains
   ALL FIVE values {Hook,Draw,Straight,Fade,Slice} (FAIL if Hook/Slice missing —
   they'd silently drop); and the render uses `stats.shape`. Confirm src/ai.js
   reads `s.shape` and excludes 'Straight' from the miss tally. Grep-confirm NO
   `s.line` / `s.curve` / `outcome === 'Green'` remain anywhere in src/.

2. SHAPE SOURCING (oncourse.js): Confirm shotShapeTendency is now computed from
   SHOT DOCS (a shots query filtered to roundId + this player's uid), not from
   simpleStats. Confirm the query did NOT add a composite where() that needs a new
   Firestore index (should query by roundId, filter uid client-side). Confirm
   penaltyTotal/routinePassCount were left untouched (out of scope — NOT a FAIL
   that they remain broken).

3. GIR INFERENCE (score-input.js): Walk the logic. Does it set gir=true only when
   the just-logged shot is the FIRST real putt on the hole (Putter && !isOffGreen)
   AND shotNumber <= par-1? Check it does not double-count across multiple putts,
   does not fire for off-green putts, and reuses the existing par/holeIdx. Confirm
   the existing putt-count block is preserved and still guards on !isOffGreen.

4. ISOFFGREEN SETTER: Confirm the new #wiz-toggle-offgreen button (a) flips
   AppState.currentShotData.isOffGreen, (b) reflects pressed state via a class
   toggle (NOT .style.display), and (c) is re-synced in syncShotWizardUI when an
   existing shot is reopened. FAIL if the value can't round-trip (set -> save ->
   reopen shows pressed).

5. NO CONTRACT DAMAGE: Confirm NO `.style.display`, NO `!important`, NO
   `body[data-active-tab]` change; NO getFunctions/region call added; region stays
   australia-southeast1; simpleStats still mutated in-place (matching existing
   pattern — mutateList NOT introduced here); the shot WRITE payload field names
   and penalty-modal outcome values are unchanged.

Output: a table of items 1-5 with PASS/FAIL + file:line evidence, then a
"MISSED READERS" section listing any remaining consumer of a non-canonical shot
field you found, then a one-line verdict: SHIP / FIX-FIRST.
```
