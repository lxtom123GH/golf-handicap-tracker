# The Grand Synthesis: Master Supermagic Backlog (Jules Engine)

## I. The Architectural Verdict
The Reactivity and State Ingestion Enclosure is fundamentally brittle. A comprehensive cross-examination of 12 adversarial peer-reviewed ledgers reveals that the core state-driven UI paradigm is frequently subverted by downstream maintainers.

The primary architectural flaw is the `AppState` Proxy bounds in `state.js` being "shallow" by design (only tracking top-level assignment). This structural limitation has forced workarounds: some use in-place array mutations (`.push()`) that silently bypass reactivity, while others rely on redundant self-assignment hacks (`arr = [...arr]`). In parallel, the unified layout contract (`body[data-active-tab]`) has been broken by ad-hoc, imperative DOM manipulation (`classList.add/remove`, `style.display`, `!important` CSS overrides) spread across `auth-v2.js`, `oncourse.js`, and `style.css`. Finally, core state ingestion via Firestore `onSnapshot` lacks schema validation and cache-first persistence patterns.

This Master Backlog distills these disparate findings into unified, atomic (~100-line limit) remediation chunks, strictly prioritizing the enforcement of AppState boundaries, state ingestion protocols, and data-active-tab visual contracts.

---

## II. The Definitive Master Backlog

### 1. Shallow `AppState` Proxy Bounds & Deep Mutation Bypass
* **Target:** `src/state.js:60-83` (Root Cause), `src/practice.js:370-372`, `src/social.js:23-31` (Concrete Instances)
* **Violation:**
```js
// state.js — set trap only fires on top-level assignment:
set(target, prop, value) { target[prop] = value; /* dispatch stateChange */ }

// practice.js:370-372 — in-place mutation never reaches the trap:
AppState.currentPracticeRounds = [];
snapshot.forEach(docSnap => {
    AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });
});
```
* **Remediation Plan:** Introduce a `mutateList(AppState, key, fn)` utility in `state.js` that performs the mutation against a shallow copy and reassigns the array (e.g., `const copy = [...target[key]]; fn(copy); target[key] = copy;`). Refactor `practice.js` and `social.js` to utilize this utility instead of bare `.push()`, guaranteeing deterministic `stateChange` events while remaining inside Proxy bounds. (Chunk: ~30 lines).

### 2. `#tab-oncourse` Layout Contract Collision (State Machine vs. CSS)
* **Target:** `src/style.css` (Lines 869-870 vs 570-582)
* **Violation:**
```css
/* L570-582: state-machine-driven visibility */
body[data-active-tab="tab-oncourse"] #tab-oncourse, ... { display: block !important; opacity: 1 !important; ... }

/* L869-870: a second, independent lever that can win the cascade */
body.round-active #tab-oncourse.hidden { display: block !important; }
```
* **Remediation Plan:** Delete the `body.round-active #tab-oncourse.hidden` rule. Integrate the "round in progress" visibility logic directly into the `AppState.activeTab` state machine by transitioning `data-active-tab` to `tab-oncourse` when a round starts, thus restoring the `body[data-active-tab]` contract as the exclusive layout controller. (Chunk: ~20 lines).

### 3. Imperative Display Toggles Subverting the Layout Contract
* **Target:** `src/auth-v2.js` (Lines 25-28, 42-45, 153-157, 201-205)
* **Violation:**
```js
UI.authOverlay.classList.add('hidden');
UI.authOverlay.style.display = 'none';   // Force hide
UI.mainApp.classList.remove('hidden');
UI.mainApp.style.display = 'block';      // Force show
```
* **Remediation Plan:** Collapse redundant visibility mutations strictly to `.classList.add('hidden')` and eradicate all explicit `.style.display` overrides. Emit a login success event that correctly delegates app entry to `AppState.activeTab = 'dashboard'`, allowing the `body[data-active-tab]` CSS architecture to manage display cleanly. (Chunk: ~25 lines).

### 4. Core State Ingestion Lacking Schema Guards
* **Target:** `src/practice.js:360-372`, `src/social.js:23-31`
* **Violation:**
```js
// snapshot populates state directly with unvalidated payloads
snapshot.forEach(docSnap => {
    AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });
});
```
* **Remediation Plan:** Establish an explicit ingestion boundary by creating a `normalizeRoundDoc(docSnap)` and `normalizeUserDoc(docSnap)` shape-checker. Pipe all raw Firestore `docSnap.data()` reads through these pure functions before assigning them into the `AppState` store to ensure UI invariants. (Chunk: ~35 lines).

### 5. AppState Global Observer Broadcast Inefficiency
* **Target:** `src/state.js:66-74`
* **Violation:**
```js
if (oldValue !== value) {
    const event = new CustomEvent('stateChange', {
        detail: { property: prop, oldValue: oldValue, newValue: value }
    });
    window.dispatchEvent(event);   // global, unfiltered — every listener wakes on every write
}
```
* **Remediation Plan:** Refactor the proxy trap to emit property-specific namespaces (e.g., `stateChange:${prop}`) or introduce a lightweight subscription registry to `AppState`. This bounds the proxy's reactive scope so listeners only execute renders on relevant slice mutations, eliminating layout thrashing. (Chunk: ~20 lines).
