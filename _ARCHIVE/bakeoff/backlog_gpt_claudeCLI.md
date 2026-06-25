# Backlog — GPT Lens (claudeCLI)
*Efficiency / bottleneck focus. Each fix sized to fit a ≤100-line PR chunk.*

| # | Target | Violation | Impact | Fix (chunk) |
|---|---|---|---|---|
| 1 | `oncourse.js:724,727,1519`, `score-input.js:166` | `setTimeout` handles discarded; no `clearTimeout` on retrigger | Rapid repeat-triggers stack timers that fight over the same element (see R1 Lens race-condition chain) | Store the handle, `clearTimeout` before scheduling a new one, at all 4 sites (~25 lines) |
| 2 | `state.js:66-74` | Every `AppState` write dispatches an unfiltered `window`-level `CustomEvent` | Cost scales as `(listeners) × (writes)`; high-frequency keys (e.g. `currentHole`) wake unrelated handlers | Add `detail.property`-based early-exit guidance/helper for subscribers, or split into per-key event names (~40 lines) |
| 3 | `competitions.js:215-216,298,585`, `admin.js:16-45`, `coach.js:65-281` | `innerHTML = ''` + full loop rebuild on every relevant state tick | O(n) DOM churn where O(Δ) suffices; visible jank on larger rosters/leaderboards | Shared with Claude Lens backlog #4/#5 — same `renderList` extraction also solves the perf complaint, just keyed differently (~70-90 lines, one PR serves both lenses) |
| 4 | `state.js:38-53` | Synchronous `JSON.parse(localStorage.getItem(...))` runs in the module-load hot path | Negligible today; becomes a first-paint cost if Llama Lens backlog #1 expands the persisted payload | Wrap in a microtask/idle-callback once the persisted payload grows beyond `playerClubs` (~10 lines, defer until #1 of Llama backlog lands) |

## Sequencing
1 (isolated, zero-risk) → 2 → 3 (coordinate with Claude Lens to avoid duplicate PRs) → 4 (blocked by Llama backlog #1)
