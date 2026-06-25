# Deep Dive · Phase 0 — Toolchain & Constraint Ground-Truth

*As at 2026-06-26 · HEAD `aae25c1`. Read-only phase. Method column distinguishes
**EXECUTED** (I ran it) from **INSPECTED** (read source/config) from **DEFERRED**.*

> **Why this phase exists.** Every "can't / broken / manual / must / is-fine" in
> `CLAUDE.md` and the docs is an **untested claim** until executed or re-derived from
> source. The trigger was the assertion *"the Firebase emulator is manually-started …
> Claude Code cannot reliably manage it as a background process"* — which turned out to
> be false in practice. Phase 0 tests the constraints so later phases know which
> verification tools they can actually rely on.

## 1. Constraint-truth table

| # | Asserted constraint (source) | Verdict | Method · evidence |
|---|------------------------------|---------|-------------------|
| C1 | "Emulator manually-started; Claude Code cannot manage it" (CLAUDE.md Environment) | ❌ **False in practice** | **EXECUTED.** firebase CLI 15.20 + OpenJDK 21 + Playwright browsers all installed; a Firestore emulator is live on `:8080` (`curl`→"Ok") with the hub on `:4000`; `test:rules` self-manages via `firebase emulators:exec`; I ran the rules suite directly against `:8080`. The practical barrier ("you can't verify rules/e2e") does not exist. |
| C2 | "`test:unit` needs no emulator" (CLAUDE.md) | ✅ **True** | **EXECUTED.** jsdom-only; 24 tests run with no emulator. |
| C3 | "Playwright webServer auto-start broken on Windows (bash `&`)" (CLAUDE.md) | ⚠️ **Real but bypassable** | **INSPECTED.** `playwright.config.js:30` command `npm run dev & npx firebase emulators:start` — the `&` won't background on cmd/PowerShell. BUT `reuseExistingServer:true` (local) skips it when servers are up; browsers installed; app safely routes to the emulator on localhost (`firebase-config.js:47-51`). A live browser run needs the **full** emulator suite (auth `:9099` + functions `:5001` are NOT up; only firestore is) + `vite` dev. **DEFERRED** (won't disturb the running firestore emulator). |
| C4 | "vitest has no `include` key → some specs never execute" (CLAUDE.md Test Warning) | ❌ **False/misleading** | **EXECUTED.** `vitest run tests/unit` path-filter + default glob run all 4 unit specs. Latent risk only if specs were added outside `tests/unit`. |
| C5 | "`test:rules` baseline passes" (implied) | 🔴 **2/3 fail** | **EXECUTED + triaged** (§2). 1 is a *wrong test*; 1 is a *low-sev validation gap*. Neither is a breach. |
| C6 | Sydney Protocol: **"No `!important`"** (CLAUDE.md) | ❌ **Violated ×46** | **EXECUTED** grep — 46 in `src/style.css`. (Tracked as debt in BL-4.13, but the contract states it as absolute.) |
| C7 | Sydney Protocol: **"No `.style.display` assignments"** (CLAUDE.md) | ❌ **Violated ×20** | **EXECUTED** grep — 20 in `src/` (`ai.js` role-gating [FP-09-sanctioned], `app-v4.js:302/306`, etc.). Contract states it as absolute; reality is "mostly, with sanctioned + debt exceptions". |
| C8 | Sydney Protocol: "`getFunctions(` only in `firebase-config.js`" | ✅ **Holds (0 violations)** | **EXECUTED** grep; also guarded green by contract test (c). |
| C9 | "Firebase region pinned to `australia-southeast1`" | ✅ **In code** | **INSPECTED.** `functions/index.js:12` `REGION` + every `onCall({region:REGION})`; client bridge present. Runtime-deploy region **DEFERRED** (needs `firebase functions:list` / deploy access). |
| C10 | "Visibility state-driven via `body[data-active-tab]`" | ⚠️ **Mostly** | `telemetry.js:19-20` still gates on legacy `.tab-content.active` (BL-4.11). |
| C11 | FP-01..FP-11 are false positives | ✅ **All hold** | Confidence Audit (executed re-validation, 2026-06-25). |
| C12 | "Cloud Functions never audited (AUDIT-01)" | ✅ **True** | Still unaudited — Phase 1/3 target. |
| C13 | Hollow E2E specs (async-coach / logic-boundaries / quota-guards) | ✅ **True (hollow)** | Confidence Audit (read). They pass green while asserting nothing. |

## 2. The 2 `test:rules` failures — triaged (not fixed)

`tests/rules/firestore.test.js` — 3 tests, **2 fail**:

- **"deny bad round data" — REAL gap, LOW severity + aspirational test.** The `whs_rounds`
  create rule (`firestore.rules:81`) is ownership-only (`request.resource.data.uid ==
  request.auth.uid`) with **no field validation**, so `adjustedGross: 500` is accepted; the
  test expects a "max 200" check the rules never implemented. Impact: a user can only write
  junk to *their own* rounds — **no cross-user / privilege effect**. Every create rule in the
  file is ownership-only (`whs_rounds`/`shots`/`practice_rounds`/`comp_rounds`), so "rules do
  no field validation" is a **consistent design choice to adjudicate in Phase 3**, not a bug.
- **"allow approved read / deny create for others" — WRONG/STALE TEST.** It does an
  *unconstrained* `collection('whs_rounds').get()` and asserts success (line 44). Under the
  owner-scoped read rule (`firestore.rules:75-80`), Firestore **denies unconstrained queries**
  — the real app always queries `where('uid','==',uid)`, so it works in production. **The rule
  is correct (arguably stricter than the test assumes); the test is wrong.**

**Meta:** the rules suite is thin (3 tests, 1 outright wrong) and the rules have **no
field-level validation anywhere**. The rules-test corpus joins the hollow-unit-spec problem
— another "red/green that doesn't mean what it says." → Phase 3 (security + test-truthfulness).

## 3. Headline meta-finding — the contract overstates itself

`CLAUDE.md`'s **Sydney Protocol** lists "No `!important`" and "No `.style.display`" as
**non-negotiable**, but the code violates both (46 + 20). An agent told these are invariants
would reason incorrectly about the codebase (and FP-09 *sanctions* some `.style.display`).
The contract is **part-true, part-aspirational** and out of sync with both the debt ledger
(BL-4.13) and the FP exceptions. → Phase 4 should reconcile CLAUDE.md to reality:
state these as **"no NEW … ; existing tracked as BL-4.13 debt; FP-09 sites sanctioned"**,
not as absolutes. (Same disease as the "two contracts red" / vitest / emulator claims.)

## 4. Safety charter (governs every later phase)

- **Phases 0–3 are read-only** — findings docs only; zero code/data mutation. Risk lives only
  in the eventual fix phases.
- Before any change phase: **tag a restore point** (`pre-deepdive-2026-06-26`) on `main`.
- All changes via **worktree branches + PRs the user merges** — never direct to `main`; stage
  explicit paths (no `git add -A`); reversible, ≤~150-line commits.
- **Emulator/dev work is local-only** (`singleProjectMode`, `127.0.0.1`, app auto-routes to
  emulator on localhost per `firebase-config.js:47-51`) — it cannot touch prod. Verify
  project/region before any stateful op.
- **Do not disturb running infra that isn't ours** (the live firestore emulator). Spin an
  isolated suite via `emulators:exec` when a phase needs one.
- Findings policy: **triage, don't fix**; fast-track only items that are *both clearly-real
  and security/safety-critical*, in isolated PRs, with user approval.

## 5. Phase 1 scope (informed by Phase 0)

Independent source-truth mapping — built from source, **trusting neither the docs nor the
contract's claims**. Parallel read-only readers (safe to fan out — no port contention):
1. **Architecture & state contracts** — AppState Proxy / `mutateList` / normalisers, and
   where code *violates* them (the in-place `liveRoundGroups` writes per BL-4.15, the 46+20
   Sydney violations).
2. **Firestore schema map** — every collection + the fields actually written vs read
   (field-drift hunt, beyond the whs_rounds check already done).
3. **Security-rules coverage matrix** — every collection's rule vs its real client usage;
   the "no field validation" pattern; orphan/over-permissive rules.
4. **Cloud Functions inventory (AUDIT-01)** — every `functions/` export: trigger, auth gate,
   region, secrets, data touched. Never audited before.
5. **Dependency / build / bundle health** — the 1.2 MB chunk, dynamic-vs-static import
   warning, dep freshness.
6. **Dead-code / orphan map** — dead ids (the 31 contract-(b) offenders), archive-only refs,
   duplicate renders.

**Gate:** user reviews this Phase-0 artifact before Phase 1 launches.
