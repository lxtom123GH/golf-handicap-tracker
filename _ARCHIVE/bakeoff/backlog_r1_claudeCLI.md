# Backlog — R1 Lens (claudeCLI)
*Boundary-logic / edge-case focus. Each fix sized to fit a ≤100-line PR chunk.*

| # | Target | Violation | Impact | Fix (chunk) |
|---|---|---|---|---|
| 1 | `style.css:869-870` vs `:570-582` | `!important` rule and `data-active-tab` selectors can both claim `#tab-oncourse` | Edge case: start a round, switch tabs → element forced visible while `data-active-tab` says otherwise | Remove the `!important` rule; encode "round in progress" as part of the `activeTab` state machine, not a parallel `body` class (~20 lines, coordinates with o1 backlog #4) |
| 2 | `auth-v2.js:25-28,42-45,153-157,201-205` | `classList` **and** `style.display` both mutate the same elements, with `// Force hide`/`// Force show` comments admitting the redundancy is intentional | Edge case: a future edit removes one lever, the other silently overrides every `.hidden`-class-based assumption elsewhere | Collapse to `classList` only (shared with Claude backlog #1/#2 — same fix, land as one PR) (~25 lines) |
| 3 | `oncourse.js:724,727` | Two different `setTimeout` durations (2500ms / 2000ms) hide the *same* `voiceOverlay` from different call paths | Edge case: trigger A then B within 600ms → B's timer fires, user reopens overlay, A's stale timer re-hides it with no user action | Cancel the prior timer before scheduling a new one (shared with GPT backlog #1 — same fix) (~10 lines) |
| 4 | `ui.js:622-623` vs `practice.js:370-372` | Same intent (append to an `AppState` array) implemented two incompatible ways — one re-arms the proxy trap, one doesn't | Edge case: a maintainer copies the non-reassigning pattern into new code; it "works" until a second mutation reveals the silent miss | Standardize on the `mutateList` helper (o1 backlog #1); this is the canonical example of *why* that helper must be the only way to mutate `AppState` lists (~0 lines net-new — enforced via the helper landing) |

## Sequencing
This ledger has **no independent items** — every row is the edge-case manifestation of a fix already proposed by another lens. Land in the order: o1 #1 (helper) → #4 here closes automatically → #1 here (coordinates with o1 #4) → #2 (= Claude #1/#2) → #3 (= GPT #1).
