# GOLF HANDICAP TRACKER - INTEGRATED MASTER BACKLOG (SUPERMAGIC MERGE)

## Priority: Critical (Reactivity & Architecture Bypasses)

- [ ] **State Mutation Drift:** `src/oncourse.js` (L262-272). Deep mutation of nested properties (`p.simpleStats[...].fwy = ...`) bypassing the `AppState` Proxy `set` trap.
  - *Action:* Enforce explicit array reassignment or flat updates to trigger global `stateChange` events properly.
- [ ] **CSS Reactivity Override:** `src/style.css` (L868-869). `body.round-active #tab-oncourse.hidden { display: block !important; }` violates `data-active-tab` design rule completely.
  - *Action:* Remove the `!important` CSS rule. Rely entirely on `body[data-active-tab="tab-oncourse"]`.
- [ ] **Auth State Bypass:** `src/auth-v2.js` (L25-44, 154-204). Complete bypass of `AppState` for UI toggling (`style.display`, `classList.remove`).
  - *Action:* Sync auth overlay to `AppState.activeTab = 'auth'` and data attributes.
- [ ] **Async UI Corruptions:** `src/oncourse.js` (L724-727). Race condition where `setTimeout` alters UI visibility independent of `AppState`.
  - *Action:* Tie timeout logic strictly to state data expiration, preventing ghost state rendering if a user navigates away.

## Priority: High (XSS & Direct Layout Mutations)

- [ ] **Admin Rendering Vulnerability:** `src/admin.js` (L16-53). Iterative string building and `.innerHTML` updates bypassing state listeners.
  - *Action:* Isolate to `src/modules/admin-render.js` (under 100 lines) using `document.createElement()` and `replaceChildren()`.
- [ ] **Analytics Component Sprawl:** `src/analytics.js` (L7-88). Manual component toggles and `.innerHTML` writes.
  - *Action:* Convert layout rendering to state-mapped pure DOM nodes.
- [ ] **DOM Thrashing in Social/Card Render:** `src/modules/card-render.js` (L15-156) & `src/social.js` (L42-98).
  - *Action:* Replace all `.innerHTML` loops with `DocumentFragment` construction.
- [ ] **Competition State Rendering:** `src/competitions.js` (L43-100).
  - *Action:* Move UI generating logic to `src/modules/comp-render.js`, driven by `AppState.activeComp`.

## Priority: Medium (CSS Inline Sprawl & Event Overload)

- [ ] **Event Storming:** `src/ui.js` (L712+). `stateChange` listener performs direct DOM manipulation causing multi-component layout thrashing upon Proxy updates.
  - *Action:* Debounce updates or use specialized targeted render dispatchers based strictly on `key` parameters.
- [ ] **Memory Collection Gap:** `src/oncourse.js` (L813). Async `setInterval` (`audioTimerInterval`) lacks rigorous unmount cleanup.
  - *Action:* Implement deterministic lifecycle cleanup on tab navigation away from `tab-oncourse`.
- [ ] **Inline Styling Sprawl:** `src/tempo.js` (L19-115) & `src/wakelock.js` (L50-55). Unencapsulated `.style.backgroundColor` and `.style.transform` calls.
  - *Action:* Replace with pre-calculated CSS utility classes toggled via declarative data bindings.
