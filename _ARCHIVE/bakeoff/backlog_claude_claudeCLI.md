# Backlog — Claude Lens (claudeCLI)
*DRY / modularity focus. Each fix sized to fit a ≤100-line PR chunk.*

| # | Target | Violation | Impact | Fix (chunk) |
|---|---|---|---|---|
| 1 | `auth-v2.js:25-28,42-45` | Same element toggled via **both** `classList` and `style.display` in one branch | Two levers, one outcome — desyncs the moment either is edited alone | Drop the `style.display` half; `classList` + the existing `.hidden` CSS rule is sufficient (~10 lines) |
| 2 | `auth-v2.js:153-157,201-205` | `// Force hide` / `// Force show` comments mark *known* redundant dual-writes on `authOverlay`/`mainApp` | Documents the team already hit the desync bug and patched the symptom | Same collapse as #1, applied to these two blocks (~15 lines) |
| 3 | `ai.js:70-75,101,147-150`, `whs.js:156-157,209-214`, `ui.js:344-346,654-659`, `practice.js:152,158,166,219,321`, `coach.js:68` | ~25 hand-written `classList`/`style.display` toggles repeating the same triad | No single audited code path for "show/hide an element" | Extract `setVisible(el, show)` into `ui.js`; sweep call sites in batches of 8-10 files (~80 lines/chunk × 3 chunks) |
| 4 | `admin.js:16-45`, `coach.js:65-71,180-238,251-281,293-304` | `innerHTML = ''` + manual `forEach`/`appendChild` reimplemented per list | Same ~15-line pattern duplicated 6+ times; bugs fixed in one copy persist in the others | Extract `renderList(container, items, toRowFn, emptyMsg)`; migrate these two files first (~70 lines) |
| 5 | `competitions.js:215-228,298-327,585-599`, `card-render.js:15-49,55-87,93-135,143-160` | Same `renderList`-shaped duplication, larger surface | Highest-traffic render paths still hand-rolled | Migrate onto the helper from #4 once proven (~90 lines across 2 files) |

## Sequencing
1+2 (mechanical, de-risk auth first) → 3 (creates the shared primitive) → 4 → 5
