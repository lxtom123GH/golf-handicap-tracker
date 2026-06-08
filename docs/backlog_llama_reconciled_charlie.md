# TECHNICAL DEBT BACKLOG — RECONCILED (CHARLIE)

## The Peer Review Assessment
**Exhibit Bravo (Claude CLI)** provided superior line-level precision and fewer false positives compared to **Exhibit Alpha (Llama 4)**.
- Bravo correctly identified deep architectural and offline-first state issues with actionable chunked fixes.
- Alpha caught several valid DOM pollution violations but hallucinated a `practice_plans` Firestore Rules query path in `bindPracticeCaddyUI` that isn't problematic because the query is pointing to the root collection `practice_plans`, whereas the rules define it under `/users/{userId}/practice_plans/{planId}`. Alpha's fix #4 is a recognized pattern for forcing CSS transition resets, though there are better ways.
- The reconciliation merges the DOM/Reflow insights from Alpha and the robust Offline-State architecture improvements from Bravo.

## The Reconciled Master Llama Backlog

### 1. State Hydration Loss (Offline-First Resiliency)
* **Target:** `src/state.js:38-53`
* **Violation:** Only `playerClubs` is mirrored to `localStorage`. Other ~30 `initialState` keys are memory-only.
* **Remediation Plan:** Add an explicit allow-list (`activeRoundId`, `liveRoundGroups`, `currentHole`, `currentRoundHoles`, `currentRoundCourseName`) mirrored on `stateChange`.

### 2. Unpersisted Round Transition
* **Target:** `src/persistence.js:94-103`
* **Violation:** `round-active` DOM class set on round start with no companion persistence write.
* **Remediation Plan:** Hook the round-start transition to write the allow-listed keys from #1 to storage.

### 3. Missing App Boot Hydration
* **Target:** App boot path
* **Violation:** No hydrate-from-storage step before Firestore listeners attach.
* **Remediation Plan:** Add a `hydrateFromStorage()` call before `whs.js`/`practice.js` listener setup.

### 4. Firestore Snapshot Overwrites Offline State
* **Target:** `src/whs.js:148-156`, `src/practice.js:360-372`
* **Violation:** `onSnapshot` populates state directly with no cached-read fallback.
* **Remediation Plan:** Confirm/enable Firestore's offline persistence in `firebase-config.js`; verify the snapshot's `fromCache` metadata is handled.

### 5. Stale Social Feed Roster
* **Target:** `src/social.js:23-31`
* **Violation:** `allUsersCache` built once via `getDocs`, no connectivity-aware refresh.
* **Remediation Plan:** Add an `online`/`stateChange` listener that invalidates `allUsersCache` on reconnect.

### 6. DOM Pollution & Reactivity Bypass
* **Target:** `src/oncourse.js` (FIR/GIR Buttons), `src/ai.js` (Lines 70-75), `src/auth-v2.js`, `src/modules/event-binders.js`, `src/tempo.js`
* **Violation:** Direct DOM class manipulations (`.classList.toggle`, `.style.display`) bypassing `AppState` reactivity.
* **Remediation Plan:** Migrate to purely use state-driven `body[data-active-tab]` or localized `data-state` hooks.

### 7. Event Listener Memory Leaks
* **Target:** `src/modules/card-render.js`, `src/coach.js`
* **Violation:** Missing explicit `removeEventListener` calls when destroying and regenerating views.
* **Remediation Plan:** Implement explicit cleanup for event listeners or utilize an Event Bus wrapper to prevent memory leaks on view regeneration.

### 8. Forced Reflow Elimination
* **Target:** `src/tempo.js`
* **Violation:** `void UI.tempoRing.offsetWidth` forces synchronous reflow.
* **Remediation Plan:** Utilize `requestAnimationFrame` or dual-class transitions to force CSS resets without blocking the main rendering thread.
