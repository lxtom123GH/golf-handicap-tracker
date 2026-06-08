# Backlog — Master Lens (claudeCLI)
*Blended ledger — the items every other lens converged on, ranked by leverage.*

| # | Target | Violation | Impact | Fix (chunk) |
|---|---|---|---|---|
| 1 | `state.js:60-83` + `practice.js:370-372` + `ui.js:622-623` | Reference-equality proxy silently misses in-place array mutation; one correct workaround exists but isn't shared | Root cause of the entire "reactivity gap" theme (o1, R1) | Land the `mutateList` helper first — it retroactively fixes/standardizes #2 below too (~30 lines) |
| 2 | `auth-v2.js:25-28,42-45,153-157,201-205` | Dual-lever (`classList` + `style.display`) visibility, with comments admitting it's a known patch | Highest-severity single instance — it's a *documented* prior bug fixed at the symptom layer (Claude, R1) | Collapse to `classList`-only across all 4 blocks (~25 lines) |
| 3 | `style.css:869-870` vs `:570-582` | `!important` CSS rule competes with the `data-active-tab` exclusivity contract | Second-highest severity — same "two authorities, one outcome" shape as #2, at the CSS layer (o1, R1) | Remove the override; encode round-in-progress visibility through the `activeTab` state machine (~20 lines) |
| 4 | `oncourse.js:724,727,1519`, `score-input.js:166` | Uncancelled `setTimeout` handles mutate shared elements | Produces the timer race R1 traced end-to-end | Cache + clear handles before rescheduling (~25 lines) |
| 5 | `admin.js`, `coach.js`, `competitions.js`, `card-render.js` (list-render call sites) | `innerHTML = ''` + manual rebuild duplicated 6+ times | Both a DRY violation (Claude) and an O(n) perf cost (GPT) — same fix serves two lenses | Extract `renderList(container, items, toRowFn, emptyMsg)`, migrate in 2 chunks (~70-90 lines each) |
| 6 | `whs.js:148-156`, `practice.js:360-372`, `social.js:23-31` | Firestore listeners with no schema guard / unsubscribe / proxy-routed cache writes | Gemini's full integration-risk surface — three sites, one normalizer+lifecycle fix | `normalizeRoundDoc`/`normalizeUserDoc` + stored `unsubscribe` handles (~55 lines combined) |
| 7 | `state.js:38-53` and the 30+ unmirrored `initialState` keys | Only `playerClubs` survives a refresh | Llama's offline-resilience gap; depends on #1 landing first (mirrors should go through the same mutation contract) | Allow-list mirror to storage + boot-time hydrate (~75 lines, two-part) |

## Why this order
\#1 and #2 are the two items every lens that touched reactivity or DOM-authority
independently flagged — they unblock or simplify everything below them
(notably, #7 should not be built on top of an unfixed #1). #3–#6 are each the
*single* highest-leverage fix for their theme; #7 is last because it is the
largest surface and the most behavior-sensitive (round-resume UX).
