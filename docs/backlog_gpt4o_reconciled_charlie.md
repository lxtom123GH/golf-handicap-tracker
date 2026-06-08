# Adversarial Cross-Examination — Reconciled Charlie Backlog

## I. The Peer Review Assessment

**Exhibit Alpha (GPT-4o)**
* **Precision & Depth:** High accuracy on architectural boundaries. Correctly identified multiple violations of the state-driven UI paradigm (e.g., bypassing `body[data-active-tab]` in favor of manual `.classList.add('hidden')`).
* **Blindspots:** Focused heavily on declarative DOM mutations but missed the runtime memory leak / race condition risks related to transient `setTimeout` wrappers. Missed the overarching `AppState` dispatch bottleneck.
* **False Positives:** None. Line bounds align closely with actual logic blocks.

**Exhibit Bravo (Claude CLI Lens)**
* **Precision & Depth:** Superior focus on algorithmic efficiency and JavaScript runtime bottlenecks (e.g., synchronous `JSON.parse` on hot path, unfiltered `window`-level events).
* **Blindspots:** Overlooked the `setInterval` disconnection risk in the audio diary system. Failed to address the structural requirement for `data-active-tab` based UI navigation.
* **False Positives:** None. Line bounds and issues match the source code accurately.

**Synthesis:** Bravo provided deeper insights into runtime performance and event bus scaling, while Alpha excelled at enforcing the project's state-driven UI and XSS-prevention architecture.

---

## II. The Reconciled Master GPT-4o Backlog

### Target: `src/oncourse.js:101-120` & `src/modules/event-binders.js:480-490`
* **Violation:** Manual class swaps bypassing state-driven UI: `document.getElementById('oncourse-setup').classList.remove('hidden');` and `.classList.toggle('hidden')`
* **Remediation Plan:** Refactor navigation events and cleanup routines to dispatch `AppState` mutations, relying on `body[data-active-tab]` CSS rules for component visibility instead of direct classlist manipulation.

### Target: `src/state.js:66-74`
* **Violation:** Unfiltered global dispatch on every proxy write: `window.dispatchEvent(new CustomEvent('stateChange', { detail: { property: prop... } }));`
* **Remediation Plan:** Implement a lightweight subscription registry or specific per-property event keys (e.g., `stateChange:currentHole`) inside the `AppState` proxy setter to prevent O(n) wakeups for unrelated UI components.

### Target: `src/oncourse.js:724-727, 810-817, 1519` & `src/modules/score-input.js:166`
* **Violation:** Unmanaged async primitives: `setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);` and `audioTimerInterval = setInterval(...)` without robust unmount cleanup.
* **Remediation Plan:** Introduce a centralized async registry (or local module scope variables) to store timer handles. Enforce `clearTimeout` / `clearInterval` calls before re-triggering or component unmounting to prevent race conditions and memory leaks.

### Target: `src/modules/card-render.js:15-156` & `src/ui.js:270`
* **Violation:** Heavy synchronous DOM regeneration and XSS risks: `tbody.innerHTML = '';` followed by string concatenation in loops.
* **Remediation Plan:** Refactor rendering loops to use safe native DOM manipulation (`document.createElement()`, `DocumentFragment`, and `.textContent`) or surgical DOM patching instead of destructive `.innerHTML` assignments.

### Target: `src/competitions.js:215-216`, `src/admin.js:16-45`, `src/coach.js:65-281`
* **Violation:** High-frequency layout thrashing: `innerHTML = ''` + full loop rebuilds on every state tick for large lists.
* **Remediation Plan:** Extract a shared `renderList` diffing utility to update only the changed row elements (O(Δ) complexity) rather than wiping and rebuilding the entire O(n) node tree on each update.

### Target: `src/state.js:35-55`
* **Violation:** Synchronous main-thread parsing on boot: `initialState.playerClubs = JSON.parse(savedClubs);`
* **Remediation Plan:** Defer parsing of heavy LocalStorage payloads using a microtask or idle callback, loading only the strictly necessary UI shell state initially.
