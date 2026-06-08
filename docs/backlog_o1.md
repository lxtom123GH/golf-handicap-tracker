## Architectural Debt (Identified during Night 1 Closure)

1.  **State-Driven UI Violation in CSS:** `body.round-active #tab-oncourse.hidden { display: block !important; }` in `src/style.css` forces visibility outside of `AppState` control. Needs removal/refactor.
2.  **Inline Style Visibility Overrides:** `style.display = 'block'` / `'none'` overrides exist across components (e.g., `src/app-v4.js`, `src/auth-v2.js`, `src/ui.js`, `src/ai.js`, `src/oncourse.js`). Refactor required to rely purely on `[data-active-tab]` or proxy listeners.
3.  **ClassList UI Overrides:** Widespread use of `.classList.remove('hidden')` and `.classList.add('hidden')` breaking state isolation (over 50 instances across codebase).
4.  **Async Microtask Race Conditions:** Unbounded `setTimeout` calls modifying DOM post-navigation in `src/oncourse.js`, `src/ui.js`, and `src/notifications.js` risking race conditions and UI corruption.
5.  **Broken Rate Limiting:** Double-tap rate limiting on "Generate AI Briefing" is currently non-functional (test failure).
6.  **Missing Future Date Validation:** The logic boundaries allowing future dates for round creation are currently failing to reject invalid data.
7.  **Async Coach Notification Failure:** Real-time state syncing between Player A and Coach B is completely dropping.
