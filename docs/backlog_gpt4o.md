# Night 1 Deep Diagnostic Pass - Operational Sprint Summary

## 1. Operational Sprint Summary
* **Compliance Baseline Score (0-100%):** 35%
  * *Rationale:* While the core `AppState` proxy exists and intercepts state changes, a significant portion of UI updates are triggered imperatively rather than reactively listening to `stateChange` events.
* **State Coupling Profile:** High
  * *Rationale:* The application exhibits high rendering side effects, heavily relying on manual `.innerHTML`, `.style` overrides, and class toggles (`.classList.add('hidden')`) coupled directly with event handlers, rather than declarative state-driven rendering.

## 2. Actionable Technical Debt Backlog

* **Ticket Reference ID:** `src/modules/event-binders.js:321`
* **Issue Description:** Direct raw DOM write (`innerHTML`) on `UI.ocDailyHandicapLine` bypassing proxy state.
* **Priority Level:** Critical

* **Ticket Reference ID:** `src/modules/event-binders.js:483`
* **Issue Description:** Manual UI layout override using `.classList.toggle('hidden')` instead of relying exclusively on `body[data-active-tab]` attribute logic for navigation layers.
* **Priority Level:** High

* **Ticket Reference ID:** `src/ui.js:270`
* **Issue Description:** Raw DOM mutation (`info.innerHTML`) used to refresh settings UI. Violates XSS prevention patterns and bypasses state reactivity.
* **Priority Level:** Critical

* **Ticket Reference ID:** `src/oncourse.js:813`
* **Issue Description:** Potential async disconnection risk with `setInterval` for `audioTimerInterval`. While cleared locally on stop, if the component unmounts or the round aborts unexpectedly, the interval may leak and not be garbage collected properly.
* **Priority Level:** Medium

* **Ticket Reference ID:** `src/oncourse.js:101-120`
* **Issue Description:** Extensive use of manual styling class swaps (`.classList.remove('hidden')`, `.classList.add('hidden')`) to control visibility of layout components like setup, hub, and jumper, instead of using state-driven `data-active-tab` rules.
* **Priority Level:** High

* **Ticket Reference ID:** `src/modules/card-render.js:15-156`
* **Issue Description:** Extensive raw DOM writes via `.innerHTML` assignments in loops for rendering tables and buttons, causing layout thrashing and bypassing reactive state updates.
* **Priority Level:** Critical
