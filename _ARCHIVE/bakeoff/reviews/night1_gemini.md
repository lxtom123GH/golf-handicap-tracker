# Night 1 Deep Diagnostic Pass - Global Ingestion Topology

## 1. Macro Topology Overview
* **Systemic Determinism Rating (0-100%):** 70%
* **State Coupling Factor:** High. The application attempts to use a centralized state management (`AppState`), but many UI modules bypass this state and modify the DOM directly through imperative class toggling (`classList.add/remove('hidden')`) or inline styles (`style.display`). This creates multiple sources of truth and brittle couplings between UI logic and presentation state.

## 2. Structural Dependency Manifest

### Module Coordinates: `src/auth-v2.js` (lines 26-44, 154-204)
* **Bypass Code Signature:**
  ```javascript
  UI.btnLogin.style.display = 'none';
  UI.authOverlay.style.display = 'none'; // Force hide
  UI.mainApp.style.display = 'block'; // Force show
  ```
* **Structural Penalty:** Directly manipulates display styling to handle authentication views rather than relying on `data-active-tab` or global state. This makes authentication state invisible to the centralized AppState, circumventing the designated architectural pattern.

### Module Coordinates: `src/app-v4.js` (lines 135-168, 309-313)
* **Bypass Code Signature:**
  ```javascript
  customCourseGroup.classList.remove('hidden');
  modeHoleByHole.classList.add('hidden');
  UI.addRoundContainer.style.display = 'none';
  ```
* **Structural Penalty:** The `hidden` class toggle bypasses state-driven visibility. Logic to hide or show components is imperatively defined in event handlers rather than deterministically calculated from `AppState`. This causes fragmentation where components manage their own visual state independent of the application.

### Module Coordinates: `src/ai.js` (lines 70-75)
* **Bypass Code Signature:**
  ```javascript
  if (btnAiPlayer) btnAiPlayer.closest('section, div')?.style && (btnAiPlayer.style.display = 'none');
  ```
* **Structural Penalty:** Hardcodes display overrides. If global state attempts to manage these components based on user roles or feature flags, this override will conflict and lead to visual bugs.

### Module Coordinates: `src/ui.js` (lines 344-908)
* **Bypass Code Signature:**
  ```javascript
  if (UI.emptyState) UI.emptyState.classList.remove('hidden');
  if (stateLoading) stateLoading.classList.toggle('hidden', state !== 'loading');
  canvas.style.display = 'none';
  ```
* **Structural Penalty:** General utility and rendering functions manually toggle visibility classes and styles. While some components like loading states might be transient, embedding layout changes in imperative logic scattered across the file degrades the single-source-of-truth requirement.

### Module Coordinates: `src/style.css` (lines 868-869)
* **Bypass Code Signature:**
  ```css
  /* Remove hidden class on on-course tab during round */
  body.round-active #tab-oncourse.hidden {
      display: block !important;
  }
  ```
* **Structural Penalty:** The use of `!important` coupled with a global class (`body.round-active`) circumvents the state-driven `body[data-active-tab]` structure. This overrides the default visibility rules, creating an edge case that could interfere with standard tab transitions, mirroring the "Locker Room" issue documented in `AI_ARCHITECTURE.md`.
