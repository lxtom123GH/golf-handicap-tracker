# Backlog — R1 Lens — Reconciled Delta (Round 5 Adversarial Cross-Examination)
*Sources: Exhibit Alpha (`backlog_r1.md`, Jules) vs. Exhibit Bravo (`backlog_r1_claudeCLI.md`, Claude CLI)*

## I. Peer Review Assessment

| Axis | Exhibit Alpha (Jules) | Exhibit Bravo (Claude CLI) |
|---|---|---|
| **Location evidence** | Zero file paths, zero line numbers. Two prose paragraphs ("BL-3.10", "BL-3.11") describing categories of problems. | 4 entries, every one anchored to exact `file:line` ranges. |
| **Verifiability** | BL-3.10's substantive claim ("Proxy does not support deep reactivity") is **technically correct** — confirmed against `state.js:60-83`: the `set` trap fires only on top-level property assignment (`target[prop] = value`), so `.push()`/`.splice()` on `liveRoundGroups`/`currentHoleShots` never re-arms it. But as written it names no call site, so a reviewer cannot act on it without first doing Bravo-grade location work. | All 4 location claims verified byte-for-byte against the live tree (see table below). Line ranges are accurate to the line — e.g. `auth-v2.js:25-28` lands exactly on the `classList.remove`/`style.display` quartet, `oncourse.js:724,727` lands exactly on the two divergent `setTimeout` durations. |
| **Hallucination / over-engineering** | No fabricated paths (there are none to fabricate). BL-3.11's "**hundreds** of manual DOM visibility toggles" is in the right order of magnitude (verified: 66× `classList.remove('hidden')` + 89× `classList.add('hidden')` + 24× `.style.display` + 8× `round-active` ≈ 187 sites) but is a population-level statistic, not a backlog item — it can't be turned into a PR without further triage. Not a "Sydney Protocol" violation, just under-specified. | No fabrications found. Every cited snippet is a real, exact match. The framing stays disciplined — each entry names one concrete edge-case manifestation rather than re-describing the architecture in the abstract. |
| **Verdict** | Correctly diagnoses *that* a deep-reactivity gap and a visibility-toggle sprawl exist, but at a level of abstraction that is closer to an audit finding than an actionable backlog row — no remediation can be scoped or chunked from it as written. | Superior precision on boundary logic. Each row is independently actionable, correctly scoped to ≤100 lines, and several rows turn out to be the *concrete instances* of the very failure modes Alpha gestures at abstractly (see Blindspot Report). |

### Location-claim verification ledger (Bravo)
| Claim | Verified? | Evidence |
|---|---|---|
| `style.css:869-870` vs `:570-582` | ✅ exact | L869-870 = `body.round-active #tab-oncourse.hidden { display: block !important; }`; L570-582 = `body[data-active-tab="..."] #tab-X` chain, both target `#tab-oncourse` |
| `auth-v2.js:25-28,42-45,153-157,201-205` | ✅ exact | L25-28 = register-mode `classList.remove`+`style.display='none'` quartet; L42-45 = mirror teardown; L153-157/201-205 = `classList` + `style.display` pairs flanked by `// Force hide` (L154/202) and `// Force show` (L156/204) |
| `oncourse.js:724,727` | ✅ exact | L724 = `setTimeout(...hidden..., 2500)`; L727 = `setTimeout(...hidden..., 2000)`, both targeting `UI.voiceOverlay` |
| `ui.js:622-623` vs `practice.js:370-372` | ✅ exact | ui.js L622-623 = `splice` + `AppState.liveRoundGroups = [...AppState.liveRoundGroups]` (reassign, re-arms proxy); practice.js L370-372 = `AppState.currentPracticeRounds = []` then `.forEach(...push(...))` (in-place mutation, does **not** re-arm proxy) |

---

## II. The Reconciled Master R1 Backlog

### R1-01 🔴 Shallow `AppState` Proxy — deep mutations bypass reactivity *(Alpha BL-3.10, generalized; Bravo #4 supplies the concrete instance)*
- **Target:** `state.js:60-83` (root cause); concrete instance at `practice.js:370-372` vs. `ui.js:622-623`
- **Violation:**
  ```js
  // state.js — set trap only fires on top-level assignment:
  set(target, prop, value) { target[prop] = value; /* dispatch stateChange */ }

  // practice.js:370-372 — in-place mutation never reaches the trap:
  AppState.currentPracticeRounds = [];
  snapshot.forEach(docSnap => {
      AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });
  });

  // ui.js:622-623 — the "working" pattern, because it reassigns the array:
  AppState.liveRoundGroups.splice(index, 1);
  AppState.liveRoundGroups = [...AppState.liveRoundGroups];
  ```
- **Remediation Plan:** Land a single `mutateList(AppState, key, fn)` helper (already proposed by the o1 lens as backlog #1) that performs the mutation against a shallow copy and reassigns — i.e. canonicalizes the `ui.js:622-623` pattern as the *only* sanctioned way to touch an `AppState` array. Migrate `practice.js:370-372` to it in the same chunk as the proof case (~30 lines: helper + one call-site conversion + a regression note in `state.js` doc comment explaining why bare `.push()` is unsafe). Defer migrating every other call site to follow-up chunks — do not boil the ocean in one PR.

### R1-02 🟠 `#tab-oncourse` visibility governed by two competing rule systems
- **Target:** `style.css:570-582` (data-active-tab selector chain) vs. `style.css:869-870` (`body.round-active` override)
- **Violation:**
  ```css
  /* L570-582: state-machine-driven visibility */
  body[data-active-tab="tab-oncourse"] #tab-oncourse, ... { display: block !important; opacity: 1 !important; ... }

  /* L869-870: a second, independent lever that can win the cascade */
  body.round-active #tab-oncourse.hidden {
      display: block !important;
  }
  ```
- **Remediation Plan:** Delete the `body.round-active #tab-oncourse.hidden` `!important` override; fold "round in progress, force on-course tab visible" into the `data-active-tab` state machine (e.g. transition `data-active-tab` to `tab-oncourse` when a round starts, rather than layering a parallel `body` class). ~20 lines in `style.css` + the `oncourse.js:100/1181-1182` and `persistence.js:94` call sites that toggle `round-active`. Coordinates with the o1-lens #4 item — land together to avoid a half-migrated state.

### R1-03 🟠 Auth overlay toggled via redundant `classList` + `style.display` levers
- **Target:** `auth-v2.js:25-28`, `:42-45`, `:153-157`, `:201-205`
- **Violation:**
  ```js
  UI.authOverlay.classList.add('hidden');
  UI.authOverlay.style.display = 'none';   // Force hide  (L154/202)
  UI.mainApp.classList.remove('hidden');
  UI.mainApp.style.display = 'block';      // Force show  (L156/204)
  ```
- **Remediation Plan:** Collapse every pair down to `classList` only (the `// Force hide`/`// Force show` comments are an admission that the duplication is a deliberate guard against a `.hidden` CSS-specificity loss — fix the CSS specificity instead of doubling the JS). One mechanical pass across all four ranges, ~25 lines, single PR — this is the same root fix the Claude-CLI lens's own backlog rows #1/#2 already target, so land as one combined chunk rather than twice.

### R1-04 🟡 Competing `setTimeout` calls race to hide the same voice overlay
- **Target:** `oncourse.js:724,727`
- **Violation:**
  ```js
  setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);  // L724 (not-allowed path)
  setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2000);  // L727 (other-error path)
  ```
- **Remediation Plan:** Store the timer handle on a module-scoped variable and `clearTimeout` it before scheduling a new one (and on overlay-reopen). ~10 lines, single chunk — the fix is identical to the one already proposed by the GPT-4o lens for the same call site; land as a shared PR rather than duplicating review effort.

---

## III. Items Explicitly Excluded From the Reconciled Ledger
- **Alpha BL-3.11 ("hundreds of manual DOM visibility toggles")** is retained only as *context* for R1-02/R1-03 above, not as its own ledger row. The raw count (~187 `classList`/`style.display` sites) is a population statistic, not a single atomic fix; promoting it to a backlog row as-is would violate the 100-line chunking policy by definition (it has no natural chunk boundary). The two genuinely fixable, boundary-crossing instances Bravo isolated (R1-02, R1-03) are the actionable subset of this population — once those land, the remaining count should be re-measured rather than worked as a monolith.

---

## IV. Blindspot Report

**Caught by Alpha, missed by Bravo's R1 ledger (as an explicit row):**
- The *general* shallow-Proxy reactivity defect (BL-3.10) — Alpha names the architectural root cause; Bravo's R1 ledger only surfaces it indirectly through entry #4's `ui.js` vs. `practice.js` comparison (folded into R1-01 above). Without Alpha's framing, a reviewer might treat Bravo's #4 as "just" a style inconsistency rather than recognizing it as a symptom of a structural reactivity gap that will keep producing new bugs at every future array-mutation call site.

**Caught by Bravo, missed by Alpha:**
- The concrete `#tab-oncourse` CSS rule collision (`!important` vs. `data-active-tab`) — Alpha's BL-3.11 gestures at "DOM visibility toggles subverting the architecture" but never identifies *which* rules collide or under what user sequence (start round → switch tabs).
- The `auth-v2.js` dual-lever redundancy with self-documenting `// Force hide`/`// Force show` comments — a maintainer-trap Alpha's broad framing would not surface without a code-level pass.
- The `oncourse.js` stale-timer race on the voice overlay (trigger A then B within 600ms re-hides a manually reopened overlay) — a genuine state-drift edge case invisible at the architectural-summary altitude Alpha operates at.
- The precise `mutateList`-shaped fix for the reactivity gap (i.e., *how* to close BL-3.10, not just *that* it's open) — Alpha identifies the disease, Bravo (in coordination with the o1 lens) identifies the cure and the exact two call sites that prove it's needed.

**Net assessment:** Alpha operates at audit-summary altitude (correct diagnoses, zero coordinates); Bravo operates at fix-ready altitude (correct coordinates, and — via cross-references to the o1/GPT lenses — correctly recognizes when its own findings are restatements of fixes proposed elsewhere, avoiding duplicated backlog rows). The reconciled ledger above keeps Bravo's coordinates as the spine and uses Alpha's framing only to correctly *generalize* R1-01 so the fix isn't scoped too narrowly to the one call site Bravo happened to find.
