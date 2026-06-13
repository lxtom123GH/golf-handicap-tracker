# Session Report — Audit Reconciliation (NIGHT4)

**Date:** 2026-06-13 | **Branch:** `docs/audit-reconciliation` (cut from `main` @ `e50c3f5`) | **Model:** Opus 4.8
**Mode:** Run **interactively / supervised**, not by the unsupervised scheduler. The scheduled runs at 02:05 and 12:15 both failed before doing anything because `run_task.ps1` invokes `claude -p --model claude-fable-5`, which returned *"issue with the selected model (claude-fable-5) … may not exist or you may not have access"* (see `logs/output_20260613_1215.txt`). Operator action: point the runner at an accessible model id.
**Scope honoured:** docs-only edits to the 6 permitted files; all commits on this branch; `main` never modified; nothing pushed; no deploy/workflow triggered; no `src/`/`functions/`/`tests/`/config edits.

---

## Phase 1 — Dynamic verification: prediction vs observed

| Step | Predicted (NIGHT2/NIGHT3) | Observed 2026-06-13 | Verdict |
|---|---|---|---|
| **1. `test:unit`** | green; 4 `vi.mock` specifiers inert (T5) | **7/7 passed.** Console printed `[Dev] Connecting to Firebase Local Emulators…` → real `firebase-config.js` loaded despite mocks. All 4 specifiers confirmed inert (repo-root paths + gstatic URL vs real `src/` modules + bare `firebase/firestore`). | **CONFIRMED** |
| **2. `test:rules`** | exactly 2 failures: firestore.test.js:44 and :75-81 (T2) | **1 passed, 2 failed.** L44 — unfiltered `whs_rounds.get()` *denied*: `FirebaseError: Property uid is undefined … for 'list' @ L75` (per-doc rule can't evaluate on a collection list); `assertSucceeds` wrongly expected success. L75-81 — `adjustedGross:500` create *allowed* (no validation rule): `Error: Expected request to fail, but it succeeded`. | **CONFIRMED** (both halves) |
| **3. `test:e2e`** | green-by-theatre | **14 tests → 10 passed / 3 failed / 1 skipped (55.9s).** 3 failures = `logic-boundaries` Time-Travel (`#oc-round-date` not visible → timeout), `quota-guards` Double-Tap (`#btn-generate-practice` stuck disabled/"Generating…"), `ui-ergonomics` touch-target (`#oc-course-select` not visible → timeout). These match the **BL-3.15 note's "3 pre-existing failures"** exactly. 10 passes confirm theatre. | **CONFIRMED** |

### Deviations from the task's "run the project script as-is" expectation
- **`test:rules`:** `npm run test:rules` (which wraps `emulators:exec --only firestore`) **could not start** — port 8080 was already held by a pre-existing firestore emulator (PID 5760; hub 4400, UI 4000 — started from a different invocation, not this `firebase.json`). Per the task I must not kill processes I did not start. Honouring the user's supervised instruction to "try / start emulator if needed", I ran the tests **directly against the existing emulator** via `npx vitest run tests/rules` (the test hardcodes `127.0.0.1:8080` + projectId `demo-golf-tracker`, uploads its own rules, and `clearFirestore()` is scoped to its own project namespace). Result is valid.
- **`test:e2e`:** the config `webServer` command (`npm run dev & npx firebase emulators:start`) uses a bash `&` that breaks on Windows. The required auth (9099) and functions (5001) emulators were **not** running (only firestore was). I started `firebase emulators:start --only auth,functions` + `vite` as background processes; Playwright's `reuseExistingServer` then reused the dev server (skipping the broken command). Ran with `--reporter=list` and `PLAYWRIGHT_HTML_OPEN=never` to get a per-test baseline without the HTML report server hanging — **no config file modified**. All processes I started were torn down afterward; the pre-existing firestore (8080) / UI (4000) were left running.

### Caveats / extra observations
- The `--only auth,functions` emulator reported `onRoundCreated`/`onRoundDeleted` *ignored because the firestore emulator … is not running* (firestore was a separate invocation on its own hub) → **feed fan-out triggers were not exercised**. No e2e spec tests feed directly, so the baseline stands.
- Functions loaded **pinned to `australia-southeast1`** (all 5 callables) — live confirmation of NIGHT1 B1.
- **F10 observed live:** console emitted `Auth read explicitly failed (forcing bypass) FirebaseError: false for 'get' @ L17` — the auth-v2 catch-path admin-bypass firing in real time.

### Discrepancies with the audit reports
None material; the audits were accurate. One **refinement** to NIGHT2/TEST-04: NIGHT2 framed `ui-ergonomics` as vacuous-via-`if(isVisible)`; dynamically its touch-target test instead **hard-fails** on a `selectOption('#oc-course-select')` timeout (setup panel not visible) — a *red*, not a vacuous-green, in this environment. Logged in `02_debt_catalogue.md` TEST-04; the audit reports were **not** edited (they are records).

---

## Phase 2 — Commits on `docs/audit-reconciliation`

| Hash | Commit | Lines |
|---|---|---|
| `34ed104` | base: add NIGHT1-3 audit reports as evidence (they were untracked) | +reports |
| `e7670fe` | **A** docs(backlog): BL-4.x series + R10 renumber; reopen BL-3.08; re-scope BL-3.06; restore BL-3.13; fix BL-3.10 citation | 51/-7 |
| `9d9137c` | **B** docs(debt): DATA-02✅, TEST-03 reopened, TEST-01/04/05 amended, ARCH-01 closed, priority table | 25/-29 |
| `268f5ee` | **C** docs(testing): NIGHT2's six corrections + harness section + e2e baseline | 39/-22 |
| `c265bee` | **D** docs(pir): claims-without-commits PIR entry + Commit-Hash Mandate in CLAUDE.md | 26/-2 |
| *(this)* | **E** docs(session): this report | new |

Each functional commit is ≤150 lines. `main` is unchanged (`git log main -1` still `e50c3f5`).

### Working-tree note
`git status` is clean **for everything in scope**. Three items remain that are not mine to touch and were present at session start: `run_task.ps1` (M) and `scheduled_task.md` (M) — pre-existing modifications outside the writable set — and untracked `logs/output_*.txt` runner logs. The one test artifact my e2e run touched (`test-results/.last-run.json`, tracked despite `.gitignore`) was restored.

---

## Recommended first fix wave (recommendation only — no briefs written, no work begun)

1. **BL-4.00 — static contract suite.** Cheapest, highest leverage; catches F5/F6/F7/F8-root/F10-tripwire/F1-root and every future dead-ID regression. Lands before any BL-4.x fix so each fix shrinks its allowlist.
2. **BL-4.07 — remove auth debug bypass (F10).** Security-adjacent (needs sign-off), and it currently *masks* Firestore permission denials (the live `forcing bypass` above) — removing it also makes honest e2e possible.
3. **BL-4.06 — pin `askAiCoach` (F7).** One-line import change; closes the last australia-southeast1 contract gap.
4. **BL-4.01 — WHS data-integrity (F1 first).** Highest data-corruption risk; ship the seeding/cleanup utility (TEST-06) and the round-finish read-back test in the same brief.
5. **BL-4.04 — comp logging incl. R-LIVE-1.** Live comp sync is fully dead (rule-less `competition_results` write aborts both writes); fix ordering/rules then the `totalPoints` field.
6. **BL-3.08 — one-word Snap fix** (`value="snare"`→`'snap'`), bundled with any Jules pass.

**Environmental follow-ups (not fixes):** repair the Playwright `webServer` `&` command (or document the always-on emulator) so `test:e2e` is reproducible; add `include: ['tests/unit/**','tests/rules/**']` to `vitest.config.js`; reopen TEST-03 work with real cleanup hooks; and fix the scheduler's `--model claude-fable-5` invocation.

*No source/test/config files were modified. No fix work was started. Audit reports (NIGHT1–3) were committed but not edited.*
