# Handoff — BL-4.x remediation (for Antigravity 2.0 / Gemini 3.5 Flash)

You are implementing a queue of pre-written remediation briefs for the **Golf
Handicap Tracker** (vanilla JS + Vite + Firebase: Auth, Firestore, Cloud Functions,
Hosting). Each brief is execution-ready and lives in `docs/agent-briefs/`. Work
**one chunk at a time, in order**. After each chunk you open a PR and STOP — a
cross-family reviewer (Claude) runs that brief's check before the next chunk starts.
You implement; you do not self-certify and you do not merge.

---

## How to run each chunk
1. Open the brief file for the chunk (path in the table below).
2. Follow its **"① Implementation prompt"** section **exactly** — it names the
   files, the precise change, the acceptance criteria, and the contracts not to
   break. Do not improvise beyond it; if the brief seems to require breaking a
   Global Guardrail below, STOP and report instead of working around it.
3. Create the branch named in the brief (e.g. `fix/bl-4.17-xss`).
4. Implement. Keep each commit one complete, independently-testable logical unit,
   ~≤150 lines. Larger briefs (BL-4.02) say how to split.
5. Run `npm run build` (must be clean) and `npm run test:unit` (baseline must be
   unchanged — see Testing). No emulator is needed for unit tests.
6. Open a PR to `main`. In the description, map each change to its tag (the brief
   says which), list every file touched, and note anything you were unsure about.
   **DO NOT MERGE.**
7. STOP. Wait for the cross-family review (the brief's "② Independent check
   prompt"). Apply any FIX-FIRST findings on the same branch, then it merges.
8. Move to the next chunk.

---

## Chunk order

| # | Brief file | Scope (one line) | Branch | Depends on |
|---|-----------|------------------|--------|-----------|
| 1 | `bl-4.17-xss-remediation.md` | Stored-XSS: add `src/escape.js`, escape every user-controlled innerHTML sink | `fix/bl-4.17-xss` | — |
| 2 | `bl-4.08-shots-schema.md` | Shot-field reconciliation (`line/curve`→`startLine/shape`), GIR inference, isOffGreen toggle | `fix/bl-4.08-shots-schema` | — |
| 3 | `bl-4.04-comp-logging.md` (PART A only) | Comp logging repair + R-LIVE-1 (drop rule-less write, `totalPoints`, empty-state, delete handler, starting-points) | `fix/bl-4.04-comp-logging` | — |
| 4 | `bl-4.04-f8-oncourse-comp-rules.md` | On-course comp-rule steppers that write `compStats` (collapsible hub panel) | `fix/bl-4.04-f8-compstats` | **#3** |
| 5 | `bl-4.02-oncourse-setup.md` | Setup rewiring onto static `#oc-stat-*`/`#oc-dh-*`, resolver repoint, custom-course flow, N2 alert gate | `fix/bl-4.02-oncourse-setup` | — |

Notes:
- **#4 must follow #3:** F8 writes the rule data, but PART A's `totalCompScore →
  totalPoints` rename is what makes it appear on the leaderboard.
- `bl-4.04-comp-logging.md` has a **PART B** describing F8 — that is now chunk #4's
  own brief (`bl-4.04-f8-...`). Implement PART A only from the comp-logging file.
- **#5 touches the WHS handicap contract** (the BL-4.01 `resolveRoundRatings`
  single-source resolver). Its check has a dedicated WHS-regression gate. Treat it
  as the highest-care chunk.

---

## Global Guardrails (Sydney Protocol — apply to EVERY chunk)
These override convenience. If a brief can't be met without breaking one, STOP.

- **Visibility is state-driven.** Top-level screen/tab visibility flows from
  `body[data-active-tab]` + AppState proxies only. Reveal/hide sub-content (panels,
  groups, empty-states) via the **`hidden` class** — never via `.style.display`
  assignments.
- **No `!important`** anywhere in CSS or inline styles.
- **Firebase region is pinned to `australia-southeast1`.** Do not add a
  `getFunctions(...)` / region call — `getFunctions(` may appear in `src/` ONLY in
  `firebase-config.js`. Reuse the shared `functions`/`db` imports.
- **AppState mutation:** the proxy fires `stateChange` on *reference* change only.
  Use `mutateList(key, fn)` for array/object replacement — EXCEPT the live-round
  per-hole stat path (`simpleStats`/`compStats`), where the briefs explicitly tell
  you to match the existing **in-place** mutation + `loadHole()` pattern. Follow the
  brief; do not "upgrade" that one site to mutateList (it would change reactivity
  and break persistence).
- **Escape untrusted output.** Any Firestore-/user-sourced string interpolated into
  innerHTML must be escaped (use `escapeHtml` from chunk #1's `src/escape.js`), or
  routed to the DOM via `textContent`/`setAttribute`. Never raw-interpolate user
  data (displayName, course name, competition/rule names, notes).
- **Do not touch:** `dist/` (build output — never commit it), `scheduled_task.md`,
  `logs/`, or `CLAUDE.md`. Commit source + tests only.
- **One logical unit per commit**, ~≤150 lines.

## Testing
- `npm run test:unit` needs **no emulator** (pure jsdom/file-read). The baseline is:
  the two mapped static-contract tests in `tests/unit/contracts.test.js` are
  **intentionally red** until their BL-4.x fixes land; the rest green; the whs suite
  green. Your change must not alter that baseline except where a brief says a
  specific contract test should now flip green.
- `test:rules` / `test:e2e` DO need the emulator, which is **manually started,
  always-on** infrastructure (`firebase emulators:start` in a separate terminal).
  The Playwright auto-start `webServer` is broken on Windows — assume the emulator
  is already running; do not rely on auto-start. Only run these if a brief asks.
- Platform is Windows 11 / PowerShell — use PowerShell-native commands.

## When you finish all five
Report a summary per chunk (branch, files, PR link, test result, open questions).
Do not merge any PR. Do not start new backlog items beyond these five.
```
