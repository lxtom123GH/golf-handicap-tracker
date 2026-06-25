# DECISIONS.md — the "why", and how to know if it still holds

Companion to `CLAUDE.md`. CLAUDE.md says **what** to do (the operating contract);
this says **why**, and gives a concrete **re-test** so a future audit can ask
*"does the reason still hold?"* — instead of trusting a rule whose justification has
silently rotted (which is exactly how "the emulator can't be run by Claude" became a
false constraint — see D-06).

**How to use:** CLAUDE.md rules carry `[D-xx]` tags. Each entry below has —
*What* (the rule), *Why* (reason/context), *Holds only if* (the load-bearing
assumptions), *Re-test* (a command/check + the date it was last run), *Status*.
When you act on a tagged rule, glance at its Re-test date; if it's stale or the
assumption looks shaky, run the check and update the entry.

---

## D-01 · Component visibility is state-driven (`body[data-active-tab]` + AppState)
- **What:** top-level screen/tab visibility flows from `body[data-active-tab]` (set at `ui.js`, consumed by `style.css`) and AppState proxies; sub-content reveals via the `hidden` class.
- **Why:** a single source of truth for "what's showing" prevents the class of bug where two screens render stacked (the BL-4.03 duplicate `#tab-practice`) or a screen is shown/hidden from scattered imperative `.style.display` calls that drift out of sync.
- **Holds only if:** the CSS keys off `body[data-active-tab]` and nav writes that attribute.
- **Re-test:** `grep -rn "data-active-tab" src/` shows the writer (`ui.js`) + the CSS consumer; `grep -rn "classList.*\.active" src/` should find no *tab-content* gating (telemetry.js:19 still does — tracked, BL-4.11). *Last run: 2026-06-26.*
- **Status:** active; mostly holds (telemetry.js:19 is the one remnant).

## D-02 · No *new* `!important` / `.style.display`
- **What:** add no new `!important` (CSS) or `.style.display` (JS) for visibility.
- **Why:** both undermine D-01's state-driven model and accrete specificity/again-out-of-sync debt. Stated as absolutes originally, but the codebase already carries **46** `!important` and **20** `.style.display` — so the rule is "stop the bleeding", not "the code is clean".
- **Holds only if:** you treat the existing counts as the debt ceiling.
- **Re-test:** `grep -rc "!important" src/style.css` (was 46) and `grep -rn "\.style\.display\s*=" src/ | wc -l` (was 20) on 2026-06-26. A rise means a new violation slipped in; a fall means BL-4.13 cleanup is progressing. Some `.style.display` are FP-09-sanctioned (role-gating), not visibility.
- **Status:** active; existing violations tracked as BL-4.13.

## D-03 · AppState Proxy fires on reference change — with one sanctioned in-place exception
- **What:** mutate AppState arrays/objects via `mutateList` (reference change) so `stateChange` fires. **Exception:** the live-round per-hole stat path mutates `liveRoundGroups`/`simpleStats`/`compStats` in place.
- **Why:** the proxy (`state.js:66`) only fires on reference change, which drives autosave + re-render. The live-round path deliberately mutates in place and lets `loadHole()` reassign the `currentHoleShots` PERSIST_FIELD — *that* reassignment fires `stateChange`, so autosave still runs. Converting it naively to `mutateList` risks breaking that paired save path.
- **Holds only if:** every in-place stat write is followed by a `loadHole()` (or another PERSIST_FIELD reassignment) before the user can leave the hole.
- **Re-test:** `npx vitest run tests/rules` (emulator) + a manual mid-round-then-refresh check that scores survive. The BL-4.15/F1 "scores aren't persisted" claim was **refuted** 2026-06-26 (`loadHole()` at `oncourse.js:190` reassigns `currentHoleShots`). If `loadHole()` stops reassigning a PERSIST_FIELD, this exception breaks and BL-4.15 becomes real.
- **Status:** active; the exception is intentional (BL-4.04 design note `oncourse.js:1741`).

## D-04 · Persistence is localStorage; `activePracticeSession`/IndexedDB are planned, not built
- **What:** round state persists to localStorage via `PERSIST_FIELDS`; there is no IndexedDB and no `activePracticeSession`.
- **Why:** CLAUDE.md asserted both as architecture for months — they were **contract fictions** (zero source footprint), which wasted implementer effort assuming they existed. Recorded here so the *planned* feature isn't mistaken for a *present* one again.
- **Holds only if:** nobody ships the Adaptive-Engine practice-session persistence.
- **Re-test:** `grep -ric "indexeddb\|activePracticeSession" src/` — must be **0** today; when it becomes non-zero, the feature has shipped and this entry + CLAUDE.md move from "planned" to "actual". *Last run: 2026-06-26 → 0.*
- **Status:** active (planned feature; tracked under Practice Caddy Upgrades).

## D-05 · Unit-test baseline: only contract (b) is red; vitest runs all unit specs
- **What:** `test:unit` = 24 tests; contract (a)/(c)/(d)/(e) green, only (b) red by design; whs 10/10.
- **Why:** the prior docs claimed "two contracts red" and "vitest `include` missing → specs never run" — both stale/misleading. BL-4.03 flipped (a) green; the `vitest run tests/unit` path filter does execute all 4 specs.
- **Holds only if:** the unit specs stay under `tests/unit/` and the mapped BL-4.x fix for (b)'s 31 id-offenders (BL-4.13) hasn't landed.
- **Re-test:** `npm run test:unit` → expect `1 failed | 23 passed`, the failure being contract (b). When (b)'s offenders are cleaned, it flips green and this updates. *Last run: 2026-06-26.*
- **Status:** active.

## D-06 · The emulator is runnable in-session; rules/e2e are verifiable
- **What:** `test:rules` (and `test:e2e` with a dev server) run against the local emulator; Claude can drive them.
- **Why:** the original "emulator must be manually started; Claude Code cannot manage it" was a **stale constraint** (likely from older tooling) that discouraged ever running rules/e2e — so 2 real rules-test failures sat undiscovered. Disproved by actually running it.
- **Holds only if:** firebase CLI + a JDK + Playwright browsers remain installed.
- **Re-test:** `firebase --version && java -version`; `npx vitest run tests/rules` against a live emulator (`curl 127.0.0.1:8080` → "Ok"). *Last run: 2026-06-26 → passed; 2/3 rules tests fail for app reasons (1 wrong test, 1 low-sev validation gap), not infra.*
- **Status:** corrected 2026-06-26 (supersedes the "can't run it" claim).

## D-07 · Firebase region pinned to `australia-southeast1`
- **What:** all Firebase services + Cloud Functions use `australia-southeast1`; `getFunctions(` appears in `src/` only in `firebase-config.js`.
- **Why:** data-residency + latency; a stray region-less `getFunctions()` silently defaults to `us-central1` and never reaches the emulator (this happened — BL-4.06).
- **Holds only if:** no module builds its own Functions instance.
- **Re-test:** `grep -rn "getFunctions(" src/ | grep -v firebase-config.js` → expect **0** (also guarded green by contract test (c)); `grep -n REGION functions/index.js`. *Last run: 2026-06-26 → 0.*
- **Status:** active; holds (the one Sydney rule with no current violations).

## D-08 · FP-01..FP-11 are settled — cite-and-stop, but re-validate periodically
- **What:** the Permanent False Positive registry (CLAUDE.md + MASTER_BACKLOG) is "do not re-investigate".
- **Why:** ten-plus settled dead ends were being re-raised each audit round, burning tokens. The registry stops that — *but* a wrongly-listed FP would bury a real bug forever, so the "do not re-investigate" earns its keep only by periodic re-validation.
- **Holds only if:** the cited source still matches each FP's reasoning.
- **Re-test:** the Confidence-Audit pattern (`docs/CONFIDENCE-AUDIT.md`) — re-read each FP's cited file at HEAD. *Last full re-validation: 2026-06-25 → all 11 hold.* Re-run when the cited files change materially.
- **Status:** active.

## D-09 · Cross-family offload loop (Antigravity implements, Claude checks)
- **What:** BL-x work is implemented by Antigravity/Gemini against an Opus-written airtight brief; a different family (Claude) runs the adversarial check before merge; the user merges.
- **Why:** a producer misses ~a third of its own drift; same-family check doesn't catch it. Cross-family review + a structured four-field feedback loop (`HANDOFF-antigravity-bl-4.x.md`) makes each chunk teach the next.
- **Holds only if:** briefs stay airtight (name files/changes/acceptance/contracts) and the reviewer is a different model family.
- **Re-test:** check that recent BL completions cite a cross-family review + a brief; that LESSONS.md grew when a finding recurred.
- **Status:** active.

## D-10 · Audit against `origin/main`, never a stale feature branch
- **What:** ground-truth audits, greps, and workflows must read the current `origin/main` (or a worktree off it), not the session's checked-out branch.
- **Why:** the 2026-06-26 deep-dive's **Phase 2 ran against a `fix/bl-4.03-practice-merge` working tree that was behind main**, and "discovered" ~70 clutter docs + a missing STATUS.md that were *already resolved on main* (#64/#65/#67). The code findings survived (code was identical) but the doc findings were artifacts — a self-inflicted version of the very "stated truth that isn't true" the dive was hunting.
- **Holds only if:** you remember the session cwd may be an old branch.
- **Re-test:** before an audit, `git fetch && git log --oneline HEAD..origin/main` — if non-empty, work from a worktree off `origin/main`.
- **Status:** active (process lesson; also logged in LESSONS.md).

---
*Created 2026-06-26 (Deep Dive Phase 4). Seeded from `docs/deep-dive/PHASE-0..3A` + the
Confidence Audit. Add an entry whenever a non-obvious rule is set or a constraint is
corrected; always include a Re-test so the next audit can falsify it.*
