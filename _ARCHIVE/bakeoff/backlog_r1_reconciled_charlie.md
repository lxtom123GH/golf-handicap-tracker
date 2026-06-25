# Adversarial Peer Review: R1 Lens (Jules Engine vs. Claude CLI)

## I. The Peer Review Assessment

**Exhibit Alpha (Jules Engine):**
- **Assessment:** Alpha provides valid high-level architectural observations (e.g., deep state reactivity flaws, CSS visibility subversion), but fails to provide precise, verifiable coordinates. Alpha violates the strict structural contract by omitting file paths, line numbers, and actionable atomic scopes. This lack of specificity borders on a "Sydney Protocol" violation by providing an over-engineered generalized narrative instead of targeted, bounded ledger entries.

**Exhibit Bravo (Claude CLI):**
- **Assessment:** Bravo provides exceptional precision, correctly identifying asymmetric race conditions, conflicting logic, and exact line coordinates. Bravo explicitly links its findings to specific architectural edge cases without over-engineering. Bravo successfully catches the deep reactivity mismatch (`ui.js` vs `practice.js`) and the CSS/DOM manipulation conflicts (`style.css`, `auth-v2.js`) that Alpha only vaguely alluded to.

**Conclusion:** Exhibit Bravo is the superior artifact for actionable technical debt remediation. Alpha's findings, while conceptually aligned, are too abstract.

## II. The Blindspot Report

- **Alpha’s Blindspots (Caught by Bravo):**
  - Conflicting timer durations hiding the same `voiceOverlay` (`oncourse.js:724,727`).
  - Redundant DOM manipulation combining `classList` and `style.display` with explicit force flags (`auth-v2.js`).
  - CSS selector conflicts between `!important` global states and data-attribute driven states (`style.css`).

- **Bravo’s Blindspots (Caught by Alpha):**
  - None. Bravo successfully materialized Alpha's abstract architectural complaints (reactivity and DOM visibility) into precise, exact edge-case implementations.

## III. The Reconciled Master R1 Backlog

### 1. CSS State Subversion
- **Target:** `src/style.css` (Lines 869-870 vs 570-582)
- **Violation:**
  ```css
  body.round-active #tab-oncourse.hidden { display: block !important; }
  ```
  This conflicts with `body[data-active-tab="..."]` architecture, allowing an element to be forced visible while the state machine indicates it should be hidden.
- **Remediation Plan:** Remove the `!important` rule in `body.round-active #tab-oncourse.hidden`. Encode "round in progress" logically into the `activeTab` AppState machine rather than relying on a parallel, subverting `body` CSS class. (Chunk: ~20 lines).

### 2. Redundant DOM Mutation Overrides
- **Target:** `src/auth-v2.js` (Lines 153-157, 201-205)
- **Violation:**
  ```javascript
  UI.authOverlay.classList.add('hidden');
  UI.authOverlay.style.display = 'none'; // Force hide
  ```
- **Remediation Plan:** Collapse all redundant DOM visibility mutations strictly to `classList` (`.hidden`). Remove explicit `.style.display` overrides to preserve the single-source-of-truth established by the CSS utility classes. (Chunk: ~25 lines).

### 3. Asynchronous Timer Race Condition
- **Target:** `src/oncourse.js` (Lines 724, 727)
- **Violation:** Two different `setTimeout` durations (2500ms and 2000ms) hide the `voiceOverlay` on error paths without clearing the previous timer.
  ```javascript
  setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);
  // vs
  setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2000);
  ```
- **Remediation Plan:** Introduce a module-scoped variable `let voiceOverlayTimer;`. Call `clearTimeout(voiceOverlayTimer)` before assigning a new `setTimeout` block to ensure prior stale timers do not unexpectedly hide the overlay. (Chunk: ~10 lines).

### 4. Asymmetric State Reactivity Implementation
- **Target:** `src/ui.js` (Lines 622-623) vs `src/practice.js` (Lines 370-372)
- **Violation:** Incompatible reactivity hacks. `ui.js` forces the proxy via self-assignment (`AppState.liveRoundGroups = [...AppState.liveRoundGroups]`), whereas `practice.js` mutates the array via `.push()` and manually invokes the render cycle (`renderPracticeDashboard()`), circumventing the proxy completely.
- **Remediation Plan:** Standardize on a `mutateList` AppState helper to guarantee uniform deep reactivity across all array mutations without resorting to self-assignment or manual DOM renders. (Chunk: ~15 lines).