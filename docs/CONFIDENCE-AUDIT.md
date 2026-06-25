# CONFIDENCE-AUDIT.md — Golf Handicap Tracker

*Verification snapshot as at 2026-06-25 · HEAD `aae25c1`.*
*Method: 25-agent cross-family workflow (`wf_6d284834-3aa`) — one verifier per FP and per open item re-read the cited source at HEAD; any flag would have triggered an adversarial recheck; separate probes confirmed the test baseline, hollow specs, vitest config, and completion hashes; a synthesis agent compiled the result. Nothing here is taken from the registry's own say-so — every verdict cites source read at HEAD.*

## Confidence Statement

**11 of 11 False Positives HOLD; 10 of 10 open items verified (9 REAL, 1 NEEDS-DECISION); 0 inverted, 0 stale-but-live; 1 test discrepancy (doc-clarity only); all 5 sampled completion hashes verified.** The FP registry (FP-01..FP-11) is fully under control: every entry was re-checked against HEAD source and the registry's reasoning still matches the code line-for-line. The open backlog is honest — **no open item was found inverted by source (the BL-3.05 failure mode did not recur)**, though two items (BL-4.10, BL-4.16) need a product/owner decision before build. The one discrepancy is a documentation/clarity issue in the Test Suite Warning's vitest claim, not a code or registry defect. **Net: the backlog + FP registry can be stated as under control as at today**, with the caveats in §3–§4.

## 1. False Positives

| ID | Verdict | Confidence | Note (file:line) |
|----|---------|------------|------------------|
| FP-01 | HOLDS | high | 13 round-state keys persist, not just `playerClubs` — `PERSIST_FIELDS` (persistence.js:11-25), save/load (persistence.js:30-47, 52-73). |
| FP-02 | HOLDS | high | Both handles declared, guarded, reassigned — whs.js:12/144/160; practice.js:13/359/367. |
| FP-03 | HOLDS | high | Only subcollection rule exists (firestore.rules:44-46); client aligned (ui.js:820,905,941,974); stopgap added `aba4185` then removed `3658bf7`. |
| FP-04 | HOLDS | high | Resume-mid-round trilogy still inverted: write (persistence.js:30-47/119-133), hydration before listeners (app-v4.js:47 vs :50), transition persisted. |
| FP-05 | HOLDS | high | Synchronous `disabled=true` before first await — ui.js:870 (await :880), ai.js:151 (await :159). |
| FP-06 | HOLDS | high | `async-coach.spec.js:66` is `expect(true).toBe(true)`; real steps commented out (55-65). Unchanged since `a63e1f3`. |
| FP-07 | HOLDS | high | Time-Travel test reads `validity.valid` (logic-boundaries.spec.js:55) but never asserts; code gap tracked as T3-dateValidation. |
| FP-08 | HOLDS | high | `innerHTML=''` clears before rebind on every dynamic path — card-render.js:16/56/94/144; coach.js:73/188/259/301. |
| FP-09 | HOLDS | high | None of the 3 files reference `data-active-tab`; pressed-state / routine highlight / role gating respectively. |
| FP-10 | HOLDS | high | `showToast()` creates a function-local node (score-input.js:165) with its own `setTimeout` removal — no shared element. |
| FP-11 | HOLDS | high | Personalisation is server-derived (functions/index.js:258-286); generic fallback only when `roundsSnap.empty` (:287-290). |

No FP was flagged, so no adversarial recheck was required; every verdict is high-confidence HOLDS.

## 2. Open Items

| ID | Verdict | Recommendation | Note (file:line) |
|----|---------|----------------|------------------|
| BL-3.06 | REAL | brief/build | Rule + write exist (firestore.rules:48-56; coach.js:145); **read path absent** — no getDocs/getDoc/onSnapshot for `assignedDrills`. Players never see drills. |
| BL-3.07 | REAL | brief/build | Invite UI dead — `#comp-invite-list` never populated; no `comp-visibility` listener; `invitedUIDs` never written (competitions.js:468-518) so private comps invisible to invitees. |
| BL-4.09 | REAL | brief/build | Feed reads `handicapDifferential` (index.js:434, social.js:165) but no round-writer sets it → Diff column permanently a dash. BL-4.01 dependency now satisfied. |
| BL-4.10 | REAL | **decision-needed** | `triggerLocalNotif` (notifications.js:113) has **zero callers**; saved prefs never consumed — panel is decorative. |
| BL-4.11 | REAL | brief/build | telemetry.js:19-20 gates on legacy `.tab-content.active` (never set) → telemetry dead on oncourse. Sydney Protocol violation; event-binders.js:403 already correct. |
| BL-4.12 | REAL | brief/build | Comp archive/delete markup (index.html:1542,1723-1728,2210-2239) has **no JS handlers** anywhere in repo. |
| BL-4.13 | REAL | brief/build | Hygiene debt holds: 46 `!important` (style.css); dead `btn-sync-rounds`/`oc-progress-bar` refs (archive-only); dead whs.js render duplicates. |
| BL-4.14 | REAL | brief/build | `#btn-oc-review-round` absent from index.html; handler gated on null `UI.btnOcReviewRound` (oncourse.js:1586) → review modal never opens. Do not conflate with live `oc-detailed-review-modal`. |
| BL-4.15 | REAL | brief/build | Score/stat writes mutate `liveRoundGroups` in place (score-input.js:109/119-126/152; oncourse.js:518-522), never `mutateList` → `stateChange` never fires → scores persist only incidentally. Distinct from FP-01. |
| BL-4.16 | NEEDS-DECISION | **decision-needed** | No `courses` rule (default-deny) + `updateDoc` on non-existent doc (surveyor.js:233) + zero readers + false "Pin saved successfully!" (surveyor.js:207-211). Swallowed denial. |

## 3. Discrepancies & Drift

**FP registry:** None. No FP drifted; no FP required a recheck. All 11 hold at HEAD with the registry reasoning matching source line-for-line. The only trivial drift noted (FP-04: save-function body at 30-47 vs listener wiring at the cited 119-133) is non-defeating and needs no action.

**Open items:** None inverted, none stale-but-live. The BL-3.05 inversion failure mode (premise contradicted by a hidden writer) did **not** recur in any item; every REAL verdict cites source affirming the gap. Two soft-edge notes worth recording but **not** discrepancies:

- **BL-3.06** — `docs/02_debt_catalogue.md:78` and `docs/01_feature_map.md:181` still carry the **stale original "no match block" premise**, which the 2026-06-13 re-scope superseded (rule already exists at firestore.rules:48-56). *Action: fix-in-docs — align both stale docs to the re-scoped "read-path absent" framing.*
- **BL-3.07** — premise is slightly **understated, not inverted**: `visibility` is persisted (competitions.js:483) and the read-side `invitedUIDs array-contains` clause already exists (competitions.js:56); only the invite-selection handlers and the `invitedUIDs` write are missing. *Action: none required; note when briefing so the build scopes only the genuine gap.*

**Test discrepancy (1):**

- **Hollow-specs + vitest-include** (`discrepancy:true`). Sub-claims 1-3 (hollow `async-coach`, no-expect Time-Travel, wrong-button Double-Tap) are **confirmed exactly**. Sub-claim 4 is **literally true but misleading**: `vitest.config.js:3-9` genuinely has no `include` key, **but** `package.json:11,14` run `vitest run tests/unit`, and Vitest's default include glob still matches all four `tests/unit/*.test.js` files — so **no `tests/unit` spec is silently skipped** under the configured commands. *Action: fix-in-docs — amend the CLAUDE.md Test Suite Warning's vitest sentence so it no longer implies "some specs never execute"; the missing-`include` risk is latent (would bite only if specs were added outside `tests/unit` or the path filter were dropped), not active.*

## 4. Test-Suite Truth

**Contract baseline (actual vs claimed) — CONFIRMED on every point.** `npm run test:unit` (vitest v4.0.18): **Test Files 1 failed | 3 passed (4); Tests 1 failed | 23 passed (24)**.

- `whs.test.js` — 10/10 PASS.
- `contracts.test.js` — 5 tests, 1 failed:
  - (a) "has no duplicate ids" — **PASS** (green, per the post-BL-4.03 expectation).
  - (b) "JS-referenced ids resolve to index.html (modulo allowlist)" — **FAIL** (the only red test in the whole suite; contracts.test.js:198). Lists **31 JS-referenced ids absent** from index.html/allowlist (e.g. `admin-invite-form`, `btn-ai-player`, `log-comp-dynamic`, `oc-simple-stats`, `btn-wizard-prev/next`).
  - (c) Functions-instance singleton — PASS; (d) no `if (true ||` overrides — PASS; (e) no `currentUserIsAdmin` hard-true — PASS.
- `escape.test.js` 4/4 PASS; `course-data.test.js` 5/5 PASS.

The contract suite behaves exactly as `tests/unit/contracts.test.js` (BL-4.00) intends: intentionally red until its mapped BL-4.x fixes land, now narrowed to **only contract (b)**. The 31 missing-id offenders are the live, actionable signal from this baseline (mapped to the BL-4.13 hygiene sweep / per-item id wiring).

**Hollow specs (confirmed real safety-net gaps):**
- `tests/async-coach.spec.js:66` — `expect(true).toBe(true)` placeholder; coaching-sync steps commented out (55-65). Green here ≠ feature works (= FP-06).
- `tests/logic-boundaries.spec.js:41-59` — Time-Travel test computes `isValid` (:55) but never `expect()`s it; trails into comments. (Two other tests in the file have real assertions; two more are empty stubs at 100-106.) (= FP-07.)
- `tests/quota-guards.spec.js:31-53` — Double-Tap test clicks `#btn-generate-practice` (:35,45), **not** the "Generate AI Briefing" button named in its title → wrong button exercised (= FP-05).

**vitest `include`:** `vitest.config.js:3-9` has no `include` key, but the `vitest run tests/unit` path filter + default glob execute all four `tests/unit` specs. No silent skip today (see §3).

**Completion-hash spot-check — ALL FIVE VERIFIED.** Every hash exists as a commit (`git cat-file -t` → commit) and the diffstat touches the claimed files:

| BL | Hash / PR | Verified touch |
|----|-----------|----------------|
| BL-4.07 | `8ed20c3` | src/auth-v2.js + contracts.test.js — "remove auth debug bypasses (F10)". |
| BL-4.06 | `1a7972d` | src/ai.js — pin `askAiCoach` to australia-southeast1. |
| BL-4.08 | PR#59 `0b0b62d` | index.html, src/ai.js, src/analytics.js, src/oncourse.js, score-input.js, event-binders.js. |
| BL-4.04 PART A | PR#60 `578dade` | index.html, src/competitions.js, src/oncourse.js. |
| BL-4.03 | PR#68 `35d2535` | index.html, src/practice.js. |

Every PR number, branch name, and named source file matched the diffstat. No hash-less or fabricated completion claim found in the sampled set.

## 5. Recommended Actions (ordered)

1. **Leave / close-as-FP (no work):** FP-01..FP-11 — all HOLD at HEAD. Cite the FP-ID and stop on any re-raise. No action.
2. **Decision-needed (user/owner call before any build):**
   - **BL-4.16** — surveyor write is default-denied (no `courses` rule), writes to a non-existent doc, has zero readers, and **falsely alerts success**. Decide: ship the full surveyor pin-persistence feature (rule + `setDoc` seed + read path + honest UI), or **explicitly cut it** and remove the misleading "Pin saved successfully!" alert. The false-success alert should be fixed regardless of the feature decision.
   - **BL-4.10** — local-notification prefs are decorative (`triggerLocalNotif` has zero callers). Decide: wire the notification consumers, or remove the dead pref panel. Product-intent call.
3. **Brief/build (REAL, scoped, no decision needed):** BL-3.06 (read path), BL-3.07 (invite handlers + `invitedUIDs` write), BL-4.09 (`handicapDifferential` writer — unblocked by BL-4.01), BL-4.11 (repoint telemetry gate to `body[data-active-tab]` — also a Sydney Protocol fix), BL-4.12 (archive/delete handlers), BL-4.13 (hygiene: `!important` removal + dead-ref cleanup), BL-4.14 (add/wire `#btn-oc-review-round`), BL-4.15 (route score/stat writes through `mutateList` so `stateChange`/persistence fires). Opus writes briefs for the contract-touching ones (**BL-4.11, BL-4.15** — Proxy/`mutateList`/Sydney Protocol); the rest are Sonnet-tier against an airtight brief.
4. **Fix-in-docs (clarity, no code):**
   - Amend CLAUDE.md Test Suite Warning's vitest sentence so it no longer implies live specs "never execute" (the missing-`include` risk is latent, not active under the current run command).
   - Re-align `docs/02_debt_catalogue.md:78` and `docs/01_feature_map.md:181` to the re-scoped BL-3.06 "read-path absent" premise (drop the superseded "no match block" framing).
5. **Re-open / re-scope:** None required — no open item was found inverted or already-fixed; no FP drifted into a real bug.

**Bottom line:** the FP registry and open backlog are accurate and under control as at 2026-06-25. The only items blocking a clean "all green" statement are two **product decisions** (BL-4.10, BL-4.16) and two **doc-clarity fixes** — none of which indicate hidden code rot or registry drift.
