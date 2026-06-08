# PIR Log — Supermagic Delta: Unified Night 1 Timeline
*Synthesis of all 14 non-supermagic `PIR_log_*.md` administrative footprints (`claude_claudeCLI`, `gemini`, `gemini_claudeCLI`, `gpt_claudeCLI`, `gpt4o`, `llama_claudeCLI`, `llama4`, `master`, `master_claudeCLI`, `o1`, `o1_claudeCLI`, `opus`, `r1`, `r1_claudeCLI`) into one chronological ledger. Read-only — no production code touched.*

---

## I. Executive Audit Summary

Night 1 (2026-06-08) consisted of two interleaved activity streams that this log unifies for the first time:

1. **Seven analytical lens passes** (o1, Claude, Llama, GPT, Gemini, R1, and a Master synthesis), each running its own internally-timestamped (`T+0:00` → `T+0:2x/3x`) execution footprint and landing on a Determinism/Coupling score. Scores cluster tightly: **33–50 / 100 Determinism** (mean ≈ 42), **Medium → Critical Coupling** — every lens independently converged on the same root finding (an imperative DOM/`classList`/`style.display` layer bypassing `AppState`/`data-active-tab`), which is itself a strong cross-validation signal.
2. **Multiple Playwright E2E suite executions**, whose *captured raw output* tells a starkly different story depending on which capture you read — see the Correlative Analysis (§III) for why this matters more than it first appears.

**The headline correlative finding:** the worst captured E2E run shows **all 14 of 14 tests failing** on the *exact same* assertion — `expect(locator('#auth-overlay')).toBeHidden()` — i.e., the login overlay never hides, so every single downstream test is blocked before it can begin. This is not 14 independent bugs; it is **one DOM-visibility fault cascading into a 100% suite failure** — the most concrete, severe possible illustration of the "Critical Coupling" verdict the R1 lens (lowest determinism score, 33/100) and the Master lens (consensus score 40/100) both arrived at independently through static analysis alone. The static findings and the dynamic test evidence corroborate each other end to end.

A second correlative finding, equally important: **at least three distinct, mutually-inconsistent E2E result summaries circulate across these logs** (14/14 failed; "4 Failed, 1 Skipped, 9 Passed"; "3 failed, 1 skipped, 10 passed"), and the reconciled backlog audit (a sibling synthesis pass, `MASTER_BACKLOG_supermagic_delta.md` §III) independently proved that the "4 Failed" figure traces to **stale, unsupportable PIR-log transcription** — two of the three cited "failing" specs contain no assertion capable of failing as described. This timeline treats that number accordingly (§III).

---

## II. The Unified Timeline

*Per-lens execution footprints use each lens's own internal `T+` clock (relative to that lens's pass start — the corpus contains no evidence the seven passes ran in strict sequence, and several internal cross-references — e.g., the GPT lens noting overlap with "Claude Lens backlog #4/#5" — indicate they substantially overlapped in time. They are grouped by lens below rather than falsely interleaved to a single fabricated clock.)*

### A. Analytical Lens Execution Tracks (Night 1 · 2026-06-08)

**o1 Lens** *(claudeCLI)* — lowest-determinism static finding of the "core six"
- T+0:00 — Loaded `state.js`, mapped the `AppState` proxy contract (lines 60-83); identified the reference-equality gap as the seed finding.
- T+0:08 — Cross-referenced array-mutation call sites (`practice.js:370-372`, `ui.js:622-623`); confirmed a correct workaround already exists in-tree.
- T+0:15 — Walked the `data-active-tab` CSS contract (`style.css:570-582`) against the `round-active` override (`:869-870`) to size the determinism gap.
- T+0:22 — Drafted ROI ranking; verified each fix fits a ≤100-line chunk.
- T+0:28 — Wrote `night1_o1_claudeCLI.md` / `backlog_o1_claudeCLI.md`.
- **Final: Score 38/100 Determinism, High Coupling.**

**Claude Lens** *(claudeCLI)*
- T+0:00 — Grepped for `classList`/`style.display` triads (~25 hand-written sites located).
- T+0:10 — Confirmed the canonical pathway exists and works (`AppState.activeTab` at `ui.js:259` + `style.css:570-582`) — adopted as the baseline every other site is measured against.
- T+0:18 — Catalogued the `innerHTML = ''` + manual-rebuild pattern across `admin.js`, `coach.js`, `competitions.js`, `card-render.js`.
- T+0:24 — Flagged `auth-v2.js` dual-lever sites as highest priority — the `// Force hide`/`// Force show` comments indicate a *known prior bug*.
- T+0:30 — Sequenced the refactor pathway; wrote `night1_claude_claudeCLI.md` / `backlog_claude_claudeCLI.md`.
- **Final: Score 45/100 Determinism, Medium-High Coupling.**

**Llama Lens** *(claudeCLI)*
- T+0:00 — Read `state.js:1-53`, enumerated `initialState` keys, concluded only `playerClubs` survives a refresh. *(Later proven false by this same lens's own Delta-round reconciliation — `persistence.js`'s 13-key `PERSIST_FIELDS` allow-list was never opened; see the sibling Backlog synthesis §III.)*
- T+0:09 — Traced the round-start path (`persistence.js:94-103`) believing no companion persistence write exists. *(Also later disproven — the write is wired at `:119-133`.)*
- T+0:16 — Reviewed `whs.js:148-156`/`practice.js:360-372` listener setup for offline-cache fallback.
- T+0:22 — Sized `oncourse.js` (1,684 lines) as the largest single point of offline exposure.
- T+0:27 — Drafted the storage-mirror + boot-hydrate recommendation.
- T+0:32 — Wrote `night1_llama_claudeCLI.md` / `backlog_llama_claudeCLI.md`.
- **Final: Score 41/100 Determinism, High Coupling (network-dependent).** *(Three of this lens's five backlog entries — the "resume mid-round" cluster built on the T+0:00/T+0:09 steps above — were subsequently retracted as fabricated during its own Delta reconciliation round.)*

**GPT Lens** *(claudeCLI)*
- T+0:00 — Searched for `setTimeout` touching DOM/`classList` to size the timer-leak surface (`oncourse.js:724,727,1519`, `score-input.js:166`).
- T+0:07 — Re-read the `AppState` proxy `set` trap (`state.js:66-74`) for event fan-out cost — confirmed every write dispatches a global `window` event.
- T+0:14 — Catalogued full-teardown render sites (`competitions.js`, `admin.js`, `coach.js`); estimated O(n) vs O(Δ) cost delta.
- T+0:20 — Cross-checked the `localStorage`/`JSON.parse` boot-path cost (`state.js:38-53`) — negligible today, flagged as conditional risk if Llama Lens's persistence expansion lands.
- T+0:25 — Wrote `night1_gpt_claudeCLI.md` / `backlog_gpt_claudeCLI.md`, **explicitly noting overlap with Claude Lens backlog #4/#5** to avoid duplicate PRs — direct evidence the lens passes overlapped in wall-clock time, not strict sequence.
- **Final: Score 50/100 Determinism, Medium Coupling** *(highest of the night — the GPT lens's narrower, deeper-but-smaller-surface scope produced the least alarming read).*

**Gemini Lens** *(claudeCLI)*
- T+0:00 — Located all `onSnapshot`/`getDocs` call sites (`whs.js:148-156`, `practice.js:360-372`, `social.js:23-31`, `app-v4.js:369-386`) to map the Firestore integration surface.
- T+0:09 — Checked each listener for a stored `unsubscribe` handle — believed none found at `whs.js:148-156`. *(Proven false in this lens's own Delta reconciliation: `whs.js:11,143,159` correctly stores/guards/reassigns `unsubscribeWHS` — the single most-repeated hallucination of the entire night, independently caught and purged by six different reconciliation passes.)*
- T+0:16 — Traced `docSnap.data()` spreads into `AppState` for schema guards — confirmed none present; malformed docs flow straight to render templates (`practice.js:466`).
- T+0:22 — Reviewed `admin.js:24,55,155` for injection risk in Firestore-sourced `innerHTML` templates.
- T+0:27 — Drafted the shared `normalize*Doc` + lifecycle-cleanup recommendation.
- T+0:31 — Wrote `night1_gemini_claudeCLI.md` / `backlog_gemini_claudeCLI.md`.
- **Final: Score 47/100 Determinism, Medium-High Coupling.**

**R1 Lens** *(claudeCLI)* — lowest score of the night; explicitly a stress-test pass, not a fresh sweep
- T+0:00 — Re-walked every other lens's findings through a "worst-case interleaving" filter rather than searching fresh.
- T+0:10 — Chained the CSS-authority conflict (`style.css:869-870` vs `:570-582`) to a concrete user-action sequence (start round → switch tab) to prove it's *reachable*, not theoretical.
- T+0:18 — Chained the `auth-v2.js` dual-lever pattern to a "future edit removes one lever" failure scenario; flagged the `// Force hide`/`// Force show` comments as evidence the team already lived through this once.
- T+0:25 — Chained the two `oncourse.js` voice-overlay timers (`:724` 2500ms vs `:727` 2000ms) to a concrete trigger-then-retrigger timeline showing the overlay can re-hide itself with **zero user action**.
- T+0:31 — Cross-compared `ui.js:622-623` against `practice.js:370-372` — same intent, two incompatible implementations — "the clearest single proof there is no enforced reactivity contract."
- T+0:36 — Wrote `night1_r1_claudeCLI.md` / `backlog_r1_claudeCLI.md`, **explicitly mapping every backlog row to a fix another lens already proposed** — the only lens to fully commit to zero-duplication-by-design.
- **Final: Score 33/100 Determinism, Critical Coupling** *(the night's most severe verdict — and, notably, arrived at without opening a single new file).*

**Master Lens** *(claudeCLI)* — convergence pass, run after the other six completed
- T+0:00 — Collected the six completed lens passes (o1, Claude, Llama, GPT, Gemini, R1) and built a convergence map keyed by *theme* rather than by lens.
- T+0:08 — Identified the single unifying root cause: one correct, centralized visibility/reactivity pathway exists (`AppState.activeTab` → `data-active-tab` → CSS), and ~40+ sites across the app bypass it.
- T+0:14 — Flagged the two highest-severity items as bearing *evidence of a prior incident*: the `// Force hide`/`// Force show` comments (`auth-v2.js:153-157,201-205`) and the `!important` override (`style.css:869-870`) — "these aren't theoretical, the team already patched around this once."
- T+0:20 — Wrote `night1_master_claudeCLI.md` with the cross-lens convergence table and verdict; **explicitly handed off to the Supermagic pass for final deduplication and remediation code.**
- **Final: Consensus Score 40/100 Determinism, High Coupling** — the night's median verdict, and the one that downstream synthesis (including this document's sibling, `MASTER_BACKLOG_supermagic_delta.md`) treats as the canonical baseline.

### B. E2E Verification Events (Playwright `npm run test:e2e`, 14-test suite)

Three **mutually-inconsistent** result signatures were captured across the corpus — presented here as discrete events in the order their captures appear in the file set, since no absolute timestamp in the corpus reliably orders them relative to each other or to the lens passes above (the one ISO timestamp present, `[2024-06-08T02:35:00Z]` in `PIR_log_gemini.md`, carries the wrong year — 2024 vs. the night's documented 2026-06-08 — and cannot be trusted as an anchor).

**Event 1 — "Catastrophic" run: 14/14 failed, single root assertion**
*Captured verbatim, independently, in three separate logs: `PIR_log_gpt4o.md`, `PIR_log_o1_claudeCLI.md`, `PIR_log_opus.md`.*
- Every one of the 14 tests fails on the identical assertion: `expect(locator('#auth-overlay')).toBeHidden()` → `Received: visible`, 15000ms timeout, after `Login failed, attempting registration for test-worker-N@example.com`.
- Affected specs span all five phases: `logic-boundaries` (×5), `async-coach`, `quota-guards` (×2), `security-rbac` (×2), `ui-ergonomics` (×3), `ux-bag-management`.
- The three captures are **near-identical but not byte-identical** — `PIR_log_opus.md` records "18 × locator resolved" at one assertion site where the other two record "19 ×" — strong evidence these are **three independent executions of the same broken build**, not one run copy-pasted three times.
- `PIR_log_opus.md` additionally records a static "Security & Architecture Evaluation" *ahead of* its captured run, diagnosing the same root cause the lenses converged on: *"`AppState` only traps top-level assignments... extensive hardcoded visual overrides... completely subvert the `data-active-tab` protocol."*

**Event 2 — "Healthy" run: 3 failed / 1 skipped / 10 passed (1.1m)**
*Captured identically in `PIR_log_master.md` and `PIR_log_r1.md`* — both labeled "Session Teardown Execution Logs," both showing the *exact same* three failing specs (`logic-boundaries.spec.js:41`, `quota-guards.spec.js:31`, `ui-ergonomics.spec.js:40`) and the same wall-clock duration. This is the **only** captured run in the entire corpus where the suite substantially passes — and it is the run two of the night's most synthesis-oriented passes (Master, R1) chose to carry forward as their teardown evidence.

**Event 3 — Secondhand "~4 failures" summaries (no matching raw capture exists)**
*Three independent lenses report a number in this range, but none of their cited failure lists matches Event 1, Event 2, or each other:*
- `PIR_log_gemini.md` *(`[2024-06-08T02:35:00Z]`, year-stamp inconsistent)*: "4 tests failed out of 14... E2E tests timed out or failed explicitly on infrastructure checks."
- `PIR_log_llama4.md`: names four failing specs (`quota-guards` Double-Tap, `ui-ergonomics` Live Scoring buttons, `logic-boundaries` Time Travel, `async-coach`) plus a captured `FirebaseError: No matching allow statements` on the `practice_plans` collection — **this is the only PIR log in the corpus that independently captured the exact runtime error the Llama-lens Delta reconciliation later confirmed as the night's one genuine, confirmed-by-evidence runtime-breaking bug** (see `MASTER_BACKLOG_supermagic_delta.md` §II Entry 1).
- `PIR_log_o1.md`: "4 Failed, 1 Skipped, 9 Passed" — names `async-coach`, `logic-boundaries` (Time Travel), `quota-guards` (Double-Tap), `ui-ergonomics`.

---

## III. Correlative Analysis — Where E2E Evidence Aligns (and Conflicts) With the Static Scores

**1. The 14/14 catastrophic run is the dynamic proof of the night's static consensus.**
Every one of the seven lenses independently flagged the same architectural fault: a parallel, imperative `classList`/`style.display` visibility layer that competes with — and can defeat — the sanctioned `AppState.activeTab → data-active-tab → CSS` pathway (Claude Lens T+0:10, Master Lens T+0:08, R1 Lens T+0:10/T+0:18, Opus's pre-run static note). Event 1 is that exact fault caught in the act: `#auth-overlay`'s visibility is governed by the same kind of dual-lever logic the lenses catalogued in `auth-v2.js` (the `// Force hide`/`// Force show` sites the Claude and Master lenses flagged as evidence of "a known prior bug" and R1 chained into a "future edit removes one lever" failure scenario). When that lever logic misfires, the overlay sticks visible — and because `#auth-overlay` gates the entire authenticated app surface, **one visibility bug fails literally 100% of the suite**, a textbook real-world expression of "Critical Coupling" (R1's score, the lowest of the night, 33/100).

**2. The score spread (33–50) correlates with *scope*, not disagreement.**
The two lenses that stayed narrowly scoped to a single subsystem scored highest (GPT Lens 50/100 — timers + dispatch cost only; Claude Lens 45/100 — DOM/render sprawl only). The two that explicitly synthesized or stress-tested the full cross-cutting picture scored lowest (R1 33/100 — adversarial worst-case chaining; Master 40/100 — full seven-lens convergence). This is not inconsistency; it is the expected signature of a **systemic** defect — the more surface a pass covers, the worse the aggregate looks, because the same root cause keeps recurring under a new name in each new file opened.

**3. The "~4 failures" secondhand claims (Event 3) do not survive contact with either captured raw run — and that gap is itself diagnostic of a *process* debt, not just a *code* debt.**
None of the three "4 failures" summaries' named specs lines up cleanly with Event 1's 14 (which fails everything) or Event 2's 3 (`logic-boundaries:41`, `quota-guards:31`, `ui-ergonomics:40` — note `o1.md` and `gemini.md` both *do* cite `quota-guards:31`/Double-Tap and overlap partially with Event 2's list, suggesting they may be garbled transcriptions of Event 2 rather than evidence of a fourth run). The sibling Backlog synthesis (`MASTER_BACKLOG_supermagic_delta.md` §III) independently proved, by opening the actual spec files, that two of `o1.md`'s three cited "failing" tests (`async-coach.spec.js`, `logic-boundaries.spec.js`'s Time Travel test) contain **no assertion capable of failing as described** — one is a tautological placeholder (`expect(true).toBe(true)`) introduced by commit `a63e1f3` ("100% E2E pass"), the other ends mid-comment with no `expect()` at all. **The "4 failures" figure appears to be a number carried forward from a stale run and never re-verified against the live spec files** — exactly the failure mode the o1 Delta reconciliation warned future lenses to guard against: *"treat PIR-log 'test failure' claims as leads to verify against the live spec file, not as pre-confirmed findings to transcribe."*

**4. The one E2E-captured runtime error (`FirebaseError: No matching allow statements`, `PIR_log_llama4.md`) is the night's single confirmed, evidence-backed runtime bug** — and it independently corroborates the highest-priority entry in the reconciled Backlog (`practice_plans` collection-path mismatch between `firestore.rules` and `ui.js:806-825`). This is the rare case in the corpus where dynamic evidence (an emulator log line) and static analysis (a rules-vs-query trace) converge on the *same* bug from opposite directions with no contradiction — it should be weighted accordingly above any of the architectural-cleanup items.

---

*Original fourteen source PIR logs left untouched. No production code in `src/`/`tests/` was modified, staged, or committed — this document is the sole write performed for this synthesis.*
