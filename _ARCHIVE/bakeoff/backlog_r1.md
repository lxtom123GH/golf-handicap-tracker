### BL-3.10 🔴 Core State Reactivity Failure
`AppState` Proxy does not support deep reactivity. Mutations to deep objects (`liveRoundGroups`, `currentHoleShots`) bypass the proxy and do not trigger UI updates.
- **Fix:** Implement deep proxy tracking or rewrite state mutations to use top-level immutable updates.

### BL-3.11 🔴 State-Driven UI Subversion
Hundreds of manual DOM visibility toggles (`classList.remove('hidden')`) and overrides (`body.round-active`) exist, directly subverting the AppState `data-active-tab` architectural boundary.
- **Fix:** Standardize all visibility on `AppState` variables and data attributes.
