# Night 1 — Supermagic Consolidation (claudeCLI)
*Synthesis of all 7 lens passes into one definitive baseline.*

## Architectural Leaderboard

Ranked by depth, accuracy, and efficiency of insight (1 = strongest):

| Rank | Lens | Why |
|---|---|---|
| 1 | **R1** | Only lens to chase findings to a *concrete reachable timeline* (e.g. "start round → switch tab → CSS race fires"). Turned 3 other lenses' static findings into proven edge cases. |
| 2 | **o1** | Found the actual root mechanism (`state.js:60-83` reference-equality gap) *and* the in-tree counter-example (`ui.js:622-623`) that proves the fix is already known to the codebase — highest signal-to-noise. |
| 3 | **Claude** | Correctly identified that a working canonical pathway exists (`ui.js:259`) and reframed every other finding as "bypass of a known-good lever" rather than a standalone bug — the most actionable refactor framing. |
| 4 | **Gemini** | Strong, narrow integration sweep; findings are real but lower blast-radius than the structural items above (schema guards vs. active race conditions). |
| 5 | **GPT** | Useful efficiency catalogue, but two of its four findings (timer leak, render-rebuild cost) were independently — and more sharply — surfaced by R1 and Claude respectively. |
| 6 | **Llama** | Valid and important (offline durability), but orthogonal to the "Sydney Protocol" reactivity-violation brief — more of an adjacent feature gap than a state-coupling defect. |
| 7 | **Master** *(self-assessed, excluded from ranking)* | Synthesis role — graded on the convergence map it produced, not original findings. |

## Consensus Baseline

**Systemic Reactivity Score: 39 / 100** *(median of the 6 independent lens scores: 38, 45, 41, 50, 47, 33)*

**State Coupling Assessment: High**
— Driven to consensus by three structural patterns every analytical angle
independently rediscovered:

1. **Dual-authority visibility** — the same element governed by two competing
   mechanisms (`classList` + `style.display` in `auth-v2.js`; `data-active-tab`
   CSS + `!important` override in `style.css`).
2. **Reactivity contract drift** — `AppState` array mutation handled two
   incompatible ways in-tree (`ui.js:622-623` reassigns to re-arm the proxy;
   `practice.js:370-372` does not).
3. **Untracked async side-effects** — `setTimeout`-scheduled DOM mutations
   with no cancellation, racing against user-driven state changes.

## Verdict

The "Sydney Protocol" (visibility driven exclusively by `body[data-active-tab]`
and `AppState` proxies) is **not absent from this codebase — it's incompletely
enforced**. A correct reference implementation exists for every violated rule
(`ui.js:259` for tab state, `ui.js:622-623` for list reactivity). The
remediation path is therefore narrower than a rewrite: standardize on the
patterns already proven in-tree and sweep the bypasses. See
`docs/MASTER_BACKLOG_supermagic_claudeCLI.md` for the line-anchored ledger.
