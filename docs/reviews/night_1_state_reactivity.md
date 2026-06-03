# Night 1: Core Reactivity & State Architectural Integrity

## Executive Health Score
**Health Score: 78% (Functional but Fragile in Edge Cases)**
The reactivity engine successfully orchestrates global updates via `AppState` proxies and `'stateChange'` events, forming a resilient core for the Golf PWA. However, significant technical debt remains due to raw DOM manipulation methods interleaving with state changes, and the missing implementation of strict `body[data-active-tab]` attribute boundaries.

## Reactive Lifecycle Map
1. **Trigger**: User interactions (e.g., scoring, navigation) invoke functions that mutate the `AppState` object.
2. **Proxy Trap**: The `AppState` Proxy in `src/state.js` intercepts the `set` operation.
3. **Dispatch**: If the value mutates, a global `CustomEvent('stateChange')` is fired.
4. **Listener Execution**: Sub-modules (e.g., `src/ui.js`, `src/modules/telemetry.js`) listen for specific `e.detail.property` changes and selectively run rendering loops or logic hooks.

## Technical Debt Ledger (Proxy Pattern Violations)
The following instances bypass state proxies via raw DOM overrides:
- **`src/app-v4.js` (Lines 140, 177, 179, 191, 358, 393)**: Direct `.innerHTML` injections used for rendering manual WHS tracking forms, bypassing reactive state logic.
- **`src/coach.js` & `src/social.js`**: Deep `.innerHTML` loops used to inject roster views and feed items rather than syncing an array to `AppState` and relying on an event listener.
- **`src/modules/card-render.js`**: `updateLiveLeaderboard()` destructively rebuilds `tbody.innerHTML` instead of performing targeted element updates, risking scroll reset loops and memory fragmentation during rapid updates.
- **`src/modules/telemetry.js`**: Relies on `document.querySelector('.tab-content.active')` instead of the mandated `body[data-active-tab]` structure to infer current application context.

## Priority Structural Fixes
1. **Standardize `body[data-active-tab]` Architecture**: Refactor `src/ui.js`'s `switchTab()` function to set `document.body.setAttribute('data-active-tab', targetId)` and update all context sniffers (like `telemetry.js`) to read from the body attribute.
2. **Refactor Destructive `.innerHTML` Renderers**: Convert heavy list renderers (e.g., `updateLiveLeaderboard` in `card-render.js` and coach rosters) to use granular DOM patching or state-bound `DocumentFragment` generation.
3. **Isolate Local UI State**: Move volatile UI states (like input box contents) out of raw DOM variables and into isolated UI-specific Proxy objects to prevent memory leaks during view destruction.
