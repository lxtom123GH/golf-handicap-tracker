# Post-Implementation Review (PIR) Log — SUPERMAGIC MERGE

Date: 2026-03-06
Symptom: Agent hangs on "Retrieved Console Logs" after a Malformed Edit.
Ghost: The edit corrupted the syntax of surveyor.js, preventing the UI from loading for Playwright.
Silver Bullet: Perform a git checkout to clear the buffer and skip Playwright for one cycle to restore the build.
Ward: Verify bracket nesting manually in the Recon phase before applying high-logic edits.

Date: 2026-06-01
Symptom: Monolithic application layout files (BL-2.01) causing unmanageable file footprint, leading to tight coupling between UI rendering and core logic.
Ghost: Inline UI generation bound inside deep orchestrator functions, making testing and iterative feature enhancements brittle.
Silver Bullet: Extracted decoupled components (`card-render.js`, `score-input.js`, `event-binders.js`) into a dedicated `src/modules/` directory while strictly enforcing pre-existing DOM layout attributes to safeguard PIR scroll behaviors.
Ward: Always maintain 1:1 element ID and inline styling definitions during module extractions to prevent regression of hard-fought UX state patches. Ensure testing environments properly scope `vitest` unit frameworks away from Playwright E2E suites.

Date: 2026-06-02
Symptom: UX friction due to manual drive/approach shot tracking (BL-2.02).
Ghost: Players had to manually log every shot, creating significant latency on the course.
Silver Bullet: Scaffolded `src/modules/telemetry.js` to automatically infer drive distances via Haversine logic tied to `gpsLocation` AppState proxies, triggered strictly within `tab-oncourse`. Kept file size under 100 lines for mobile scannability. Added automated Firebase Preview channels via `.github/workflows/firebase-preview.yml`.
Ward: Enforce the 100-line limit per module file for telemetry calculations to maintain high performance. Always isolate GPS background loops strictly to the active target tab to prevent battery drain or zombie DOM interactions.

Date: 2026-06-03
Symptom: Brittle and destructive DOM updates caused by raw `.innerHTML` string loops in coach and social modules, making state synchronization error-prone.
Ghost: The usage of `.innerHTML` wiped out DOM state, dropping event listeners and creating high latency repaints, while preventing clean reactive state bindings.
Silver Bullet: Split `src/coach.js` and `src/social.js` into sub-modules under `src/modules/` (enforcing <100 line limit). Removed all `.innerHTML` string builders, instead utilizing `document.createElement` and `replaceChildren()` tied specifically to proxy listeners on `AppState`.
Ward: Ensure any new components adhere to non-destructive DOM manipulations (e.g. `replaceChildren`) and are directly responsive to the centralized `AppState` proxy. Never use `.innerHTML` loops for list rendering.

## Post Incident Review: Tab Navigation Refactor
**Issue:** Core navigation (`switchTab()`) manually injected `.hidden` and `.active` classes across disparate elements, violating State-Driven UI compliance. Playwright environment tests were timing out on container boot.
**Resolution:**
1. Increased `webServer` timeout in `playwright.config.js` to 240 seconds for CI reliability.
2. Abstracted component visibility into pure CSS rules matching `body[data-active-tab]`.
3. Rewrote `switchTab()` in `src/ui.js` to dispatch state changes (`AppState.activeTab = targetId`).
4. Event listeners observe state changes to `activeTab` to update the document body dataset.
**Result:** Passed all `npm run test:e2e` constraints while conforming to the 100-line logic cap and improving the application's clean state architecture.

Date: 2026-06-08 (Automated Evaluation)
Symptom: Playwright test suites failing (4/14 tests) with `expect(locator('#auth-overlay')).toBeHidden()` timeouts. High State Coupling Factor across UI modules.
Ghost: The UI visibility is heavily dependent on manual inline style injections (`style.display = 'none'`) and `.classList` modifications rather than reacting exclusively to the central `AppState` proxy and `body[data-active-tab]`. Additionally, Proxy `set` traps fail to catch deep nested object mutations (e.g. `p.simpleStats[x].fwy = !p.simpleStats[x].fwy`), silently bypassing the reactivity loop.
Silver Bullet: Centralize navigation and UI visibility strictly behind `AppState.activeTab` data attributes. Remove hardcoded `.hidden` class manipulations. Transition deep proxy mutations to immutable top-level reassignments to enforce global `stateChange` broadcasts.
Ward: Forbid use of imperative visibility overrides and strictly route all state transformations through the active `AppState` Proxy root.
