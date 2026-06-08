# Systemic Reactivity Baseline

## Mutation Determinism Score: 30%
The isolation of the data layer is relatively low. While `AppState` relies on a `Proxy` mechanism that successfully centralizes global state, many modules perform manual UI layout modifications (e.g. `style.display = 'none'` or DOM replacements) bypassing the central reactivity loop, which leads to unpredictable UI states. The heavy reliance on manual event listeners that dispatch non-reactive updates creates severe unreliability in component rendering cascades.

## State Coupling Breakdown:
*   **Architectural Bottleneck (Proxy Overload & Manual DOM Injection):** Changes to `AppState` dispatch a generic `stateChange` window event. Rather than relying on simple virtual DOM or template bindings, listener switches (like the one in `ui.js`) directly call bulky rendering functions (`renderRoundsHistory`, `renderTrendChart`, etc.).
*   **Rendering Cascades:** A single property change (e.g., `currentRounds`) rerenders the entire history DOM list and recreates a Chart.js instance. This creates heavy layout thrashing.
*   **Navigation Enclosure Breach:** The active tab is intended to be driven strictly by `body[data-active-tab]`. However, many files are missing proper tab data bindings and instead rely on hardcoded `style.display` injections or `.hidden` class toggles to fake component switching (e.g. AI module, Auth module).

# Technical Debt Manifest

* **Target:** `src/ai.js` lines 70-75
* **Violation:**
```javascript
if (btnAiPlayer) btnAiPlayer.closest('section, div')?.style && (btnAiPlayer.style.display = 'none');
if (btnAiCoach) btnAiCoach.style.display = 'none';
// ...
if (btnAskAi) btnAskAi.style.display = 'none';
// ...
if (btnCoachAiPlan) btnCoachAiPlan.style.display = 'none';
```
* **Impact:** Modifying component visibility via inline `display: none` violates the state-driven UI constraint. This causes unmanaged component state drift when views are reconstructed or toggled back, confusing the user and breaking layout contracts.

* **Target:** `src/app-v4.js` lines 309, 313
* **Violation:**
```javascript
UI.addRoundContainer.style.display = 'block';
// ...
UI.addRoundContainer.style.display = 'none';
```
* **Impact:** Directly updating `.style.display` bypasses the `AppState` central handler, leading to layout thrashing and creating multi-component rendering cascades disconnected from global application state.

* **Target:** `src/auth-v2.js` lines 26-27, 43-44
* **Violation:**
```javascript
UI.btnLogin.style.display = 'none';
UI.btnRegister.style.display = 'none';
// ...
UI.btnLogin.style.display = 'block';
UI.btnRegister.style.display = 'block';
```
* **Impact:** Hardcoded toggles via `display: none` / `block` cause the Auth layer to fall out of sync with the global app layout, occasionally hiding essential views permanently if navigation occurs during an active authentication cycle.

* **Target:** `src/auth-v2.js` lines 154, 156, 202, 204
* **Violation:**
```javascript
UI.authOverlay.style.display = 'none'; // Force hide
UI.mainApp.style.display = 'block'; // Force show
```
* **Impact:** These direct modifications are specifically annotated as "Force hide/show" and bypass UI boundaries, explicitly breaking the Navigation Enclosure rule. They conflict with `.hidden` utility classes and can cause the screen to enter a zombie visual state.

* **Target:** `src/oncourse.js` lines 847, 919
* **Violation:**
```javascript
btnAudio.style.display = "flex";
// ...
btnAudio.style.display = "block";
```
* **Impact:** Isolated CSS toggles inside complex module controllers cause visual fragmentation. The component visibility isn't tied to `AppState` or `data-active-tab`, making state prediction almost impossible.

* **Target:** `src/ui.js` lines 654, 658 (and duplicate in `src/whs.js` lines 209, 213)
* **Violation:**
```javascript
canvas.style.display = 'none';
// ...
canvas.style.display = '';
```
* **Impact:** Updating Chart.js canvas visibility with direct style manipulations creates flickering and conflicts with the parent container's layout metrics when rendered dynamically via `AppState` proxies.