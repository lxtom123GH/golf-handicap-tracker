# BL-4.04 / F8 — On-course comp-rule tracking (compStats writer) (offload brief)

> Working artifact. **Implementer:** Google Antigravity 2.0 driving Gemini 3.5 Flash
> (encode the Sydney Protocol as an Antigravity skill/instruction file).
> **Independent check:** Claude (cross-family — do NOT check Gemini with Gemini).
> Produced by Opus 2026-06-25. Safe to delete after ship.
>
> This is the F8 piece carved out of `bl-4.04-comp-logging.md` (PART B), now made
> execution-ready after the user's design decisions. Ship PART A (R-LIVE-1, F9, N9,
> N10, N11) first or in parallel — F8 writes the rule data; PART A's `totalPoints`
> rename is what makes it show on the leaderboard.
>
> ## Design decisions (locked by user 2026-06-25)
> - **Placement:** a **collapsible "🏆 Comp Rules" panel in the on-course hub**,
>   between the scorecard (`#oc-group-scores`) and the bottom nav. Rendered only when
>   a competition is linked.
> - **Scope:** **current user only** for now — steppers write to the signed-in
>   player's `compStats`. The render MUST be structured so multi-player is a clean
>   future add (the live aggregator already loops all players). A future
>   single-vs-all **toggle** is noted as an enhancement; do NOT build it now.
> - **Persistence:** FREE via the existing mechanism — see the persistence note
>   below. Do NOT add new persistence code.

---

## Why this is needed (verified at HEAD)

`p.compStats` is initialised to `{}` (event-binders.js:20, 64) and READ by the live
aggregator (oncourse.js:1148-1158) as `p.compStats[hole][ruleName] = count`, but
**no code path ever writes it**. So every live comp round syncs `rulePoints = 0`
and empty `ruleCounts`. F8 adds the missing writer: per-hole rule steppers that
populate `compStats`.

**The model to copy:** the existing per-hole "simple stats" steppers
(oncourse.js:243-281) — FW/GIR/putts. They mutate `p.simpleStats[currentHole]`
**in place** and then call `loadHole()`. F8 mirrors this exactly for `compStats`.

**Persistence mechanism (critical — do not break):** an in-place mutation of
`p.simpleStats[hole]` / `p.compStats[hole]` does NOT fire the AppState Proxy
`stateChange` (same object reference). It persists ONLY because `loadHole()`
reassigns `AppState.currentHoleShots = []` (oncourse.js:189) — a *reference* change
on a PERSIST_FIELDS key — which fires `stateChange`, and persistence.js:120-132 then
calls `saveRoundState()`, serialising all of `liveRoundGroups` (compStats included).
**Therefore every stepper MUST call `loadHole()` after mutating.** Do not "optimise"
it to a local re-render, and do NOT switch this site to `mutateList` — that would
change live-round reactivity semantics and is out of scope.

---

## ① Implementation prompt (for Antigravity 2.0 / Gemini 3.5 Flash)

```
TASK: Add on-course competition-rule tracking to the Golf Handicap Tracker
(vanilla JS / Vite / Firebase). Currently p.compStats is never written, so live
comp rounds score zero rule points. Add a collapsible per-hole rule-stepper panel
that writes the signed-in player's compStats, mirroring the existing simple-stats
steppers. Open a PR to main on branch fix/bl-4.04-f8-compstats. Do NOT merge.

STEP 1 — Markup. index.html: insert this block BETWEEN the scorecard container
`#oc-group-scores` (its closing </div> is ~line 571) and `#oc-bottom-nav`
(~line 574):

  <div id="oc-comp-panel" class="hidden"
       style="margin-bottom:20px; border:1px solid var(--border-color); border-radius:12px; overflow:hidden; text-align:left;">
      <button type="button" id="oc-comp-panel-header"
              style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:12px 15px; background:#f8fafc; border:none; font-weight:700; font-size:0.95rem; color:#1e293b; cursor:pointer;">
          <span>🏆 Comp Rules <span id="oc-comp-panel-hole" style="color:#64748b; font-weight:500;"></span></span>
          <span id="oc-comp-panel-caret">▼</span>
      </button>
      <div id="oc-comp-panel-body" style="padding:12px 15px;"></div>
  </div>

STEP 2 — Renderer. src/oncourse.js: add a function renderCompPanel() and CALL IT
inside loadHole(), right before the existing `updateLiveLeaderboard();` near the end
of the success path (~line 297). Implementation:

  function renderCompPanel() {
      const panel = document.getElementById('oc-comp-panel');
      if (!panel) return;
      const rules = AppState.currentLiveCompRules || [];
      if (!AppState.currentLiveCompId || rules.length === 0) {
          panel.classList.add('hidden');
          return;
      }
      // SCOPE: current user only. To extend to all players later, loop
      // AppState.liveRoundGroups and render one labelled block per player.
      const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
      if (!p) { panel.classList.add('hidden'); return; }
      panel.classList.remove('hidden');

      const holeLabel = document.getElementById('oc-comp-panel-hole');
      if (holeLabel) holeLabel.textContent = `(Hole ${AppState.currentHole})`;

      // Collapse toggle — assignment (.onclick), never addEventListener, so it
      // cannot stack across re-renders. Header markup is static.
      const header = document.getElementById('oc-comp-panel-header');
      const caret  = document.getElementById('oc-comp-panel-caret');
      if (header) header.onclick = () => {
          const body = document.getElementById('oc-comp-panel-body');
          if (!body) return;
          const collapsed = body.classList.toggle('hidden');
          if (caret) caret.textContent = collapsed ? '▶' : '▼';
      };

      const body = document.getElementById('oc-comp-panel-body');
      if (!body) return;
      body.innerHTML = '';
      const holeStats = p.compStats[AppState.currentHole] || {};

      rules.forEach(rule => {
          const count = holeStats[rule.name] || 0;
          const row = document.createElement('div');
          row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0;';
          // Stepper controls are STATIC markup — safe to use innerHTML here.
          row.innerHTML = `
              <span class="comp-rule-label" style="font-size:0.9rem; font-weight:600; color:#475569;"></span>
              <div style="display:flex; align-items:center; gap:12px;">
                  <button class="comp-rule-minus" style="width:40px; height:40px; border-radius:10px; border:2px solid #cbd5e1; background:white; font-size:1.3rem; font-weight:bold;">−</button>
                  <span class="comp-rule-count" style="min-width:24px; text-align:center; font-size:1.3rem; font-weight:800; color:#1e293b;">${count}</span>
                  <button class="comp-rule-plus" style="width:40px; height:40px; border-radius:10px; background:var(--primary-color); color:white; border:none; font-size:1.3rem; font-weight:bold;">+</button>
              </div>
          `;
          // rule.name is COMP-CREATOR-CONTROLLED user input (stored XSS surface,
          // BL-4.17). NEVER interpolate it into an innerHTML string. Set it via
          // textContent and aria-labels via setAttribute (both are HTML-inert).
          const label = row.querySelector('.comp-rule-label');
          label.textContent = `${rule.name} (${rule.pts} pt${rule.pts === 1 ? '' : 's'})`;
          const minus = row.querySelector('.comp-rule-minus');
          const plus  = row.querySelector('.comp-rule-plus');
          minus.setAttribute('aria-label', `Decrease ${rule.name}`);
          plus.setAttribute('aria-label', `Increase ${rule.name}`);

          plus.onclick = () => {
              if (!p.compStats[AppState.currentHole]) p.compStats[AppState.currentHole] = {};
              p.compStats[AppState.currentHole][rule.name] =
                  (p.compStats[AppState.currentHole][rule.name] || 0) + 1;
              loadHole(); // REQUIRED — see persistence note; do not remove.
          };
          minus.onclick = () => {
              if (!p.compStats[AppState.currentHole]) p.compStats[AppState.currentHole] = {};
              const cur = p.compStats[AppState.currentHole][rule.name] || 0;
              if (cur > 0) p.compStats[AppState.currentHole][rule.name] = cur - 1;
              loadHole();
          };
          body.appendChild(row);
      });
  }

HARD CONSTRAINTS (Sydney Protocol — do not violate):
  - Visibility via the `hidden` CLASS only (panel show/hide AND the collapse). NO
    `.style.display`. No `!important`. No `body[data-active-tab]` changes.
  - Mutate compStats IN PLACE, matching the simpleStats steppers
    (oncourse.js:262-279), and call loadHole() after every mutation. Do NOT use
    mutateList here and do NOT add any saveRoundState() call — persistence already
    rides on loadHole()'s currentHoleShots reassignment.
  - rule.name MUST reach the DOM only via textContent / setAttribute — never raw in
    an innerHTML template (it is user-controlled; raw interpolation is stored XSS).
  - Firebase stays pinned to australia-southeast1; add no getFunctions/region calls.
  - Do NOT change the aggregator (oncourse.js:1148-1158), the compStats init
    (event-binders.js:20,64), or any PART A code. Scope is current-user only — do
    not build a multi-player UI or a toggle (forward-compat is via the loop comment
    only).

ACCEPTANCE:
  - `npm run build` clean; `npm run test:unit` baseline unchanged (mapped contract
    tests stay red, rest green, whs 10/10). No emulator needed for unit.
  - The panel is hidden when no competition is linked (currentLiveCompId falsy) or
    the comp has zero rules; it appears (single player) when a comp is linked.
  - Each rule shows a stepper for the CURRENT hole; +/- updates the count; changing
    holes shows that hole's own counts (per-hole keys in compStats).
  - The header collapses/expands the body and flips the caret, with no listener
    stacking across hole changes.
  - PERSISTENCE: tap + on a rule, then refresh the page mid-round — the count
    survives (it rides liveRoundGroups via loadHole()).
  - END-TO-END (with PART A shipped + emulator): finishing a comp-linked round now
    writes a comp_rounds doc with non-zero rulePoints/ruleCounts, and the leaderboard
    total reflects them.
  - grep proves rule.name is never raw-interpolated into an innerHTML string.
  - PR description: files touched, and an explicit note that scope is current-user
    only with the multi-player extension point identified.
```

## ② Independent check prompt (for Claude — cross-family, NOT Gemini)

```
You are reviewing a new on-course competition-rule tracking feature in a
vanilla-JS/Firebase golf app. The gap it fixes: p.compStats was never written, so
live comp rounds scored zero rule points. I will paste the diff (or files:
index.html, src/oncourse.js). Answer PASS/FAIL per item with file:line evidence.
Be skeptical.

1. WRITER EXISTS: Confirm a per-hole stepper UI now mutates
   p.compStats[currentHole][rule.name] for the signed-in player, and that the live
   aggregator (oncourse.js:1148-1158) will therefore see non-zero counts. FAIL if
   compStats is still never written.

2. PERSISTENCE: Confirm every +/- handler calls loadHole() after mutating (in-place
   mutation alone does NOT fire stateChange; persistence rides on loadHole()
   reassigning AppState.currentHoleShots). FAIL if a handler mutates without
   loadHole(), or if it added a manual saveRoundState()/mutateList instead.

3. XSS: rule.name is comp-creator-controlled. Confirm it reaches the DOM ONLY via
   textContent / setAttribute, NEVER interpolated raw into an innerHTML string
   (including aria-label built inside a template literal). FAIL on any raw
   interpolation of rule.name (or rule.pts if it could be non-numeric).

4. SYDNEY PROTOCOL: Confirm panel show/hide AND the collapse use the `hidden` class,
   not `.style.display`; no `!important`; no body[data-active-tab] change; no
   getFunctions/region call; compStats mutated in place (matching the simpleStats
   pattern), not via mutateList.

5. NO LISTENER STACKING: The body is rebuilt each loadHole(). Confirm the collapse
   toggle uses `.onclick =` (idempotent) or is bound once — not addEventListener
   inside the re-render (which would stack). Confirm stepper handlers are on
   freshly-created elements each render (fine) and don't leak.

6. SCOPE / CORRECTNESS: Confirm it renders for the current user only, is hidden when
   currentLiveCompId is falsy or rules are empty, reads per-hole counts correctly
   (changing holes shows that hole's values), and decrement floors at 0. Confirm it
   did NOT alter the aggregator, compStats init, or PART A code.

Output: items 1-6 table with PASS/FAIL + evidence, then a one-line verdict:
SHIP / FIX-FIRST.
```
