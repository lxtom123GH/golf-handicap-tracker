# Backlog — Master Lens — Reconciled Delta (Round 6 Adversarial Cross-Examination · Objective Truth Lens)
*Sources: Exhibit Alpha (`docs/reviews/night1_master.md`, raw multi-file audit log) vs. Exhibit Bravo (`docs/backlog_master_claudeCLI.md`, Claude CLI initial master output). This document **replaces** a prior `backlog_master_reconciled_delta.md` that paired Bravo against a different, near-empty Alpha (`backlog_master.md`) — that pairing produced little signal because that Alpha was a one-line pointer. This round pairs Bravo against the actual underlying raw audit log, which is the comparison that yields real adversarial signal.*

## I. Peer Review Assessment

| Axis | Exhibit Alpha (raw audit log) | Exhibit Bravo (initial master backlog) |
|---|---|---|
| **Location evidence** | ~190 entries across 20 files, every one a `file:line` + verbatim snippet. Exhaustive breadth — opens files Bravo never touches (`analytics.js`, `notifications.js`, `wakelock.js`, `ai.js`, `surveyor.js`, `tempo.js`). | 7 rows, each anchored to exact `file:line` ranges plus a named root-cause mechanism (`state.js:60-83`) and a concrete proof-pair (`ui.js:622-623` vs `practice.js:370-372`). |
| **Verifiability** | **75 of 75 sampled `file:line` citations verified byte-for-byte** against the live tree (every line in the spot-check batches below matches exactly — admin.js, ai.js, analytics.js, app-v4.js, auth-v2.js, coach.js, competitions.js, card-render.js, event-binders.js, score-input.js, notifications.js, oncourse.js, persistence.js, practice.js, social.js, surveyor.js, tempo.js, ui.js, wakelock.js, whs.js). Zero fabricated paths or lines. | 6 of 7 `Target` ranges verified accurate — including the load-bearing root-cause claim (`state.js:60-83` = the `set` trap that fires only on top-level assignment) and the `ui.js:622-623`/`practice.js:370-372` proof-pair (confirmed: one reassigns the array and re-arms the proxy, the other mutates in place and silently doesn't). The seventh (#7) is **not a citation error — it is a fabricated finding**; see the headline Hallucination Check entry below. |
| **Hallucination / templating** | **No fabricated locations — but a systemic "Sydney Protocol" violation in the *analysis* layer.** Every entry's `Mechanic Analysis` field is one of three canned strings, mechanically pasted by *which API was called* rather than by *what the code does*. This produces concrete false claims on `wakelock.js:50/55`, `score-input.js:68-69`, and `ai.js:70-75` — all three labeled "Critical Structural Leak... circumventing `body[data-active-tab]`," none of which is true (see §III). The location is real; the analysis is a template stamp. | **One outright fabrication (#7) and one minor citation-cluster error (#4).** #7 claims "only `playerClubs` survives a refresh / 30+ unmirrored `initialState` keys, including mid-round tracking state" — verified **false**: `persistence.js:11-25` defines a 13-field `PERSIST_FIELDS` allow-list (covering `liveRoundGroups`, `currentHole`, `currentShotData`, `activeRoundId` — *precisely* the "mid-round tracking state" the claim says is lost) that round-trips through a second, entirely separate `GOLF_APP_STATE_KEY` localStorage mechanism Bravo never opened. #4 additionally bundles `score-input.js:166` (a disposable, single-use toast timer) into a cluster of *shared-element* timer races it doesn't structurally belong to. |
| **Verdict** | The superior **raw census** — broad, mechanical, exhaustive, zero location fabrication. But it is a *grep with a label-maker*, not an audit: it cannot distinguish a genuine architectural collision from an unrelated cosmetic toggle, because it never reads the surrounding function to ask "does this element's visibility actually compete with `data-active-tab`?" | The superior **diagnostic synthesis** on six of seven rows — narrower in file coverage, but every one of those six names a *mechanism*, not just a symptom, and several are the verified concrete proof of exactly the gap Alpha can only gesture at via boilerplate. Its seventh row, however, is a genuine fabrication that a prior reconciliation pass (the file this document replaces) carried forward *uncorrected* — see the cascade note below. |

### ⚠️ Headline Hallucination Finding: Bravo #7 is fabricated, and it already fooled one prior reconciliation pass

Bravo's row #7 states: *"`state.js:38-53` and the 30+ unmirrored `initialState` keys... Only `playerClubs` survives a refresh."* This is **false on its central claim**, not merely miscounted:

```js
// persistence.js:11-25 — a SECOND, independent persistence mechanism Bravo never opened:
const PERSIST_FIELDS = [
    'currentTrackingMode', 'currentRoundHoles', 'currentRoundCourseName', 'currentCoursePars',
    'liveRoundGroups', 'currentHole', 'currentShotData', 'currentLiveCompId',
    'currentLiveCompRules', 'currentHoleShots', 'activeRoundId', 'currentRoundDate', 'myBag'
];
// — saved/loaded/cleared/hydrated as a full cycle under GOLF_APP_STATE_KEY = 'golf_round_state',
//   completely separate from the playerClubs ↔ golfAppClubs mechanism Bravo correctly found at state.js:38-53.
```

Thirteen keys persist through this allow-list — including `liveRoundGroups`, `currentHole`, `currentShotData`, and `activeRoundId`, which is **exactly** the "mid-round tracking state" Bravo's row claims vanishes on refresh. The claim isn't off by a count; it asserts the opposite of what the code does.

**This is not a fresh catch — it is a fabrication that already survived one full adversarial reconciliation round.** The `backlog_master_reconciled_delta.md` this document replaces carried the *identical* claim forward as its own row #9 ("Of 25 top-level `initialState` keys, only `playerClubs` round-trips... 24 unmirrored... including mid-round tracking state"), correcting only Bravo's headline *count* ("30+" → "24 of 25") while leaving the underlying — and false — premise completely unexamined. Independently, a sibling reconciliation pass on the Llama lens's findings (`backlog_llama_reconciled_delta.md`, synthesized into `MASTER_BACKLOG_supermagic_delta.md` §III) caught and retracted this exact same fabrication via the same `persistence.js:11-25` evidence. **Three separate reconciliation passes have now independently converged on "this claim is false" — it should be considered permanently retired, not re-litigated, in any future round.** The lesson for future lenses: a claim surviving one reconciliation pass is not proof it's true — verify the *premise* (open `persistence.js`), not just the *headline number*.

---

## II. The Reconciled Master Lens Backlog
*De-duplicated, file-by-file. Ranked by ROI: the state-layer root cause first (it retroactively explains and simplifies #2 and the mutation half of #6), then the two "two authorities, one outcome" symptom instances it produces, then the remaining independent clusters. Bravo's fabricated #7 is retracted outright (see above) rather than carried forward in any form.*

### 1. Target: `state.js:60-83` — Shallow `AppState` Proxy, reference-equality miss on in-place mutation
**Violation:**
```js
export const AppState = new Proxy(initialState, {
    set(target, prop, value) {
        const oldValue = target[prop];
        target[prop] = value;
        if (oldValue !== value) {                 // reference-equality only — misses in-place mutation
            window.dispatchEvent(new CustomEvent('stateChange', { detail: { property: prop, oldValue, newValue: value } }));
        }
        return true;
    }
});
```
**Remediation Plan:** Add an exported `mutateList(key, fn)` helper — `const copy = [...target[key]]; fn(copy); target[key] = copy;` — that mutates a shallow copy and reassigns through the existing `set` trap (reference changes, so the trap fires deterministically). Purely additive; zero blast radius on existing reactive paths. ~30 lines. *(Bravo #1, exact — corroborated independently by the o1 and R1 lenses.)*

### 2. Target: `practice.js:370-372` (+ `social.js:23-26`, identical defect)
**Violation:**
```js
unsubscribePractice = onSnapshot(q, (snapshot) => {
    AppState.currentPracticeRounds = [];                                            // fires stateChange
    snapshot.forEach(docSnap => {
        AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() }); // silent — no stateChange
    });
});
// social.js:23-26 — same shape, same root cause, never connected to it by either exhibit:
AppState.allUsersCache = [];                                                        // fires stateChange
snap.forEach(d => AppState.allUsersCache.push({ uid: d.id, ...d.data() }));         // silent
```
**Remediation Plan:** Replace each reset-then-push loop with a single reassignment built from the snapshot (`AppState.currentPracticeRounds = snapshot.docs.map(...)`), or route both through `mutateList` once #1 lands. Either fires exactly one `stateChange` instead of one-then-silence. ~15 lines across both sites, single chunk. *(Bravo #1's "live instance," extended to its `social.js` twin.)*

### 3. Target: `ui.js:622-623` — the correct idiom, currently undiscoverable
**Violation:**
```js
AppState.liveRoundGroups.splice(index, 1);
AppState.liveRoundGroups = [...AppState.liveRoundGroups];
```
**Remediation Plan:** This *is* the mutate-then-reassign idiom done right — bespoke, undocumented, unshared. Once `mutateList` exists (#1), make this call site its first documented caller: `mutateList('liveRoundGroups', list => list.splice(index, 1))`. ~5 lines. *(Bravo #1's cited proof-of-pattern.)*

### 4. Target: `auth-v2.js:25-28, 42-45, 153-157, 201-205` — dual-lever auth overlay visibility
**Violation:**
```js
// :153-157 — paired, redundant authorities; the style.display lines are commented "Force hide"/"Force show"
UI.authOverlay.classList.add('hidden');
UI.authOverlay.style.display = 'none';   // Force hide
UI.mainApp.classList.remove('hidden');
UI.mainApp.style.display = 'block';      // Force show
```
**Remediation Plan:** Collapse all four blocks to `classList`-only; delete the four paired `style.display` assignments and their "Force hide/show" comments — which are themselves an admission that `classList` alone was once judged insufficient (the actual bug to find is *why*, likely a CSS-specificity loss, not a justification to keep the second lever). ~25 lines. *(Bravo #2, exact — corroborated by Claude/R1 lenses as "evidence of a prior incident.")*

### 5. Target: `style.css:869-870` vs. `:570-582` — `#tab-oncourse` dual visibility authority
**Violation:**
```css
/* :570-582 — the sanctioned exclusivity contract */
body[data-active-tab="tab-oncourse"] #tab-oncourse, /* …12 more selectors… */ { display: block !important; opacity: 1 !important; }

/* :869-870 — a second, independent authority that can force the SAME element visible */
body.round-active #tab-oncourse.hidden { display: block !important; }
```
**Remediation Plan:** Delete the `body.round-active` override; instead set `AppState.activeTab = 'tab-oncourse'` at the round-start routing point (`persistence.js`'s `document.body.classList.add('round-active')` call is the natural insertion point — `activeTab` already exists in `initialState`). ~20 lines. *(Bravo #3, exact.)*

### 6. Target: `oncourse.js:724,727,1519`, `notifications.js:53` — uncancelled `setTimeout` races on shared elements (corrected & widened cluster)
**Violation:**
```js
setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);  // oncourse.js:724
setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2000);  // oncourse.js:727 — direct race with :724
setTimeout(() => msg.classList.add('hidden'), 3000);              // oncourse.js:1519
setTimeout(() => msgEl.classList.add('hidden'), 3000);            // notifications.js:53 — same shape, missed by Bravo
```
**Correction to Bravo's original scope:** Bravo bundled `modules/score-input.js:166` (`setTimeout(() => toast.remove(), 2500)`) into this cluster. Verified: `toast` there is a function-local element created via `document.body.appendChild(toast)` and discarded after one use — it can never be re-triggered against a stale handle, so it carries none of the shared-element race risk the four sites above share. Drop it from this cluster; including it would mis-scope the fix toward `clearTimeout` ceremony a disposable node never needs.
**Remediation Plan:** Cache each *shared* element's pending-hide handle on its owning module/scope and `clearTimeout` it before rescheduling (and on relevant teardown — e.g. `activeTab` change for the `oncourse.js` overlay). One mechanical pass across the four verified shared-element sites, ~20 lines, single PR. *(Bravo #4, corrected scope; `notifications.js:53` newly surfaced from Alpha's wider census.)*

### 7. Target: `admin.js`, `coach.js`, `competitions.js`, `modules/card-render.js`, `analytics.js`, `notifications.js`, `social.js`, `wakelock.js`, `ai.js` — `innerHTML = ''` + manual-rebuild render sprawl (widened to its true file census)
**Violation:** the same three-line shape — clear container, then either nothing or a string-concatenated rebuild — recurs at minimum 9 file boundaries. Representative verified instances: `admin.js:16,20,24,45`, `analytics.js:7,18,39,88`, `coach.js:56,62,65`, `competitions.js:43,45`, `card-render.js:15,55`, `social.js:42,46,95,98`, `wakelock.js:51`, `ai.js:28`, plus `notifications.js`'s banner rebuild. Per the underlying raw audit (`night1_master.md`), each is also tagged "vulnerable to XSS and layout thrashing" wherever interpolated values reach `innerHTML` rather than `textContent`/DOM APIs — a security framing Bravo's original #5 omitted entirely.
**Remediation Plan:** Extract `renderList(container, items, toRowFn, emptyMsg)` — clears via `container.replaceChildren()`, builds rows through `toRowFn` using safe DOM construction (no string-concatenated `innerHTML`), renders `emptyMsg` when empty. Migrate in ROI-ordered chunks of ≤100 lines: `admin.js`/`coach.js`/`competitions.js`/`card-render.js` first (Bravo's original 4, ~70-90 lines/chunk), then `analytics.js`/`social.js`/`notifications.js` (~50 lines), with `wakelock.js:51`/`ai.js:28` folded into whichever chunk lands nearest them. *(Bravo #5's DRY/perf framing, merged with Alpha's underlying-report XSS framing and widened from 4 files to its verified true census of 9.)*

### 8. Target: `whs.js:148-156`, `practice.js:360-372`, `social.js:23-31` — Firestore listeners: missing schema guard + the #2 silent-mutation pattern
**Violation:** No `normalizeRoundDoc`/`normalizeUserDoc` (or any `normalize*`) guard exists anywhere in `src/` — raw Firestore doc data is spread directly into `AppState` with no shape validation. (Note: the "no stored `unsubscribe`" framing some lenses applied to `whs.js`/`practice.js` does **not** survive inspection — `whs.js` correctly declares/guards/reassigns `unsubscribeWHS` at lines 11/143/159, and `practice.js` does the identical thing with `unsubscribePractice` at 12/361/369. Do not re-scope work toward "fixing" lifecycle code that already works.)
**Remediation Plan:** Land `normalizeRoundDoc(raw)`/`normalizeUserDoc(raw)` — pure functions supplying defaults for missing/malformed fields — and route all three `onSnapshot`/`getDocs` callbacks through them before assigning to `AppState`. ~40 lines (two normalizers + three call-site edits), additive only. *(Bravo #6, narrowed to its one valid clause; the silent-mutation half of #6 is folded into reconciled item #2 above where it belongs alongside its `practice.js` twin.)*

---

## III. Items Explicitly Excluded — Templated False Positives From Alpha, With Receipts

Alpha's raw census labels each of the following `Critical Structural Leak — circumventing the state-driven body[data-active-tab] parameter`. All three citations are **location-accurate** but **mechanism-false** — the analysis text is a canned string stamped onto every `classList`/`style` hit regardless of what the element is:

| Citation | What Alpha claims | What the code actually does | Why the claim is false |
|---|---|---|---|
| `wakelock.js:50,55` | Circumvents `body[data-active-tab]` | `btn.classList.add/remove('active')` toggles the **pressed-state skin of a screen-wake-lock toggle button** (`updateToggleUI`, paired with `innerHTML`/`style.backgroundColor` amber↔slate swaps) | No relationship to tab navigation — entirely self-contained to `.wakelock-toggle` elements |
| `score-input.js:68-69` | Same canned text | `btn.classList.add/remove('active')` highlights **which pre-shot-routine chip the user previously selected**, driven by `data.routines[field] === val` | A wizard-step selection-state highlight; never touches or competes with `data-active-tab` |
| `ai.js:70-75` | Same canned text | `btn.style.display = 'none'` for four AI-feature buttons, gated by `if (window.currentUserIsCoach && !window.currentUserIsAdmin)` | **Role-based feature gating**, not tab-visibility management — permanently hidden from a user class regardless of active tab |

These are excluded entirely (not "fixed") — there is nothing here to fix; the violation as described doesn't exist. Treating Alpha's labels as pre-vetted findings would have manufactured three unnecessary backlog rows, exactly the failure mode the rest of this reconciliation pass exists to prevent.

---

## IV. Blindspot Report

**Caught by Alpha, missed by Bravo (valid — promoted into §II):**
- `notifications.js:53` — a fourth genuine member of the uncancelled-`setTimeout`-on-shared-element cluster (folded into #6).
- `analytics.js`, `social.js`, `wakelock.js`, `ai.js` as additional genuine instances of the `innerHTML`-rebuild-sprawl pattern (folded into #7, widening its true census from "4 files" to a verified minimum of 9).
- The **security framing** (XSS/layout-thrash) of the `innerHTML` rebuild pattern — present throughout Alpha's raw entries, entirely absent from Bravo's #5, which framed the identical sites as a pure DRY/perf concern.
- The sheer concentration of raw violations in `oncourse.js` (99 sites total per Alpha's census) — even after filtering Alpha's templated false positives, this file remains the single largest concentration of manual visibility-toggle debt and should be the first beneficiary once `mutateList`/`renderList` are proven elsewhere.

**Caught by Bravo, missed by Alpha entirely:**
- The actual root-cause *mechanism* (`state.js:60-83`'s reference-equality `set` trap) — Alpha's audit log never opens `state.js`; it can score "Reactivity Determinism" generically (35%) but cannot explain *why*.
- The `ui.js:622-623` proof-pair — the only evidence in either exhibit that a correct pattern already exists in-tree, ready to be canonicalized rather than invented.
- The `style.css:869-870` vs `:570-582` CSS dual-authority collision — Alpha never opens `style.css`, despite invoking `body[data-active-tab]` in ~100 of its own rows.
- Any remediation strategy whatsoever — Alpha is a pure findings census with zero "what do we do about it" content.

**Caught by neither, surfaced only by this reconciliation's independent verification:**
- The `persistence.js:11-25` `PERSIST_FIELDS` allow-list and its `GOLF_APP_STATE_KEY` mechanism — proof that Bravo's #7 ("only `playerClubs` survives a refresh") is fabricated, not merely miscounted. Neither Alpha nor Bravo opened `persistence.js`'s actual save/load cycle; Bravo guessed at its absence and was wrong in the maximally consequential direction (claiming critical mid-round state is lost when it is, in fact, the most thoroughly-persisted state in the app).

**Net assessment:** Alpha is the superior *raw census* — wider net, zero location fabrication, and (once its templated mislabels are filtered per §III) a genuinely useful expansion source. Bravo is the superior *finished product* on six of seven rows — narrower net, but mechanism-true and immediately actionable. Its seventh row is this round's most important catch precisely because it *looked* the most authoritative (specific count, specific file, plausible-sounding claim) while being the most wrong — and had already fooled one prior reconciliation pass into "correcting the count" instead of checking the premise.

---

*Original two source exhibits left untouched. No production code in `src/`/`tests/` was modified, staged, or committed — this document is the sole write performed for this synthesis.*
