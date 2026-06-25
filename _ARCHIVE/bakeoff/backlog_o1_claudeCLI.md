# Backlog — o1 Lens (claudeCLI)
*Determinism / ROI focus. Each fix sized to fit a ≤100-line PR chunk.*

| # | Target | Violation | Impact | Fix (chunk) |
|---|---|---|---|---|
| 1 | `state.js:60-83` | Proxy `set` trap is reference-equality only; array `.push`/`.splice` produce no `stateChange` | Silent reactivity gaps wherever a list is mutated in place | Add a `mutateList(key, fn)` helper that mutates a shallow copy then reassigns — re-arms the trap deterministically (~30 lines) |
| 2 | `practice.js:370-372` | `AppState.currentPracticeRounds.push(...)` inside `onSnapshot`, no reassignment | New rows can land without notifying subscribers | Replace with `mutateList('currentPracticeRounds', list => [...list, newRow])` (~10 lines) |
| 3 | `ui.js:622-623` | Correct pattern exists but is bespoke/local | Knowledge of the fix isn't reusable; next author won't find it | Promote this exact splice+reassign idiom into the shared helper from #1; this site becomes the first caller (~5 lines) |
| 4 | `style.css:869-870` vs `:570-582` | `!important` override fights the `data-active-tab` exclusivity contract | Two CSS authorities can claim `#tab-oncourse` simultaneously | Remove the `!important` rule; drive on-course visibility through an explicit `AppState.activeTab = 'tab-oncourse'` transition at round-start (`persistence.js:94`) (~15 lines) |
| 5 | `app-v4.js:309,313` | `style.display` toggle driven by inline `selectedUid === currentUser.uid` check | Visibility logic duplicated outside the state layer; hard to test in isolation | Derive `AppState.isViewingSelf` once, drive visibility via CSS keyed on a data attribute (~20 lines) |

## ROI Order
1 → 2 → 3 (compounding: the helper pays for itself the moment a second caller exists) → 4 → 5
