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
- Use `mutateList(key, fn)` for all array mutations (helper lands in BL-3.14)
- Use `onStateChange(keys, handler)` for filtered subscriptions (lands after BL-3.14)
- The correct reassignment pattern already exists at `ui.js` around line 622 — treat it as the reference implementation until `mutateList` lands

## Tooling
- Runtime: Vanilla JS, Vite, Firebase (Auth, Firestore, Cloud Functions, Hosting)
- Tests: Playwright against the Firebase Local Emulator
- Platform: Windows 11 / PowerShell — use PowerShell-native commands only
- Never truncate code output

## Known False Positives — Do Not Re-Investigate
Before raising any architectural finding, check this list. If it matches, cite the FP-ID and stop.

- **FP-01** "Only `playerClubs` survives a page refresh — ~24 initialState keys are memory-only" → FALSE. `persistence.js:11-25` persists 13 round-state keys via `PERSIST_FIELDS` + `GOLF_APP_STATE_KEY`. Mid-round state is the most thoroughly persisted state in the app.
- **FP-02** "`whs.js`/`practice.js` have no stored unsubscribe handle" → FALSE. Both correctly declare, guard, and reassign `unsubscribeWHS`/`unsubscribePractice`.
- **FP-03** "`practice_plans` Firestore rules mismatch is a hallucination" → FALSE. The mismatch is real and tracked as BL-3.12.
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

Green CI for these specs does not mean the features work. Do not rely on them as safety nets.

## Active Backlog Reference
See `MASTER_BACKLOG.md` for the full prioritised technical debt ledger.

Current execution sequence:
1. BL-3.11 ✅ This file
2. BL-3.12 — T1-A: Firestore rules `practice_plans` root-level stopgap
3. BL-3.13 — T1-B: Audio timer leak (`endRoundCleanup` never calls `stopAudioTimer`)
4. BL-3.15 — T2-B: Auth overlay dual-lever (causing 14/14 CI failure)
5. BL-3.14 — T2-A: `mutateList` primitive + proxy consumer migration
6. BL-3.16 — T2-C: Firestore document normalisation
## Workflow: After Every Code Commit

After each successful code commit, make a second docs commit:
1. Read MASTER_BACKLOG.md first to understand the current structure
2. Find the completed BL-X.XX section in Active Tasks
3. Add ✅ and completion note to the section header:
   ### BL-3.XX ✅ [existing title]
   *Completed: 2026-06-08 · commit XXXXXXX*
4. Move the entire section to the relevant Completed section
5. Commit: docs: mark BL-X.XX complete (commit XXXXXXX)

Do NOT update PIR_LOG.md — handled in strategic review sessions.
Do NOT modify any other documentation files.

## Environment

The Firebase emulator must be running before any Playwright test 
commands are executed. Start it in a separate terminal first:
  firebase emulators:start
Claude Code cannot reliably manage this as a background process — 
treat the emulator as always-on infrastructure, not a step in a prompt.


## Model Selection
Default: Opus for all sessions.
Switch to Sonnet only for purely mechanical single-file tasks
(docs-only commits, single import additions, one-line fixes where
the change is fully pre-specified).
Rationale: Opus caught the app-v4.js N-copies-in-loop issue (BL-3.14)
that Sonnet missed. Use the ceiling deliberately, not by default fallback.