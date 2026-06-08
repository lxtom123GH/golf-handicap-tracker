# Master Lens Technical Debt: Reconciled Peer Review

## 1. The Peer Review Assessment

An adversarial audit of Exhibit Alpha (Jules Engine) and Exhibit Bravo (Claude CLI) reveals distinct strengths and weaknesses in their respective technical debt ledgers:

* **Exhibit Alpha (Jules Engine):** Delivered the most uncompromising, accurate, and code-grounded baseline. It correctly isolated exact files and lines (e.g., `src/admin.js:16`, `src/surveyor.js:37`) demonstrating pervasive structural leaks (`.innerHTML` assignments and manual `.classList` toggles). **Zero hallucinations were detected.** Every referenced snippet exists exactly as claimed.
* **Exhibit Bravo (Claude CLI):** Contributed critical architectural insights (the Proxy deep-mutation trap, CSS exclusivity bypasses) but suffered from severe hallucinations. It falsely flagged non-existent files (`score-input.js`, `card-render.js`) and mischaracterized Firestore listener lifecycles (claiming missing unsubscribes in `whs.js` and `practice.js` when the actual code correctly implements `unsubscribeWHS` and `unsubscribePractice`).
* **Conclusion:** Exhibit Alpha acts as the objective source of truth for execution-level debt. Exhibit Bravo provides valid system-level architectural observations. This reconciled backlog synthesizes Bravo's valid architectural insights with Alpha's precise code mechanics.

## 2. The Reconciled Master Lens Backlog

### A. State Proxy Evasion (Deep Mutations)
* **Target:** `src/practice.js:370-372` (and related `AppState` assignments)
* **Violation:** `AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });`
* **Remediation Plan:** The shallow `AppState` Proxy fails to trap in-place array mutations (`.push()`). Refactor to enforce top-level reassignment (e.g., `AppState.currentPracticeRounds = [...currentRounds, newItem]`) so the proxy can detect the change and broadcast `stateChange` events (~30 line chunk).

### B. Dual-Lever Visibility Coupling
* **Target:** `src/auth-v2.js:25-28, 42-45, 153-157, 201-205`
* **Violation:**
  ```javascript
  UI.registerFields.classList.remove('hidden');
  UI.btnLogin.style.display = 'none';
  ```
* **Remediation Plan:** Consolidate UI visibility logic. Remove imperative inline styling (`style.display = 'none'`) and rely strictly on the existing `classList` definitions or the overarching `body[data-active-tab]` contract (~25 line chunk).

### C. CSS Exclusivity Contract Bypass
* **Target:** `src/style.css:869-870`
* **Violation:**
  ```css
  body.round-active #tab-oncourse.hidden { display: block !important; }
  ```
* **Remediation Plan:** Remove the `!important` tag. Encode the "round-in-progress" display override through the `AppState.activeTab` state machine rather than bypassing the central `data-active-tab` CSS enclosure (~20 line chunk).

### D. Untethered Timer Mutations
* **Target:** `src/oncourse.js:724, 727, 1519`
* **Violation:** `setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);`
* **Remediation Plan:** Untracked timers altering DOM state cause race conditions on tab switch. Implement a module-level variable to store the timer ID, clearing it (`clearTimeout`) before scheduling a new overlay hide or unmounting the view (~25 line chunk).

### E. Imperative DOM Generation (XSS & Layout Thrashing Risk)
* **Target:** `src/admin.js:16-24` (and mirrored instances in `social.js`, `coach.js`)
* **Violation:** `if (usersList) usersList.innerHTML = '<tr><td colspan="5">Loading users from Firestore...</td></tr>';`
* **Remediation Plan:** Extract a shared `renderList` utility that utilizes `DocumentFragment`, `document.createElement()`, and `.textContent`. Replace all `.innerHTML` list rendering to prevent XSS injection and eliminate repeated DOM thrashing. Migrate in strict, isolated chunks per file (~70-90 lines each).

### F. Manual View State Overrides
* **Target:** `src/surveyor.js:37, 68` and `src/ui.js:344-346`
* **Violation:** `if (container) container.classList.remove('hidden');`
* **Remediation Plan:** Refactor sub-view toggling. These components manually overwrite visibility instead of reacting to `AppState`. Tie visibility updates into a listener attached to the `stateChange` custom event to maintain deterministic rendering (~40 line chunk).
