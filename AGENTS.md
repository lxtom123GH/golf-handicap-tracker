# AGENTS.md — Golf Handicap Tracker

Rules for every coding agent (Claude Code, Codex, Gemini, OpenCode) and human
contributor. `CLAUDE.md` and `GEMINI.md` only import this file. Read these as
**"add no new violations"**: where the code already breaks a rule it is tracked
debt. STOP and ask before introducing a new violation, or before "fixing" a
documented sanctioned exception.

## Architecture contract
- Visibility is state-driven: `body[data-active-tab]` and `AppState` proxies only.
- No **new** `!important` in CSS. The existing ones in `src/style.css` are debt,
  not licence to add more.
- No **new** `.style.display` for tab/screen visibility. Use
  `body[data-active-tab]` + the `hidden` class. (Role gating and pressed-state
  toggles are sanctioned, see FP-09.)
- All Firebase services and Cloud Functions are pinned to `australia-southeast1`.
- One complete, independently testable logical unit per commit; aim for at most
  ~150 changed lines per commit.

## State layer
- The `AppState` Proxy fires `stateChange` on **reference change only**. Never
  mutate arrays/objects in place: use `mutateList(key, fn)` from `state.js`.
  This includes the live-round scoring path, with no exceptions.
  - Why: a past "this is safe because something else triggers the save"
    exception broke silently when that trigger moved, and the final hole of a
    round stopped persisting. The guard is `tests/unit/round-persistence.test.js`
    ("persists the FINAL hole…"); it fails on any tree where scoring mutates in
    place.
- Normalise before writing Firestore data to `AppState`: `normalizeRoundDoc`,
  `normalizeUserDoc`, `normalizePracticePlan` in `state.js`. Add a normaliser
  for any new document type you consume.
- Do not implement a filtered `onStateChange(keys, handler)` wrapper without
  explicit approval.
- Persistence today: round state persists to **localStorage** via
  `PERSIST_FIELDS` + `GOLF_APP_STATE_KEY` (`persistence.js`); `loadRoundState()`
  re-hydrates on boot before Firestore listeners attach. There is **no
  IndexedDB** and **no `activePracticeSession`**; do not assume they exist.

## Stack and tests
- Vanilla JS, Vite, Firebase (Auth, Firestore, Cloud Functions, Hosting).
- `npm run test:unit` — unit + static contract tests (`tests/unit`,
  incl. `contracts.test.js`); jsdom only, no emulator needed.
- `npm run test:rules`, `test:auth`, `test:offline` — start their own Firebase
  emulator via `scripts/run-emulator-tests.mjs`.
- `npm run test:e2e` — Playwright against the Firebase Local Emulator. Start
  `npm run dev` and the emulators first; the app routes to the emulator on
  `localhost` (`firebase-config.js`), so there is no production risk.
- No test reads back a Firestore document the app wrote, so a green suite does
  not prove the stored schema. Check writes by hand when you change them.
- Never truncate code output.

## Known false positives — do not re-investigate
Before raising an architectural finding, check this list. If it matches, cite
the FP-ID and stop.

- **FP-01** "Only `playerClubs` survives a refresh" → FALSE. `persistence.js`
  persists the round-state keys in `PERSIST_FIELDS`; mid-round state is the
  most thoroughly persisted state in the app.
- **FP-02** "`whs.js`/`practice.js` keep no unsubscribe handle" → FALSE. Both
  declare, guard and reassign `unsubscribeWHS`/`unsubscribePractice`.
- **FP-03** "The `practice_plans` rules mismatch was a hallucination" → FALSE.
  It was real; the client query was repointed and the stopgap rule removed.
- **FP-04** "Resume mid-round is missing (no persistence write, no hydration,
  unpersisted transition)" → FALSE. All three are inverted by the source.
- **FP-05** "`Generate AI Briefing` double-tap guard is broken" → FALSE. The
  `disabled = true` guard is set before the `await`.
- **FP-06** "Async coach notification dropped" (an e2e failure) → FALSE. The
  old spec was a placeholder, not a test of the feature.
- **FP-07** "Future-date validation is failing" (an e2e failure) → FALSE. The
  old spec asserted nothing, and round entry now rejects future dates
  (`src/modules/event-binders.js`).
- **FP-08** "Listener leaks in `card-render.js`/`coach.js`" → FALSE.
  `innerHTML = ''` clears before re-binding; detached nodes are collected.
- **FP-09** "`wakelock.js`, `score-input.js`, `ai.js` bypass
  `body[data-active-tab]`" → FALSE. They are a pressed-state toggle, a
  pre-shot routine highlight and role-based feature gating, not tab navigation.
- **FP-10** "`score-input.js` setTimeout races on a shared element" → FALSE.
  It is a function-local disposable toast.
- **FP-11** "Practice-plan personalisation inputs are never sent" → FALSE.
  `generatePracticePlan` personalises server-side from the caller's rounds and
  profile, and the Caddy also sends focus, goal and time.
- **FP-12** "The Practice Caddy is broken end to end" → FALSE. That described a
  pre-fix data path; the Caddy works. Do not change it as a simplification.
