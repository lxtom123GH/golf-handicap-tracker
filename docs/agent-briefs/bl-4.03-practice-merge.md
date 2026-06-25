# BL-4.03 — Practice tab merge (offload brief)

> **Implementer:** Antigravity 2.0 / Gemini. **Independent check:** Claude (cross-family).
> Produced by Opus 2026-06-25. Follow the standing loop in
> `docs/agent-briefs/HANDOFF-antigravity-bl-4.x.md` + `LESSONS.md` (read LESSONS
> first; ask up-front on ambiguity; paste grep gates + a Brief-feedback block in the PR).
> Branch `fix/bl-4.03-practice-merge`. PR to main, DO NOT MERGE.
>
> **Decision (user 2026-06-25): MERGE** the two `#tab-practice` screens into one.
> **BL-3.05 stays SEPARATE** (the next item) — the AI Caddy already generates a
> *generic* plan today; BL-3.05 only adds personalisation. Do NOT bundle it here.
> Covers backlog **F5 (P1, the id collision) + N18 (the stale drill-form heading)**.

## Root cause (verified at HEAD)
Two `<div id="tab-practice" class="tab-content hidden">` exist — **index.html:186**
("🎯 Practice Caddy") and **index.html:1719** ("Practice Drills"). Duplicate HTML id.
The CSS rule `body[data-active-tab="tab-practice"] #tab-practice` (style.css:575)
matches **both**, so when the Practice tab is active **both screens render stacked**
(two headers, two bodies). No JS calls `getElementById('tab-practice')` (confirmed) —
so the risk is structural/visual, not JS breakage.

The two screens are **complementary and both fully wired** — neither may lose
functionality:
- **Block A — Caddy (index.html:186–271):** AI 3-step drill flow. IDs:
  `practice-state-empty`, `btn-generate-practice`, `practice-generate-error`,
  `practice-state-active`, `practice-category-badge`, `practice-target-metric`,
  `btn-reset-practice`, `practice-steps-list`, `practice-rating-section`,
  `practice-star-rating`, `btn-submit-rating`, `practice-state-loading`. Bound by
  `ui.js bindPracticeCaddyUI` + `ai.js bindAiGenerator` + `practice.js renderPracticeSteps`.
- **Block B — Practice Drills (index.html:1719–1850):** manual logging + coach +
  metrics + history. IDs: `drill-select`, `drill-date`, `practice-form-container`,
  `pf-title`, `pf-desc`, `form-log-practice`, `practice-dynamic-inputs`,
  `drill-live-total`, `btn-save-practice`, `player-coach-select`, `btn-save-coach`
  (BL-4.05 coach linkage), `practice-best-score`, `practice-avg-score`,
  `btn-email-coach`, `btn-export-practice`, `btn-ask-ai`, `practice-empty-state`,
  `practice-table-container`, `practice-history-tbody`. Bound by `practice.js`.

**Every inner element id is unique across the two blocks — only the `#tab-practice`
wrapper collides.** So the merge = put Block B's content inside Block A's single
wrapper, drop Block B's duplicate header, delete Block B's wrapper.

---

## ① Implementation prompt (Antigravity 2.0 / Gemini)

```
TASK: Merge the two duplicate #tab-practice screens in the Golf Handicap Tracker
into ONE coherent Practice screen, fixing the F5 id collision (both currently render
stacked) and the N18 stale drill-form heading. Branch fix/bl-4.03-practice-merge.
PR to main, DO NOT MERGE.

Read docs/agent-briefs/LESSONS.md first. The two screens are complementary and BOTH
fully wired — preserve EVERY inner element id and all functionality. The only thing
being removed is the duplicate WRAPPER id and Block B's redundant page header.

FIX 1 — Merge the markup (index.html). One #tab-practice, two sections.
  Anchors (both blocks end with a `<!-- PRACTICE DRILLS TAB END -->` comment):
    - Block A (Caddy): `<div id="tab-practice" class="tab-content hidden">` (~line 186)
      … its closing `</div>` immediately BEFORE the FIRST
      `<!-- PRACTICE DRILLS TAB END -->` (~line 271/272).
    - Block B (Drills): the SECOND `<div id="tab-practice" class="tab-content hidden">`
      (~line 1719) … its closing `</div>` before the SECOND
      `<!-- PRACTICE DRILLS TAB END -->` (~line 1850/1851).
  Do this:
    1. From Block B, take ONLY its `<div class="dashboard-grid" …> … </div>` element
       (the card stack containing "Log a Practice Session", coach selector, metrics,
       and Past Sessions — index.html ~1726–1848). Do NOT take Block B's
       `<div class="header"><h1>Practice Drills</h1>…</div>` (~1721–1724) — that
       duplicate page header is dropped (Block A's "🎯 Practice Caddy" header is the
       screen header).
    2. Insert that dashboard-grid INSIDE Block A's #tab-practice, immediately before
       Block A's closing `</div>`, separated by a divider so the two sections read as
       one screen, e.g.:
         <hr style="max-width:600px; margin:28px auto; border:none; border-top:1px solid var(--border-color);">
         <h2 class="section-title" style="max-width:600px; margin:0 auto 12px; padding:0 20px;">Log &amp; Track Sessions</h2>
       (then the moved dashboard-grid)
    3. DELETE Block B entirely — its `<div id="tab-practice">` wrapper, the dropped
       header, and its `<!-- PRACTICE DRILLS TAB END -->` comment. Afterwards exactly
       ONE `id="tab-practice"` and ONE `<!-- PRACTICE DRILLS TAB END -->` remain.
  Move the dashboard-grid VERBATIM — do not "fix" anything inside it (e.g. the
  pre-existing inline `display:none` on #practice-table-container and the !important
  CSS are out of scope; leave them).

FIX 2 — N18: wire the drill-form heading (src/practice.js, generatePracticeForm
  ~line 300). Today the function injects currentDrillDefinition.desc into
  #practice-dynamic-inputs (lines ~306–312) and never touches #pf-title / #pf-desc,
  so the heading is stuck on "Select a Drill Above" and the description shows twice.
  Change it to:
    - Set the real heading: at the top of generatePracticeForm (after the
      `if (!dynamicBody || !currentDrillDefinition) return;` guard):
        const pfTitle = document.getElementById('pf-title');
        const pfDesc  = document.getElementById('pf-desc');
        if (pfTitle) pfTitle.textContent = currentDrillDefinition.name;
        if (pfDesc)  pfDesc.textContent  = currentDrillDefinition.desc;
      (Use textContent — drill name/desc are app constants, but textContent is the
      safe default per LESSONS L2.)
    - REMOVE the now-duplicate descP block (the `const descP = document.createElement('p')`
      … `dynamicBody.appendChild(descP);` lines ~306–312) so the description shows
      once (in #pf-desc), not twice.

HARD CONSTRAINTS (Sydney Protocol):
  - Visibility stays state-driven via `body[data-active-tab]` + the `hidden` class.
    Do NOT add `.style.display` or `!important`, and do NOT edit style.css — the
    existing `#tab-practice` rule (style.css:575) works correctly once there is a
    single #tab-practice.
  - Preserve every inner element id and all event bindings (ui.js / practice.js /
    ai.js bind by those ids). No getFunctions/region calls. No state-contract changes.
  - This is the BL-4.03 merge ONLY. Do NOT touch the Caddy's generation logic
    (that's BL-3.05) or the coach/metrics/history JS — just relocate the markup.
  - Split into 2 commits: (1) FIX 1 markup merge, (2) FIX 2 N18.

ACCEPTANCE:
  - `npm run build` clean; `npm run test:unit` baseline unchanged (whs 10/10; mapped
    contracts still red).
  - GREP GATE (paste output in PR): exactly ONE id="tab-practice" remains —
    `grep -c 'id="tab-practice"' index.html` returns 1; and
    `grep -c 'PRACTICE DRILLS TAB END' index.html` returns 1.
  - Every inner id listed in the brief still present exactly once
    (`grep -c 'id="drill-select"' index.html` == 1, etc. — spot-check several).
  - Manual (if emulator): the Practice tab shows ONE screen — Caddy (generate / active
    drill) on top, then "Log & Track Sessions" (log form + coach + metrics + history)
    below; no stacked duplicate header; generate button still works; logging a session
    still writes to practice_rounds and appears in history; selecting a drill now sets
    #pf-title to the drill name and #pf-desc to its description (shown once).
  - PR description: the grep-gate output + a "Brief feedback" block.
  - NOTE in PR: the Caddy still generates a GENERIC plan (personalisation is BL-3.05,
    intentionally out of scope) — expected, not a regression.
```

## ② Independent check prompt (Claude — cross-family, NOT Gemini)

```
You are reviewing the BL-4.03 Practice-tab merge in a vanilla-JS/Firebase app. Two
duplicate id="tab-practice" screens (AI Caddy + manual Practice Drills) were merged
into one. I will paste the diff (index.html, src/practice.js). PASS/FAIL per item
with file:line evidence. Be skeptical.

1. ID COLLISION RESOLVED: Confirm exactly ONE id="tab-practice" remains
   (grep-confirm). FAIL if two remain or if the second was renamed to a new
   tab-content screen with no nav button (it must be MERGED into the first wrapper,
   not relocated as a separate screen).

2. NO LOST FUNCTIONALITY: Confirm Block B's full content survived inside the single
   #tab-practice — log form (drill-select, form-log-practice, practice-dynamic-inputs,
   btn-save-practice), coach selector (player-coach-select, btn-save-coach), metrics
   (practice-best-score/avg-score), export/Ask-AI (btn-export-practice, btn-ask-ai),
   and history (practice-table-container, practice-history-tbody). And Block A's Caddy
   states (practice-state-empty/active/loading + children) are intact. Spot-grep each
   id == 1. FAIL on any dropped id.

3. ONLY THE DUPLICATE HEADER DROPPED: Confirm Block B's `<div class="header"><h1>
   Practice Drills</h1>…</div>` was removed (not the Caddy header), and a divider/
   sub-heading separates the two sections. No inner content of the dashboard-grid was
   altered (the pre-existing inline display:none / !important are still there — out of
   scope).

4. N18: Confirm generatePracticeForm now sets #pf-title to currentDrillDefinition.name
   and #pf-desc to .desc via textContent, AND the old descP injection into
   #practice-dynamic-inputs was removed (description shows once, not twice). FAIL if
   pf-title/pf-desc are still orphaned or the desc now renders twice.

5. SYDNEY / SCOPE: No `.style.display` added, no `!important` added, no style.css edit,
   no getFunctions/region call. The Caddy generation logic (BL-3.05) and coach/metrics/
   history JS were NOT touched — markup relocation only. Build clean; test:unit baseline
   unchanged.

Output: items 1-5 PASS/FAIL + evidence, a "LOST FUNCTIONALITY" line (NONE / FOUND:…),
then verdict: SHIP / FIX-FIRST.
```
