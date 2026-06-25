# BL-4.04 — Competition logging repair + R-LIVE-1 (offload brief)

> Working artifact. **Implementer:** Google Antigravity 2.0 driving Gemini 3.5 Flash
> (encode the Sydney Protocol as an Antigravity skill/instruction file).
> **Independent check:** Claude (cross-family — do NOT check Gemini with Gemini).
> Produced by Opus 2026-06-25. Safe to delete after ship.
>
> Status when written: PR #55 still OPEN (BL-4.01 not yet fully on main). BL-4.17
> and BL-4.08 briefs already written. After this: **BL-4.02** (on-course rewiring).
>
> Covers backlog notes **F8, F9, N9, N10, N11, R-LIVE-1**.
>
> ## SCOPE SPLIT — read first
> This brief is in two parts:
> - **PART A (airtight, ship now):** R-LIVE-1, F9, N9, N10, N11. Five bounded,
>   fully-specified fixes. Antigravity can implement and PR these immediately.
> - **PART B (F8 — needs your design decision):** `p.compStats` is initialised to
>   `{}` but **nothing ever writes to it** — there is no on-course UI to record
>   comp-rule achievements per hole. So even after PART A, every *live* comp round
>   syncs with **zero** rule points. Closing F8 is a real feature build (new
>   on-course markup + render + stepper handlers), not a one-liner, and needs a
>   placement/interaction decision from you before Antigravity builds it. PART B
>   below is a *proposal*, NOT an execution-ready spec. **Do not hand PART B to
>   Antigravity until the user signs off.**

---

## Authoritative findings (verified at HEAD)

| Tag | File:line | Defect | Fix |
|-----|-----------|--------|-----|
| **R-LIVE-1** | oncourse.js:1175-1176 | `competition_results` `addDoc` is rule-less (no match block in firestore.rules — confirmed; only `comp_rounds` at :122) → denied → throws → the very next line, the `comp_rounds` write, never runs. Comp sync is fully dead. `competition_results` has **zero readers** anywhere in src/. | Delete the `competition_results` write line; keep only the `comp_rounds` write. |
| **F9** | oncourse.js:1167 vs competitions.js:237,321 | Live write stores the total as `totalCompScore`; the leaderboard + recent-rounds read `r.totalPoints` (manual log already writes `totalPoints`, competitions.js:547). Live comp rounds therefore contribute **0** points. `totalCompScore` has no reader. | Rename the `totalCompScore` key in the live `compPayload` to `totalPoints` (same value: `totalStableford + totalRulePoints`). |
| **N9** | competitions.js:122-143; index.html:1579 | `startingPoints` is parsed into `currentCompData` and used in manual scoring, but is **never displayed**. Players can't see the comp's starting-points config. | Add a banner element + populate it in `setActiveCompetition`. |
| **N10** | competitions.js:301-303; index.html:1661 | `renderRecentCompRounds` has an empty `// UI.compEmptyState ??` branch. `#comp-empty-state` ("No rounds logged yet.") has no `hidden` class, so it shows **always**, even when rounds exist. | Toggle `#comp-empty-state` based on round count. |
| **N11** | competitions.js:324 | The `.del-comp-round` delete button is rendered (gated to owner/admin) but **no click handler is bound anywhere** — `deleteDoc` is imported and never called. Button is dead. `comp_rounds` delete rule already allows owner/admin (firestore.rules:125). | Bind one delegated handler that deletes the `comp_rounds` doc by `data-id`. |
| **F8** | event-binders.js:20,64; oncourse.js:1148-1158 | `p.compStats` initialised `{}`, never written → live rule aggregation always sums 0. | PART B — feature build, needs design sign-off. |

---

## PART A — ① Implementation prompt (for Antigravity 2.0 / Gemini 3.5 Flash)

```
TASK: Repair competition logging in the Golf Handicap Tracker (vanilla JS / Vite /
Firebase). Five bounded fixes. Open a PR to main on branch fix/bl-4.04-comp-logging.
Do NOT merge. Keep each fix reviewable; map each to its tag in the PR description.

FIX 1 (R-LIVE-1) — src/oncourse.js ~lines 1174-1180.
  The live comp sync currently does:
      try {
          await addDoc(collection(db, "competition_results"), compPayload);
          await addDoc(collection(db, "comp_rounds"), compPayload); // Backward compat
      } catch (cloudErr) { ... anyCloudFail = true; }
  The `competition_results` collection has NO Firestore rule (default deny) and NO
  readers anywhere. Its write throws, which aborts the `comp_rounds` write in the
  same try. DELETE the `competition_results` line entirely (and its stale
  "Backward compat" comment). Keep ONLY:
      await addDoc(collection(db, "comp_rounds"), compPayload);
  Do NOT add a competition_results rule — the collection is being removed from the
  write path, not resurrected.

FIX 2 (F9) — src/oncourse.js, the live `compPayload` (~lines 1160-1170).
  Rename the key `totalCompScore` to `totalPoints` (value unchanged:
  totalStableford + totalRulePoints). The leaderboard (competitions.js:237) and
  recent-rounds (competitions.js:321) read `r.totalPoints`; the manual log form
  already writes `totalPoints`. Leave the other compPayload keys as-is.

FIX 3 (N9) — starting-points display.
  index.html: after the rules summary line (`<p id="active-comp-rules-summary">`,
  ~line 1579) add:
      <p id="active-comp-sp-summary" style="opacity:0.85; font-size:0.85rem;"></p>
  src/competitions.js, setActiveCompetition (~after line 140, where the rules
  summary is built): populate it from `startingPoints` (already parsed at ~line
  114). Use textContent (NOT innerHTML). Build a string only from enabled buckets:
      const sp = startingPoints || {};
      const parts = [];
      if (sp.round?.enabled) parts.push(`+${sp.round.value||0}/round`);
      if (sp.hole?.enabled)  parts.push(`+${sp.hole.value||0}/hole`);
      const spEl = document.getElementById('active-comp-sp-summary');
      if (spEl) spEl.textContent = parts.length ? `Starting points: ${parts.join(' · ')}` : '';
  When neither is enabled the line is empty (invisible) — do NOT use .style.display.

FIX 4 (N10) — comp-empty-state toggle. src/competitions.js, renderRecentCompRounds
  (~lines 297-330). Replace the dead `// UI.compEmptyState ??` branch with a real
  toggle of #comp-empty-state using the `hidden` class:
      const emptyEl = document.getElementById('comp-empty-state');
      if (emptyEl) emptyEl.classList.toggle('hidden', AppState.currentCompRounds.length > 0);
  (Show the message only when there are zero rounds.) Keep the existing row-render
  loop for the non-empty case. Class toggle only — no `.style.display`.

FIX 5 (N11) — del-comp-round handler. src/competitions.js. Bind ONCE (not inside a
  render fn — avoid duplicate listeners) using event delegation on the recent-rounds
  tbody. Add to initCompetitions (~line 14, alongside the other bind* calls) a call
  to a new bindCompRoundDelete(), or inline a delegated listener:
      function bindCompRoundDelete() {
          if (!UI.compRecentRoundsTbody) return;
          UI.compRecentRoundsTbody.addEventListener('click', async (e) => {
              const btn = e.target.closest('.del-comp-round');
              if (!btn) return;
              const id = btn.getAttribute('data-id');
              if (!id) return;
              if (!confirm('Delete this competition round?')) return;
              try {
                  await deleteDoc(doc(db, 'comp_rounds', id));
                  // onSnapshot (listenToCompRounds) auto-refreshes the table.
              } catch (err) {
                  console.error('Error deleting comp round:', err);
                  alert('Failed to delete round.');
              }
          });
      }
  `doc`, `deleteDoc`, `db` are already imported. The button is already gated to
  owner/admin in render, and firestore.rules:125 enforces the same — do NOT widen
  the rule.

HARD CONSTRAINTS (Sydney Protocol — do not violate):
  - State-driven visibility only: use the `hidden` class for N9/N10, never
    `.style.display`. No `!important`. No `body[data-active-tab]` changes.
  - Firebase stays pinned to australia-southeast1; do NOT add getFunctions/region
    calls. Reuse the imports already in each file.
  - Do NOT add a competition_results rule or any new collection.
  - Do NOT touch p.compStats / the live rule aggregation (that is PART B / F8, out
    of scope for this PR).
  - Bind the delete handler exactly once (delegation), not per-render.

ACCEPTANCE:
  - `npm run build` clean.
  - `npm run test:unit` baseline unchanged (mapped contract tests stay red, rest
    green, whs 10/10). No emulator needed for unit.
  - grep proves no remaining `competition_results` reference and no `totalCompScore`
    in src/.
  - PR description maps each FIX 1-5 to its tag (R-LIVE-1, F9, N9, N10, N11) and
    lists files touched.
  - (If the emulator is running) a live-tracked round linked to a competition now
    produces ONE comp_rounds doc that appears on the leaderboard with non-zero
    totalPoints (rule points still 0 until F8 — expected).
```

## PART A — ② Independent check prompt (for Claude — cross-family, NOT Gemini)

```
You are reviewing a competition-logging repair in a vanilla-JS/Firebase golf app.
I will paste the diff (or files: src/oncourse.js, src/competitions.js, index.html,
firestore.rules). Answer PASS/FAIL per item with file:line evidence. Be skeptical.

1. R-LIVE-1: Confirm the `competition_results` addDoc is GONE from src/oncourse.js
   and the remaining comp write targets only `comp_rounds`. FAIL if competition_
   results is still written, or if a competition_results rule was added (the
   collection should be removed from the write path, not resurrected). Confirm the
   comp_rounds write is no longer shadowed by a preceding throwing call inside the
   same try.

2. F9: Confirm the live compPayload now uses key `totalPoints` (not totalCompScore),
   value = totalStableford + totalRulePoints, matching the reader at
   competitions.js (r.totalPoints) and the manual-log writer. Grep-confirm no
   `totalCompScore` remains in src/.

3. N9: Confirm #active-comp-sp-summary exists and is populated via textContent (NOT
   innerHTML — startingPoints could carry user input indirectly) from the enabled
   round/hole buckets, empty string when none enabled, and that visibility is via
   empty text or `hidden` class, NOT `.style.display`.

4. N10: Confirm #comp-empty-state is toggled via the `hidden` class based on
   AppState.currentCompRounds.length (hidden when rounds exist, shown when zero).
   FAIL if it uses .style.display or is left always-visible.

5. N11: Confirm the delete handler is bound ONCE via delegation on the recent-rounds
   tbody (not re-added on every render — that would stack listeners), reads data-id,
   confirms, and calls deleteDoc(doc(db,'comp_rounds',id)). Confirm it does NOT widen
   firestore.rules and relies on the existing owner/admin gate (rules:125).

6. NO CONTRACT DAMAGE: No `.style.display`, no `!important`, no body[data-active-tab]
   change; no getFunctions/region call added; region stays australia-southeast1; no
   new collection or rule; p.compStats / live rule aggregation untouched (F8 is out
   of scope here).

Output: items 1-6 table with PASS/FAIL + evidence, then a one-line verdict:
SHIP / FIX-FIRST.
```

---

## PART B — F8 proposal (NOT execution-ready; needs user sign-off)

**The gap.** `p.compStats` is created empty (event-binders.js:20, 64) and read by
the live aggregator (oncourse.js:1148-1158) as `p.compStats[hole][ruleName] = count`,
but **no code path ever writes it**. There is no on-course UI to tap "birdie / 2pt /
sandie" etc. per hole. Result: live comp rounds always sync `rulePoints = 0` and
empty `ruleCounts`.

**Decisions needed from you before this becomes an airtight spec:**
1. **Placement** — where on the on-course screen do the per-hole comp-rule steppers
   live? (Options: inside the hub under the scorecard; a collapsible "Comp" panel;
   a button on the hole view.) This drives the index.html markup.
2. **Scope of tracking** — single-player only (the current user `p`), or all players
   in `liveRoundGroups`? The aggregator already loops all players, but a multi-player
   stepper UI is materially bigger.
3. **Persistence** — `compStats` lives on `liveRoundGroups`. Confirm whether
   `liveRoundGroups` is in the offline persist set (persistence.js PERSIST_FIELDS
   lists `currentLiveCompId`/`currentLiveCompRules` but I have not confirmed
   liveRoundGroups is persisted). If mid-round comp taps must survive a refresh,
   persistence wiring is part of the task.

**Recommended shape (once decided):** reuse the existing dynamic-stepper pattern in
`generateDynamicLogInputs` (competitions.js:160-192) — render a stepper per
`AppState.currentLiveCompRules` for the current hole, with +/- writing
`p.compStats[AppState.currentHole][rule.name]`. Mutate `compStats` following the
same in-place pattern the codebase already uses for `p.simpleStats`
(score-input.js:112-119) for consistency — do NOT switch this one site to
`mutateList` in isolation. Re-render on hole change.

**Recommendation:** ship PART A now (it's the actual R-LIVE-1 unblock + the
field-mismatch repairs), and split F8 into its own brief.

**UPDATE 2026-06-25 — F8 is now its own execution-ready brief:**
`docs/agent-briefs/bl-4.04-f8-oncourse-comp-rules.md`. Decisions locked by user:
collapsible "🏆 Comp Rules" panel in the on-course hub; **current-user-only** scope
(multi-player + a single/all toggle deferred as a future enhancement); persistence
is free via `liveRoundGroups` + `loadHole()`'s `currentHoleShots` reassignment (no
new persist code). PART A's `totalPoints` rename is what surfaces F8's rule points
on the leaderboard, so ship PART A first or alongside.
