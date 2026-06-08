# Reconciled Technical Debt Backlog — o1 Lens

## 1. The Peer Review Assessment
**Exhibit Bravo (Claude CLI Output)** provided significantly superior line-level precision and deeper insight into the state logic. It correctly identified that the `AppState` Proxy's `set` trap only checks reference equality, which means array mutations like `.push()` silently bypass reactivity.

**Exhibit Alpha (Jules Engine Output)** correctly identified UI anti-patterns (such as CSS `!important` overrides and inline `style.display` toggles) but lacked specific line numbers and missed the critical architectural flaw in the Proxy implementation. Alpha did, however, capture broader systemic issues like async race conditions and validation gaps that Bravo missed.

**Blindspot Summary:**
* **Alpha's Blindspots:** Missed the root cause of the state determinism violation in `state.js` (Proxy trap missing deep reactivity for array methods like `.push()`).
* **Bravo's Blindspots:** Focused exclusively on determinism and UI state, missing broader systemic issues identified by Alpha (e.g., unbounded `setTimeout` microtasks, missing date validation, and broken rate limiting).

## 2. The Reconciled Master o1 Backlog

| Target | Violation | Remediation Plan |
|---|---|---|
| `src/state.js:60-83` | `Proxy set trap is reference-equality only; array mutations bypass stateChange` | Add a `mutateList(key, fn)` helper to the `AppState` that performs a shallow copy, mutates, and reassigns to deterministically re-arm the proxy trap. (≤100 lines) |
| `src/practice.js:370-372` | `AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });` | Refactor to use the new list mutation helper: `AppState.mutateList('currentPracticeRounds', list => [...list, newRow])` to ensure reactivity. (≤100 lines) |
| `src/ui.js:622-623` | `AppState.liveRoundGroups.splice(index, 1); AppState.liveRoundGroups = [...AppState.liveRoundGroups];` | Promote this bespoke reassignment idiom to the shared `mutateList` helper to standardize list updates across the app. (≤100 lines) |
| `src/style.css:869-871` | `body.round-active #tab-oncourse.hidden { display: block !important; }` | Remove the `!important` override. Drive the on-course visibility strictly through the `[data-active-tab]` attribute and AppState transitions. (≤100 lines) |
| `src/app-v4.js:309-313` | `UI.addRoundContainer.style.display = 'block';` / `'none';` | Remove inline styles. Derive `AppState.isViewingSelf` and use a data attribute on the container, styling visibility purely through CSS. (≤100 lines) |
| `src/oncourse.js`, `src/ui.js` | Unbounded `setTimeout` microtasks modifying DOM post-navigation. | Centralize async post-navigation DOM updates using explicit state observers or bounded lifecycle handlers instead of free-floating `setTimeout`s. (≤100 lines) |
| `src/ai.js` | "Generate AI Briefing" double-tap rate limiting non-functional. | Implement a robust debounce or state-locking mechanism (`AppState.isGeneratingAIBriefing = true`) to prevent concurrent requests. (≤100 lines) |
| `src/app-v4.js` | Missing future date validation for round creation. | Inject a date boundary check (`selectedDate <= today`) before adding new round data to `AppState`. (≤100 lines) |
