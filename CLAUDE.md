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
See `MASTER_BACKLOG.md` for the full prioritised technical debt ledger.

Remaining active tasks:
- BL-3.05 (sole remaining sub-task) — personalisation inputs never sent to `generatePracticePlan`; every plan uses the generic fallback. `// TODO(BL-3.05)` marker in `ui.js`.
- BL-3.06 (re-scoped 2026-06-13) — the `assignedDrills` rule **already exists** (firestore.rules:48-56); remaining work is the client read path (NIGHT1 N22) + rules-test coverage. NOT a missing-rule task.
- BL-3.07 — Competition Invite Players wiring (dead UI, needs event handlers + Firestore writes)
- BL-3.08 — CLOSED. Tempo "Snap" `value="snare"`→`"snap"` now matches `tempo.js:62` (index.html:2166). *Completed: 2026-06-13 · commit 42fb255*
- See `MASTER_BACKLOG.md` BL-4.x for the NIGHT1–NIGHT3 remediation backlog (ship BL-4.00 static contract suite first).

Recently completed (June 9–10 2026):
BL-3.08, BL-3.09, BL-3.13, BL-3.14, BL-3.15, BL-3.16, BL-3.17, BL-3.05 data shape + DOM ID layers.

## Workflow: After Every Code Commit

After each successful code commit, make a second docs commit:
1. Read MASTER_BACKLOG.md first to understand the current structure
2. Find the completed BL-X.XX section in Active Tasks
3. Add ✅ and completion note to the section header:
   ### BL-3.XX ✅ [existing title]
   *Completed: YYYY-MM-DD · commit XXXXXXX*
4. Move the entire section to the relevant Completed section
5. Commit: `docs: mark BL-X.XX complete (commit XXXXXXX)`

**The Commit-Hash Mandate (2026-06-13):** a completion note (✅ / "Resolved" / "Fixed this session") is **invalid without its commit hash(es)**, and completion docs must land in the **same session** as the code commit they describe — never mark work done before it is committed. Rationale (PIR_LOG 2026-06-13): in the NIGHT2/NIGHT3 claims audit, every hash-less completion claim in the March–June docs failed verification (TEST-03, BL-3.08 HTML half, BL-3.10 artefact), while every claim citing a commit hash held at HEAD.

Do NOT update PIR_LOG.md — handled in strategic review sessions.
Do NOT modify any other documentation files.

## Environment

Unit/contract tests (`test:unit`, incl. `tests/unit/contracts.test.js`) require NO emulator — pure jsdom/file-read. Only `test:rules` and `test:e2e` need it.
The Playwright `webServer` auto-start command is broken on Windows (bash `&`); do not rely on it. Treat the emulator as manually-started, always-on infrastructure: start it in a separate terminal first with `firebase emulators:start` before running `test:rules` or `test:e2e`. Claude Code cannot reliably manage it as a background process.

## Model Selection
Default: Opus for complex multi-file tasks and architectural work.
Sonnet: Only for purely mechanical single-file tasks (docs-only commits, single import additions, one-line fixes where the change is fully pre-specified).
Haiku: Not recommended for this codebase — architectural context is too dense.
Note: Fable and Mythos (Mythos-class) were withdrawn 2026-06-12 by US government export-control directive; no restoration date. Opus is the standing default in their absence — the prior "Fable default, Opus security fallback" convention is void.