# Handoff — BL-4.x remediation (for Antigravity 2.0 / Gemini 3.5 Flash)

You are implementing a queue of pre-written remediation briefs for the **Golf
Handicap Tracker** (vanilla JS + Vite + Firebase: Auth, Firestore, Cloud Functions,
Hosting). Each brief is execution-ready and lives in `docs/agent-briefs/`. Work
**one chunk at a time, in order**. After each chunk you open a PR and STOP — a
cross-family reviewer (Claude) runs that brief's check before the next chunk starts.
You implement; you do not self-certify and you do not merge.

---

## How to run each chunk
1. Read `LESSONS.md` (accumulated cross-chunk lessons) first, then open the brief
   file for the chunk (path in the table below).
2. Follow its **"① Implementation prompt"** section **exactly** — it names the
   files, the precise change, the acceptance criteria, and the contracts not to
   break. Do not improvise beyond it. If anything is **ambiguous, under-specified,
   or seems to require breaking a Global Guardrail**, STOP and ask BEFORE coding —
   that is the cheapest place to fix a brief.
3. Create the branch named in the brief (e.g. `fix/bl-4.17-xss`).
4. Implement. Keep each commit one complete, independently-testable logical unit,
   ~≤150 lines. Larger briefs (BL-4.02) say how to split.
5. Run `npm run build` (must be clean) and `npm run test:unit` (baseline must be
   unchanged — see Testing). No emulator is needed for unit tests. ALSO run every
   grep / acceptance gate the brief specifies and KEEP the output.
6. Open a PR to `main`. In the description: (a) map each change to its tag (the brief
   says which); (b) list every file touched; (c) **paste the output of every
   grep/acceptance gate** — completeness must be *demonstrated*, not asserted (see
   LESSONS L1); (d) a **"Brief feedback"** block: any ambiguity or wrong assumption
   in the brief, anything you had to infer that wasn't specified, and the method you
   used to verify coverage. **DO NOT MERGE.**
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
- **Escape untrusted output (standing, ALL chunks).** `src/escape.js` (`escapeHtml`)
  ships in chunk #1 and is then available to every later chunk. Any Firestore-/user-
  sourced string interpolated into innerHTML must be escaped with it, or routed to
  the DOM via `textContent`/`setAttribute` — **even when the brief doesn't mention
  XSS**. Never raw-interpolate user data (displayName, course/player names,
  competition/rule names, notes).
- **Demonstrate completeness, don't assert it.** When a brief has a grep/acceptance
  gate ("no remaining `s.line`", "no `competition_results`", etc.), RUN it and paste
  the output in the PR. The brief's named files/sinks are the **floor, not the
  ceiling** — enumerate by the dangerous pattern across the whole tree, not by the
  named list, and never trust a single self-written detector's all-clear (LESSONS L1).
- **No scratch in commits.** Helper scripts (`find_*.py`), notes, `walkthrough.md`,
  and any throwaway artifact stay OUT of PRs. Stage explicit paths (`git add <files>`),
  never `git add .`/`-A`. Commit `src/` + `tests/` only.
- **Do not touch:** `dist/` (build output — never commit it), `scheduled_task.md`,
  `logs/`, or `CLAUDE.md`.
- **One logical unit per commit**, ~≤150 lines.

## Two-way learning loop (standing — every chunk, both agents)
The goal is that each chunk makes the next one smoother, instead of re-litigating the
same misunderstandings. This is not optional and not per-chunk-asked — it is the loop.

- **Implementer (Antigravity):** read `LESSONS.md` before starting; ask up-front on
  any ambiguity (step 2); in the PR include the grep-gate output + the "Brief
  feedback" block (step 6).
- **Reviewer (Claude):** run the brief's ② check (PASS/FAIL + verdict), THEN add a
  **"Doc/Process update"** note — if a finding reveals a brief defect or a recurring
  failure mode, propose the concrete fix and update `LESSONS.md` (and the affected
  brief/handoff) so the lesson is captured, not just mentioned.
- **Both:** `LESSONS.md` is the shared ledger; read it before a chunk, append to it
  after a finding.

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
