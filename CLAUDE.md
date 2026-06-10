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

Green CI for these specs does not mean the features work. Do not rely on them as safety nets. Tracked as AUDIT-02.

## Active Backlog Reference
See `MASTER_BACKLOG.md` for the full prioritised technical debt ledger.

Remaining active tasks:
- BL-3.05 (sole remaining sub-task) — personalisation inputs never sent to `generatePracticePlan`; every plan uses the generic fallback. `// TODO(BL-3.05)` marker in `ui.js`.
- BL-3.06 — Coach Assign Drill security rule (security — needs explicit brief)
- BL-3.07 — Competition Invite Players wiring (dead UI, needs event handlers + Firestore writes)

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

Do NOT update PIR_LOG.md — handled in strategic review sessions.
Do NOT modify any other documentation files.

## Environment

The Firebase emulator must be running before any Playwright test
commands are executed. Start it in a separate terminal first:
  firebase emulators:start
Claude Code cannot reliably manage this as a background process —
treat the emulator as always-on infrastructure, not a step in a prompt.

## Model Selection
Default: Fable for complex multi-file tasks and architectural work.
Fallback: Opus for security-adjacent work (Fable routes these to Opus automatically).
Sonnet: Only for purely mechanical single-file tasks (docs-only commits, single import additions, one-line fixes where the change is fully pre-specified).
Haiku: Not recommended for this codebase — architectural context is too dense.
