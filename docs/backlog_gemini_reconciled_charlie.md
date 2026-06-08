# Reconciled Gemini Tech Debt Backlog

## I. The Peer Review Assessment

**Assessment Summary:**
* **Exhibit Alpha (Jules Engine)** accurately diagnosed a genuine violation of the project's state-driven UI paradigm: the manual display toggling in `auth-v2.js` that bypasses the `AppState.activeTab` observer. However, Alpha miscategorized E2E test failures as "technical debt" rather than standard testing regressions, lacking insight into backend state boundaries.
* **Exhibit Bravo (Claude CLI)** provided superior, deep-level analysis regarding Firebase schema validation and reactivity constraints. It correctly identified severe issues where the shallow `AppState` proxy was bypassed via deep array mutations (`.push()`) and direct assignments in `practice.js`, `social.js`, and `app-v4.js`. It also accurately caught XSS vulnerabilities in `admin.js`.
* **The Hallucination:** Bravo's Item 1 regarding `whs.js:148-156` was a hallucination. The code *does* correctly store and invoke the `unsubscribeWHS` handle prior to re-querying. This entry has been purged from the master backlog.

## II. The Reconciled Master Gemini Backlog

| # | Target | Violation | Remediation Plan |
|---|---|---|---|
| 1 | `src/auth-v2.js:156, 204` | `UI.mainApp.style.display = 'block';` | Remove inline style modifications. Emit a login success event that updates `AppState.activeTab = 'dashboard'`, allowing the `body[data-active-tab]` CSS architecture to manage display. (≤15 lines) |
| 2 | `src/practice.js:360-372` | `AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });` | Replace direct array mutation with `mutateList` (or reassign a new array). Add a `normalizeRoundDoc(docSnap)` shape checker before merging. (≤30 lines) |
| 3 | `src/social.js:23-31` | `AppState.allUsersCache.push({ uid: d.id, ...d.data() });` | Use array reassignment or a mutation helper to update `allUsersCache`. Validate payload structure via `normalizeUserDoc`. (≤25 lines) |
| 4 | `src/admin.js:24, 55, 155` | `<td>${data.displayName \|\| 'N/A'}</td>`<br>`<td>${data.email}</td>` | Refactor the rendering loop to use `document.createElement()` and `.textContent` for dynamic values to prevent XSS. (≤35 lines) |
| 5 | `src/app-v4.js:369-386` | `AppState.profileUsersMap[d.id] = opt.textContent;` | Assemble the cache in a local object, then reassign `AppState.profileUsersMap = {...newCache}` to trigger observers. Normalize records. (≤15 lines) |
