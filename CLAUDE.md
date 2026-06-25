# CLAUDE.md — Golf Handicap Tracker

## Architecture Contract (Sydney Protocol)
These rules are the target contract. The **why** behind each — and a concrete **re-test** for "does this reason still hold?" — lives in `docs/DECISIONS.md` (`[D-xx]` tags below). Where the codebase currently violates a rule it is flagged inline and tracked as debt: read these as **"add no new violations"**, and STOP and ask before introducing one *or* before "fixing" a documented sanctioned exception.

- Component visibility is state-driven via `body[data-active-tab]` and `AppState` proxies only
- No **new** `!important` in CSS — 46 existing in `src/style.css` are tracked debt (BL-4.13), not licence to add more `[D-02]`
- No **new** `.style.display` for tab/screen visibility — use `body[data-active-tab]` + the `hidden` class. 20 `.style.display` sites remain in `src/` (some sanctioned per FP-09 role-gating; the rest tracked debt) `[D-02]`
- All Firebase services and Cloud Functions pinned strictly to `australia-southeast1`
- Each commit must represent one complete, independently-testable logical unit
- Maximum ~150 lines changed per commit as a secondary guardrail

## State Layer Rules
- `AppState` Proxy fires `stateChange` on **reference change only** — never mutate arrays/objects in place (use `mutateList`). **Documented sanctioned exception:** the live-round per-hole stat path (`liveRoundGroups`/`simpleStats`/`compStats`) mutates in place and relies on `loadHole()` reassigning the `currentHoleShots` PERSIST_FIELD to fire `stateChange` → autosave. This is intentional and verified — the BL-4.15/F1 "scores aren't persisted" claim was **refuted** (data does persist). Do not naively convert it to `mutateList` without preserving that save path. `[D-03]`
- Use `mutateList(key, fn)` from `state.js` for all array/object mutations
- Normaliser pattern: `normalizeRoundDoc`, `normalizeUserDoc`, `normalizePracticePlan` in `state.js` — all Firestore snapshot consumers must normalise before writing to `AppState`. Add new normalisers here when new document types are consumed.
- `onStateChange(keys, handler)` filtered subscription wrapper is deferred (T3-onStateChange) — do not implement without explicit approval
- **Persistence (actual):** round state persists to **localStorage** via `PERSIST_FIELDS` + `GOLF_APP_STATE_KEY` (`persistence.js:11-25`); `loadRoundState()` re-hydrates on boot *before* Firestore listeners attach (`app-v4.js:47` before `:50`). There is **no IndexedDB** and **no `activePracticeSession`** in the codebase today.
- **Planned — not built; do not assume it exists:** a serializable `activePracticeSession` + IndexedDB offline-recovery for practice sessions are a *future* Adaptive-Engine item (MASTER_BACKLOG → "Practice Caddy Upgrades"), not current architecture. *(These two lines were contract fictions until 2026-06-26 — zero source footprint.)* `[D-04]`

## Tooling
- Runtime: Vanilla JS, Vite, Firebase (Auth, Firestore, Cloud Functions, Hosting)
- Tests: Playwright against the Firebase Local Emulator
- Platform: Windows 11 / PowerShell — use PowerShell-native commands only
- Never truncate code output

## Known False Positives — Do Not Re-Investigate
Before raising any architectural finding, check this list. If it matches, cite the FP-ID and stop.

- **FP-01** "Only `playerClubs` survives a page refresh — ~24 initialState keys are memory-only" → FALSE. `persistence.js:11-25` persists 13 round-state keys via `PERSIST_FIELDS` + `GOLF_APP_STATE_KEY`. Mid-round state is the most thoroughly persisted state in the app.
- **FP-02** "`whs.js`/`practice.js` have no stored unsubscribe handle" → FALSE. Both correctly declare, guard, and reassign `unsubscribeWHS`/`unsubscribePractice`.
- **FP-03** "`practice_plans` Firestore rules mismatch is a hallucination" → FALSE. The mismatch was real and was tracked as BL-3.12. Root-level stopgap added then removed after DATA-02 repointed the client query.
- **FP-04** "Resume mid-round" feature gap trilogy (missing persistence write, no hydration, unpersisted transition) → FALSE. All three sub-claims are inverted by source.
- **FP-05** "`Generate AI Briefing` double-tap rate limiting is broken" → FALSE. Spec targets the wrong button; `disabled = true` guard exists pre-`await`.
- **FP-06** "Async coach notification dropped" (E2E test failure) → FALSE. `async-coach.spec.js` is an `expect(true).toBe(true)` placeholder (commit `a63e1f3`).
- **FP-07** "Future-date validation currently failing" (E2E test failure) → FALSE. The cited spec has no `expect()` on date validity. Underlying code gap is real and tracked as T3-dateValidation.
- **FP-08** "Event listener memory leaks in `card-render.js`/`coach.js`" → FALSE. `innerHTML = ''` clears before re-bind; GC handles detached nodes.
- **FP-09** "`wakelock.js`, `score-input.js`, `ai.js` circumvent `body[data-active-tab]`" → FALSE. These are a pressed-state toggle, a pre-shot routine highlight, and role-based feature gating respectively. No relationship to tab navigation.
- **FP-10** "`score-input.js:166` setTimeout is a shared-element race" → FALSE. Function-local disposable toast — cannot race on a shared element.

## Test Suite Warning
Commit `a63e1f3` ("100% E2E pass") hollowed out real assertions in:
- `tests/async-coach.spec.js` → `expect(true).toBe(true)` placeholder
- `tests/logic-boundaries.spec.js` (Time Travel test) → ends mid-comment, no `expect()`
- `tests/quota-guards.spec.js` (Double-Tap test) → targets wrong button

Green CI for these specs does not mean the features work. Do not rely on them as safety nets. Tracked as AUDIT-02. **Correction (2026-06-26 deep-dive):** the earlier "`vitest` has no `include` key so some specs never execute" is misleading — `test:unit` runs `vitest run tests/unit`, whose path filter + default glob execute all **4 unit specs (24 tests)**; the missing-`include` is only a *latent* risk if specs are added outside `tests/unit`. Still true: no test reads back a Firestore doc the app wrote (the suite is schema-blind). Static contract suite `tests/unit/contracts.test.js` (BL-4.00): **only contract (b) "JS-referenced ids resolve" is red** now — (a) flipped green with BL-4.03; (c)/(d)/(e) green. `[D-05]`

## Active Backlog Reference
**Current state, priorities, and "what's next" live in `docs/STATUS.md`** (the
one-page living index). `MASTER_BACKLOG.md` is the detailed ledger with per-item
completion notes + merge hashes.

Durable open items (also surfaced in STATUS):
- BL-3.05 — personalisation inputs never sent to `generatePracticePlan`; every plan uses the generic fallback. `// TODO(BL-3.05)` marker in `ui.js`. (Relevant to the BL-4.03 Practice-tab merge — the AI Caddy depends on this.)
- BL-3.06 (re-scoped 2026-06-13) — the `assignedDrills` rule **already exists** (firestore.rules:48-56); remaining work is the client read path (NIGHT1 N22) + rules-test coverage. NOT a missing-rule task.
- BL-3.07 — Competition Invite Players wiring (dead UI, needs event handlers + Firestore writes).

The BL-4.x P1 remediation cluster (4.01/4.02/4.04/4.05/4.06/4.07/4.08/4.17) shipped
2026-06-25 via the cross-family offload loop — see STATUS + MASTER_BACKLOG for hashes.
BL-3.08 is CLOSED (`value="snare"`→`"snap"`, commit 42fb255).

## Workflow: After Every Code Commit

After each successful code commit (or merged PR), make a second docs commit:
1. Read MASTER_BACKLOG.md first to understand the current structure
2. Find the completed BL-X.XX **row in the entries table**
3. Mark it ✅ inline and append a completion note to the Title cell:
   `| **BL-X.XX ✅** | <sev> | <title>. *Completed: YYYY-MM-DD · PR #NN merge `hash`.* <one-para summary> | <tags> | <ships-with> |`
4. Update `docs/STATUS.md` if the item changes "what's next"
5. Commit: `docs: mark BL-X.XX complete (PR #NN <hash>)`

**The Commit-Hash Mandate (2026-06-13):** a completion note (✅ / "Resolved" / "Fixed this session") is **invalid without its commit hash(es)**, and completion docs must land in the **same session** as the code commit they describe — never mark work done before it is committed. Rationale (PIR_LOG 2026-06-13): in the NIGHT2/NIGHT3 claims audit, every hash-less completion claim in the March–June docs failed verification (TEST-03, BL-3.08 HTML half, BL-3.10 artefact), while every claim citing a commit hash held at HEAD.

Do NOT update PIR_LOG.md — handled in strategic review sessions.
Do NOT modify any other documentation files.

## Surfacing decisions to the user
When you present a choice between options (AskUserQuestion or prose), you MUST:
1. **Recommend one option with a one-line rationale** — never a bare options list (mark it "(Recommended)"). State the relevant caveat (e.g. "this is a product call — flip if X is on the roadmap").
2. **Record the recommendation + why in the relevant doc** so the rationale survives and is re-testable later:
   - architecture / contract / process calls → `docs/DECISIONS.md` (D-format, *with a Re-test*);
   - backlog / feature / product calls → the `MASTER_BACKLOG.md` item row, as `**Rec (date): <option>** — <why>`.
3. When the user decides, update that record with the chosen option + date (so a future audit sees both the call and its reasoning, and can ask "does the why still hold?").

## Environment

Unit/contract tests (`test:unit`, incl. `tests/unit/contracts.test.js`) require NO emulator — pure jsdom/file-read. Only `test:rules` and `test:e2e` need it.
**Correction (2026-06-26 deep-dive):** the emulator IS runnable in-session — firebase CLI + JDK + Playwright browsers are installed, `test:rules` self-manages via `firebase emulators:exec`, and the rules suite was run successfully against a live emulator. So `test:rules`/`test:e2e` ARE verifiable; the old "Claude Code cannot manage the emulator" claim was false. The Playwright `webServer` command does use a bash `&` that won't background on Windows, but `reuseExistingServer:true` (local) skips it when the dev server + emulator are already up — so for e2e, start `npm run dev` + the auth/functions emulators yourself (the app auto-routes to the emulator on `localhost`, `firebase-config.js:47-51` — no prod risk). A running emulator is still convenient as always-on infra, but is not a hard prerequisite Claude can't satisfy. `[D-06]`

## Model Selection & Effort

**Routing is by reasoning-difficulty, not task size.** The question is never
"how big is this change" but "how much of the thinking is already done."
Replaces the prior Fable/Opus-4.7 convention, which is void (those models are
not in the picker).

### Which model
- **Haiku** — zero-reasoning mechanical work, fully pre-specified:
  - The post-commit docs commit (mark `BL-X.XX ✅`, add completion note +
    commit hash, move section to Completed) per the Workflow section below.
  - Single import additions; find-and-replace with an exact target.
  - One-line fixes where both the line and the replacement are named.
  - The Tempo-style value fix (`value="snare"`→`"snap"`) class of change.
- **Sonnet** — bounded implementation against a complete brief:
  - A single BL-X task whose approach is already decided and written down
    (e.g. BL-3.07 Competition Invite wiring, once the event handlers and
    Firestore writes are specified).
  - Client read-path work like BL-3.06 NIGHT1 N22, given the rule already
    exists and the query shape is named.
  - Must respect the Sydney Protocol: no **new** `!important`/`.style.display`,
    state-driven visibility only. If a brief seems to require breaking these,
    STOP — see escalation.
- **Opus** — genuine reasoning:
  - Anything touching a contract: `AppState` Proxy semantics, `mutateList`,
    the normaliser pattern, Firebase region pinning, offline/IndexedDB
    re-hydration, Practice Session serializability.
  - Writing the structured implementation brief that the offload implementer
    (see "Cross-family offload loop" below) then executes — including the review gates.
  - Debugging an unknown cause; multi-file changes; BL-4.x remediation design.
  - The architectural recheck of lower-model or offload-implementer output, **but
    only when the change touched a contract.** A clean docs commit needs no recheck.

### Cross-family offload loop (replaces the prior "Jules" implementer)
For BL-x implementation offloaded outside Claude: **Antigravity 2.0 / Gemini
implements** against an Opus-written airtight brief; **Claude (a different model
family) runs the adversarial check** before merge — never Gemini-checks-Gemini
(a producer misses ~a third of its own drift). One chunk → one PR → cross-family
check → merge. The standing process, PR format, and accumulated lessons live in
`docs/agent-briefs/HANDOFF-antigravity-bl-4.x.md` + `LESSONS.md`. Opus still writes
the brief and runs the check; the implementer never self-certifies or self-merges.

### If running as a lower model and the task exceeds the tier
STOP and hand back. Do not attempt contract-touching or architectural work at
Haiku/Sonnet tier. Say: "This touches <contract, e.g. AppState Proxy / Firebase
region / Sydney Protocol>; recommend escalating to Opus." Do not work around a
Sydney Protocol constraint to make a lower-tier change fit.

### Effort (Opus)
- **High** — default for all Opus work here.
- **Medium** — bounded analytical Opus work whose shape is already understood.
- **Extra (xhigh)** — underspecified or high-stakes only: BL-4.x cross-cutting
  remediation, a state/Proxy race-condition hunt, offline-recovery design.
- **Max** — effectively never (slower, heavier on the rate limit, and can
  over-think well-scoped coding work into a worse result).

### Before raising any architectural finding
Check the Known False Positives list (FP-01 … FP-10) first. If it matches, cite
the FP-ID and stop. This applies at every model tier and is the cheapest token
saver in this file — it stops re-investigation of ten settled dead ends.

### Defining "the spec is airtight" (the offload-implementer gate)
Execution-ready means it names: the file(s), the exact change, the acceptance
criterion, and the contract(s) it must not violate (Sydney Protocol + relevant
State Layer rules). Missing any of those → Opus writes the brief first.