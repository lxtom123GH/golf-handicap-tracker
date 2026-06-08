# Night 1 — Master Lens Audit (claudeCLI)
**Focus:** Blended, uncompromising objective-truth pass over all 6 lenses

**Mutation Determinism Score:** 40 / 100 *(consensus, see supermagic for spread)*
**State Coupling:** High

> Rationale: every lens converged on the same root structural fact even though
> each one entered through a different door — **the codebase has exactly one
> correct, centralized visibility/reactivity pathway
> (`AppState.activeTab` → `data-active-tab` → CSS, proven at `ui.js:259` and
> `style.css:570-582`), and a long tail of call sites that quietly bypass it
> with bespoke `classList`/`style.display`/`innerHTML` writes.**

## Cross-Lens Convergence

| Theme | Surfaced by | Anchor evidence |
|---|---|---|
| Reference-equality proxy misses array mutations | o1, R1 | `state.js:60-83`, `practice.js:370-372` vs `ui.js:622-623` |
| `data-active-tab` contract fought by `!important` CSS | o1, R1 | `style.css:869-870` vs `:570-582` |
| Redundant dual-lever visibility (`classList` **and** `style.display`) | Claude, R1 | `auth-v2.js:25-28,42-45,153-157,201-205` |
| Wholesale `innerHTML` rebuild instead of incremental render | Claude, GPT | `admin.js`, `coach.js`, `competitions.js`, `card-render.js` |
| Firestore listeners with no schema guard / unsubscribe | Gemini | `whs.js:148-156`, `practice.js:360-372`, `social.js:23-31` |
| In-memory-only state with single-key persistence | Llama | `state.js:38-53` vs the other 30+ `initialState` keys |
| Uncancelled timers mutating shared elements | GPT, R1 | `oncourse.js:724,727,1519`, `score-input.js:166` |

## Master Verdict

This is **not** seven unrelated problem sets — it's one architectural gap
(no enforced single-mechanism contract for "change the UI in response to
state") refracted seven ways. The CSS race (`style.css:869-870`) and the
auth dual-lever (`auth-v2.js:25-28`) are the two highest-severity instances
because they're *known, intentional* workarounds (`// Force hide` /
`// Force show` comments, `!important` flags) — meaning the team has already
hit the underlying bug once and patched the symptom rather than the cause.

See `docs/MASTER_BACKLOG_supermagic_claudeCLI.md` for the deduplicated,
file-by-file remediation ledger with line-anchored fix code.
