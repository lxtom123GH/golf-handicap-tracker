# Master Lens — Reconciled Backlog (Adversarial Cross-Examination, Round 6)
*Synthesis of `backlog_master.md` (Exhibit Alpha / Jules Engine) and `backlog_master_claudeCLI.md` (Exhibit Bravo / Claude CLI), verified against the live source tree on `main`.*

## I. Peer Review Assessment

| Exhibit | Line-level precision | False positives / framing issues | Verdict |
|---|---|---|---|
| **Bravo (master_claudeCLI)** | High — 6 of 7 cited targets verified exact at the file:line level (`state.js:60-83`, `practice.js:370-372`, `ui.js:622-623`, `auth-v2.js:25-28,42-45,153-157,201-205`, `style.css:869-870`/`570-582`, `oncourse.js:724,727,1519`, `admin.js`/`coach.js`/`competitions.js`/`card-render.js` `innerHTML=''` sprawl — 19 live instances confirmed) | One bundled inaccuracy in #6 ("no unsubscribe" is false for 2 of 3 cited files — see Hallucination Check); #7's "30+ unmirrored keys" overcounts the live 25-key/24-unmirrored `initialState`; `score-input.js`/`card-render.js` paths omit the `modules/` directory | **Vastly superior on this round.** It is the only exhibit that actually performed master-lens synthesis — naming files, lines, cross-lens provenance, impact, and atomic fix sizes. Six of seven entries are exact; the seventh is a true finding wrapped around one false sub-claim |
| **Alpha (master)** | N/A — cites zero files and zero line numbers of its own | Not hallucinated, but functionally empty as a backlog: its single entry (BL-3.07) is a meta-summary ("reactivity determinism score 35%... relies on imperative DOM manipulation") that simply points at a separate 535-line audit (`night1_master.md`) rather than distilling it into a ledger | **Abdicated the task.** The 35% score and "imperative DOM over reactivity/`data-active-tab`" characterization are corroborated by `night1_master.md` (15+ concretely cited `innerHTML`/`classList`/`.style` instances), so the *claim* is true — but a one-line pointer to another document is not a reconciled backlog entry. It carries a quantified-scale signal Bravo's table lacks, and nothing else |

**Bottom line:** This round is lopsided. Bravo did the actual work the master-lens synthesis demands — seven concrete, mostly-verified, file:line-anchored findings with remediation sizing. Alpha produced a single summary statement that defers to an external document instead of reconciling anything; its only contribution of value is the aggregate 35% reactivity-determinism score, which usefully frames *how big* the problem Bravo's points-fixes are chipping away at really is.

---

### The Hallucination Check

**Alpha (BL-3.07)** — **not hallucinated, but contentless as a ledger entry.** The "35% reactivity determinism score" traces cleanly to `night1_master.md:6` and its reasoning is backed by a real catalog of `innerHTML`/`classList.add('hidden')`/`.style` sites spanning `admin.js`, `oncourse.js`, `app-v4.js`, and others (verified: lines 14-95 of that report cite ~15 concrete snippets, each correctly described as "imperative DOM manipulation untethered from a reactive state subscription"). The defect isn't fabrication — it's that the backlog entry itself supplies no file, no line, no remediation, and no chunk size; it is a pointer ("see the other report") dressed as a backlog item, which is indistinguishable in practice from generic audit-summary boilerplate.

**Bravo #6** (`whs.js:148-156`, `practice.js:360-372`, `social.js:23-31` — "Firestore listeners with no schema guard / unsubscribe / proxy-routed cache writes") — **partially false: the "no unsubscribe" clause does not survive inspection for 2 of the 3 cited files.**
- `whs.js:11` declares `let unsubscribeWHS = null;`, `whs.js:143` calls `if (unsubscribeWHS) unsubscribeWHS();` defensively before resubscribing, and `whs.js:159` reassigns `unsubscribeWHS = onSnapshot(q, ...)`. This is the textbook subscribe/teardown lifecycle, correctly implemented.
- `practice.js:12,361,369` follows the identical pattern with `unsubscribePractice`.
- Only `social.js` genuinely lacks a listener-lifecycle concern (it isn't a listener at all — it's a one-shot `getDocs` cache populate at `social.js:23-26`).

So two-thirds of the cited files already do the thing Bravo claims they don't. The other two clauses of #6 — "no schema guard" (true: zero `normalizeRoundDoc`/`normalizeUserDoc`/any `normalize*` helper exists anywhere in `src/`) and "proxy-routed cache writes" that silently mutate (true: `social.js:26`'s `AppState.allUsersCache.push(...)` is the *exact same* reference-equality silent-mutation bug as #1's root cause — `allUsersCache` is reassigned to `[]` then mutated via `.push` inside the same `forEach`, firing zero `stateChange` events for the populated entries) — are both real and well-targeted. Bundling a correct finding with an incorrect one under a single bullet is the kind of error that gets a "fixed" ticket closed for work that was never needed (rewiring unsubscribe handling that already works) while the real defects (schema guard, silent mutation) go untouched.

**Bravo #7** (`state.js:38-53` and "the 30+ unmirrored `initialState` keys") — **count overstated.** The live `initialState` object (`state.js:6-37`) has exactly 25 top-level keys; only `playerClubs` is mirrored to `localStorage` (via the `golfAppClubs` hydrate block at `state.js:38-53`), leaving **24** unmirrored, not "30+". The substance of the finding — "only `playerClubs` survives a refresh" — is exactly correct; only the headline count needs correcting.

**Bravo #1–#5** — all verified clean at the cited file:line ranges: `state.js:60-83` (Proxy `set` trap, reference-equality check at line 76), `practice.js:370-372` (`= []` then `.push` inside `onSnapshot`), `ui.js:622-623` (`splice` then spread-reassign — the *correct* idiom, undocumented), `auth-v2.js:25-28/42-45/153-157/201-205` (all four blocks pair `classList.add/remove('hidden')` with `style.display = 'block'/'none'`, the latter commented `// Force hide` / `// Force show` — exactly the "documented prior bug fixed at the symptom layer" framing), `style.css:869-870` (`body.round-active #tab-oncourse.hidden { display: block !important; }`) vs. `:570-582` (the 13-selector `body[data-active-tab="..."] ... { display: block !important; ... }` exclusivity block at `:583-584`), and `oncourse.js:724,727,1519` (three uncancelled `setTimeout` calls mutating `UI.voiceOverlay`/`msg` via `classList`). The only nit: `score-input.js:166` and `card-render.js` (item #5's call sites) live at `src/modules/score-input.js` and `src/modules/card-render.js` — the directory prefix is missing from both citations, though the line numbers land exactly on the described code.

### The Blindspot Report

**Valid findings Alpha caught that Bravo missed** (Bravo's lens is entirely surgical — seven point-fixes with no aggregate measurement; it never frames the *scale* or *security* angle of the problem it's chipping at):
- The aggregate severity measurement: a quantified 35% "reactivity determinism score" and the broader catalog behind it (`night1_master.md` cites ~15 concrete `innerHTML`/`classList`/`.style` sites across `admin.js`, `oncourse.js`, `app-v4.js`, `coach.js` and others) — this gives a reviewer a sense of *total remediation surface* that Bravo's seven-row punch-list does not attempt to convey.
- The **security framing** of the `innerHTML` rebuild pattern: `night1_master.md` repeatedly tags these sites "Vulnerable to XSS and layout thrashing" — a risk dimension entirely absent from Bravo #5, which frames the identical `innerHTML = ''` + rebuild sites purely as a DRY/perf issue. Both framings are valid; Bravo's misses the security angle that Alpha's underlying audit (if not its backlog entry) surfaces.

**Valid findings Bravo caught that Alpha missed** (Alpha's pointer entry never opens a single source file — it has no file:line content of its own to compare against any of these):
- The root-cause architectural mechanism: `AppState`'s Proxy `set` trap uses `oldValue !== value` reference equality, so in-place array mutation (`.push`/`.splice`) never fires `stateChange` — the single fact that *explains* why 35% reactivity determinism is even possible in an app with a working Proxy (Bravo #1).
- The concrete, currently-live instance of that bug actively losing UI updates (`practice.js:372`'s `.push` inside `onSnapshot`, Bravo #2) — and, separately, the *same* bug recurring in `social.js:26`'s cache-populate loop (correctly folded into Bravo #6 despite that entry's unsubscribe misstatement).
- The fact that the **correct fix idiom already exists**, unpromoted, at `ui.js:622-623` — meaning the fix for #1/#2 is an extraction-and-promotion, not new design (Bravo #3).
- The precise CSS-vs-state authority collision: `style.css:869-870`'s `!important` rule independently overriding the same element the `data-active-tab` exclusivity contract (`:570-582`) is supposed to govern exclusively — Alpha's pointer never opens `style.css` at all (Bravo #3, second sense).
- The uncancelled-`setTimeout` handle leak across `oncourse.js`/`score-input.js` (Bravo #4) and the missing Firestore-doc schema-normalization layer plus proxy-cache silent-mutation pattern (Bravo #6's valid two-thirds).
- The `localStorage` mirroring gap — 24 of 25 `initialState` keys vanish on refresh, an offline-resilience defect orthogonal to the "reactivity determinism" framing Alpha anchored its entire entry on (Bravo #7).

---

## II. The Reconciled Master Lens Backlog
*De-duplicated, file-by-file. Ordered by ROI: the state-layer root cause first (it retroactively explains and simplifies #2, #6's mutation half, and gates #7), then the two "two authorities, one outcome" symptom instances it produces, then the remaining independent clusters.*

### 1. Target: `state.js:60-83`
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
**Remediation Plan:** Add an exported `mutateList(key, fn)` helper — `const copy = [...target[key]]; fn(copy); target[key] = copy;` — that mutates a shallow copy and reassigns through the existing `set` trap (reference changes, so the trap fires deterministically). Purely additive; the trap itself is untouched, zero blast radius on existing reactive paths. ~30 lines. *(Bravo #1, exact; this is the fix that #2 and #6's `social.js` half should both be migrated onto.)*

### 2. Target: `practice.js:370-372` (+ `social.js:23-26`, same defect)
**Violation:**
```js
unsubscribePractice = onSnapshot(q, (snapshot) => {
    AppState.currentPracticeRounds = [];                                            // fires stateChange
    snapshot.forEach(docSnap => {
        AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() }); // silent — no stateChange
    });
    ...
});
// social.js:23-26 — identical shape:
if (!AppState.allUsersCache) {
    const snap = await getDocs(collection(db, 'users'));
    AppState.allUsersCache = [];                                                    // fires stateChange
    snap.forEach(d => AppState.allUsersCache.push({ uid: d.id, ...d.data() }));     // silent
}
```
**Remediation Plan:** Replace each reset-then-push loop with a single reassignment built from the snapshot — `AppState.currentPracticeRounds = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));` and `AppState.allUsersCache = snap.docs.map(d => ({ uid: d.id, ...d.data() }));` — or, once #1 lands, route both through `mutateList`. Either fires exactly one `stateChange` instead of one-then-silence. ~15 lines across both sites, single chunk. *(Bravo #1's "one workaround exists but isn't shared" + the live instance at Bravo #2, extended to its `social.js` twin that neither exhibit's table connected to the same root cause.)*

### 3. Target: `ui.js:622-623`
**Violation:**
```js
li.querySelector('.remove-player-btn').addEventListener('click', () => {
    AppState.liveRoundGroups.splice(index, 1);
    AppState.liveRoundGroups = [...AppState.liveRoundGroups];
});
```
**Remediation Plan:** This *is* the correct mutate-then-reassign idiom — bespoke and undiscoverable. Once `mutateList` exists (#1), replace with `mutateList('liveRoundGroups', list => list.splice(index, 1))` and make this call site the helper's first documented caller, collapsing the redundant "splice in place, then spread the already-spliced array" double operation into one declared intent. ~5 lines. *(Bravo #1's cited proof-of-pattern.)*

### 4. Target: `auth-v2.js:25-28, 42-45, 153-157, 201-205`
**Violation:**
```js
// :153-157 — paired, redundant authorities; the style.display lines are commented "Force hide"/"Force show"
UI.authOverlay.classList.add('hidden');
UI.authOverlay.style.display = 'none';   // Force hide
UI.mainApp.classList.remove('hidden');
UI.mainApp.style.display = 'block';      // Force show
```
**Remediation Plan:** Collapse all four blocks to `classList`-only; delete the four paired `style.display` assignments and their "Force hide/show" comments (which are themselves an admission that `classList` alone was once judged insufficient — the actual bug to find is *why* it was insufficient, likely a missing/overridden CSS rule, not a justification to keep the second lever). ~25 lines. *(Bravo #2, exact — "documented prior bug fixed at the symptom layer.")*

### 5. Target: `style.css:869-870` vs. `style.css:570-582`
**Violation:**
```css
/* :570-582 — the sanctioned exclusivity contract (13 selectors, one declared authority) */
body[data-active-tab="tab-oncourse"] #tab-oncourse, /* …12 more… */ {
    display: block !important;
    opacity: 1 !important;
    ...
}

/* :869-870 — a second, independent authority that can force the same element visible */
body.round-active #tab-oncourse.hidden {
    display: block !important;
}
```
**Remediation Plan:** Delete the `body.round-active #tab-oncourse.hidden` rule; instead set `AppState.activeTab = 'tab-oncourse'` at the round-start routing point (`persistence.js`'s `document.body.classList.add('round-active')` call is the natural insertion point — `activeTab` already exists in `initialState`). Collapses two independent visibility authorities for `#tab-oncourse` into the one contract the rest of the app follows. ~20 lines. *(Bravo #3, exact.)*

### 6. Target: `oncourse.js:724,727,1519`, `modules/score-input.js:166`
**Violation:**
```js
setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);  // oncourse.js:724
setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2000);  // oncourse.js:727
setTimeout(() => msg.classList.add('hidden'), 3000);              // oncourse.js:1519
setTimeout(() => toast.remove(), 2500);                           // modules/score-input.js:166
```
**Remediation Plan:** Cache each timer's id on the originating module/element and `clearTimeout` it before rescheduling (and on the relevant teardown event — e.g. `activeTab` change for the `oncourse.js` overlay sites). A single small `scheduleDomCleanup(fn, ms)` helper covers all four call sites in one ≤100-line chunk. ~25 lines. *(Bravo #4, exact — corrected path: `modules/score-input.js`, not `score-input.js`.)*

### 7. Target: `admin.js`, `coach.js`, `competitions.js`, `modules/card-render.js` (19 confirmed `innerHTML = ''` + manual-rebuild call sites)
**Violation:**
```js
// representative of 19 live instances (admin.js ×3, coach.js ×5, competitions.js ×7, modules/card-render.js ×4)
if (usersList) usersList.innerHTML = '';
snap.forEach(d => { /* …build a <tr>, append… */ });
```
— each site is both a DRY violation (the same clear-and-rebuild loop reimplemented 19 times) **and**, per the underlying master-lens audit (`night1_master.md`), a latent XSS/layout-thrash vector wherever any interpolated value reaches `innerHTML` rather than `textContent`/DOM APIs.
**Remediation Plan:** Extract `renderList(container, items, toRowFn, emptyMsg)` (clears via `container.replaceChildren()`, builds rows through `toRowFn` using safe DOM construction — no string-concatenated `innerHTML` — and renders `emptyMsg` when `items` is empty). Migrate the 19 call sites in 2-3 chunks of ≤100 lines each, file-by-file (`admin.js` → `coach.js` → `competitions.js` + `modules/card-render.js`). ~70-90 lines per chunk. *(Bravo #5's DRY/perf framing, merged with Alpha's underlying-report XSS framing that Bravo's table omitted — the same fix resolves both.)*

### 8. Target: `whs.js:148-156`, `practice.js:360-372`, `social.js:23-31`
**Violation:** No `normalizeRoundDoc`/`normalizeUserDoc` (or any `normalize*`) guard exists anywhere in `src/` — `onSnapshot`/`getDocs` callbacks spread raw Firestore doc data (`{ id: docSnap.id, ...docSnap.data() }`) directly into state with no shape validation, plus the silent-mutation cache-write pattern already covered in #2 above (`social.js:26`).
**Remediation Plan:** Land `normalizeRoundDoc(raw)` / `normalizeUserDoc(raw)` — pure functions that supply defaults for missing/malformed fields (`date`, `score`, `displayName`, etc.) — and route all three `onSnapshot`/`getDocs` callbacks through them before assigning to `AppState`. ~40 lines (two normalizers + three call-site edits), additive only. **Do not** scope this as "add unsubscribe lifecycle" — `whs.js` (`unsubscribeWHS`, declared `:11`, guarded `:143`, reassigned `:159`) and `practice.js` (`unsubscribePractice`, declared `:12`, guarded `:361`, reassigned `:369`) already implement the correct subscribe/teardown pattern; re-touching that code would be wasted effort against a non-existent defect. *(Bravo #6, narrowed to its two valid clauses — schema guard and proxy-cache silent writes — with the false "no unsubscribe" clause removed per the Hallucination Check.)*

### 9. Target: `state.js:6-37` (25 `initialState` keys, 24 unmirrored) + `:38-53` (the `playerClubs`-only hydrate block)
**Violation:** Of 25 top-level `initialState` keys, only `playerClubs` round-trips through `localStorage` (`golfAppClubs`, hydrated at `:38-53`). Everything else — `currentRounds`, `handicapIndex`, `liveRoundGroups`, `activeRoundId`, `currentRoundDate`, `currentHole`, `currentShotData`, …(20 more)… — is lost on refresh, including mid-round tracking state.
**Remediation Plan:** Once #1 lands (so list-shaped keys mirror through the same `mutateList`-routed `set` trap, not a parallel ad-hoc path), add an allow-list of keys safe to mirror (excluding live Firestore-derived collections like `currentRounds`/`allUsersCache`, which should rehydrate from listeners, not stale local copies) plus a boot-time hydrate block mirroring the existing `playerClubs` pattern. Two-part chunk: allow-list + persistence wiring (~40 lines), then boot-time hydrate (~35 lines). *(Bravo #7, count corrected from "30+" to the verified 25 keys / 24 unmirrored — substance otherwise exact, and correctly sequenced last as the largest, most behavior-sensitive surface.)*

---

### Process Note: on Alpha's contribution
Alpha's single entry (BL-3.07) supplied no file:line content to reconcile, but its 35% "reactivity determinism score" is worth preserving as the **scale marker** against which the above nine atomic fixes should be measured: even after all nine land, the bulk of the score's drag — the 155+ `classList.add/remove('hidden')` instances and 19+ `style.display` assignments cataloged in `night1_master.md` but never individually targeted by either exhibit's table — remains as a separate, much larger epic. Future master-lens rounds should treat "imperative DOM sprawl, broad strokes" (Alpha's strength) and "surgical root-cause + fix-idiom identification" (Bravo's strength) as complementary inputs, not substitutes — this round, only one of the two lenses showed up to do the latter.
