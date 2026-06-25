# MASTER BACKLOG — Supermagic Delta
*Grand synthesis of 12 adversarial reconciled ledgers (`backlog_*_reconciled_{charlie,delta}.md`) into a single, de-duplicated, verified backlog for the Reactivity & State-Ingestion Enclosure. This is a re-run of the original Grand Synthesis: `backlog_master_reconciled_delta.md` was rewritten between runs (its fabricated #9 row was retracted at the source), so this edition reflects the corrected ledger rather than carrying its error forward.*

---

## I. The Architectural Verdict

**Overall health: ~35% reactivity-determinism (per the cross-lens-corroborated `night1_master.md` baseline), with two confirmed runtime-breaking bugs and a well-understood, fixable root-cause chain.**

The twelve ledgers converge on a single causal story rather than a scattered pile of style nits:

1. **One root cause explains most of the rest.** `AppState`'s Proxy `set` trap (`state.js:60-83`) checks `oldValue !== value` — reference equality only. In-place array/object mutation (`.push`, `.splice`, `obj[k] = v`) silently bypasses `stateChange` dispatch. This single fact explains why `practice.js`, `social.js`, and `app-v4.js` each carry a live data-loss bug, and why so much of the UI has grown a parallel imperative layer (`classList`/`style.display`/`innerHTML`) instead of trusting reactive re-renders — **the proxy can't be trusted for arrays, so engineers stopped trying.**
2. **The correct fix idiom already exists, unpromoted, in the codebase** at `ui.js:622-623` (`splice` then spread-reassign). The remediation is a *promotion* of an existing pattern into a shared `mutateList(key, fn)` helper, not new design work — this is the highest-ROI architectural chunk in the entire backlog.
3. **The `body[data-active-tab]` layout contract is real, sanctioned, and exists at `style.css:570-588`** — but it has at least two competing authorities actively undermining it: a second `!important` CSS rule (`style.css:869-870`) and a self-documented "Force hide/Force show" `style.display` layer in `auth-v2.js`. Both are small, isolated, well-understood fixes.
4. **Two confirmed runtime-breaking bugs exist outside the reactivity cluster**: (a) a Firestore security-rules / collection-path mismatch on `practice_plans` that throws `FirebaseError: No matching allow statements` at runtime, and (b) an `audioTimerInterval` leak (`endRoundCleanup` never calls `stopAudioTimer`) that runs an interval indefinitely if a round ends mid-recording. Both should outrank any architectural cleanup — they are live, evidenced, and trivially fixable in isolation.
5. **A meaningful fraction of "findings" circulating across these twelve ledgers are confirmed false**, and one of them — "only `playerClubs` survives a refresh" — is now the single most-repeated hallucination in the entire corpus, having independently infected *two separate ledger lineages* (Llama-charlie and an earlier draft of Master-delta) before being caught and permanently retired by a three-pass convergence documented in §III. Section III exists specifically so these do not get re-discovered and re-funded in a future round.

**Bottom line:** fix the two confirmed runtime bugs (cheap, isolated, ship today), land `mutateList` to close the Proxy gap, collapse the two CSS/JS visibility-authority collisions it's tangled with, and the bulk of the remaining "155+ `classList.add/remove('hidden')` instances" backlog becomes a mechanical, low-risk, file-by-file mop-up rather than an architectural emergency.

---

## II. The Definitive Master Backlog
*Ordered by ROI: confirmed runtime bugs first, then the state-layer root cause (which retroactively simplifies the largest cluster of subsequent items), then its concrete instances, then the layout-contract collisions it produces, then independent clusters.*

### 1. 🔴 Firestore rules / collection-path mismatch on `practice_plans` (CONFIRMED RUNTIME BUG)
* **Target:** `firestore.rules:44` (rule nested at `/users/{userId}/practice_plans/{planId}`) vs. `src/ui.js:806-825` (`bindPracticeCaddyUI` → `loadActivePlan`)
* **Violation:**
  ```js
  // ui.js:821 — queries the ROOT-level collection, but the only matching
  // security rule lives at a subcollection path
  const q = query(
      collection(db, "practice_plans"),
      where("userId", "==", AppState.currentUser.uid),
      where("status", "==", "active")
  );
  ```
  Firestore has no `allow` statement covering `/practice_plans/{planId}` at the root, so this throws `FirebaseError: No matching allow statements` at runtime (corroborated against an emulator log).
* **Remediation Plan:** Pick one canonical location and align both sides (~30 lines, single chunk). Lower-risk option: add a root-level `match /practice_plans/{planId} { allow read, write: if isAuthenticated() && (request.auth.uid == resource.data.userId || isAdmin()); }` block to `firestore.rules` — the docs already carry a `userId` field, so no query rewrite is needed.
* **Provenance:** `backlog_llama_reconciled_delta.md` #1 (verified via line-level cross-check of both the rule and the query, plus emulator-log corroboration). *Note: `backlog_llama_reconciled_charlie.md` mislabels this exact same finding as a hallucination, with a self-contradictory explanation — its own sentence ("the query points to the root collection, whereas the rules define it under the subcollection path") **describes** the mismatch while concluding it "isn't problematic." That is the mismatch; a query against a path the rules don't cover is precisely what produces "No matching allow statements." This is a second instance (alongside the playerClubs cascade in §III) of an earlier reconciliation round of the *same lens* getting a finding backwards, later corrected by its own delta round — the Llama-delta ledger's deeper trace (rule path + query path + emulator log) is adopted here as authoritative.*

### 1a. 🔴 `audioTimerInterval` leak — confirmed, not hypothetical
* **Target:** `src/oncourse.js:99-124` (`endRoundCleanup`) and `src/oncourse.js:813,819-822` (`startAudioTimer`/`stopAudioTimer`)
* **Violation:**
  ```js
  // oncourse.js:813 — started here
  audioTimerInterval = setInterval(() => { recordingSeconds++; updateAudioUI(); }, 1000);
  // oncourse.js:819-822 — only ever cleared from the manual "stop recording" toggle (line 796)
  function stopAudioTimer() { if (audioTimerInterval) { clearInterval(audioTimerInterval); audioTimerInterval = null; } }
  // oncourse.js:99 — endRoundCleanup() never calls stopAudioTimer() or clearInterval()
  ```
  If a round ends or is aborted while the audio diary is actively recording, `audioTimerInterval` keeps firing `updateAudioUI()` every second indefinitely.
* **Remediation Plan:** Add `stopAudioTimer();` as the first line of `endRoundCleanup()` — it is already a no-op when no timer is running, so this is a pure, zero-risk addition. ~3 lines, smallest possible chunk, ship in isolation.
* **Provenance:** `gpt4o_reconciled_delta.md` #2 — upgraded from "potential" (Alpha's framing) to **confirmed** via an explicit cross-trace through `startAudioTimer`/`stopAudioTimer`/`endRoundCleanup`. The only entry across all twelve ledgers describing a real, currently-live `setInterval` leak rather than a `setTimeout` race — promoted alongside #1 as a Phase-0, ship-today item precisely because it is this cheap and this isolated.

---

### 2. 🔴 `AppState` Proxy `set` trap — reference-equality only (ROOT CAUSE)
* **Target:** `src/state.js:60-83`
* **Violation:**
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
* **Remediation Plan:** Add an exported `mutateList(key, fn)` helper — `const copy = [...target[key]]; fn(copy); target[key] = copy;` — that mutates a shallow copy and reassigns through the existing `set` trap (the reference changes, so the trap fires deterministically). Purely additive; the trap itself is untouched, zero blast radius on existing reactive paths. ~30 lines.
* **Provenance:** Independently identified and verified byte-for-byte in 7 of 12 ledgers (`master_charlie` #1, `master_delta` #1, `o1_charlie`, `o1_delta` #1, `r1_charlie` #4, `r1_delta` R1-01, `gpt4o_charlie`/`gpt4o_delta` #3 via the dispatch-mechanism angle). Zero disagreement — this is the single most cross-corroborated finding in the entire corpus.

### 2a. 🟠 Unfiltered global `stateChange` dispatch (secondary state.js finding)
* **Target:** `src/state.js:66-74`
* **Violation:**
  ```js
  if (oldValue !== value) {
      const event = new CustomEvent('stateChange', { detail: { property: prop, oldValue, newValue: value } });
      window.dispatchEvent(event);   // global, unfiltered — every listener wakes on every write
  }
  ```
* **Remediation Plan:** Do **not** restructure the dispatch itself (high blast radius — every subscriber depends on the current event shape). Instead add a documented `onStateChange(keys, handler)` wrapper that early-exits via `if (!keys.includes(e.detail.property)) return;` before invoking `handler`, and migrate the highest-frequency listeners (`currentHole`, shot-tracking keys) first. ~40 lines for the helper + JSDoc; migration is a separate follow-up.
* **Provenance:** `backlog_gpt4o_reconciled_delta.md` #3 — names the `O(listeners) × O(writes)` cost mechanism explicitly; cross-checked clean. Deferred, not urgent: the cost is real but currently negligible at observed listener counts.

---

### 3. 🔴 Live data-loss instances of the Proxy bypass
* **Target:** `src/practice.js:370-372`, `src/social.js:23-26`, `src/app-v4.js:366,386`
* **Violation:**
  ```js
  // practice.js:370-372 — onSnapshot reset-then-push
  AppState.currentPracticeRounds = [];                                            // fires stateChange
  snapshot.forEach(docSnap => {
      AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() }); // silent — no stateChange
  });

  // social.js:23-26 — identical shape
  AppState.allUsersCache = [];
  snap.forEach(d => AppState.allUsersCache.push({ uid: d.id, ...d.data() }));

  // app-v4.js:366,386 — nested-key assignment, same set-trap bypass
  AppState.profileUsersMap[d.id] = opt.textContent;
  ```
* **Remediation Plan:** Replace each reset-then-push loop with a single top-level reassignment built from the snapshot (`AppState.currentPracticeRounds = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))`), and replace `profileUsersMap` nested writes with `AppState.profileUsersMap = { ...AppState.profileUsersMap, ...updates }`. Once #2 lands, route all three through `mutateList`. ~40 lines across three sites — land as one coordinated chunk since they share a single root cause and a single fix shape.
* **Provenance:** `practice.js` instance corroborated in 8+ ledgers (the most-cited concrete bug in the corpus); `social.js` in `master_delta` #2 and `gemini_delta` #2/#3; `app-v4.js` in `gemini_charlie` #5 / `gemini_delta` #3. All three independently verified line-exact.

### 3a. 🟢 Promote the existing correct idiom
* **Target:** `src/ui.js:622-623`
* **Violation (this is the *good* pattern, currently undiscoverable):**
  ```js
  AppState.liveRoundGroups.splice(index, 1);
  AppState.liveRoundGroups = [...AppState.liveRoundGroups];
  ```
* **Remediation Plan:** Once `mutateList` (#2) exists, replace with `mutateList('liveRoundGroups', list => list.splice(index, 1))` and make this call site the helper's first documented caller — collapsing the redundant "splice in place, then spread the already-spliced array" double operation into one declared intent. ~5 lines.
* **Provenance:** `master_delta` #3, `o1_delta` #3, `r1_charlie`/`r1_delta` R1-01 — unanimous: this is the proof that the fix pattern is already proven in production, not theoretical. *(One source ledger, `o1_charlie`, briefly mis-described `practice.js:370` itself as "no reassignment" — self-corrected within its own delta round; substance unaffected. See §III.)*

---

### 4. 🟠 `#tab-oncourse` visibility — two competing CSS authorities
* **Target:** `src/style.css:869-870` vs. `src/style.css:570-588`
* **Violation:**
  ```css
  /* :570-588 — the sanctioned exclusivity contract (13 selectors, one declared authority) */
  body[data-active-tab="tab-oncourse"] #tab-oncourse, /* …12 more… */ {
      display: block !important; opacity: 1 !important; ...
  }

  /* :869-870 — a second, independent authority that can force the same element visible */
  body.round-active #tab-oncourse.hidden { display: block !important; }
  ```
* **Remediation Plan:** Delete the `body.round-active #tab-oncourse.hidden` rule; instead set `AppState.activeTab = 'tab-oncourse'` at the round-start routing point (`persistence.js:94`'s `document.body.classList.add('round-active')` call is the natural insertion point — `activeTab` already exists in `initialState`). Collapses two independent visibility authorities into the one contract the rest of the app follows. ~20 lines.
* **Provenance:** Appears, line-identical, in 6 of 12 ledgers (`master_charlie` #3, `master_delta` #5, `o1_charlie`, `o1_delta` #4, `r1_charlie` #1, `r1_delta` R1-02). Zero disagreement — coordinate with #4a below; both are CSS/JS visibility-authority collisions and several lenses recommend landing them together.

### 4a. 🟠 `auth-v2.js` — redundant `classList` + `style.display` "Force" levers
* **Target:** `src/auth-v2.js:25-28, 42-45, 153-157, 201-205`
* **Violation:**
  ```js
  UI.authOverlay.classList.add('hidden');
  UI.authOverlay.style.display = 'none';   // Force hide   (self-documented admission)
  UI.mainApp.classList.remove('hidden');
  UI.mainApp.style.display = 'block';      // Force show
  ```
* **Remediation Plan:** Collapse all four blocks to `classList`-only and delete the four paired `style.display` assignments and their "Force hide/show" comments — which are themselves an admission that `classList` alone was once judged insufficient. The actual bug to find is *why* it was insufficient (likely a CSS-specificity loss against `.hidden`), not a justification to keep the second lever; fix the CSS specificity instead of doubling the JS. ~25 lines.
* **Provenance:** Appears in 7 of 12 ledgers, all citing the identical four line ranges and the `// Force hide`/`// Force show` comments verbatim (`master_charlie` #2, `master_delta` #4, `gemini_charlie` #1, `gemini_delta` #5, `r1_charlie` #2, `r1_delta` R1-03, `llama_delta` #5-cluster, `o1_delta` #5-cluster). The self-documenting comments are independently read by multiple lenses as "evidence of a prior incident" — a maintainer-trap worth fixing at its root (CSS specificity), not papering over again.

---

### 5. 🟡 Untethered `setTimeout` handles on shared elements (corrected & widened cluster)
* **Target:** `src/oncourse.js:724,727,1519`, `src/notifications.js:53` *(see exclusion note below)*
* **Violation:**
  ```js
  setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);  // oncourse.js:724
  setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2000);  // oncourse.js:727 — same element, different duration, races #724
  setTimeout(() => msg.classList.add('hidden'), 3000);              // oncourse.js:1519
  setTimeout(() => msgEl.classList.add('hidden'), 3000);            // notifications.js:53 — same shape, missed by the original master ledger
  ```
  No site stores its timer handle or calls `clearTimeout` before rescheduling — competing timers stack against the same *shared, re-triggerable* element, and a view can be torn down while a timer is still pending.
* **Correction to scope — `score-input.js:166` explicitly excluded:** Several ledgers (including `o1_delta`/`gpt4o_delta`) bundled `modules/score-input.js:166` (`setTimeout(() => toast.remove(), 2500)`) into this cluster. Verified: that `toast` is a function-local element created via `document.body.appendChild(toast)` and discarded after one use — it can never be re-triggered against a stale handle, so it carries none of the shared-element race risk the four sites above share. Folding it in would mis-scope the fix toward `clearTimeout` ceremony a disposable node never needs; it is dropped from this cluster (the most recent reconciliation pass — `master_delta` — is the only one of the affected ledgers to catch this).
* **Remediation Plan:** Cache each *shared* element's pending-hide handle on its owning module/scope and `clearTimeout` it before rescheduling (and on relevant teardown — e.g. `activeTab` change for the `oncourse.js` overlay). One mechanical pass across the four verified shared-element sites, ~20-25 lines, single PR. *Cross-lens note: the `oncourse.js:724/727` pair and fix were independently proposed by the GPT-4o, R1, and O1 lenses — land as one coordinated PR to avoid triplicated review effort.*
* **Provenance:** Cross-corroborated in `master_delta` #6 (corrected scope adopted here), `gpt4o_charlie`/`gpt4o_delta` #1, `o1_delta` #7, `r1_charlie` #3, `r1_delta` R1-04, `llama_charlie`/`llama_delta`.

---

### 6. 🟡 Imperative `innerHTML` rebuild sprawl — DRY, perf, and XSS (widened to its true 9-file census)
* **Target:** `src/admin.js:16-45`, `src/coach.js:56-71`, `src/competitions.js:43-45,215-228`, `src/modules/card-render.js:15-87`, `src/analytics.js:7,18,39,88`, `src/notifications.js` (banner rebuild), `src/social.js:42-98`, `src/wakelock.js:51`, `src/ai.js:28`
* **Violation (representative shape, recurs at minimum 9 file boundaries):**
  ```js
  container.innerHTML = '';
  items.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${item.x}</td>...`;   // string-built — XSS-adjacent wherever data is interpolated
      container.appendChild(row);                 // one reflow-triggering append per row
  });
  ```
* **Remediation Plan:** Extract a single shared `renderList(container, items, toRowFn, emptyMsg)` utility — clears via `container.replaceChildren()`, builds rows through `toRowFn` using safe DOM construction (`document.createElement`/`.textContent`, no string-concatenated `innerHTML`), batches inserts through a `DocumentFragment` (folding in #6a below), and renders `emptyMsg` when empty. Migrate in ROI-ordered chunks of ≤90 lines, file-by-file: `admin.js`/`coach.js`/`competitions.js`/`card-render.js` first (the original 4-file census), then `analytics.js`/`social.js`/`notifications.js`, with `wakelock.js:51`/`ai.js:28` folded into whichever chunk lands nearest them.
* **Provenance:** The single most-converged finding after the Proxy root cause — independently proposed with overlapping targets across `master_charlie` #6, `master_delta` #7, `gpt4o_charlie`, `gpt4o_delta` #9, `llama_charlie`. **Multiple ledgers explicitly flag a cross-lens coordination risk: shipping two incompatible `renderList` signatures from independent PRs.** This entry should be implemented exactly once. The security framing (XSS/layout-thrash) comes from Alpha's raw census via `master_delta`'s reconciliation — Bravo's original framing of this cluster was pure DRY/perf and omitted it entirely.

### 6a. 🟢 `card-render.js` — per-row `appendChild` inside loop (the specific reflow mechanism)
* **Target:** `src/modules/card-render.js:38-50,76-87` (inside `updateLiveLeaderboard` / `renderDetailedReview`)
* **Violation:**
  ```js
  standings.forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>...</td><td>${s.name}</td>...`;   // string-built per row
      tbody.appendChild(tr);                                 // one reflow-triggering append per row
  });
  ```
* **Remediation Plan:** Build all `<tr>` nodes into a `DocumentFragment` and perform one `tbody.appendChild(fragment)` after the loop — collapses N reflows into one. Land this *first*, in isolation (~15 lines), as the reference implementation that #6's `renderList` extraction then absorbs — do not fold the two into a single PR (would exceed the 100-line chunk policy).
* **Provenance:** `gpt4o_delta` #8 — refines the broader "layout thrashing" framing down to the precise per-row mechanism (lines 43/49 and 79/85), correctly distinguishing it from the `innerHTML = ''` resets at 15/55/93/143 (which are the *correct*, idiomatic way to clear a container — not part of the violation).

### 6b. 🟠 Unescaped Firestore field interpolation — XSS-adjacent
* **Target:** `src/admin.js:24-26,155-158` (plus unflagged sibling `:215-228`), `src/ui.js:270-276`
* **Violation:**
  ```js
  // admin.js:24-26 — Firestore field values interpolated raw into innerHTML
  tr.innerHTML = `...<td>${data.displayName || 'N/A'}</td><td>${data.email}</td>...`;
  // ui.js:270 — settings panel, same shape
  info.innerHTML = `...<p><strong>Name:</strong> ${AppState.currentUser.displayName || 'Guest User'}</p>...`;
  ```
  A crafted `displayName`/`email`/document-ID value can break out of the attribute/string context.
* **Remediation Plan:** Replace template-string `innerHTML` assembly with `textContent` assignments against a static template (the layout never changes — only the data points do). For `admin.js`, route through #6's `renderList`; for `ui.js:270`, the surrounding markup can live as static elements in `index.html` with only the four `textContent` values set imperatively from a `stateChange` listener. ~35 + ~20 lines, two isolated chunks. *Note: `admin.js:55` is static boilerplate HTML (`tabAdmin.innerHTML = '<header>...Admin Dashboard...'`) with zero Firestore interpolation — a confirmed misattribution in one source ledger; do not include it in this fix's scope.*
* **Provenance:** `gemini_delta` #4 (admin.js, with the `:55` misattribution explicitly corrected) and `gpt4o_delta` #7 (ui.js:270, prioritized "ahead of [pure-reactivity entries] on security grounds despite lower traffic" — the only entry across either GPT-4o exhibit surfacing an actual injection-adjacent concern rather than a pure state-bypass one).

---

### 7. 🟡 Missing Firestore-doc schema normalization
* **Target:** `src/whs.js:148-156`, `src/practice.js:360-372`, `src/social.js:23-31`
* **Violation:** No `normalizeRoundDoc`/`normalizeUserDoc` (or any `normalize*`) guard exists anywhere in `src/` — `onSnapshot`/`getDocs` callbacks spread raw Firestore doc data (`{ id: docSnap.id, ...docSnap.data() }`) directly into render-bound state with no shape validation.
* **Remediation Plan:** Land `normalizeRoundDoc(raw)` / `normalizeUserDoc(raw)` — pure functions supplying defaults for missing/malformed fields (`date`, `score`, `displayName`, `uid`, etc.) — and route all three `onSnapshot`/`getDocs` callbacks through them before assigning to `AppState`. ~40 lines (two normalizers + three call-site edits), additive only.
* **Provenance:** `master_delta` #8, `gemini_delta` #1/#2 — **with the false "missing unsubscribe" sub-claim explicitly stripped out** (see §III, the corpus's most-repeated single hallucination). Land first per `gemini_delta`'s sequencing note, since #3/#3a above benefit from the same normalizer pattern. *A related, narrower angle — `onSnapshot` callbacks never branching on `snapshot.metadata.fromCache` — is folded in here from `llama_delta` #4 as the same "trust the wire shape blindly" defect viewed from the cache-freshness side.*

---

### 8. 🟢 Forced synchronous reflow in tempo animation loop
* **Target:** `src/tempo.js:122,135`
* **Violation:**
  ```js
  UI.tempoRing.style.display = 'block'; UI.tempoRing.style.animation = "none"; void UI.tempoRing.offsetWidth;
  ```
* **Remediation Plan:** Replace the `offsetWidth` read-for-side-effect with a `requestAnimationFrame` double-rAF or a dual-class swap (`ring--reset` → `ring--expand` on the next frame) so the animation restart no longer forces a synchronous layout flush on the main thread. ~25 lines, isolated to the two call sites.
* **Provenance:** `llama_charlie`/`llama_delta` #2 — verified exact across both rounds, zero disagreement; the one finding from the Llama lens that survived its own internal reconciliation completely intact (described there as "the single sharpest finding across both exhibits").

### 9. 🟡 `event-binders.js` — `innerHTML`/`classList.toggle` bypassing `AppState`
* **Target:** `src/modules/event-binders.js:319,321` and `:480,483`
* **Violation:**
  ```js
  // :319/321 — sibling if/else branches both writing raw HTML, computing `dh` outside the reactive layer
  UI.ocDailyHandicapLine.innerHTML = `Your Daily Handicap: <strong><input ... value="${dh}" ...></strong>`;
  // :480/483 — sub-navigation visibility driven by closure variables, not AppState
  simpleStats.classList.toggle('hidden', !isHub || !isSinglePlayer);
  document.getElementById('oc-leaderboard').classList.toggle('hidden', target !== 'leaderboard');
  ```
* **Remediation Plan:** (a) Compute `dh` and assign to a new `AppState.currentDailyHandicap` key; render `UI.ocDailyHandicapLine` from a `stateChange` listener using `textContent`/a static `<input>` element rather than `innerHTML` (~25 lines). (b) Promote `target`/`isHub`/`isSinglePlayer` into `AppState` (e.g. `AppState.ocViewTarget`) and add CSS rules keyed on a `data-oc-view` attribute, mirroring the existing `data-active-tab` contract for a sub-navigation layer (~20 lines). Two independent, parallel-safe chunks.
* **Provenance:** `gpt4o_delta` #5/#6 (both cited sibling sites folded per-finding); `llama_delta` #5-cluster. Verified exact at all four line ranges.

### 10. 🟢 `app-v4.js` — inline `style.display` sprawl (template fix for a 5-file pattern)
* **Target:** `src/app-v4.js:309,313` (flagship), with the same anti-pattern recurring across `ai.js`(4)/`auth-v2.js`(8)/`oncourse.js`(2)/`ui.js`(2) — 19 sites total outside the `data-active-tab` cascade
* **Violation:**
  ```js
  UI.addRoundContainer.style.display = 'block';
  ...
  UI.addRoundContainer.style.display = 'none';
  ```
* **Remediation Plan:** Land the `app-v4.js` fix as the template chunk: derive `AppState.isViewingSelf = (selectedUid === currentUser.uid)` once in the `change` handler, add one CSS rule keyed on `body[data-viewing-self="false"] #add-round-container { display: none; }`, drop both inline assignments (~20 lines). Then open one ≤100-line follow-up chunk per remaining file applying the identical `data-attribute`-driven pattern — each independently shippable and individually low-risk.
* **Provenance:** `o1_charlie`/`o1_delta` #5 — reconciles Bravo's precise flagship fix with Alpha's evidence that this is a five-file pattern, "turning a narrow fix into a templated rollout plan."

### 11. 🔵 Repo-wide `classList.add/remove('hidden')`/`style.display` sprawl — epic, not a single fix
* **Target:** ~155-187 live instances across 13 files (worst offenders: `oncourse.js` ×55, `auth-v2.js` ×26, `competitions.js` ×15, `ai.js` ×11, `app-v4.js` ×11)
* **Violation:** Visibility state lives in scattered imperative call sites rather than being derived once from `AppState` and rendered declaratively.
* **Remediation Plan:** **Do not** attempt a single sweeping refactor — far beyond the 100-line chunk policy and unreviewable as one PR. Land #4/#4a/#10 first (they establish the `data-attribute`-driven convergence pattern), then open one ≤100-line chunk per file, starting with `oncourse.js` (highest leverage), triaging each site into "drive via `data-active-tab`/derived-state attribute" vs. "leave as-is — genuine ephemeral UI state" (e.g. transient toasts like `score-input.js:166`, see §5). Track as a multi-PR epic, not a ticket.
* **Provenance:** `o1_delta` #6 (count corrected from Alpha's "50+"/"hundreds" to a verified, file-broken-down 155) and `r1_delta` (independently measured ≈187 via `66× classList.remove + 89× classList.add + 24× style.display + 8× round-active`, explicitly excluded from its own ledger as "a population statistic, not a single atomic fix"). Both lenses agree: retain only as epic-sizing context, not as an actionable row — the rare case of two independently-measured counts converging closely enough to trust the order of magnitude.

### 12. 🟢 Missing future-date validation on round creation
* **Target:** `index.html:334` + `src/oncourse.js` (round-start handler, ~lines 60-65 and the `#btn-oc-start` click binding)
* **Violation:**
  ```html
  <input type="date" id="oc-round-date" class="form-control" ...>  <!-- no max attribute -->
  ```
  ```js
  // oncourse.js:62-63 — sets a default, never validates the submitted value
  if (dateInput) dateInput.valueAsDate = new Date();
  ```
* **Remediation Plan:** Add `max="${new Date().toISOString().split('T')[0]}"` to the input at render time (native-validation path) **and** an explicit guard in the `#btn-oc-start` click handler (`if (new Date(dateInput.value) > new Date()) { alert(...); return; }`) so the rejection holds even if `max` is stripped client-side. ~15 lines, single chunk.
* **Provenance:** `o1_delta` #8 — the *only* one of three PIR-log-derived "test failure" claims this round whose underlying gap survived independent source inspection (the cited spec asserts nothing and cannot fail, but the code-level gap is real and confirmed by direct trace — see §III for the two sibling claims that did *not* survive).

---

## III. Confirmed False Positives — Discarded, With Receipts
*Listed explicitly so these do not get re-discovered, re-actioned, or re-funded in a future synthesis round. Every entry below was independently traced to source and found unsupportable.*

| Claim | Where it recurs | Why it's false |
|---|---|---|
| **"Only `playerClubs` is mirrored to `localStorage`; ~24-30 `initialState` keys are memory-only with no hydrate-from-storage step"** ⚠️ *the corpus's most-repeated single hallucination* | Originates in `llama_charlie` #1 (folded with its "resume mid-round" trilogy, #1-#3); independently re-fabricated in an **earlier draft** of `master_delta` (its retired #9, "24 of 25 keys unmirrored") | **Permanently retired by a three-pass convergence**, all citing the same evidence: `persistence.js:11-25` defines a `PERSIST_FIELDS` allow-list of **13** round-state keys (`liveRoundGroups`, `currentHole`, `currentShotData`, `activeRoundId`, etc. — *exactly* the "mid-round tracking state" the claim says vanishes), each mirrored via `saveRoundState()`/`loadRoundState()`/`clearRoundState()` under a second, independent `GOLF_APP_STATE_KEY` mechanism; `persistence.js:119-133` auto-saves on every relevant `stateChange`; `persistence.js:87-92` exports `initializeAppRouting()` (the hydrate step), invoked at `app-v4.js:47` — *before* `listenToWHSRounds()` at `:50`. Pass 1: `llama_delta` caught and retracted its own lens's charlie-round version. Pass 2: the rewritten `master_delta` independently re-derived the same evidence and retracted its own prior #9 (additionally documenting that the false claim had itself survived one full reconciliation round before being caught — a "hallucination cascade" within a single lineage). Pass 3 (this synthesis): cross-references both retractions and confirms neither contradicts the other — **the prior "unresolved contradiction" flagged in the previous edition of this document is now fully resolved**: there is no live ledger anywhere in the 12-file corpus that still asserts this claim. Treat it as closed, not "corrected" — the premise was the opposite of true. |
| **"`whs.js`/`practice.js` have no stored `unsubscribe` handle / no listener teardown"** | `master_charlie`, `master_delta`, `gemini_charlie`, `gemini_delta`, `llama_delta` (six independent reconciliations all flag the *same* originating claim) | `whs.js:11,143,159` declares, defensively guards, and reassigns `unsubscribeWHS`; `practice.js:12,361,369` follows the identical pattern with `unsubscribePractice`. Textbook subscribe/teardown, correctly implemented. |
| **"`practice_plans` Firestore-rules query path is fine / Alpha hallucinated a problem"** | `llama_charlie` (mislabels its sibling lens-round's #1 finding as a hallucination) | Self-contradictory on its own terms — its explanation *describes* the exact root-vs-subcollection mismatch that produces `FirebaseError: No matching allow statements`, then concludes "isn't problematic." `llama_delta`'s fuller trace (rule path + query path + emulator log) proves this is in fact the corpus's #1-priority confirmed runtime bug — see Master Backlog #1. |
| **"Resume mid-round" feature-gap trilogy (missing persistence write at `persistence.js:94-103`, no boot-time hydration, unpersisted round transition)** | `llama_charlie` #1-#3 | All three sub-claims inverted by source, by `llama_delta`'s own later-round investigation: the "missing companion write" is wired at `persistence.js:119-133`; the "missing hydrate step" (`initializeAppRouting`) runs *before* Firestore listeners attach — exactly the sequencing the claim says needs to be built. This trilogy is the charlie-round seed of the playerClubs cascade above; both should be read as one retraction, not two. |
| **"'Generate AI Briefing' double-tap rate limiting is non-functional" (E2E test failure)** | `o1_charlie` | Misnames the button under test — the cited spec (`quota-guards.spec.js`) targets `#btn-generate-practice` per its own in-line comment, not the briefing feature. Both candidate buttons (`practice.js:130`, `ui.js:468`) already carry a synchronous `disabled = true` guard set *before* the first `await`. |
| **"Async coach notification dropped" (E2E test failure)** | `o1_charlie` | The cited spec (`async-coach.spec.js`) was rewritten in commit `a63e1f3` into a tautological placeholder (`expect(true).toBe(true)`) incapable of detecting the claimed failure, in both its current and prior form. *(A genuine architecture question — `coach.js` has zero `onSnapshot`/`listenTo*` wiring for real-time notifications — may still exist, but it requires fresh, properly-scoped investigation; it is not evidenced by any test that has ever run.)* |
| **"Time Travel: future-date validation is currently failing" (E2E test failure)** | `o1_charlie` | The cited spec (`logic-boundaries.spec.js`) contains no `expect()` on date validity and cannot fail. *(The underlying gap is real, however — see Master Backlog #12, which replaces the unsupportable test-evidence framing with a direct code-level finding and fix.)* |
| **`event-listener` "memory leaks" in `card-render.js`/`coach.js` re-render cycles** | `llama_charlie` #7 | Downgraded to non-issue by `llama_delta`: containers are cleared via `innerHTML = ''` before re-`addEventListener`, so detached nodes and their listeners are GC'd together. Zero `removeEventListener` calls exist anywhere in `src/` — this is a repo-wide convention, not an active leak. If pursued at all, event-delegation on the stable parent is the correct framing (and a low-priority stylistic nicety, not a "Sydney Protocol"-grade violation). |
| **Templated `data-active-tab` mislabels: `wakelock.js:50,55`, `score-input.js:68-69`, `ai.js:70-75`** | `night1_master.md` raw census (Alpha), surfaced and rejected in `master_delta` §III | All three are location-accurate but mechanism-false — the raw audit's `Mechanic Analysis` field is one of three canned strings, mechanically pasted by *which API was called* rather than *what the code does*. `wakelock.js` toggles a screen-lock button's pressed-state skin; `score-input.js` highlights a previously-selected pre-shot routine chip; `ai.js` performs role-based feature gating for coach/admin users. None has any relationship to tab navigation or `body[data-active-tab]`. A textbook demonstration of why "the location is real" is not the same claim as "the violation is real." |
| **"`practice.js:370` performs no reassignment" (mechanism mis-description)** | `o1_charlie` (Bravo's original framing in that round) | Minor, self-corrected within the same lens's later round: line 370 *is* a reassignment and *does* fire the trap — the actual silent-mutation bug is the `.push()` calls at line 372 mutating the array line 370 just installed. Substance of the finding (Master Backlog #3) is unaffected; only the originating mechanism description needed one more level of precision. |

---

## IV. Sequencing Recommendation
*Synthesized across all twelve ledgers' individual sequencing notes — no contradictions found here.*

**Phase 0 (ship independently, today, zero coordination needed — all four are isolated, ≤30-line, evidence-backed fixes):**
`#1` (Firestore rules mismatch — runtime-breaking) → `#1a` (audio timer leak — 3-line addition) → `#8` (tempo reflow) → `#12` (date validation)

**Phase 1 (the root-cause chain — land as one coordinated sequence):**
`#2` (`mutateList` helper) → `#3`/`#3a` (migrate the three live data-loss bugs + promote `ui.js:622-623`) → `#7` (normalizers, shares the sequencing dependency and benefits from #3 landing first)

**Phase 2 (the two layout-contract collisions the root cause produces — both isolated, parallel-safe, several lenses recommend landing together):**
`#4` (CSS `!important` collision) and `#4a` (`auth-v2.js` dual-lever)

**Phase 3 (independent clusters, parallel-safe against everything above):**
`#5` (setTimeout cluster — coordinate the `oncourse.js:724/727` fix across lenses) → `#6`/`#6a`/`#6b` (`renderList` extraction — **coordinate to avoid duplicate implementations, the single biggest cross-lens collision risk in the backlog**) → `#9` → `#10` → `#11` (epic, track separately, re-measure the count after #4/#4a/#10 land)

---

*Original twelve source exhibits left untouched. No production code in `src/`/`tests/` was modified, staged, or committed — this document is the sole write performed for this synthesis.*
