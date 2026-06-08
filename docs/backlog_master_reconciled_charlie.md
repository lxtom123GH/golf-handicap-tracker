# Adversarial Peer Review: Objective Truth Lens

## I. The Peer Review Assessment: Bravo vs. Alpha

**Verdict: Bravo suffers from high-altitude hallucination and severe scope deficit, while Alpha provides raw but mechanically sound telemetry.**

*   **The Fact-Grounding Failure:** Bravo fabricated line numbers and codebase behavior. Most egregiously, it claimed `src/social.js:23-31` contains unbounded Firestore `onSnapshot` listeners. A direct inspection confirms `social.js` uses strict one-time `getDocs` queries—no real-time listeners exist in that module.
*   **The De-Boilerplate Filter:** Bravo over-extrapolated simple static DOM updates. It classified basic UI loading strings (`list.innerHTML = 'Loading...'` in `coach.js` and `admin.js`) as complex "DRY violations" causing "O(n) perf costs," misrepresenting standard boilerplate as deep architectural rot.
*   **The Scope Deficit:** Bravo entirely missed the massive volume of imperative UI overrides (over 100+ instances) mapped meticulously by Alpha. While Bravo flagged a "dual-lever visibility" issue exclusively in `auth-v2.js`, it completely glazed over systematic `classList.add('hidden')` bypasses of the `body[data-active-tab]` contract in `analytics.js`, `notifications.js`, `wakelock.js`, and `oncourse.js`.

---

## II. The Reconciled Master Lens Backlog

### 1. AppState Proxy Mutation Leak
*   **Target:** `src/practice.js:369-371` & `src/state.js:60-83`
*   **Violation:** `AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });`
*   **Remediation Plan:** The shallow `AppState` proxy fails to detect in-place array mutations, silently dropping reactivity. Introduce a `mutateList` utility or strict reassignment pattern (e.g., `AppState.key = [...AppState.key]`) across mutative sites. Limit helper addition to < 30 lines.

### 2. Dual-Lever Visibility Overrides
*   **Target:** `src/auth-v2.js:153-157`
*   **Violation:** `UI.authOverlay.classList.add('hidden'); UI.authOverlay.style.display = 'none'; // Force hide`
*   **Remediation Plan:** Collapse component visibility exclusively to the `classList` token layer. Strip all imperative `.style.display` assignments across the auth module to restore single-authority styling in adherence to state-driven boundaries. (< 25 lines)

### 3. Exclusivity Contract CSS Collision
*   **Target:** `src/style.css:868-870`
*   **Violation:** `body.round-active #tab-oncourse.hidden { display: block !important; }`
*   **Remediation Plan:** Remove the `!important` directive which violently competes with the `data-active-tab` layout app contract. Enforce round-in-progress visibility entirely through the reactive `activeTab` state machine rather than CSS patches. (< 20 lines)

### 4. Unmanaged Async UI Mutation
*   **Target:** `src/notifications.js:53` & `src/oncourse.js:724`
*   **Violation:** `setTimeout(() => msgEl.classList.add('hidden'), 3000);`
*   **Remediation Plan:** Centralize ephemeral async handlers. Implement a timeout registry to explicitly call `clearTimeout()` before setting new UI overlay state, preventing race conditions and zombie closures upon rapid tab switching. (< 30 lines)

### 5. Rogue Component Visibility Bypasses
*   **Target:** `src/oncourse.js:103-111`
*   **Violation:** `if (hub) hub.classList.add('hidden');`
*   **Remediation Plan:** Refactor localized view closures to react to `AppState` enumerations (e.g., `currentTrackingMode`) rather than imperatively firing `.classList.add('hidden')` methods. Migrate in strict chunks of max 80 lines per feature block.

### 6. XSS-Vulnerable Boilerplate Injection
*   **Target:** `src/analytics.js:7,18,39,88`
*   **Violation:** `dispEl.innerHTML = '<p style="color:#ef4444;">Failed to load analytics.</p>';`
*   **Remediation Plan:** Eradicate unsanitized `.innerHTML` usage for static states. Replace with safe `document.createElement()` fragment patches or direct `.textContent` assignments to eliminate XSS risks and layout thrashing. (< 40 lines)
