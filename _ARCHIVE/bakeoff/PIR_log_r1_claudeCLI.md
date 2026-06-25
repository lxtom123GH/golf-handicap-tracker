# PIR Log — R1 Lens (claudeCLI)
*Night 1 · 2026-06-08*

- **T+0:00** — Re-walked every finding surfaced by the other lenses through a
  "what's the worst-case interleaving" filter rather than searching fresh —
  this lens is a stress-test of existing evidence, not a new sweep.
- **T+0:10** — Chained the CSS-authority conflict
  (`style.css:869-870` vs `:570-582`) to a concrete user action sequence
  (start round → switch tab) to prove it's reachable, not theoretical.
- **T+0:18** — Chained the `auth-v2.js` dual-lever pattern to a "future edit
  removes one lever" scenario — noted the `// Force hide`/`// Force show`
  comments as evidence the team already lived through this once.
- **T+0:25** — Chained the two `oncourse.js` timers (`:724` 2500ms, `:727`
  2000ms) to a concrete trigger-then-retrigger timeline showing the overlay
  can re-hide itself with no user action.
- **T+0:31** — Cross-compared `ui.js:622-623` against `practice.js:370-372` to
  show the *same intent* implemented two incompatible ways — the clearest
  single proof that there is no enforced reactivity contract.
- **T+0:36** — Wrote `night1_r1_claudeCLI.md` and `backlog_r1_claudeCLI.md`,
  explicitly noting every backlog row maps to a fix another lens proposed.
- **Status:** Complete. Score: 33/100 Determinism, Critical Coupling.
