# Overnight Review — Night 3: Residue Audit (Stale Paths, Archive Bleed, Dead Modules, Claims-vs-Reality, Stranded Work)

**Date:** 2026-06-13 (run interactively after the 2026-06-13 02:05 scheduled trigger was missed — machine rebooted 01:33, task registered "Interactive only", one-time triggers don't retry)
**HEAD:** `e50c3f5` (Merge PR #47) — **identical to the commit NIGHT1 and NIGHT2 audited.** Working tree deltas at audit time: `run_task.ps1`, `scheduled_task.md` (modified), untracked `docs/` reports + `logs/` — zero changes under `src/`, `functions/`, `tests/`, `index.html`, or any config.
**Scope:** Part 1 — stale Firestore paths (DATA-02 closure). Part 2 — archive bleed (both directions). Part 3 — dead modules/scripts + NIGHT1 H-series re-confirmation. Part 4 — documentation-vs-reality claims audit with git-history classification. Part 5 — stranded-work inventory across all refs.
**Method:** Static source analysis and read-only git only (`log --all`, `show`, `rev-list`, `for-each-ref`, `branch -a`). No code executed, no emulator, no git writes. Sole artefact: this file.
**Context inputs:** `docs/overnight_review_night1_blast_radius.md` (NIGHT1), `docs/05_unit_test_audit.md` (NIGHT2). Their findings are not re-reported; amendments to them are flagged explicitly.
**FP registry:** every candidate below checked against FP-01–FP-10 before inclusion; adjacency declared inline.

---

## Executive summary

| # | Class | Finding | Evidence anchor |
|---|---|---|---|
| R1 | Verdict | **DATA-02 can be CLOSED** — zero root-level `practice_plans` references anywhere in src/functions/tests; all client refs are `users/{uid}/practice_plans/active` | ui.js:821, 906, 942, 975; functions/index.js:240; firestore.rules:44 |
| R2 | **P1 live** | `competition_results` write is **rule-less → denied in production**, and it runs *before* the `comp_rounds` write inside one try — the denial aborts live comp sync entirely (compounds NIGHT1 F9) | oncourse.js:1147-1153; firestore.rules (no `competition_results` match) |
| R3 | P2 live | Surveyor pin persistence **always fails three ways** (no `courses` rule, `updateDoc` on docs nothing creates, no reader anywhere) while the UI alerts "Pin saved successfully!" | surveyor.js:210, 230-238; oncourse.js:621 |
| R4 | P2 live | **BL-3.08 "Tempo Snap" completion claim is PARTIAL — the bug still reproduces**: both fix commits added a `'snap'` branch, but the option labelled Snap emits `value="snare"`, which matches no branch | index.html:2166; src/tempo.js:58-68; commits `bfc8b51`, `42ac23d` |
| R5 | Claims | **Three doc-cited artefacts were NEVER COMMITTED on any ref**: quota-guards cleanup hooks (TEST-03 ✅), `tests/utils/clear-emulator.js` + `tests/firebase-admin-setup.js`, and `docs/TIERED_MASTER_SYNTHESIS.md` (cited twice by MASTER_BACKLOG) | `git log --all` returns empty for all three paths |
| R6 | Residue | **Zero stranded work**: every local and remote branch tip is an ancestor of HEAD — nothing is parked on a branch, so every failed claim is a never-landed change, not a lost one | `git branch -a --no-merged` → empty; per-branch `rev-list --count HEAD..<tip>` = 0 ×14 remote |
| R7 | Residue | **Zero dead modules**: all 26 `src/` JS files reachable from the single entry (`surveyor.js` via dynamic import); all package.json script targets resolve | index.html:2273; oncourse.js:552-567 |
| R8 | Amendment | **NIGHT1 H14 is INVALID** — `oc-fixed-finish-btn` *is* created and appended to `<body>`; the removal at oncourse.js:1169 is legitimate cleanup. Drop from the BL-3.30 delete list | event-binders.js:443-450 |
| R9 | Amendment | **NIGHT1 H3 understated**: `!important` appears **44×** file-wide in style.css, not ×5 — the Sydney Protocol "no `!important`" rule is violated at scale, not at a point | style.css:110-1083 (44 matches) |
| R10 | Hygiene | **BL-numbering collision**: MASTER_BACKLOG already contains a merged BL-3.18 (deploy workflow, June 8); NIGHT1's *proposed* BL-3.18–BL-3.32 reuse the range. The "BL-3.30 hygiene brief" identifier needs disambiguation before any brief is written | MASTER_BACKLOG.md:15; NIGHT1 "Proposed new entries" table |

---

# Part 1 — Stale Firestore paths (DATA-02)

## (a) Root-level `practice_plans`

Full-repo sweep (`src/`, `functions/`, `tests/`, `firestore.rules`; docs and archives excluded):

| Reference | Path shape | Classification |
|---|---|---|
| ui.js:821 (`loadActivePlan`) | `users/{uid}/practice_plans/active` | live code — **correct** |
| ui.js:906, 942, 975 (step-toggle / reset / archive handlers) | `users/{uid}/practice_plans/active` | live code — **correct** |
| functions/index.js:240 (`generatePracticePlan` writer) | `users/{uid}/practice_plans/active` | live code — **correct** |
| functions/index.js:227, 361; state.js:152 | comments/log strings only | inert |
| tests/** | **zero** `practice_plans` references of any shape | — |
| firestore.rules:44 | nested `match /users/{userId}/practice_plans/{planId}` only; the BL-3.12 root stopgap is gone (removed in `3658bf7`) | **correct** |

No root-collection reference survives anywhere. The debt catalogue's DATA-02 entry (02_debt_catalogue.md:54-61) still describes the pre-fix state (root refs at "ui.js:825/894/929", status 🔴) — that document is stale, not the code (see Part 4).

## (b) Path strings ↔ rules cross-check

Collections referenced from code: `users` (+ subcollections `coachNotes`, `prefs`, `practice_plans`, `assignedDrills`, `following`), `global_drills`, `profiles`, `whs_rounds`, `shots`, `practice_rounds`, `competitions`, `comp_rounds`, `preapproved_emails`, `feed`, **`competition_results`**, **`courses/{id}/holes`**. All of the first group have matching rules. The last two do not:

| Path | Site | Classification | Detail |
|---|---|---|---|
| `competition_results` | oncourse.js:1148 (`addDoc`) | **live code, rule-less** | No `match /competition_results` block exists → client write denied in production (default deny). NIGHT1 H8 flagged it as write-only; the new fact is the **failure cascade** — see live finding R-LIVE-1 in section (e). |
| `courses/{courseId}/holes/{n}` | surveyor.js:232 (`updateDoc`) | **live code, rule-less** | No `match /courses` block → denied. Independently broken twice more: `updateDoc` requires an existing doc and nothing ever creates `courses/*` (course data is static, course-data.js); and no reader exists — `surveyData` is only ever consumed from `AppState` (oncourse.js:621). See R-LIVE-2. |
| `feed` create from client | — | n/a | `allow create: if false` (firestore.rules:143) is correct: only the Admin-SDK fan-out writes (functions/index.js:438), which bypasses rules. Not an orphan. |

Rules with **zero code references** (rules for collections nothing uses):

| Rule | Lines | Detail |
|---|---|---|
| `match /tempo/{docId}` | firestore.rules:137-139 | `tempo.js` performs no Firestore I/O at all (audio synthesis + DOM only); no other module references a `tempo` collection. Dead rule surface — delete, or treat as the placeholder for a future tempo-settings persistence feature. |

## Verdict

**DATA-02: CLOSE.** No live, dead, or test code hits the old root path; the rules stopgap is gone. Do not re-open on the strength of the stale 02_debt_catalogue entry — fix the doc instead. The residue this sweep *did* find runs in the opposite direction (code → missing rule: `competition_results`, `courses`) and is tracked in section (e), not under DATA-02.

---

# Part 2 — Archive bleed

**Live → archive:** zero references. Sweeps of `src/`, `functions/index.js`, `tests/`, `index.html`, `package.json`, `vite.config.js`, `vitest.config.js`, `playwright.config.js`, `firebase.json`, `.firebaserc` for `GRAVEYARD` / `_ARCHIVE` (case-insensitive) all return nothing. No imports, script tags, asset URLs, or build paths cross into either directory.

**`_GRAVEYARD_20260308_1403` is empty.** `Get-ChildItem -Recurse -Force` returns 0 items. It exists on disk only as an empty directory (git cannot track empty directories, so it exists on no ref either). Consequence: 02_debt_catalogue.md:148 ("contains archived code from that event", ARCH-01) describes contents that no longer exist — doc-stale, recorded in Part 4. The directory itself is deletable residue (decision left to the BL-3.30 brief; this audit touches nothing in it per constraints).

**Reverse check — archive-era duplicates of live modules (candidates only):**

| Archive file | Live counterpart | Verdict |
|---|---|---|
| `_ARCHIVE/coach.js.tmp` | `src/coach.js` | Sole name collision in either archive. Candidate stale working copy — diff before deciding; no live reference to it. |
| `_ARCHIVE/test-harness.js`, `_ARCHIVE/tests.js` | none (live tests follow `tests/*.spec.js` / `*.test.js` naming) | Archive-era harness, no live shadow. Keep archived. |
| remaining 54 files | — | Docs, QA report snapshots, `index_*.html` snapshots, Python/PS utilities, spreadsheets. No `src/`/`functions/` shadowing. |

---

# Part 3 — Dead modules and dead scripts

## (a) Entry points

| Entry | Anchor |
|---|---|
| `/src/app-v4.js` — the **only** module script in index.html | index.html:2273 |
| `public/sw.js` — registered by the inline script | index.html:2274-2284 |
| `functions/index.js` — Functions `main` | functions/package.json:14 |
| Test entries (per NIGHT2 Part 0): `tests/unit/whs.test.js` (vitest), `tests/rules/firestore.test.js` (vitest+emulator), 6 root Playwright specs in `testMatch` | package.json:11-14; playwright.config.js:9 |

## (b) Module reachability

**Every `.js` file under `src/` is reachable from `app-v4.js`** — 25 modules via static imports, plus `src/surveyor.js` via dynamic `import('./surveyor')` at oncourse.js:552/557/562/567 (the one non-obvious edge; NIGHT1's "surveyor wired" stands), and `src/services/audioService.js` via oncourse.js:15. `functions/` contains only `index.js`. **Dead-module count: zero.** The orphaned-*test* files (`tests/oncourse.test.js`, `tests/e2e/app|round_flow|live_audit.spec.js`) are NIGHT2 T1/T9 territory — confirmed unchanged, not re-reported.

## (c) package.json scripts

| Script | Target | Verdict |
|---|---|---|
| `dev` / `build` / `preview` | vite (+ vite.config.js, index.html entry) | ✓ resolve |
| `test:unit`, `test` | `vitest run tests/unit` → `tests/unit/whs.test.js` | ✓ resolves (1 file) |
| `test:rules` | `emulators:exec --only firestore "vitest run tests/rules"` | ✓ resolves |
| `test:e2e` | `playwright test` | ✓ resolves |
| functions: `serve`/`shell`/`start`/`deploy`/`logs` | firebase CLI verbs, no file targets | ✓ |
| **Flag:** root `"main": "app.js"` | **no `app.js` exists at root** | stale field; harmless under Vite but misleading — fix or remove (XS) |

## (d) NIGHT1 H-series at HEAD — one-line checklist

HEAD is the same commit NIGHT1 audited and the working tree touches no source file, so the H-series holds **by commit identity**; the items below were additionally spot-verified by grep. Amendments follow the checklist.

- H2 dead UI cache keys (`ai-prompt-textarea` etc.) — **HOLDS** (ui.js:141-142, 149-155)
- H3 `!important` violation — **HOLDS, WIDENED** (see amendment)
- H4 whs.js dead `renderRoundsHistory`/`renderTrendChart` duplicates — **HOLDS** (whs.js:308 vs live ui.js:337)
- H5 dead admin injected template — **HOLDS** (admin.js:51-124)
- H8 `competition_results` write-only — **HOLDS, ELEVATED** (now R-LIVE-1: rule-less + blocking)
- H9 `profiles.handicapIndex` stored as string — **HOLDS** (whs.js:286)
- H11 `temp-submit-register` leftover — **HOLDS** (auth-v2.js:33, 46)
- H12 `btn-sync-rounds` placeholder handler — **HOLDS** (oncourse.js:330-331)
- H13 `oc-hole-dots` legacy render path — **HOLDS** (oncourse.js:164)
- H14 `oc-fixed-finish-btn` "removal of an element nothing creates" — **INVALID** (see amendment)
- H15 `btn-oc-abort-round` guarded dead binding — **HOLDS** (event-binders.js:403)
- H16 `oc-progress-bar` nonexistent — **HOLDS + new dead-CSS pair** (persistence.js:97; style.css:869, 907)
- H17 `btn-close-ai-modal-2` double-bind — **HOLDS** (ai.js:103-110)
- H18 legacy static `drill-select` options — **HOLDS** (index.html:1723-1726)
- H19 unfiltered `collectionGroup('following')` scan — **HOLDS** (functions/index.js:417)
- H21 in-place `liveRoundGroups` mutations bypassing the Proxy — **HOLDS** (oncourse.js:229-238 etc.; FP-01/FP-04 scoping unchanged)

**Amendment 1 — H14 INVALID.** `bindGlobalRoundActions` *creates* the floating finish button (`fab.id = 'oc-fixed-finish-btn'`, appended to `document.body`, shown/hidden on `activeRoundId` stateChange — event-binders.js:442-458). The removal at oncourse.js:1169 is therefore legitimate teardown of a real element, not dead code. Remove H14 from the BL-3.30 delete list.

**Amendment 2 — H3 widened.** NIGHT1 counted the `!important`s in the tab-visibility rule (×4) and cloak (×1). The file-wide count is **44**, including the entire `.tabs-container` base block (×13, style.css:1069-1083), `#main-app` (×2, 1064-1067), mode-button skins (×9, 688-712), result-state chips (×9, 1042-1056), `.hidden` (110-111) and utility text colours (114-116). The Sydney Protocol "No `!important`" decision (H3) must be scoped against all 44, not 5.

**New H-class residue found this pass:**

- **H22** Dead CSS tab selectors: `body[data-active-tab="tab-log"]`, `…="tab-history"`, `…="tab-competitions"` appear in both the visibility block (style.css:573-574, 577) and the tab-button block (592-593, 596) — **no element with any of those IDs exists in index.html**. Legacy tab names. Delete six selector lines. XS.
- **H23** `public/sw.js` logs "golf-cache-v6.21.0-SURVEYOR" while `CACHE_NAME` is `golf-app-v6.24.0` (sw.js:1, 4) — stale string, misleading in DevTools. XS.
- **H24** Root package.json `"main": "app.js"` — nonexistent file (see (c)). XS.
- **H25** `match /tempo` rule with zero consumers (Part 1b). XS decision.
- **H26** Empty `_GRAVEYARD_20260308_1403/` directory + stale ARCH-01 catalogue text describing contents it no longer has. XS (doc edit + dir delete decision).

---

# Part 4 — Documentation-vs-reality claims audit

Every ✅ / "Fixed this session" / "Status: resolved" / completion note in the four governing documents, verified against HEAD `e50c3f5`. Git classification per Part 5's result: **all refs are fully merged, so nothing can be STRANDED — every missing claim is NEVER COMMITTED.**

## (c) Claims-audit table

| Claim | Source | Verdict at HEAD | Git classification |
|---|---|---|---|
| CSS-01 ✅ single `.hidden` | 02_debt:16-17 | **CONFIRMED** — one definition, `display:none !important` only (style.css:110-112) | — |
| CSS-02 ✅ `.hidden` single-property | 02_debt:19-20 | **CONFIRMED** (same anchor) | — |
| CSS-03 ✅ single `.tab-content`, 120px kept | 02_debt:22-23 | **CONFIRMED** (style.css:563-568; `padding-bottom:120px` at 565) | — |
| CSS-04 ✅ single `.tabs-container` | 02_debt:25-26 | **CONFIRMED** — base block at 1069 (`position:fixed !important`); the second match at 819 is a responsive override inside a `@media` block (closes at 845), not a duplicate | — |
| CSS-05 ✅ one consolidated active-tab block | 02_debt:28-29 | **CONFIRMED** (single block, style.css:570-587) — *but* it carries three dead-tab selectors (H22) and the H3 `!important`s | — |
| DATA-02 listed 🔴 **open**, root refs at ui.js:825/894/929 | 02_debt:54-61 | **INVERTED-STALE** — the fix landed (`d3befec`); doc describes the pre-fix tree. Reverse drift: doc claims breakage that no longer exists | fix ON MAIN (`d3befec`, 2026-06-10) |
| DATA-03 ✅ documented distinction | 02_debt:63-66 | **CONFIRMED** (claim is the documentation itself) | — |
| BRK-02 ✅ feed fan-out | 02_debt:80-81 | **CONFIRMED** — `onRoundCreated`/`onRoundDeleted` exported (functions/index.js, NIGHT1 B1), feed rules locked (firestore.rules:141-146), `loadFeed` reads `/feed` (social.js:194), composite index `recipientUid+createdAt` present (firestore.indexes.json), SW cache `v6.24.0` (sw.js:1) | — |
| TEST-03 ✅ "cleanup hooks added to quota-guards" | 02_debt:111-112; 03_testing:82, 211-212 | **NOT PRESENT** — no `afterEach`/cleanup in the file; both cited utilities (`tests/utils/clear-emulator.js`, `tests/firebase-admin-setup.js`) absent (NIGHT2 T11 confirmed; KNOWN-FACT verified: file last touched by `a63e1f3`, 2026-03-06) | **NEVER COMMITTED anywhere** — `git log --all` on the spec shows only `97bf9f2` + `a63e1f3` (March); zero commits on any ref for the utils paths. **First confirmed instance of the claims-without-commits pattern.** |
| CI-01 ✅ CI manual-trigger only | 02_debt:130-131 | **CONFIRMED** (test.yml:3-4 `workflow_dispatch:` only) | — |
| ARCH-01 "GRAVEYARD contains archived code" | 02_debt:147-149 | **STALE** — directory is empty (Part 2) | contents on no ref |
| BL-2.01–BL-2.04 resolved | BACKLOG:4-7 | **CONFIRMED structurally** — modular `src/modules/*` exists; `body[data-active-tab]` state machine is the navigation authority (style.css:570-587; ui.js) | — |
| BL-3.18 (deploy workflow) complete | BACKLOG:15 | **CONFIRMED** (deploy-production.yml:3-4 `workflow_dispatch`; `runnpmbuild.md` at root). **Numbering collision flagged** — see R10 | merged (PR history) |
| BL-3.01 CSS cleanup | BACKLOG:16 | **CONFIRMED** (= CSS-01/03/04/05 above) | — |
| BL-3.02 feature audit complete | BACKLOG:17 | **CONFIRMED** — 6 "Audit Finding" anchors in 01_feature_map.md | — |
| BL-3.03 feed fan-out | BACKLOG:18 | **CONFIRMED** (= BRK-02) | — |
| BL-3.04 archive cleanup, 50+ files + INDEX.md | BACKLOG:19 | **CONFIRMED** — `_ARCHIVE/` holds 57 files incl. `INDEX.md` | — |
| BL-3.10 supermagic audit, "See …PIR_log_supermagic_charlie.md and docs/TIERED_MASTER_SYNTHESIS.md" | BACKLOG:20, also cited at :62 | **PARTIAL** — PIR log exists; **`docs/TIERED_MASTER_SYNTHESIS.md` does not exist at HEAD** despite being the backlog's cited source for "full mechanistic descriptions and dynamic verification protocols" | **NEVER COMMITTED anywhere** (`git log --all` on the path: empty) |
| BL-3.15 ✅ (B1 `f535c6d`, B2 `225b98c`) | BACKLOG:22-26 | **CONFIRMED** — no `body.round-active #tab-oncourse.hidden` override remains (the rule at style.css:858 is the distinct full-screen layout rule); auth-v2 `style.display` count is exactly the 4 documented login↔register toggle lines (auth-v2.js:26-27, 43-44) | both commits ON MAIN |
| BL-3.16 ✅ (`5476ac2`) | BACKLOG:28-34 | **CONFIRMED** — normalisers in state.js, wired at whs/practice/social (NIGHT1's *schema-drift* P2 against `normalizeRoundDoc` stands, unrelated to this claim) | ON MAIN |
| BL-3.17 ✅ SSRF allowlist | BACKLOG:10 / CLAUDE.md | **CONFIRMED** — `STORAGE_URL_PREFIX` allowlist (functions/index.js:14), `audioUrl` validation 134-145 (NIGHT1 B1) | `683a7a1` ON MAIN |
| BL-3.05 DATA-02 ✅ (`d3befec`, `293ccc1`, `3658bf7`) | BACKLOG:42 | **CONFIRMED** (Part 1a) | all ON MAIN |
| BL-3.05 data-shape ✅ (`3367300`) | BACKLOG:43 | **CONFIRMED** — `normalizePracticePlan` in state.js | ON MAIN |
| BL-3.05 DOM-ID ✅ (`753b842`) | BACKLOG:44 | **CONFIRMED** — all four IDs present (index.html:208, 220, 223, 226) | ON MAIN |
| BL-3.12 stopgap removed (`3658bf7`) | BACKLOG:76 | **CONFIRMED** — no root rule in firestore.rules | ON MAIN |
| BL-3.14 ✅ (`20ea34c`, `a7b70b5`) | BACKLOG:80-89 | **CONFIRMED** — `mutateList` exported and consumed at the four cited sites | both ON MAIN |
| Log-dedup "consolidated into PIR_log_supermagic_charlie.md" | BACKLOG:115-118 | **CONFIRMED** — file exists | — |
| **BL-3.08 Tempo Snap complete** | CLAUDE.md "Recently completed"; docs commit `4e54f3c` | **PARTIAL — user-facing bug persists.** `buildTone` has a real `'snap'` branch (tempo.js:62-68, rewritten percussive in `42ac23d`), but the select option labelled "Snap" emits **`value="snare"`** (index.html:2166), which matches no branch → still falls through to the default 800 Hz sine. BRK-05's symptom (silent fallthrough) reproduces at HEAD; both fixes patched the code half of a two-sided mismatch | code half ON MAIN (`bfc8b51`, `42ac23d`); the HTML half **NEVER COMMITTED anywhere** — `value="snare"` unchanged since `0f0945c` (2026-03-03); `git log --all -S'snap' -- index.html`: no hit |
| BL-3.09 ✅ dead code in `stateChange` | CLAUDE.md; `4e54f3c` | **CONFIRMED** — unreachable post-`break` block removed in `bfc8b51`; ui.js:719-723 clean | ON MAIN |
| BL-3.13 ✅ | CLAUDE.md; `4e54f3c` | **CONFIRMED** — `aba4185` ("patch audio timer leak", oncourse.js +1) is on main. **Ledger gap:** BL-3.13 has no section in MASTER_BACKLOG.md at HEAD — completion is claimed in CLAUDE.md and the `4e54f3c` docs commit, but the backlog never carried (or lost) the entry | ON MAIN |
| quota-guards "done ✅" (coverage table) | 03_testing:230 | **CONFIRMED** for existence/runner status (FP-05 title nuance per NIGHT2 reference standard; not re-investigated) | — |

**Pattern summary:** 27 claims checked → 22 CONFIRMED, 2 PARTIAL (BL-3.08, BL-3.10), 1 NOT PRESENT (TEST-03), 2 stale-doc inversions (DATA-02 entry, ARCH-01 graveyard text). Every gap classifies as **NEVER COMMITTED** — the documentation was written ahead of (or instead of) the commits, and in BL-3.08's case the commits fixed the wrong half. No claimed work is sitting on a branch.

---

# Part 5 — Stranded-work inventory

`git branch -a --no-merged` (against HEAD `e50c3f5`): **empty.** Independently verified: `git rev-list --count HEAD..<tip>` = 0 for all 14 remote branches and all 11 local branches.

## (d) Branch table

| Branch (origin/) | Tip | Unmerged commits | Note |
|---|---|---|---|
| disable-ci-10135792211006458580 | `804e1f2` | 0 — merged | CI-01 work |
| feature/activity-feed-fanout-v6.24.0 | `8cc212f` | 0 — merged | BL-3.03 |
| feature/assigned-drills-rules | `6777e2e` | 0 — merged | ⚠ name suggests BL-3.06 territory — merged, yet `assignedDrills` *has* a rule block (firestore.rules:48-56) while BL-3.06/BRK-03 still claim "no match block". The **docs** are stale on BL-3.06's premise; the remaining real gap is the missing client read path (NIGHT1 N22). Recommend re-scoping BL-3.06 before briefing it |
| fix-refactor-8663815716562934911 | `d25e7bb` | 0 — merged | local tip `b2421c4` also merged |
| fix/bl-305-practice-plan-personalisation | `3c453e2` | 0 — merged | BL-3.05 remains open only for the personalisation-inputs sub-task (TODO marker, ui.js:881) |
| fix/bl-305-practice-plan-reconciliation | `f44b814` | 0 — merged | |
| fix/bl-308-309-313-bundle | `4e54f3c` | 0 — merged | carries the BL-3.08 partial fix (R4) |
| fix/bl-317-functions-hardening | `683a7a1` | 0 — merged | |
| jules-18158134599909080684-6f68f3d7 / jules-3087443805204023212-fa70825e | `347a609` / `4cd644d` | 0 — merged | |
| manual-deployment-workflow-10231083859200876793 | `42f6d2e` | 0 — merged | PR #47 (= HEAD's parent) |
| reconcile-backlog-charlie-* ×2, synthesize-master-backlog-* | `9862128` / `e14cdf3` / `14c919a` | 0 — merged | backlog doc work |
| local-only: chore/chaos-test-suite `97bf9f2`, chore/cleanup-night-shift `a63e1f3`, feature/home-dashboard `c273dad` | | 0 — merged | stale local pointers at historic commits; safe to prune (decision, not action) |

**Consequence for Part 4:** with zero unmerged commits on any ref, the STRANDED classification is structurally impossible in this repo today — every PARTIAL / NOT PRESENT claim above is NEVER COMMITTED. The one near-miss is `feature/assigned-drills-rules`: work the *docs say is still missing* (BL-3.06's rule) is in fact merged; the backlog brief, not the branch, is what's stranded.

---

# (b) Consolidated BL-3.30 inventory — residue cleanup ledger

> **Naming caveat (R10):** "BL-3.30" follows NIGHT1's proposed numbering, which collides with the existing merged BL-3.18 (deploy workflow). Renumber NIGHT1's proposed BL-3.18–3.32 (suggest BL-3.33+ or a fresh BL-4.x series) before opening briefs; this table keeps NIGHT1's IDs for traceability only.

| Item | Action | Effort | Anchor |
|---|---|---|---|
| H2 dead UI cache keys (`ai-prompt-textarea`, `btn-copy-ai-prompt`, old wizard keys) | delete | XS | ui.js:141-142, 149-155 |
| H3 `!important` ×44 (Sydney Protocol decision) — **widened** | decide | S–M | style.css (44 sites) |
| H4 whs.js dead `renderRoundsHistory`/`renderTrendChart` | delete | S | whs.js:194, 308 |
| H5 admin injected template | delete | S | admin.js:51-124 |
| H8 `competition_results` write | delete (elevated → fix with R-LIVE-1) | XS | oncourse.js:1148 |
| H9 `profiles.handicapIndex` string type | realign | XS | whs.js:286 |
| H11 `temp-submit-register` | delete | XS | auth-v2.js:33, 46 |
| H12 `btn-sync-rounds` placeholder | delete | XS | oncourse.js:330-331 |
| H13 `oc-hole-dots` legacy render | delete | S | oncourse.js:164-183 |
| ~~H14 `oc-fixed-finish-btn`~~ | **removed — invalid** (R8) | — | event-binders.js:443-450 |
| H15 `btn-oc-abort-round` dead binding | delete | XS | event-binders.js:403-410 |
| H16 `oc-progress-bar` refs **+ dead CSS** | delete | XS | persistence.js:97; style.css:869, 907 |
| H17 `btn-close-ai-modal-2` double-bind | delete | XS | ai.js:103-110 |
| H18 legacy `drill-select` options / drillId migration note | decide | S | index.html:1723-1726 |
| H19 `collectionGroup('following')` scan | keep (→ DATA-04) | — | functions/index.js:417 |
| H21 `liveRoundGroups` in-place mutations | keep (→ BL-3.32) | M | oncourse.js:229-238 |
| `mainApp` duplicate cache key + `btnLogPracticeContainer` alias | delete | XS | ui.js:15, 78-79, 191 |
| Normaliser realignment (`normalizeRoundDoc` schema, missing `normalizePracticeRound`) | realign | S | state.js:118-127; practice.js:373 |
| **H22 dead CSS tab selectors** (`tab-log`/`tab-history`/`tab-competitions`) | delete | XS | style.css:573-574, 577, 592-593, 596 |
| **H23 sw.js stale version log string** | fix | XS | public/sw.js:4 |
| **H24 package.json `"main": "app.js"`** | fix | XS | package.json:5 |
| **H25 unused `tempo` rules block** | decide | XS | firestore.rules:137-139 |
| **H26 empty `_GRAVEYARD_20260308_1403/` + stale ARCH-01 text** | delete dir + doc edit | XS | 02_debt_catalogue.md:147-149 |
| **`_ARCHIVE/coach.js.tmp`** | decide (diff vs src/coach.js) | XS | Part 2 |
| **Stale local branches** (`chore/*`, `feature/home-dashboard`) | prune (decision) | XS | Part 5 |
| **Doc repairs**: DATA-02 entry → mark resolved; TEST-03 → reopen; BL-3.06 premise → re-scope (rule exists, read path doesn't); BL-3.13 backlog section → restore; BL-3.10 → fix or recover `TIERED_MASTER_SYNTHESIS.md` reference; BL-numbering collision | doc fixes | S total | Part 4 |

---

# (e) NOT mere residue — live-code findings (NIGHT1 P1/P2 classes), kept separate

Checked against FP-01–FP-10: none matches a registry entry. (R-LIVE-1 is adjacent to NIGHT1 F9/H8 — different mechanism, declared. R-LIVE-3 is the BL-3.08 claim gap, not an FP.)

| ID | Sev | Finding | Evidence | Fix direction |
|---|---|---|---|---|
| **R-LIVE-1** | **P1** | Live comp sync is **fully dead in production**, not just field-mismatched: the rule-less `competition_results` `addDoc` (denied → throws) executes *before* the `comp_rounds` write inside the same `try`, so the catch fires and **no comp doc of either kind is written**; `anyCloudFail` masks it as a generic sync warning. Compounds F9 — even after F9's `totalPoints` fix, nothing reaches the leaderboard until this ordering/rules gap is fixed. Emulator runs enforce the same rules, so this is testable without prod. | oncourse.js:1147-1153; firestore.rules (no match block) | Fold into BL-3.21: drop the `competition_results` write (H8) or add a rule; at minimum write `comp_rounds` first. XS–S |
| **R-LIVE-2** | P2 | Surveyor pin persistence is triple-broken — no `courses` rule (denied), `updateDoc` against docs nothing creates (fails even with a rule), and zero readers (`surveyData` only ever read from `AppState`, oncourse.js:621) — while the user is told "Pin saved successfully!" (alert fires before the awaited write; error swallowed to console). Surveyed pins silently evaporate on refresh. | surveyor.js:199, 210, 230-238 | Decide: descope to explicit local-only (remove the write + fix messaging, XS) or build the feature (rule + `setDoc merge` + boot-time read, M) |
| **R-LIVE-3** | P2 | Tempo "Snap" vibe still silently falls through to the default tone — the two-commit fix (`bfc8b51`, `42ac23d`) built the `'snap'` branch the UI never sends; the option emits `'snare'`. | index.html:2166; tempo.js:58-68 | One-word fix: `value="snare"` → `value="snap"` (or alias both). Reopen BL-3.08. XS |

---

*Report generated by Night 3 residue audit. Read-only throughout; no source, test, config, doc, or archive file modified; no git write commands executed. Sole artefact: this file.*
