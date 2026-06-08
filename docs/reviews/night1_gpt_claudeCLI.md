# Night 1 — GPT Lens Audit (claudeCLI)
**Focus:** Benchmarking · algorithmic efficiency · execution bottlenecks

**Mutation Determinism Score:** 50 / 100
**State Coupling:** Medium

> Rationale: the proxy-event model is cheap in isolation, but several render
> paths pay an O(n) full-teardown cost on every update, and a handful of
> `setTimeout`-driven DOM writes can pile up uncancelled under rapid navigation.

## Bottleneck Findings

- **Full teardown/rebuild on every render.** `container.innerHTML = ''` +
  loop-and-`appendChild` is the standing pattern for list rendering:
  `competitions.js:215-216,298,585` (leaderboard + recent rounds + regulars),
  `admin.js:16-45,149-161` (user table + email list),
  `coach.js:65-71,180-238,251-281,293-304` (roster, WHS table, practice table, notes),
  `card-render.js:15-49,55-87,93-135,143-160`.
  Every state tick that touches these re-creates *all* rows even when only one
  changed — O(n) DOM churn where O(Δ) would do.
- **Global fan-out on every state write.** `src/state.js:66-74` dispatches a
  `window`-level `CustomEvent('stateChange')` for *every* property assignment.
  Cost scales as `(listener count) × (write frequency)` — with 30+ state keys
  and broad `addEventListener('stateChange', …)` subscriptions, narrow updates
  (e.g. `currentHole++`) wake up handlers that don't care about that key.
- **Uncancelled timers.** `oncourse.js:724` (`setTimeout(... , 2500)`),
  `:727` (`... , 2000)`), `:1519` (`... , 3000)`), and
  `score-input.js:166` (`setTimeout(() => toast.remove(), 2500)`) — none retain
  a handle to `clearTimeout`. Rapid repeat-triggers (e.g. spamming the voice
  button) stack timers that all eventually fire and fight over the same element.
- **Synchronous localStorage parse on module load.** `state.js:38-53` does
  `JSON.parse` on every app boot in the hot path before first paint — small
  today (`playerClubs`), but a footgun if the persisted payload grows (see
  Llama Lens recommendation to mirror more state here).

## Quick Wins (chunk ≤100 lines)

1. Cache `setTimeout` handles and clear-on-retrigger for the 4 sites above —
   mechanical, ~25 lines.
2. Add a `property` filter to high-frequency `stateChange` subscribers so
   per-hole updates don't wake leaderboard/roster listeners — ~40 lines.
3. Defer the leaderboard/roster full-rebuild conversions to Claude Lens's
   `renderList` extraction (shared root cause).
