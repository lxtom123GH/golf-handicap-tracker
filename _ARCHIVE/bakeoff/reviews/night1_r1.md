# Night 1: Deep Diagnostic Pass - Reactivity & State Enclosure
**Status:** COMPLETE
**Target:** Core Reactivity and State Ingestion Enclosure.

## 1. Adversarial State Evaluation
* **Ingestion Integrity Rating (0-100%):** 65% (High Risk)
* **State Coupling Threat Vector:** [High] Multi-component cascading risk. State mutations and UI updates are fundamentally split.

## 2. Architectural Invalidation Manifest

**1. Explicit UI Contamination (Bypassing `data-active-tab`)**
* **Target Identity Bounds:** `src/style.css` (L900+) and `src/oncourse.js` (L100, L1182)
* **Non-Compliant Code Element:** `document.body.classList.add('round-active');` forcing `#tab-oncourse` to display.
* **Failure Vector:** Hardcoded visual override manipulates layout independently of AppState. `body.round-active #tab-oncourse.hidden { display: block !important; }` violates the `data-active-tab` design rule completely.
* **Systemic Risk Multiplier:** [Critical Failure] This fundamentally breaks the core state-driven UI promise and creates an untrackable visibility loop.

**2. Race Conditions & Event Propagation (Circular Event Cascades)**
* **Target Identity Bounds:** `src/ui.js` (L712+) `stateChange` listener
* **Non-Compliant Code Element:** `case 'activeTab': document.body.dataset.activeTab = newValue; break;`
* **Failure Vector:** Event listener modifies the DOM directly upon proxy change. If multiple modules listen and react (like `persistence.js` triggering saves), async resolution can fall out-of-sync with DOM layout states.
* **Systemic Risk Multiplier:** [High Regression Risk] Event storming when multiple tabs try to render simultaneously.

**3. Bypassing Proxy Ingestion via Deep Object Mutation**
* **Target Identity Bounds:** `src/oncourse.js` (L262, L267, L272, etc)
* **Non-Compliant Code Element:** `p.simpleStats[AppState.currentHole].fwy = !p.simpleStats[AppState.currentHole].fwy;`
* **Failure Vector:** Direct mutation of nested properties within proxy objects (`AppState.liveRoundGroups[...].simpleStats[...]`). The Proxy `set` trap in `state.js` ONLY catches top-level property assignments. Deep mutations NEVER fire the `stateChange` event, causing silent state drift.
* **Systemic Risk Multiplier:** [Critical Failure] Core UI will not re-render when nested state changes, leading to ghost data.

**4. Explicit UI Rendering Bypasses**
* **Target Identity Bounds:** `src/auth-v2.js` (L155, L203, L221), `src/ai.js`, `src/competitions.js`, etc.
* **Non-Compliant Code Element:** `UI.mainApp.classList.remove('hidden');` and `UI.mainApp.style.display = 'block';`
* **Failure Vector:** Hundreds of hardcoded `.classList.remove('hidden')` calls exist across the codebase to manually force component visibility, directly bypassing any state-driven logic.
* **Systemic Risk Multiplier:** [High Regression Risk] The visual state is entirely decoupled from the actual proxy state, creating an unmanageable tangle of DOM modifications.
