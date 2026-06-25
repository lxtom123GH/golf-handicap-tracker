# CLAUDE.md — Golf Handicap Tracker

## Architecture Contract (Sydney Protocol)
These rules are non-negotiable. If any constraint cannot be met, STOP and ask before proceeding.

- Component visibility is state-driven via `body[data-active-tab]` and `AppState` proxies only
- No `!important` tags in CSS
- No direct DOM styling via `.style.display` assignments
- All Firebase services and Cloud Functions pinned strictly to `australia-southeast1`
- Each commit must represent one complete, independently-testable logical unit
- Maximum ~150 lines changed per commit as a secondary guardrail

## State Layer Rules
- `AppState` Proxy fires `stateChange` on reference change only — never mutate arrays or objects in place
- Use `mutateList(key, fn)` from `state.js` for all array/object mutations
- Normaliser pattern: `normalizeRoundDoc`, `normalizeUserDoc`, `normalizePracticePlan` in `state.js` — all Firestore snapshot consumers must normalise before writing to `AppState`. Add new normalisers here when new document types are consumed.
- `onStateChange(keys, handler)` filtered subscription wrapper is deferred (T3-onStateChange) — do not implement without explicit approval
- Practice Session State: Must be fully serializable. `AppState.activePracticeSession` tracks active drill IDs, current step, configurations, and raw score inputs.
- Offline Recovery: On application boot, check IndexedDB for uncommitted active practice sessions and re-hydrate State/UI seamlessly.

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

Green CI for these specs does not mean the features work. Do not rely on them as safety nets. Tracked as AUDIT-02. Authoritative file-by-file test status now lives in `docs/05_unit_test_audit.md` (NIGHT2): note the `vitest` config has no `include` key so some specs never execute, and no test reads back a Firestore doc the app wrote — the suite is schema-blind. Static contract suite `tests/unit/contracts.test.js` (BL-4.00) ships intentionally red until its mapped BL-4.x fixes land.

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

## Environment

Unit/contract tests (`test:unit`, incl. `tests/unit/contracts.test.js`) require NO emulator — pure jsdom/file-read. Only `test:rules` and `test:e2e` need it.
The Playwright `webServer` auto-start command is broken on Windows (bash `&`); do not rely on it. Treat the emulator as manually-started, always-on infrastructure: start it in a separate terminal first with `firebase emulators:start` before running `test:rules` or `test:e2e`. Claude Code cannot reliably manage it as a background process.

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
  - Must respect the Sydney Protocol: no `!important`, no `.style.display`,
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