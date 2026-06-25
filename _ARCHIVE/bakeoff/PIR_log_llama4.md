# End-to-End Test Suite Execution Log

Test Suite Run Result: `npm run test:e2e`

### Failures Detected:
1. **The Double-Tap (tests/quota-guards.spec.js)**
   - `Error: locator.click: Element is not visible`
   - Element targeted: `#btn-generate-practice`
   - Component likely fails to render due to `FirebaseError: No matching allow statements` causing the UI to default to `stateEmpty` or crash before making the button interactive.
2. **UI Ergonomics Suite - Live Scoring +/- buttons (tests/ui-ergonomics.spec.js)**
   - `Test timeout of 30000ms exceeded.`
   - Element targeted: `#oc-course-select`
   - The dropdown for course selection never became visible, suggesting an issue with the Bootstrap or routing sequence inside `AppState` transition to `tab-oncourse`.
3. **Logic & Boundary Suite - Time Travel (tests/logic-boundaries.spec.js)**
   - Failed test.
4. **Multi-Context Interaction Suite - Simulate Real-time Coaching (tests/async-coach.spec.js)**
   - Failed test.

### Errors Captured in Logs:
* `[Practice Caddy] Load active fail: FirebaseError: No matching allow statements` - Emulator rules for Firestore `practice_plans` collection appear incomplete or mismatched.
* `[Practice Caddy] Generation error: FirebaseError: internal`
* `Failed to load resource: the server responded with a status of 400 (Bad Request)` - General API handshake failure on boot.

### System Assessment:
The architecture shows heavy reliance on isolated `classList.toggle` and manual `.style.display` modifications which bypass `AppState` validation. The E2E pipeline is catching several async timing and state-driven UI failures, pointing directly to technical debt within state management and DOM sync protocols.
