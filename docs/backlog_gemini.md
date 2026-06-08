
---
**[2024-06-08T02:35:00Z] GEMINI AUTOMATED DEBT SYNC**
* **Issue 1:** The `auth-v2.js` module forcibly overrides UI display state with direct style manipulation (`UI.mainApp.style.display = 'block'`), bypassing `AppState.activeTab`. Needs refactoring to emit a login event that sets `AppState.activeTab` and relies on `body[data-active-tab]` CSS visibility rules.
* **Issue 2:** E2E Test Suite failures require immediate investigation:
    * `async-coach.spec.js`: Multi-Context Interaction Suite failed.
    * `logic-boundaries.spec.js`: Time Travel future date validation failed.
    * `quota-guards.spec.js`: Rapid multi-click debounce protection failed.
    * `ui-ergonomics.spec.js`: Timeout on element visibility due to potential layout overlay issues.
