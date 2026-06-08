# [GOVERNANCE LEADERBOARD & SYNTHESIS — THE SUPERMAGIC MERGE]

## 1. The Architectural Leaderboard

Based on analytical depth, code coverage efficiency, and line-number accuracy:

1. **Master (`night1_master.md`):** The definitive standard. Achieved the highest code coverage and accuracy, providing an exhaustive, file-by-file ledger of state bypasses with precise line numbers and failure classifications.
2. **R1 (`night1_r1.md`):** Exceptional analytical depth. Identified crucial architectural edge-cases like deep object mutations bypassing proxy ingestion and circular event cascades.
3. **Opus (`night1_opus.md`):** Excellent systemic evaluation. Correctly identified rendering cascade bottlenecks and proxy overload conditions leading to layout thrashing.
4. **O1 (`night1_o1.md`):** Strong on edge-case insights, specifically highlighting async microtask race conditions and mathematical boundary failures in CSS overrides.
5. **Llama 4 (`night1_llama4.md`):** Great resource and pollution manifest, specifically noting performance impacts (forced synchronous layouts) and memory collection boundary risks.
6. **GPT-4o (`night1_gpt4o.md`):** Good actionable backlog, identifying specific XSS vulnerabilities and async disconnection risks (e.g., `setInterval` leaks).
7. **Gemini (`night1_gemini.md`):** Solid macro topology overview and structural dependency manifest, but less exhaustive in direct code coverage compared to the others.

**Consensus Systemic Reactivity Score:** 35%
**State Coupling Assessment:** High (Critical Risk Multiplier). The application exhibits severe rendering side effects, relying heavily on manual DOM manipulation (`.innerHTML`), inline style overrides (`style.display`), and imperative class toggling (`.classList.toggle('hidden')`). This tightly couples UI state to event handlers rather than remaining declarative and state-driven, strictly governed by `AppState` and `body[data-active-tab]`.

## 2. Integrated Master Backlog (File-by-File Ledger)

*(Ensuring all atomic refactoring plans adhere strictly to the 100-line chunking policy per sub-file)*

### `src/admin.js`
* **L16-53 (Multiple):** High-Risk Bypass. Imperative DOM manipulation (`usersList.innerHTML`) untethered from reactive state. Vulnerable to XSS and layout thrashing.
* **Remediation:** Extract admin user list rendering to a dedicated `src/modules/admin-render.js` (< 100 lines). Use `document.createElement()` and `replaceChildren()` tied to `AppState.adminData` proxy listeners.

### `src/ai.js`
* **L28:** High-Risk Bypass. Raw `.innerHTML` assignment on `modalContainer`.
* **L70-75:** Critical Structural Leak. Manual `.style.display = 'none'` alters visibility independently of `body[data-active-tab]`.
* **Remediation:** Refactor visibility to rely on CSS rules mapped to `body[data-active-tab="ai"]`. Extract modal DOM creation to `src/modules/ai-modal.js`.

### `src/analytics.js`
* **L7-88:** High-Risk Bypass. Repeated `.innerHTML` overwrites for analyzing shot history and states.
* **Remediation:** Map explicitly via a structured layout module.

### `src/app-v4.js`
* **L135-158:** Critical Structural Leak. Manual `classList.add/remove('hidden')` overrides for `customCourseGroup`, `modeHoleByHole`, etc.
* **L309-313:** Critical Structural Leak. Isolated inline style toggles for `UI.addRoundContainer.style.display`.
* **Remediation:** Map all mode selections to `AppState.courseMode` and allow `stateChange` listeners to toggle data attributes on parent containers.

### `src/auth-v2.js`
* **L25-44, 154-204:** Critical Structural Leak. Bypasses app state completely to handle authentication views using `style.display = 'none'` and `.classList.remove('hidden')`.
* **Remediation:** Integrate auth states into `AppState.activeTab = 'auth'`. Map `UI.authOverlay` visibility to `body[data-active-tab="auth"]`.

### `src/coach.js`
* **L22-28:** Critical Structural Leak. `manageContainer.classList.add/remove('hidden')`.
* **L56-65:** High-Risk Bypass. `.innerHTML` assignments for coach lists.
* **Remediation:** Break down into `src/modules/coach-list.js` and `src/modules/coach-manage.js`. Replace `.innerHTML` with `replaceChildren()`.

### `src/competitions.js`
* **L43-45:** High-Risk Bypass. `.innerHTML` loops for select options.
* **L98-100:** Critical Structural Leak. Manual class toggles for `compContainer` and `activeCompView`.
* **Remediation:** Isolate rendering logic into `src/modules/comp-render.js`. Sync view toggles with `AppState.activeComp`.

### `src/modules/card-render.js`
* **L15-156:** Critical/High-Risk Bypass. Extensive raw DOM writes via `.innerHTML` assignments in loops for tables/buttons.
* **Remediation:** Refactor loops to use `DocumentFragment`, `document.createElement()`, and `.textContent` to prevent layout thrashing and XSS.

### `src/modules/event-binders.js`
* **L32-39, 90:** Critical Structural Leak. Imperative `classList.add/remove('hidden')` for `UI.btnOcQuickAdd` and `container`.
* **L103, 321:** High-Risk Bypass. `.innerHTML` writes.
* **L480-483:** High-Risk Bypass. DOM classes mutated directly based on variables rather than reactive data-binding.
* **Remediation:** Route mutations through `AppState` properties. Refactor direct DOM writes to use safe DOM manipulation methods.

### `src/modules/score-input.js`
* **L20-79:** Critical Structural Leak. Direct manipulation of `wizard.classList` and `puttingSection.classList`.
* **Remediation:** Bind wizard steps to `AppState.wizardStep` and use CSS attribute selectors.

### `src/notifications.js`
* **L20-53:** Critical Structural Leak. Manually manages banner visibility and styling outside state encapsulation.
* **Remediation:** Create `AppState.notification` object. Drive UI via a centralized toast renderer module.

### `src/oncourse.js`
* **L101-120:** Critical Structural Leak. Extensive use of class list swaps for layout components (setup, hub, jumper).
* **L262-272:** Critical Failure. Deep mutation of nested properties (`p.simpleStats[...].fwy = ...`) bypassing proxy `set` trap.
* **L442-452, 499-504:** Localized pollution. Direct `.classList.toggle` for `btnFIR` and `btnGIR`.
* **L724-727:** High Regression Risk. Async microtask race conditions (`setTimeout` modifying UI visibility).
* **L813:** Medium Risk. Async disconnection risk with `audioTimerInterval` leaking on unmount.
* **Remediation:** Flat state updates or explicit array reassignment to trigger Proxy. Remove timeouts altering UI directly; use state expiration. Ensure `setInterval` cleanup on tab unmount. Extract logic to keep file under 100 lines.

### `src/persistence.js`
* **L100-103:** Critical Structural Leak. Direct layout manipulation of `setupScreen`, `hubScreen`, `ocProgressBar`.
* **Remediation:** Let `stateChange` events drive these UI updates deterministically.

### `src/practice.js`
* **L152-219:** Critical Structural Leak. `logPracticeContainer` class list toggles.
* **L289:** High-Risk Bypass. Select option injection via `.innerHTML`.
* **Remediation:** Map UI container visibility to `AppState.practiceState`. Use DOM elements for options.

### `src/social.js`
* **L42-98:** High-Risk Bypass. `.innerHTML` wiped out DOM state, destroying event listeners.
* **Remediation:** Extract to `src/modules/social-render.js` utilizing `replaceChildren()`.

### `src/surveyor.js`
* **L37-68:** Critical Structural Leak. Direct `classList` alterations for container.
* **L97-110:** Moderate Debt. Direct style modification for `statusMsg`.
* **Remediation:** Drive surveyor visibility via `AppState.surveyorActive`. Use CSS classes for status colors.

### `src/style.css`
* **L868-869 (approx 391):** Critical Failure. `body.round-active #tab-oncourse.hidden { display: block !important; }` violates `data-active-tab` design rule completely.
* **Remediation:** Remove `!important` override. Visibility must be strictly dictated by `body[data-active-tab="tab-oncourse"]`.

### `src/tempo.js`
* **L19-115:** Moderate Debt. Extensive direct style modification (`opacity`, `transform`, `background`).
* **L122, 135:** Performance Penalty. Forces synchronous layout calculation (`void UI.tempoRing.offsetWidth`) blocking the main thread.
* **Remediation:** Use CSS animations and classes instead of inline style scripting.

### `src/ui.js`
* **L270, 339:** High-Risk Bypass. `.innerHTML` assignments for settings and history.
* **L344-908:** Critical Structural Leak. Manual toggling of `UI.emptyState` and `stateLoading`.
* **L654-658, 712+:** High Regression Risk. Direct DOM dataset modifications inside `stateChange` listeners, causing event storming.
* **Remediation:** Decouple DOM generation. Refactor `stateChange` switch to dispatch to specialized renderers.

### `src/wakelock.js`
* **L50-55:** Critical Structural Leak. Modifies `classList`, `.innerHTML`, and `.style` directly.
* **Remediation:** Sync with `AppState.wakelockActive` and standard CSS classes.

### `src/whs.js`
* **L156-179:** Critical Structural Leak. Toggles `loadingState` and `emptyState` explicitly.
* **L209-213:** Critical Structural Leak. Toggles chart canvas visibility with inline styles.
* **Remediation:** Derive loading/empty states automatically from data presence in the state-driven render cycle.
