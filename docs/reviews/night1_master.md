# MASTER ARCHITECTURAL GOVERNANCE AUDIT
**Date/Time:** Night 1
**Target Domain:** Foundational Reactivity, AppState Proxies, and Navigation Enclosure (`body[data-active-tab]`)

## 1. Core Structural Health Assessment
* **Reactivity Determinism Score (0-100%):** 35%
  * *Reasoning:* While the core `AppState` proxy exists and `body[data-active-tab]` correctly observes the `activeTab` property, the application relies predominantly on imperative DOM updates (`.innerHTML` assignments) and manual view toggles (`.classList.add('hidden')`) across controllers like `oncourse.js`, `app-v4.js`, and `admin.js` rather than strictly deriving view layouts from structured data.
* **State Coupling Metric:** High
  * *Reasoning:* Extensive cascade rendering side effects observed. Imperative DOM manipulation commands are tightly coupled with network requests, Promise resolutions, and asynchronous event listeners (`async_events.txt` flagged >200 asynchronous blocks tightly coupled with local UI updates). This increases the likelihood of layout thrashing and garbage collection leaks when tabs unmount before async execution finishes.

## 2. Comprehensive Technical Debt Matrix

**Target Workspace Range:** `src/admin.js:16`
**Divergent Code Snippet:** `if (usersList) usersList.innerHTML = '<tr><td colspan="5">Loading users from Firestore...</td></tr>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/admin.js:20`
**Divergent Code Snippet:** `if (usersList) usersList.innerHTML = '';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/admin.js:24`
**Divergent Code Snippet:** `tr.innerHTML = ``
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/admin.js:45`
**Divergent Code Snippet:** `if (usersList) usersList.innerHTML = '<tr><td colspan="5" style="color:#ef4444;">Error: Failed to fetch users.</td></tr>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/admin.js:53`
**Divergent Code Snippet:** `if (tabAdmin && (tabAdmin.innerHTML === '' || tabAdmin.innerHTML.includes('DYNAMIC'))) {`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

*(... 16 additional violations found in src/admin.js)*

**Target Workspace Range:** `src/ai.js:28`
**Divergent Code Snippet:** `modalContainer.innerHTML = ``
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/ai.js:70`
**Divergent Code Snippet:** `if (btnAiPlayer) btnAiPlayer.closest('section, div')?.style && (btnAiPlayer.style.display = 'none');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/ai.js:71`
**Divergent Code Snippet:** `if (btnAiCoach) btnAiCoach.style.display = 'none';`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/ai.js:73`
**Divergent Code Snippet:** `if (btnAskAi) btnAskAi.style.display = 'none';`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/ai.js:75`
**Divergent Code Snippet:** `if (btnCoachAiPlan) btnCoachAiPlan.style.display = 'none';`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 5 additional violations found in src/ai.js)*

**Target Workspace Range:** `src/analytics.js:7`
**Divergent Code Snippet:** `dispEl.innerHTML = '<p style="color:#94a3b8;">Analyzing shot history...</p>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/analytics.js:18`
**Divergent Code Snippet:** `dispEl.innerHTML = '<p style="color:#94a3b8;">No detailed shot data available for this athlete.</p>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/analytics.js:39`
**Divergent Code Snippet:** `dispEl.innerHTML = ``
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/analytics.js:88`
**Divergent Code Snippet:** `dispEl.innerHTML = '<p style="color:#ef4444;">Failed to load analytics.</p>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/app-v4.js:135`
**Divergent Code Snippet:** `customCourseGroup.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/app-v4.js:140`
**Divergent Code Snippet:** `holeGrid.innerHTML = "<em>Hole-by-hole not available for custom courses. Use Total Stableford or Manual AGS.</em>";`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/app-v4.js:143`
**Divergent Code Snippet:** `customCourseGroup.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/app-v4.js:157`
**Divergent Code Snippet:** `modeHoleByHole.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/app-v4.js:158`
**Divergent Code Snippet:** `modeTotalStableford.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 16 additional violations found in src/app-v4.js)*

**Target Workspace Range:** `src/auth-v2.js:25`
**Divergent Code Snippet:** `UI.registerFields.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/auth-v2.js:26`
**Divergent Code Snippet:** `UI.btnLogin.style.display = 'none';`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/auth-v2.js:27`
**Divergent Code Snippet:** `UI.btnRegister.style.display = 'none';`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/auth-v2.js:28`
**Divergent Code Snippet:** `UI.authSwitchBack.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/auth-v2.js:42`
**Divergent Code Snippet:** `UI.registerFields.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 31 additional violations found in src/auth-v2.js)*

**Target Workspace Range:** `src/coach.js:22`
**Divergent Code Snippet:** `manageContainer.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/coach.js:28`
**Divergent Code Snippet:** `manageContainer.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/coach.js:56`
**Divergent Code Snippet:** `list.innerHTML = 'Loading...';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/coach.js:62`
**Divergent Code Snippet:** `list.innerHTML = '<li>No coaches added yet.</li>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/coach.js:65`
**Divergent Code Snippet:** `list.innerHTML = '';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

*(... 16 additional violations found in src/coach.js)*

**Target Workspace Range:** `src/competitions.js:43`
**Divergent Code Snippet:** `UI.compSelect.innerHTML = '<option value="" disabled selected>-- Select a Competition --</option>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/competitions.js:45`
**Divergent Code Snippet:** `UI.ocLinkComp.innerHTML = '<option value="">-- No Competition Linked --</option>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/competitions.js:98`
**Divergent Code Snippet:** `if (compContainer) compContainer.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/competitions.js:99`
**Divergent Code Snippet:** `if (activeCompView) activeCompView.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/competitions.js:100`
**Divergent Code Snippet:** `if (noCompEmpty) noCompEmpty.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 32 additional violations found in src/competitions.js)*

**Target Workspace Range:** `src/modules/card-render.js:15`
**Divergent Code Snippet:** `tbody.innerHTML = '';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/modules/card-render.js:42`
**Divergent Code Snippet:** `tr.style.borderBottom = '1px solid #f1f5f9';`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/modules/card-render.js:43`
**Divergent Code Snippet:** `tr.innerHTML = ``
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/modules/card-render.js:55`
**Divergent Code Snippet:** `UI.ocDetailedTbody.innerHTML = '';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/modules/card-render.js:78`
**Divergent Code Snippet:** `tr.style.cursor = 'pointer';`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

*(... 8 additional violations found in src/modules/card-render.js)*

**Target Workspace Range:** `src/modules/event-binders.js:32`
**Divergent Code Snippet:** `UI.btnOcQuickAdd.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/modules/event-binders.js:37`
**Divergent Code Snippet:** `UI.btnOcQuickAdd.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/modules/event-binders.js:39`
**Divergent Code Snippet:** `UI.btnOcQuickAdd.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/modules/event-binders.js:90`
**Divergent Code Snippet:** `container.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/modules/event-binders.js:103`
**Divergent Code Snippet:** `container.innerHTML = html;`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

*(... 53 additional violations found in src/modules/event-binders.js)*

**Target Workspace Range:** `src/modules/score-input.js:20`
**Divergent Code Snippet:** `wizard.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/modules/score-input.js:34`
**Divergent Code Snippet:** `wizard.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/modules/score-input.js:68`
**Divergent Code Snippet:** `if (data.routines && data.routines[field] === val) btn.classList.add('active');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/modules/score-input.js:69`
**Divergent Code Snippet:** `else btn.classList.remove('active');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/modules/score-input.js:79`
**Divergent Code Snippet:** `if (data.club === 'Putter') puttingSection.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 2 additional violations found in src/modules/score-input.js)*

**Target Workspace Range:** `src/notifications.js:20`
**Divergent Code Snippet:** `banner.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/notifications.js:28`
**Divergent Code Snippet:** `banner.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/notifications.js:51`
**Divergent Code Snippet:** `msgEl.style.color = '#10b981';`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/notifications.js:52`
**Divergent Code Snippet:** `msgEl.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/notifications.js:53`
**Divergent Code Snippet:** `setTimeout(() => msgEl.classList.add('hidden'), 3000);`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 6 additional violations found in src/notifications.js)*

**Target Workspace Range:** `src/oncourse.js:103`
**Divergent Code Snippet:** `if (hub) hub.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/oncourse.js:105`
**Divergent Code Snippet:** `if (finishModal) finishModal.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/oncourse.js:107`
**Divergent Code Snippet:** `if (progress) progress.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/oncourse.js:109`
**Divergent Code Snippet:** `if (exitBar) exitBar.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/oncourse.js:111`
**Divergent Code Snippet:** `if (subNav) subNav.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 94 additional violations found in src/oncourse.js)*

**Target Workspace Range:** `src/persistence.js:100`
**Divergent Code Snippet:** `if (setupScreen) setupScreen.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/persistence.js:101`
**Divergent Code Snippet:** `if (hubScreen) hubScreen.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/persistence.js:102`
**Divergent Code Snippet:** `if (ocProgressBar) ocProgressBar.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/persistence.js:103`
**Divergent Code Snippet:** `if (ocExitBar) ocExitBar.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/practice.js:152`
**Divergent Code Snippet:** `UI.logPracticeContainer.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/practice.js:158`
**Divergent Code Snippet:** `UI.logPracticeContainer.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/practice.js:166`
**Divergent Code Snippet:** `UI.logPracticeContainer.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/practice.js:219`
**Divergent Code Snippet:** `UI.logPracticeContainer.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/practice.js:289`
**Divergent Code Snippet:** `UI.practiceSelect.innerHTML = '<option value="" disabled selected>-- Select a Drill --</option>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

*(... 18 additional violations found in src/practice.js)*

**Target Workspace Range:** `src/social.js:42`
**Divergent Code Snippet:** `resultsEl.innerHTML = '';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/social.js:45`
**Divergent Code Snippet:** `row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;';`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/social.js:46`
**Divergent Code Snippet:** `row.innerHTML = ``
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/social.js:95`
**Divergent Code Snippet:** `if (listEl) listEl.innerHTML = '';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/social.js:98`
**Divergent Code Snippet:** `if (listEl) listEl.innerHTML = '<li style="color:#94a3b8;">Not following anyone yet.</li>';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

*(... 12 additional violations found in src/social.js)*

**Target Workspace Range:** `src/surveyor.js:37`
**Divergent Code Snippet:** `if (container) container.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/surveyor.js:68`
**Divergent Code Snippet:** `if (container) container.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/surveyor.js:97`
**Divergent Code Snippet:** `statusMsg.style.color = "#10b981";`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/surveyor.js:103`
**Divergent Code Snippet:** `statusMsg.style.color = "#f59e0b";`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/surveyor.js:110`
**Divergent Code Snippet:** `statusMsg.style.color = "#ef4444";`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/tempo.js:19`
**Divergent Code Snippet:** `UI.tempoDelayContainer.style.opacity = e.target.checked ? '1' : '0.5';`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/tempo.js:20`
**Divergent Code Snippet:** `UI.tempoDelayContainer.style.pointerEvents = e.target.checked ? 'auto' : 'none';`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/tempo.js:109`
**Divergent Code Snippet:** `UI.tempoCoreCircle.style.background = '#64748b'; UI.tempoCoreCircle.style.transform = "scale(1)";`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/tempo.js:112`
**Divergent Code Snippet:** `UI.tempoCoreCircle.style.background = '#a855f7'; UI.tempoCoreCircle.style.transform = "scale(0.8)";`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/tempo.js:115`
**Divergent Code Snippet:** `UI.tempoCoreCircle.style.background = '#eab308'; UI.tempoCoreCircle.style.transform = "scale(1.2)";`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

*(... 7 additional violations found in src/tempo.js)*

**Target Workspace Range:** `src/ui.js:270`
**Divergent Code Snippet:** `info.innerHTML = ``
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/ui.js:339`
**Divergent Code Snippet:** `UI.historyTbody.innerHTML = '';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/ui.js:344`
**Divergent Code Snippet:** `if (UI.emptyState) UI.emptyState.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/ui.js:346`
**Divergent Code Snippet:** `if (UI.emptyState) UI.emptyState.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/ui.js:351`
**Divergent Code Snippet:** `tr.style.opacity = '0.5';`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

*(... 16 additional violations found in src/ui.js)*

**Target Workspace Range:** `src/wakelock.js:50`
**Divergent Code Snippet:** `btn.classList.add('active');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/wakelock.js:51`
**Divergent Code Snippet:** `btn.innerHTML = '☀️ Screen: Always On';`
**Failure Classification:** High-Risk Bypass
**Mechanic Analysis:** Imperative DOM manipulation (.innerHTML) untethered from a reactive state subscription. Vulnerable to XSS and layout thrashing.

**Target Workspace Range:** `src/wakelock.js:52`
**Divergent Code Snippet:** `btn.style.backgroundColor = '#fbbf24'; // Amber`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/wakelock.js:53`
**Divergent Code Snippet:** `btn.style.color = '#000';`
**Failure Classification:** Moderate Debt
**Mechanic Analysis:** Direct style modification outside of reactive state encapsulation.

**Target Workspace Range:** `src/wakelock.js:55`
**Divergent Code Snippet:** `btn.classList.remove('active');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 5 additional violations found in src/wakelock.js)*

**Target Workspace Range:** `src/whs.js:156`
**Divergent Code Snippet:** `if (UI.loadingState) UI.loadingState.classList.remove('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/whs.js:157`
**Divergent Code Snippet:** `if (UI.emptyState) UI.emptyState.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/whs.js:160`
**Divergent Code Snippet:** `if (UI.loadingState) UI.loadingState.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/whs.js:179`
**Divergent Code Snippet:** `if (UI.loadingState) UI.loadingState.classList.add('hidden');`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

**Target Workspace Range:** `src/whs.js:209`
**Divergent Code Snippet:** `canvas.style.display = 'none';`
**Failure Classification:** Critical Structural Leak
**Mechanic Analysis:** Manually alters element visibility/layout, circumventing the state-driven `body[data-active-tab]` parameter or AppState proxy reactivity.

*(... 9 additional violations found in src/whs.js)*
