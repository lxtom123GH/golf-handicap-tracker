# Night 1 — Claude Lens Audit (claudeCLI)
**Focus:** DRY principles · strict modularity · clean refactoring pathways

**Mutation Determinism Score:** 45 / 100
**State Coupling:** Medium-High

> Rationale: the codebase *has* a correct, centralized visibility lever
> (`AppState.activeTab`, `src/ui.js:259`, paired with the `data-active-tab` CSS
> contract at `style.css:570-582`). The score isn't lower because that pathway
> exists and works — it's because ~40+ call sites quietly route around it with
> their own bespoke `classList`/`style.display` calls instead of reusing it.

## Duplication / Modularity Findings

- **No shared visibility helper.** The same `el.classList.add('hidden')` /
  `.remove('hidden')` / `el.style.display = '...'` triad is hand-written at:
  `auth-v2.js:25-28,42-45,153-157,201-205`, `ai.js:70-75,101,147-150`,
  `whs.js:156-157,209-214,313-316`, `ui.js:344-346,654-659`,
  `app-v4.js:309-315`, `practice.js:152,158,166,219,321`, `coach.js:68`.
  A single `setVisible(el, show)` (or better, a state-bound directive) collapses
  all of these into one audited code path.
- **Redundant dual-mechanism toggles.** `auth-v2.js:25-28` and `:42-45` flip
  *both* `classList` **and** `style.display` for the same element in the same
  branch — two levers controlling one outcome is a DRY violation waiting to
  desync (fix one, forget the other).
- **Repeated render-teardown boilerplate.** `container.innerHTML = ''` followed
  by a manual `forEach`/`appendChild` loop is reimplemented near-identically in
  `admin.js:16-45`, `coach.js:65-71,180-238,251-281,293-304`,
  `competitions.js:215-228,298-327,585-599`, `card-render.js:15-49,55-87,93-135,143-160`.
  These are textbook candidates for one `renderList(container, items, toRowFn)`
  utility in `src/ui.js` or a new `src/modules/list-render.js`.

## Clean Refactor Pathway (≤100-line chunks)

1. Extract `setVisible(el, show)` into `src/ui.js`, sweep the ~40 call sites —
   mechanical, low-risk, ~80 lines touched per chunk of 8-10 files.
2. Extract `renderList(container, items, toRowFn, emptyMessage)`; migrate
   `admin.js` and `coach.js` first (they're the most repetitive), then
   `competitions.js`/`card-render.js` in a second pass.
3. Once both helpers exist, the `data-active-tab` contract becomes the *only*
   way to flip top-level views — everything else becomes a thin wrapper around
   `AppState.activeTab = ...` (already proven correct at `ui.js:259`).
