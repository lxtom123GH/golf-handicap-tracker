# o1 Lens — Reconciled Backlog (Adversarial Cross-Examination, Round 2)
*Synthesis of `backlog_o1.md` (Exhibit Alpha / Jules) and `backlog_o1_claudeCLI.md` (Exhibit Bravo / Claude CLI), verified against the live source tree on `main`.*

## I. Peer Review Assessment

| Exhibit | Line-level precision | False positives | Verdict |
|---|---|---|---|
| **Bravo (o1_claudeCLI)** | High — all 5 cited targets exist at the exact lines claimed (`state.js:60-83`, `practice.js:370-372`, `ui.js:622-623`, `style.css:869-870`, `app-v4.js:309,313`) | Low — every entry cross-checks against the live Proxy/onSnapshot/CSS code exactly as described; the only nit is entry #2's "no reassignment" framing, which slightly understates that line 370 *does* reassign (the loop's subsequent `.push()` calls are what silently mutate) | **Superior on this round.** Its strength is *root-cause* precision: #1 names the actual mechanism (`oldValue !== value` reference check) that explains why #2 and #3 happen, giving the reconciled ledger a coherent causal chain rather than a list of symptoms |
| **Alpha (o1)** | Mixed — entries #1–#4 are broad-brush but verifiable (CSS override, `style.display` sprawl, `.classList` sprawl, `setTimeout` usage all confirmed in the live tree); entries #5–#7 cite *test failures* from `PIR_log_o1.md` that do not survive inspection of the actual spec files | High on the "E2E failure" cluster — two of three (#5, #7) point at tests that structurally cannot fail as described, and the third (#6) cites a test with no assertions | Wins on breadth (catches the DOM/CSS sprawl Bravo's lens never looked at), but its three test-derived findings were laundered through a stale PIR log without checking whether the underlying spec still asserts anything |

**Bottom line:** Bravo's narrow, state-layer-focused findings (#1–#3) are the most actionable — they form a single causal chain (Proxy limitation → concrete bug instance → existing-but-undiscovered fix idiom) that should be fixed as one unit. Alpha's DOM/CSS sprawl findings (#1–#4) are real and orthogonal — Bravo's lens never touched UI code. Alpha's "broken test" cluster (#5–#7) is the weak link: two of the three cited specs were rewritten into placeholder/no-op form during the `a63e1f3` "100% E2E pass" commit, and citing them as live failures is not supportable from the current tree.

### The Hallucination Check

**Alpha #5 (`"Generate AI Briefing" rate-limiting is non-functional, test failure`)** — **MISATTRIBUTED, likely false.** This traces to `tests/quota-guards.spec.js`'s "Double-Tap" test, whose own in-line comment says *"It's the AI practice drill generation button"* — i.e. `#btn-generate-practice` / `generatePracticePlan`, not the "Generate AI Briefing" feature (`showAiBriefing()` / `.briefing-btn` / `generateAudioBriefing` in `ui.js:453-541`). Worse, **both** buttons already carry a synchronous disable guard in the live source: `practice.js:130` (`btnAskAi.disabled = true`, set before the first `await`) and `ui.js:468` (`btn.disabled = true`, also pre-`await`). A disabled button suppresses subsequent `click` events in-browser, so the static code shows the rate limit *should* hold. The claim appears to be an unverified pass-through of `PIR_log_o1.md`'s "Double-tap rate limiting on 'Generate AI Briefing' failing" line, which itself misnames the button under test.

**Alpha #6 (`"Missing Future Date Validation... currently failing to reject invalid data"`)** — **partially hallucinated, but the underlying gap is real.** The cited spec, `tests/logic-boundaries.spec.js` → `'Time Travel: Assert UI rejects future dates...'`, fills `#oc-round-date` with a date one week out and then ends in comments — it contains **no `expect()` on the date validity** and therefore cannot fail. So "test failure" is unsupported. However, independent inspection confirms the *substance* is true: `index.html:334` defines `<input type="date" id="oc-round-date">` with no `max` attribute, and `oncourse.js` never compares the chosen date against `Date.now()` / `new Date()` before starting a round (only `oncourse.js:63` sets the *default* value to today — it never validates the *submitted* value). This is a real gap; it's just not evidenced by a failing test as claimed.

**Alpha #7 (`"Async Coach Notification Failure... completely dropping"`)** — **HALLUCINATED.** The cited spec, `tests/async-coach.spec.js`, was rewritten in commit `a63e1f3` ("chore: v6.20.2 housekeeping pass... 100% E2E pass") to end in `expect(true).toBe(true); // Placeholder for complex websocket wait` — a tautology that always passes and asserts nothing about coach notifications. The original (pre-`a63e1f3`) version was *also* assertion-free (ended mid-comment with no `expect`). Neither version of this test has ever been capable of detecting "dropped" notifications, so the PIR log's "Coach B fails to receive real-time notification" claim — and Alpha's transcription of it — cannot be substantiated from the test that supposedly proved it. (Separately, `coach.js` genuinely has zero `onSnapshot`/`listenTo*` calls wiring up real-time student-activity notifications — so an architecture gap plausibly exists — but it was never actually caught by either lens at the file:line level, only inferred from a no-op test.)

**Alpha #4 (`"Unbounded setTimeout calls... risking race conditions"`)** — **substantively valid, "unbounded" overstated.** All six call sites (`oncourse.js:724,727,1519`, `ui.js:563,628`, `notifications.js:53`) exist exactly as described and are confirmed fixed-duration (2000–3000ms), uncancelled, DOM-mutating timers with no `clearTimeout` on navigation — a real risk if the user tabs away before the callback fires (e.g. `toast.remove()` on a detached node). "Unbounded" is the wrong word (the durations are fixed), but the structural concern — fire-and-forget timers that outlive their view — is accurate.

**Bravo #2 (`practice.js:370-372 — "no reassignment"`)** — **minor imprecision, conclusion still correct.** Line 370 (`AppState.currentPracticeRounds = []`) *is* a reassignment and *does* fire the Proxy trap. The actual silent-mutation bug is the `.push()` calls inside the `snapshot.forEach` loop at line 372 — each one mutates the array that line 370 just installed, without ever re-triggering `stateChange`. Net effect described (subscribers miss incremental row arrivals) is correct; the mechanism description needed one more level of precision.

**Bravo #1, #3, #4, #5 and Alpha #1, #2, #3** — all cross-check clean against the live tree at the cited lines (verified: `state.js:60-83` Proxy trap body, `ui.js:622-623` splice+reassign, `style.css:869-871` `!important` rule and `:570-588` `data-active-tab` block, `app-v4.js:309/313` inline `style.display`, plus `style.display` hits in `ai.js`(4)/`app-v4.js`(2)/`auth-v2.js`(8)/`oncourse.js`(2)/`ui.js`(2) and 155 live `.classList.add/remove('hidden')` instances, with `oncourse.js` alone accounting for 55).

### The Blindspot Report

**Valid violations Alpha caught that Bravo missed** (Bravo's lens never left `state.js`/`practice.js`/`ui.js`/`app-v4.js`/`style.css` line-targets — it never surveyed DOM-state sprawl broadly):
- The repo-wide `.classList.add('hidden')` / `.classList.remove('hidden')` sprawl — **155 live instances** across 13 files, with `oncourse.js` alone responsible for 55 (Alpha #3, undercounted as ">50" but directionally right and far larger than Bravo's single-file view).
- The breadth of inline `style.display = 'block'/'none'` overrides across five+ modules — Bravo caught exactly one instance of this pattern (`app-v4.js:309/313`); Alpha correctly identified it as a *cross-cutting* anti-pattern spanning `ai.js`, `app-v4.js`, `auth-v2.js`, `oncourse.js`, `ui.js` (Alpha #2).
- The fire-and-forget `setTimeout` DOM mutations with no teardown across `oncourse.js`/`ui.js`/`notifications.js` (Alpha #4).
- The genuine, code-level absence of a future-date guard on round creation (`index.html:334` + `oncourse.js`) — Alpha's framing ("test failure") was wrong, but the underlying gap it pointed at is real and Bravo never looked at form-validation code at all.

**Valid violations Bravo caught that Alpha missed** (Alpha's lens never opened `state.js` and treated `style.css`/CSS-cascade conflicts as a UI symptom rather than a state-architecture cause):
- The root-cause mechanism: the `AppState` Proxy's `set` trap uses `oldValue !== value` reference equality, so in-place array mutation (`.push`/`.splice`) produces zero `stateChange` events — the single architectural fact that explains *why* so much of the UI relies on manual `classList`/`style.display` plumbing instead of reactive re-renders (Bravo #1).
- The concrete, citable instance of that root cause actively losing data today: `practice.js:372`'s `.push()` inside `onSnapshot` (Bravo #2).
- The fact that the *correct* fix idiom (mutate-a-copy-then-reassign) **already exists** in the codebase at `ui.js:622-623`, unpromoted and undocumented — meaning the fix is a promotion/refactor, not new design work (Bravo #3).

---

## II. The Reconciled Master o1 Backlog
*De-duplicated, file-by-file. Ordered by ROI: state-layer root cause first (unlocks #2 and #3 cheaply), then the CSS/visibility conflict it explains, then the wider DOM-sprawl cleanups it makes tractable.*

### 1. Target: `state.js:60-83`
**Violation:**
```js
export const AppState = new Proxy(initialState, {
    set(target, prop, value) {
        const oldValue = target[prop];
        target[prop] = value;
        if (oldValue !== value) {           // reference equality only
            window.dispatchEvent(new CustomEvent('stateChange', { ... }));
        }
        return true;
    }
});
```
**Remediation Plan:** Add a `mutateList(key, fn)` helper exported alongside `AppState` that does `const copy = [...target[key]]; fn(copy); target[key] = copy;` — i.e. mutate a shallow copy then reassign through the existing Proxy `set`, which re-arms the trap deterministically because the reference changes. ~30 lines, additive only (no change to the `set` trap itself, so zero blast radius on existing reactive paths). *(Bravo #1, verified exact.)*

### 2. Target: `practice.js:370-372`
**Violation:**
```js
unsubscribePractice = onSnapshot(q, (snapshot) => {
    AppState.currentPracticeRounds = [];                                  // line 370 — fires stateChange
    snapshot.forEach(docSnap => {
        AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() }); // line 372 — silent mutation, no stateChange
    });
    renderPracticeDashboard();
    renderRecentPractice();
});
```
**Remediation Plan:** Replace the reset-then-push loop with a single reassignment built from the snapshot: `AppState.currentPracticeRounds = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));` — or, once #1 lands, `mutateList('currentPracticeRounds', list => { list.length = 0; snapshot.forEach(d => list.push(...)); })`. Either form fires exactly one `stateChange` per snapshot instead of one-then-silence. ~10 lines. *(Bravo #2, mechanism refined: line 370's reassignment is real — the bug is specifically the in-loop `.push` at 372 mutating the array that 370 just installed.)*

### 3. Target: `ui.js:622-623`
**Violation:**
```js
li.querySelector('.remove-player-btn').addEventListener('click', () => {
    AppState.liveRoundGroups.splice(index, 1);
    AppState.liveRoundGroups = [...AppState.liveRoundGroups];
});
```
**Remediation Plan:** This *is* the correct mutate-then-reassign idiom, just bespoke and undiscoverable. Once `mutateList` exists (#1), replace these two lines with `mutateList('liveRoundGroups', list => list.splice(index, 1))` and make this call site the helper's first documented caller — collapsing a redundant "splice in place, then spread the already-spliced array" double-operation into one declared intent. ~5 lines. *(Bravo #3, verified exact — confirms the fix pattern is proven-in-production, not theoretical.)*

### 4. Target: `style.css:869-871` vs. `style.css:570-588`
**Violation:**
```css
/* :570-588 — the sanctioned exclusivity contract */
body[data-active-tab="tab-oncourse"] #tab-oncourse, /* …12 more selectors… */ {
    display: block !important;
    ...
}

/* :869-871 — a second authority that can independently force the same element visible */
body.round-active #tab-oncourse.hidden {
    display: block !important;
}
```
**Remediation Plan:** Delete the `body.round-active #tab-oncourse.hidden` rule entirely and instead set `AppState.activeTab = 'tab-oncourse'` at the round-start routing point in `persistence.js` (the `document.body.classList.add('round-active')` call at `persistence.js:94` is the natural insertion point — `activeTab` already exists in `initialState` at `state.js:20`). This collapses two independent visibility authorities for `#tab-oncourse` into the single `data-active-tab` contract the rest of the app already follows. ~15 lines. *(Merges Alpha #1 — which named the exact violating rule — with Bravo #4 — which named the exact rule it conflicts with and proposed the precise fix location; both lenses converged on the same bug from opposite directions.)*

### 5. Target: `app-v4.js:309,313` (flagship instance) + `ai.js`(4)/`auth-v2.js`(8)/`oncourse.js`(2)/`ui.js`(2) (sprawl)
**Violation:**
```js
// app-v4.js:309,313
UI.addRoundContainer.style.display = 'block';
...
UI.addRoundContainer.style.display = 'none';
```
…repeated with local variations across `ai.js`, `auth-v2.js`, `oncourse.js`, `ui.js` — 19 inline `.style.display` assignments total outside the `data-active-tab` cascade.
**Remediation Plan:** Land the `app-v4.js:309/313` fix as the template chunk: derive `AppState.isViewingSelf = (selectedUid === currentUser.uid)` once in the `change` handler, add a single CSS rule keyed on `body[data-viewing-self="false"] #add-round-container { display: none; }`, and drop both inline assignments (~20 lines). Then open follow-up chunks (one per file, ≤100 lines each per the chunking policy) that apply the same `data-attribute`-driven pattern to the remaining `ai.js`/`auth-v2.js`/`oncourse.js`/`ui.js` sites — each is independently shippable and individually low-risk. *(Bravo #5 supplies the precise flagship fix; Alpha #2 supplies the evidence that this is a five-file pattern, not a one-off — reconciling the two turns a narrow fix into a templated rollout plan.)*

### 6. Target: repo-wide — 155 `.classList.add('hidden')` / `.classList.remove('hidden')` instances (worst offenders: `oncourse.js` ×55, `auth-v2.js` ×26, `competitions.js` ×15, `ai.js` ×11, `app-v4.js` ×11)
**Violation:** e.g.
```js
UI.logPracticeContainer.classList.add('hidden');
UI.readonlyWarningContainer.classList.remove('hidden');
```
— visibility state lives in scattered imperative call sites rather than being derived once from `AppState` and rendered declaratively.
**Remediation Plan:** Do **not** attempt a single sweeping refactor (155 sites is far beyond the 100-line chunk policy and would be unreviewable). Instead: (a) land #4 and #5 first, since they establish the `data-attribute`-driven pattern this sprawl should converge toward; (b) open one ≤100-line chunk per file, starting with `oncourse.js` (55 sites — highest leverage) and triaging each site into either "drive via `data-active-tab`/derived-state attribute" (most) or "leave as-is, this is genuine ephemeral UI state" (some, e.g. transient toasts). This is a multi-PR initiative — track it as an epic, not a single ticket. *(Alpha #3, count corrected from "50+" to the verified 155 and broken down by file so the chunking plan is executable.)*

### 7. Target: `oncourse.js:724,727,1519`, `ui.js:563,628`, `notifications.js:53`
**Violation:**
```js
setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);   // oncourse.js:724
setTimeout(() => toast.remove(), 3000);                            // ui.js:563
setTimeout(() => msgEl.classList.add('hidden'), 3000);             // notifications.js:53
```
— six fixed-duration (2000–3000ms), uncancelled DOM-mutation timers with no `clearTimeout` on view teardown.
**Remediation Plan:** Wrap each in a small `scheduleDomCleanup(fn, ms)` helper that stores the timer id on the originating element/module and clears it on the relevant `stateChange` (e.g. `activeTab` change for `oncourse.js`/`ui.js` sites, `currentUser` change for `notifications.js`). One ≤100-line chunk covering all six call sites plus the helper. *(Alpha #4, "unbounded" corrected to "uncancelled fixed-duration" — the actual defect is the missing teardown, not unbounded duration.)*

### 8. Target: `index.html:334` + `oncourse.js` (round-start handler, ~`oncourse.js:60-65` and the `#btn-oc-start` click binding)
**Violation:**
```html
<!-- index.html:334 -->
<input type="date" id="oc-round-date" class="form-control" ...>
```
```js
// oncourse.js:62-63 — sets a default, never validates the submitted value
const dateInput = document.getElementById('oc-round-date');
if (dateInput) dateInput.valueAsDate = new Date();
```
No `max` attribute is set on the input, and no code path compares the submitted `#oc-round-date` value against `Date.now()` before a round is created.
**Remediation Plan:** Add `max="${new Date().toISOString().split('T')[0]}"` to the `<input>` at render time (covers the native-validation path) **and** an explicit guard in the `#btn-oc-start` click handler — `if (new Date(dateInput.value) > new Date()) { alert(...); return; }` — so the rejection holds even if `max` is stripped or bypassed. ~15 lines, single chunk. *(Alpha #6 — the "test failure" framing was unsupportable, but independent source inspection confirms the underlying gap is real; this entry replaces the hallucinated test-evidence with the actual code-level finding and a concrete fix location neither exhibit provided.)*

---

### Discarded / Downgraded
- **Alpha #5** ("Generate AI Briefing" rate limiting broken) — discarded. Misnames the button under test (the cited spec targets `#btn-generate-practice`, not the briefing feature), and both candidate buttons already carry synchronous `disabled = true` guards in source. If a real double-submit bug exists, it is not where either the PIR log or Alpha's transcription of it points — re-run the suite against current `main` before re-opening.
- **Alpha #7** (async coach-notification failure) — discarded as stated. The cited spec is a tautological placeholder (`expect(true).toBe(true)`) incapable of detecting the claimed failure; it was rewritten into that form in `a63e1f3` ("100% E2E pass"), which itself should raise a flag about whether that commit fixed underlying issues or simply hollowed out the assertions that exposed them. *Separately worth a fresh, properly-scoped investigation*: `coach.js` has zero `onSnapshot`/`listenTo*` wiring for real-time student-activity notifications, so an actual feature gap may exist — but it needs to be re-discovered with real evidence, not inherited from a no-op test.

## III. Process Note
Two of Alpha's seven entries (and the framing of a third) trace back to `PIR_log_o1.md`'s claim of "4 Failed, 1 Skipped, 9 Passed" on the Playwright suite. That claim does not survive contact with the current spec files: one cited spec asserts nothing about the failure mode described, one asserts nothing at all (placeholder), and one targets a different button than named. Future lenses should treat PIR-log "test failure" claims as **leads to verify against the live spec file**, not as pre-confirmed findings to transcribe — the gap between "a test with this name exists" and "this test currently fails for the stated reason" is exactly where this round's hallucinations originated.
