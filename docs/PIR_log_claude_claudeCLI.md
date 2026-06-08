# PIR Log — Claude Lens (claudeCLI)
*Night 1 · 2026-06-08*

- **T+0:00** — Grepped for `classList`/`style.display` triads across `src/`
  to size the duplication surface (~25 hand-written sites located).
- **T+0:10** — Confirmed the canonical pathway exists and works
  (`AppState.activeTab` at `ui.js:259`, paired with `style.css:570-582`) —
  this became the baseline every other call site is measured against.
- **T+0:18** — Catalogued the `innerHTML = ''` + manual rebuild pattern across
  `admin.js`, `coach.js`, `competitions.js`, `card-render.js`.
- **T+0:24** — Flagged the `auth-v2.js` dual-lever sites as highest-priority —
  the `// Force hide`/`// Force show` comments indicate a *known* prior bug.
- **T+0:30** — Sequenced the refactor pathway (helpers → sweeps) and wrote
  `night1_claude_claudeCLI.md` and `backlog_claude_claudeCLI.md`.
- **Status:** Complete. Score: 45/100 Determinism, Medium-High Coupling.
