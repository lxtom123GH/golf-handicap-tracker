1. **Synthesize State Transition Graphs**
   - Trace how `AppState.activeTab` changes (e.g., via `switchTab` in `src/app-v4.js` or `src/ui.js`) and how that updates `body[data-active-tab]`.
   - Cross-reference this with CSS rules like `.tab-content { display: none; }` and `body[data-active-tab="X"] #X { display: block !important; }`.
   - Identify conflicting state like `body.round-active #tab-oncourse.hidden { display: block !important; }`.

2. **Isolate Logical Contradictions**
   - Scan for explicit `style.display = 'none'` or `style.display = 'block'` that bypasses `AppState`.
   - Scan for `.classList.add('hidden')` and `.classList.remove('hidden')` applied to elements that should be controlled by `AppState.activeTab`.
   - Look for CSS side-effects like `body.round-active #tab-oncourse.hidden { display: block !important; }` causing the "previous tab to stay visible" bug (as noted in AI_ARCHITECTURE.md).

3. **Verify Component Visibility Rules**
   - Ensure the application follows: "Component visibility across the app must be governed exclusively by the `body[data-active-tab]` attribute and AppState proxies, avoiding isolated CSS toggles or visibility-controlling inline styles".

4. **Audit Asynchronous Microtasks**
   - Review `setTimeout`, `requestAnimationFrame`, and `Promise` calls in the `src/` directory. Check for potential out-of-order execution post-navigation (e.g., toast timeouts, ai delays, canvas updates).

5. **Generate Output Deliverables**
   - Create `docs/reviews/night1_o1.md` containing:
     - The Formal Closure Assessment (Logical Determinism Baseline, State Coupling Factor).
     - Structural Invalidation Ledger (Mathematical Boundary Failures, Contradictory Code Blocks, Failure Conditions).
   - This should follow the exact structure required.

6. **Session Teardown**
   - Run standard npm E2E scripts (`npm run test:e2e`).
   - Append execution logs to `docs/PIR_log_o1.md`.
   - Sync outstanding debt to `docs/backlog_o1.md`.
   - Execute the pre-commit instructions, and submit.
