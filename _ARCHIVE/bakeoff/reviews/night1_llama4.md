# PIPELINE EFFICIENCY AUDIT — ARCHITECTURE: LLAMA 4
## Night 1 Deep Diagnostic Pass

### 1. Runtime Ingestion Profile
* **Reactivity Compliance Rating (0-100%):** 70%. The application uses a robust `AppState` Proxy to dispatch `stateChange` events globally. However, several UI modules still use manual overrides (like `.style.display = 'none'` or `.classList.toggle('hidden')`), partially bypassing the single source of truth (`document.body[data-active-tab]` or data-driven variables).
* **State Coupling Metric:** [Med] Event listeners heavily interact with `AppState` changes, but some components directly modify the DOM outside of the reactive state cycle. The rendering logic inside `stateChange` listeners (e.g., `renderOcPlayersList(newValue)` on `liveRoundGroups`) triggers DOM rebuilds that can cause layout thrashing if fired rapidly.

### 2. Resource & Pollution Manifest
Instances of manual UI overrides bypassing the state hook architecture:

* **Target Bounds:** `src/ai.js` (Lines 70-75)
* **Pollution Snippet:**
  ```javascript
  if (btnAiPlayer) btnAiPlayer.closest('section, div')?.style && (btnAiPlayer.style.display = 'none');
  if (btnAiCoach) btnAiCoach.style.display = 'none';
  if (btnAskAi) btnAskAi.style.display = 'none';
  if (btnCoachAiPlan) btnCoachAiPlan.style.display = 'none';
  ```
* **Performance Impact:** Causes forced reflows outside the state-driven cycle.

* **Target Bounds:** `src/auth-v2.js` (Lines 26-27, 43-44, 154-156, 202-204)
* **Pollution Snippet:**
  ```javascript
  UI.btnLogin.style.display = 'none'; // Force hide
  UI.mainApp.style.display = 'block'; // Force show
  ```
* **Performance Impact:** Authentication transitions bypass CSS-driven layout transitions, leading to potential style flashing.

* **Target Bounds:** `src/modules/event-binders.js` (Lines 480-483)
* **Pollution Snippet:**
  ```javascript
  simpleStats.classList.toggle('hidden', !isHub || !isSinglePlayer);
  document.getElementById('oc-leaderboard').classList.toggle('hidden', target !== 'leaderboard');
  ```
* **Performance Impact:** Directly mutates DOM classes instead of using reactive data-binding, increasing the risk of stale DOM states.

* **Target Bounds:** `src/oncourse.js` (Lines 442-452, 499-504)
* **Pollution Snippet:**
  ```javascript
  btnFIR.classList.toggle('btn-primary', editorState.fir);
  btnGIR.classList.toggle('btn-primary', editorState.gir);
  ```
* **Performance Impact:** Localized mutation that decouples button states from a broader unified view render, adding minor overhead during interactions.

* **Target Bounds:** `src/tempo.js` (Lines 122, 135)
* **Pollution Snippet:**
  ```javascript
  UI.tempoRing.style.display = 'block'; UI.tempoRing.style.animation = "none"; void UI.tempoRing.offsetWidth;
  UI.tempoCoreCircle.style.transform = "scale(1)"; UI.tempoRing.style.display = 'none'; UI.tempoRing.style.animation = "";
  ```
* **Performance Impact:** Forces a synchronous layout calculation (`void UI.tempoRing.offsetWidth`) which blocks the main thread, resulting in a measurable battery/performance penalty on mobile devices.

### 3. Verification of Memory Collection Boundaries
* Widespread use of `.addEventListener` inside dynamically generated elements (`src/modules/card-render.js` inside loops, `src/coach.js` dynamically appended elements).
* Without corresponding `.removeEventListener` calls or clearing container nodes properly, memory leaks are possible over prolonged PWA sessions, though using `.innerHTML = ''` mitigates this for child components when re-rendered.
