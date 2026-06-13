# Overnight Review — Night 1: ARCH-01 Blast Radius Audit

**Date:** 2026-06-11 (overnight session)
**HEAD:** `e50c3f5` (Merge PR #47)
**Scope:** Task A — DOM ID reconciliation (JS ↔ index.html, both directions, per tab). Task B — data contract audit (callables ↔ functions/index.js; Firestore writers ↔ readers; normaliser bypasses).
**Method:** Static source analysis only. Full enumeration of 333 HTML `id="..."` declarations and 462 `getElementById`/`querySelector('#…')` references via scripted set-diff, then manual verification of every discrepancy against current source. No emulator, no Playwright, no source edits.
**FP Registry:** Checked every finding against FP-01–FP-10 before inclusion. Where a finding is *adjacent* to an FP entry or a known BL item, that is called out explicitly in the finding.
**Excluded as already known:** BL-3.05 remaining sub-task (`generatePlan({})`, ui.js:881), BL-3.06 (assignedDrills security rule), BL-3.07 (`comp-invite-container`/`comp-invite-list` dead UI), PR #42 Practice Caddy fixes.

Severity tiers:
- **P1 BROKEN** — user-visible failure or silent data corruption
- **P2 SILENT NO-OP** — feature renders (or code runs) but does nothing; guarded dead paths
- **P3 HYGIENE** — dead code, contract drift, no behavioural impact today

Effort: XS (<10 lines) · S (<50) · M (50–150, one logical unit) · L (multi-commit).

---

## Executive summary — top findings

| # | Sev | Finding | Evidence anchor |
|---|-----|---------|-----------------|
| F1 | P1 | Every live-tracked round saved to `whs_rounds` with **rating=72 / slope=113 / par=72 constants** — phantom `oc-manual-cr/sr/par` inputs never exist | oncourse.js:1028-1034, 1090-1091 |
| F2 | P1 | `UI.handicapIndexEl` is an `<input>`; two `.textContent` reads return `""` → manual AGS computed with DH=0 and **Daily Handicap calculator always errors** | app-v4.js:217, 337-343; index.html:1149 |
| F3 | P1 | WHS history **Exclude/Delete round buttons have no event listeners** — handlers exist but are never wired | ui.js:389-392; whs.js:395, 404 |
| F4 | P1 | "Not counting" checkbox value computed then **discarded**; every manual round saved `notCounting: false` | app-v4.js:279-288; whs.js:379 |
| F5 | P1 | **Duplicate `id="tab-practice"`** — Practice Caddy *and* legacy Practice Drills screens render stacked | index.html:186, 1705; style.css:575, 583 |
| F6 | P1 | **Add Coach throws TypeError** — JS reads `coach-uid-input`, HTML input is `coach-email` | coach.js:36, 46; index.html:1125 |
| F7 | P1 | `askAiCoach` called on an **unpinned `getFunctions()`** (us-central1 default; also never connected to emulator) — region contract violation, Ask AI Coach broken | ai.js:233; firebase-config.js:41, 51 |
| F8 | P1 | **Comp custom-rule inputs never generated** — container lookup matches nothing and the generator targets a nonexistent `log-comp-dynamic` | competitions.js:93, 145-152, 161-162; index.html:1633 |
| F9 | P1 | **Live-synced comp rounds invisible on leaderboard** — writer emits `totalCompScore`, readers consume `totalPoints` | oncourse.js:1133-1143; competitions.js:237, 321 |
| F10 | P1 | **Approval gate forced open** (`if (true || …)`) and error path grants `currentUserIsAdmin = true` | auth-v2.js:149, 220 |
| F11 | P1 | **Custom/zero-par course rounds silently unstartable** — alert gated on legacy `.active` class that nothing sets | event-binders.js:350-355; course-data.js:102, 105, 108 |
| F12 | P1 | **Auto-GIR detection can never fire** — checks `outcome === 'Green'` but `outcome` is only set by penalty buttons | score-input.js:111; oncourse.js:1461-1469 |

Root-cause cluster: F1, F11, and no-op N2 all stem from one refactor seam — the On-Course setup once rendered CR/SR/Par/DH as inline inputs into `#oc-course-info-line` / `#oc-daily-handicap-line`; those elements were replaced in HTML by a static stats panel (`oc-stat-par/cr/sr`, `oc-dh-*`) but the JS was never repointed in either direction.

---

# Task A — DOM ID reconciliation matrix

333 unique IDs in index.html (1 duplicated), ~245 unique literal IDs referenced from JS. Dynamic patterns accounted for: `drill-input-${id}` (practice.js:186,350 — created at practice.js:326), `btn-pin-${type}` (surveyor.js:124 → `btn-pin-front/back/override`, all exist), `ALL_SCREENS`/`switchTab` dynamic lookups (ui.js:232,247 → all 9 `tab-*` screens exist), notifications.js:99 (`set(id,…)` over existing IDs). JS-injected DOM that legitimately satisfies references: the AI modal (ai.js:26-56), `oc-comp-regulars-select` checkbox list (event-binders.js:92-103), `ai-coach-feedback` (oncourse.js:1372).

## Duplicates

| ID | Locations | Impact |
|----|-----------|--------|
| `tab-practice` | index.html:186 **and** index.html:1705 | **P1 (F5).** CSS `body[data-active-tab="tab-practice"] #tab-practice` (style.css:575) matches *all* elements with the ID — both screens get `display:block !important` (style.css:583). The new Practice Caddy (PR #42, lines 186-272) renders with the legacy "Log a Practice Session" UI (1705-1841) stacked beneath it. `getElementById` consumers get the first (Caddy) block. Fix: merge/remove one block — decision needed on whether legacy drill logging survives (its JS in practice.js is fully live). Effort: M. |
| `mainApp` (UI cache key) | ui.js:15 and ui.js:191 | P3. Known instance from the brief. Same value both times; second silently wins. No **other** duplicate keys exist in the UI object (verified by full read). Two distinct keys aliasing one element: `btnLogPracticeContainer`/`logPracticeContainer` (ui.js:78-79, both `practice-form-container`). Effort: XS. |

JS-created IDs that also exist in index.html (admin markup, admin.js:55-123) do **not** duplicate at runtime: injection is guarded by `tabAdmin.innerHTML === ''` (admin.js:53), which is never true — the injected template is dead code (see H5).

## WHS tab (`tab-whs`)

**Dead JS bindings (JS → no HTML element):** none. All 40+ WHS IDs referenced from ui.js/app-v4.js/whs.js exist.

**Broken wiring within existing IDs (the real damage on this tab):**

| Sev | Finding | Evidence | Fix / Effort |
|-----|---------|----------|--------------|
| P1 (F2) | `handicap-index` is an `<input>` (index.html:1149); ui.js writes `.value` (ui.js:721) but app-v4.js reads `.textContent` twice → `parseFloat("")` = NaN. (a) `recalculateAGS` uses Daily Handicap 0 → **wrong AGS for hole-by-hole / total-stableford entry** for any player with HI > 0; (b) Daily Handicap calculator always alerts "Player does not have a valid handicap index yet." | app-v4.js:217, 337-343 | Read `.value`. XS |
| P1 (F3) | `toggle-count-btn` / `del-round-btn` rendered per row but **no listener anywhere** (no onclick attr, no delegation). `window.deleteWhsRound` / `window.toggleCountingRules` are defined and never invoked. Exclude/Include and Delete are dead UI. | ui.js:389-392 (render); whs.js:395, 404 (orphan handlers) | Event delegation on `UI.historyTbody`. S |
| P1 (F4) | `notCounting` computed from `is-counting` then dropped — `addRound(course, rating, slope, score, stats)` hardcodes `notCounting: false`. The code comments openly admit it (app-v4.js:281-286). | app-v4.js:279-288; whs.js:379 | Pass param through. XS |
| P2 (N13) | Required `date` input (index.html:1219) **never read**; all manual rounds saved `date: serverTimestamp()`. Backdating a round is silently impossible. *Adjacent to T3-dateValidation (FP-07 notes the underlying date-validation gap is real); this is broader — the field isn't consumed at all.* | whs.js:378; app-v4.js:246-288 (no read) | Read input, pass to addRound. XS — fold into T3-dateValidation brief |
| P2 (N12) | `btn-export-whs` (index.html:1161) "Email / Export Report" — zero JS references. Renders, does nothing. | scripted diff; no match in src | Implement or remove. S |
| P3 | `app-version` (1142) hardcodes "v6.9.0" and is not in the `version-display` class set that `injectVersionFromMeta` updates (ui.js:208-216 targets `.version-display`, `footer-version`, `header-version`) → stale version string in WHS header. | index.html:1142; ui.js:204-219 | Add class. XS |
| P3 (H4) | whs.js `renderRoundsHistory` (308) and `renderTrendChart` (194) are dead duplicates of the live ui.js implementations (337, 639) — never imported (verified: only definitions match). The whs.js copy also contains the unwired buttons noted in F3. | whs.js:194, 308; ui.js:716-717, 726 | Delete dead pair. S |

**Orphaned HTML (no JS):** `calculator-form` (1174, form is decorative — button handler reads inputs directly), `handicap-chart-section` (1375, structural), `course-name-custom-group` label target `date` covered above. Manage-coaches block fully wired except the F6 mismatch (Coach tab section below).

## Competitions tab (`tab-comp`)

**Dead JS bindings:**

| JS reference | Sites | Verdict |
|---|---|---|
| `log-comp-round-container` (id) **and** `.log-comp-round-container` (class fallback) | competitions.js:93 | **Neither exists.** The form's section is `class="card add-round-section"` (index.html:1596). `compContainer` is always null → the entire `if (compContainer)` block at competitions.js:145-154 never runs. |
| `log-comp-dynamic` | competitions.js:150, 161 | Doesn't exist; the real container is `comp-dynamic-inputs` (index.html:1633). `generateDynamicLogInputs` would **TypeError at competitions.js:162** (`dynamicBody.innerHTML` unguarded) if the container bug above were fixed alone. |

P1 (F8) net effect: selecting a competition never renders the per-rule stepper inputs, so `.dynamic-rule-input` is always empty at submit (competitions.js:525) → **manual comp rounds can never score custom rules** — the core feature of custom comps. Double bug: fix the container lookup *and* the generator target together. Effort: S.

**Orphaned HTML (no JS references anywhere, case-insensitive sweep for `archive`/`delete-comp` confirmed zero):**

| Sev | IDs | Impact |
|-----|-----|--------|
| P2 (N1) | `btn-toggle-archived` (1403), `comp-creator-actions` (1581, has `hidden` — never unhidden), `btn-archive-comp` (1583), `btn-delete-comp` (1586), `delete-comp-modal` + `delete-comp-modal-name` + `delete-comp-confirm-input` + `delete-comp-cancel-btn` + `delete-comp-confirm-btn` (2207-2231) | **Entire archive/delete competition feature is markup-only.** No handler, no Firestore `archived` field anywhere in src. Competitions can never be archived or deleted from the UI. Implement (M-L, needs brief) or strip markup (S). Propose BL entry. |
| P2 (N9) | `comp-starting-points-display` (1612), `comp-sp-round-calc` (1616), `comp-sp-hole-calc` (1623) | Starting-points *baseline display* never unhidden/populated. The math itself works (competitions.js:535-541), so points appear with no explanation. Note: `startingPoints.{round,hole}.type` is written at create (competitions.js:463,468) and **never read** — "fixed vs other" selector is decorative. S |
| P2 (N10) | `comp-empty-state` (1661) | Never toggled — "No rounds logged yet." remains under the Recent Rounds table even when populated. Acknowledged in source: `// UI.compEmptyState ??` (competitions.js:302). XS |
| P2 (N11) | `del-comp-round` buttons | Rendered (competitions.js:324) with **no click handler** in any file — comp-round delete is dead, same class as F3. S |
| P3 | `comp-regulars-container` (1441), `sp-round-val-label` (1502), `sp-hole-val-label` (1527) | Structural / labels never updated by template selection. Hygiene. |
| known | `comp-invite-container` (1455), `comp-invite-list` (1459) | **BL-3.07 — excluded, listed for matrix completeness only.** |

**Leaderboard cross-writer mismatch is in Task B (F9).**

## Practice tab (`tab-practice`)

Duplicate-ID stacking is F5 above. Within the two blocks:

| Sev | Finding | Evidence | Fix / Effort |
|-----|---------|----------|--------------|
| P2 (N18) | `pf-title` (1738) stuck on "Select a Drill Above" forever; `pf-desc` (1744) never filled — `generatePracticeForm` injects the description into `practice-dynamic-inputs` instead (practice.js:305-311). Stale heading sits above every active drill form. | scripted diff + practice.js:299-344 | Update or remove the elements. XS |
| P3 | `practice-empty-state` (1815), `practice-table-container` (1819), `coach-selection-container` (1768) | Never referenced; visibility static. `renderRecentPractice` writes its own empty row into the tbody instead (practice.js:449). Hygiene. |
| P3 | `practice-best-score` / `practice-avg-score` (1787, 1795) | Used once as a *positional anchor*: `UI.practiceDashboardResults = practice-best-score.parentElement.parentElement` (ui.js:86), whose `innerHTML` is then overwritten (practice.js:383) — destroying both IDs after first render. Fragile; works only because the parent ref is cached. Hygiene. |
| P3 (H18) | Static `drill-select` options (`putting_9_holes`, `strokes_gained_putting`, index.html:1723-1726) are replaced at init by `DRILL_TEMPLATES` keys (practice.js:287-297) which use different IDs (`putting_9`, no strokes-gained at all). Historical `practice_rounds` logged under legacy drillIds will never match a template filter. | practice.js:15-117, 287 | Data-migration note only. |
| P3 | `btn-cancel-practice` (ui.js:85) | Null, documented in-source as safe; guarded at practice.js:164. Known. |

Practice Caddy block (186-272): all 13 IDs wired (ui.js:758-989). Clean apart from the stacking.

## On-Course tab (`tab-oncourse`) — largest blast radius

**Dead JS bindings (guarded → silent no-ops unless noted):**

| JS reference | Sites | Verdict |
|---|---|---|
| `oc-course-info-line`, `oc-daily-handicap-line` | ui.js:98-99; written at event-binders.js:308-310, 319-321 | Always null → the innerHTML carrying **`oc-manual-par/cr/sr/dh` inputs is never created**. Root cause of F1/F11/N2. |
| `oc-manual-cr` / `oc-manual-sr` / `oc-manual-par` | oncourse.js:1028-1030, 1561; event-binders.js:343 | Only ever "created" inside the dead innerHTML above → all reads null → constant fallbacks (72/113/72). |
| `oc-hole-dots` | oncourse.js:164, 173-183 | Legacy hole-dot strip; superseded by `renderHoleJumper` (card-render.js:139). Dead render path. P3 (H13). |
| `oc-simple-stats`, `oc-simple-stats-container` | oncourse.js:288-295, 1650; event-binders.js:477-481 | Neither exists. Simple-stats visibility toggling (single vs group, hub vs leaderboard, simple vs detailed) is **all no-op** — the per-player stats rows in `oc-group-scores` render regardless. P2 (N16). |
| `btn-sync-rounds` | oncourse.js:330-331 | Nonexistent button with a placeholder handler `/* Sync logic */`. P3 (H12). |
| `oc-fixed-finish-btn` | oncourse.js:1169 | Removal of an element nothing creates. P3 (H14). |
| `btn-oc-abort-round` | event-binders.js:403-410 | Guarded dead binding — no abort button in markup (exit flow uses `btn-oc-exit`). P3 (H15). |
| `btn-oc-review-round` | ui.js:110; oncourse.js:1552 | Null → `bindReviewModal`'s ~85-line mid-round scorecard feature (oncourse.js:1552-1637) is **unreachable**, and with it `review-round-modal` (index.html:2238), `review-content`, `btn-close-review`, `btn-review-finished` (live but pointless bindings at oncourse.js:1639-1640). P2 (N3). Restore the trigger button or delete the feature. M |
| `btn-shot-prev`, `btn-shot-next`, `btn-back-to-hole`, `btn-wizard-prev`, `btn-wizard-next`, `btn-putt-on-green`, `btn-putt-fringe` | ui.js:107-108, 149-155; event-binders.js:127-133 (`btnBackToHole`, guarded) | Old wizard navigation/putt-flag buttons — none in HTML. Mostly unused cache keys (P3, H2), **except** `btn-putt-on-green`/`btn-putt-fringe`, the missing setters for `isOffGreen` → see N15 (fringe putts always counted as putts, score-input.js:117). |
| `oc-progress-bar` | persistence.js:97, 102 | Nonexistent; guarded. P3 (H16). |
| `tab-btn-oncourse` | ui.js:90; persistence.js:106-109 | The On-Course tab button carries no `id` (index.html:172, `data-target` only) → restore-time `ocTabBtn.click()` no-ops. **Masked**: `initNavigation` independently routes to `tab-oncourse` when `AppState.activeRoundId` is set (ui.js:303-305), and boot order is `initializeAppRouting()` (app-v4.js:47) before `setupTabs()` (app-v4.js:81), so resume still lands correctly. *Deliberately scoped to not contradict FP-04 — hydration/persistence/transition all work; only this redundant click is dead.* P3. |
| `tab-btn-comp` | ui.js:60 | Documented-null cache key. P3. |

**Broken behaviour on existing IDs:**

| Sev | Finding | Evidence | Fix / Effort |
|-----|---------|----------|--------------|
| P1 (F11) | Start Round on a zero-par tee (Keperra Blue Men, St Lucia White, "Custom Course" Custom Tee — course-data.js:102, 105, 108): `totalPar` resolves 0, and the user alert is gated on `tab-oncourse` having class `active` — **nothing ever adds `.active` to tab contents** (full sweep: only `oc-locker-room` gets it, oncourse.js:1209; visibility is `body[data-active-tab]`) → silent `return`, button does nothing, no message. | event-binders.js:348-355 | Drop the class check; surface the alert; restore a par input. S (alert) + M (par input, part of N2 rewiring) |
| P2 (N2) | The static course-stats panel — `oc-course-stats`, `oc-stat-par/cr/sr` (374-390), `oc-dh-display`, `oc-dh-value`, `oc-dh-override` (396-404), plus `oc-custom-course-group`/`oc-custom-course-name` (360-362) and `oc-tee-group` (366) — has **zero JS references**. Course stats and Daily Handicap are never displayed during setup; the custom-course name input is never revealed nor read (round saves use the `oc-course-select` value only). This is the orphaned twin of the dead `ocCourseInfoLine` path. | scripted diff; index.html:360-404 | Repoint event-binders.js:299-331 to populate these elements (and read `oc-dh-override`); honour `oc-custom-course-name`. M — same commit family as F1/F11. Propose BL-3.19. |
| P2 (N17) | `fir`/`fwy` split: simple-mode stepper writes `fwy` (oncourse.js:263); Hole Editor writes `fir` (oncourse.js:519); review/detailed renderers read both (`fir \|\| fwy`, oncourse.js:386, 487; card-render.js:73) **but the WHS save aggregation reads only `fwy`** (oncourse.js:1082) → fairways set via the editor are dropped from saved `whs_rounds.stats`. | oncourse.js:263, 519, 1082 | Normalise on one key or read both at save. XS |
| P3 | `oc-exit-course-label` (282) static; `oc-starting-points-container` (562), `oc-bottom-nav` (574, CSS), `oc-review-summary-container` (720), `wizard-header`/`wizard-title` (613-615, title never updated), `shot-command-center-body` (627), `section-weapon/intent/shape/routine` (630-674; navigation is structural — only `section-putting-outcome` is toggled by ID, score-input.js:78-80), `voice-pulse` (537, CSS animation) | Orphans, structural/cosmetic. Hygiene. |

Everything else on this tab — setup selectors, group scoring, hole jumper, GPS widget, voice overlay, surveyor, penalty modal, finish modal, hole editor, detailed review, locker room, stat-analysis modal — reconciles 1:1 (see Verified Clean).

## Coach tab (`tab-coach`)

| Sev | Finding | Evidence | Fix / Effort |
|-----|---------|----------|--------------|
| P1 (F6) | Add Coach form submit reads `document.getElementById('coach-uid-input').value` — element doesn't exist; the HTML input is `coach-email` (1125). `preventDefault()` runs first, then **TypeError** — the form can never add a coach. Note the semantic mismatch too: HTML asks for an *email*, JS pushes the raw value into the `coaches` UID array. | coach.js:34-48; index.html:1121-1126 | Repoint ID + decide email→uid resolution. S (XS if UID-only). Part of proposed BL-3.22. |
| P2 (N20) | `coach-view-trend` (1881) never populated — trend badge logic exists only on roster cards (coach.js:191-199). | scripted diff | Populate or remove. XS |
| P3 | `coach-view-stats` (1887) unreferenced by ID but functional via child updates (coach.js:266-268). Matrix completeness only. | — | — |

Roster, player view, notes, assign-drill DOM are fully wired (coach.js:91-150, 242-306). The assign-drill *data* problem is Task B (N22).

## Admin tab (`tab-admin`)

| Sev | Finding | Evidence | Fix / Effort |
|-----|---------|----------|--------------|
| P2 (N14) | `bindAdminInvite`'s invite form block references `admin-invite-form`, `invite-msg`, `invite-email`, `invite-name`, `invite-role` — **none exist anywhere** (not in HTML, not JS-created). Guarded (`if (inviteForm && inviteMsg)`) → ~40 lines of dead invite/password-reset flow. The `role`/`displayName` fields it would write to `preapproved_emails` are read by nothing (registration only checks doc existence, auth-v2.js:65-67). | admin.js:222-260 | Build the form or delete the block. S (delete) / M (build) |
| P3 (H5) | Dead injected admin template: guard `tabAdmin.innerHTML === '' \|\| includes('DYNAMIC')` is never true (static markup exists, index.html:1995-2071) → admin.js:55-123 is an unmaintained copy of the static HTML. Divergence risk. | admin.js:51-124 | Delete template. S |

All live admin IDs (users list, preapprove, CSV/Excel import) reconcile.

## Feed / Tempo / Settings / Auth / Global

- **Feed:** all 5 IDs wired (social.js:12-19, 89, 178). Clean.
- **Tempo:** all 16 `tempo-*` + `native-audio-player` IDs exist and are cached (ui.js:117-131); tempo.js contains zero direct ID lookups. `tab-btn-tempo` (173) unreferenced by JS — tab buttons operate via `.tab-btn`/`data-target`. Clean.
- **Settings:** all notif/account/password/bag IDs wired (notifications.js:18-105; oncourse.js:1506-1527 for bag + `bag-msg`:1517). Clean.
- **Auth:** all wired. `temp-submit-register` (auth-v2.js:46) removes an element nothing creates — leftover. P3 (H11).
- **AI modal (global):** all `ai-*`/`btn-*-ai*` references satisfied by the injected modal (ai.js:26-56) with UI re-caching (ai.js:59-61). Exceptions: `btn-ai-player`/`btn-ai-coach` (ai.js:64-94) exist **nowhere** — those entry points never bind (the live entry points are `btn-ask-ai` and `btn-coach-ai-plan`). P2/P3. `ai-prompt-textarea`/`btn-copy-ai-prompt` (ui.js:141-142) are stale cache keys from a removed prompt-copy modal — used by nothing. P3 (H2). `btn-close-ai-modal-2` double-bound (ai.js:103-110). P3 (H17).
- **CSS contract:** `!important` ×4 in the tab visibility rule and ×1 on the cloak (style.css:583-586, 609) — violates the Sydney Protocol "No `!important`" rule from within the architecture's own core mechanism. P3 (H3) — flagging for a decision, not unilateral change.

---

# Task B — Data contract audit

## B1. httpsCallable ↔ functions/index.js

functions/index.js exports exactly: `askAiCoach`, `processRulesQuery`, `analyzeRoundStats`, `generateAudioBriefing`, `generatePracticePlan` (+ triggers `onRoundCreated`, `onRoundDeleted`). No orphan callables on either side.

| Callable | Client site | Request | Response consumed | Verdict |
|----------|------------|---------|-------------------|---------|
| `askAiCoach` | ai.js:234 | `{prompt}` ✓ (index.js:30) | `data.answer` ✓ (index.js:40) | **P1 (F7): wrong Functions instance.** ai.js:233 builds `getFunctions()` with no app/region → default us-central1, and it is *not* the emulator-connected instance (firebase-config.js:51 connects only the shared one). Every other callable imports the pinned `functions` (firebase-config.js:41). Violates the australia-southeast1 contract; Ask AI Coach / coach lesson plans fail in both prod and emulator. Fix: `import { functions } from './firebase-config.js'`. XS. |
| `processRulesQuery` | oncourse.js:757 | `{query}` ✓ | `data.answer` ✓ | Clean. |
| `analyzeRoundStats` | oncourse.js:1379-1380 | payload incl. `par3Avg/par4Avg/par5Avg` ✓ (index.js:79 guard) | `data.answer` ✓ | Transport clean; **payload inputs partially dead — see N5.** |
| `generateAudioBriefing` | ui.js:470-471 | `{audioUrl}` ✓ (validated index.js:134-145) | `{writtenSummary, verbalBriefing}` ✓ (ui.js:488, 514, 530-536); persisted to `whs_rounds.aiSummary` (ui.js:476-477) and re-read by the drawer ✓ | Clean. |
| `generatePracticePlan` | ui.js:878-882 | `{}` — **known BL-3.05 sub-task, excluded** | `{source, drillId, steps, category, targetMetric, completedSteps}` ↔ `normalizePracticePlan` (state.js:159-173) ✓ | Clean (PR #42 adapter re-verified). |

## B2. Firestore writers ↔ readers

### `whs_rounds` — written by whs.js:370-390 (manual: `uid, course, rating, slope, adjustedGross, date, notCounting, stats?`) and oncourse.js:1086-1108 (live: + `courseName, totalGross, totalScore, totalStableford, dailyHandicap, isLiveTracked, liveRoundsMode, totalPutts`, doc-ID `${roundId}_${uid}`); audioUrl patched at oncourse.js:905-908; aiSummary at ui.js:476-477.

| Sev | Finding | Evidence |
|-----|---------|----------|
| **P1 (F1)** | Live save: `rating: cr, slope: sr` where `cr`/`sr`/`par` fall back to **72/113/72 constants** because `oc-manual-cr/sr/par` never exist (Task A). The correct `teeData` (with real `rating`/`slope`) is *already fetched on the very next line* (oncourse.js:1038) and unused for this purpose. Every live round corrupts the differential `(113/slope)*(AGS-rating)` consumed by whs.js:112, ui.js:355/664, coach.js:188/255, ai.js:168, functions index.js:279 — i.e. **handicap index, trend chart, coach trends, AI prompts and practice-plan generation all ingest wrong data** for any tee ≠ 72/113. `par=72` also feeds `convertStablefordToAGS` even for 9-hole rounds (oncourse.js:1075). Fix: `teeData.rating/slope/par` with manual override once N2 restores the inputs. S. **Highest-priority finding of this audit.** |
| P2 | `normalizeRoundDoc` (state.js:118-127) defends `score`, `courseName`, `holes`, `userId` — **none of which the actual schema uses** (writers emit `adjustedGross`/`course`/`uid`; nothing writes `holes` or `userId` or top-level `score` to whs_rounds) — while the fields consumers crash-divide on (`slope`, `rating`, `adjustedGross`) get no defaults. The normaliser satisfies the letter of the pattern but not the schema. Fields "read" via normaliser but never written: `holes`, `userId`. S to realign. |
| P3 | `totalScore` duplicates `totalGross` (oncourse.js:1093-1094); neither `totalScore` nor `liveRoundsMode` has any reader. Write-only fields. |

### `comp_rounds` / `competition_results`

| Sev | Finding | Evidence |
|-----|---------|----------|
| **P1 (F9)** | Two writers, two shapes: manual log writes `totalPoints, score, createdAt` (competitions.js:543-552); live sync writes `stablefordPoints, netScore, rulePoints, totalCompScore, isLiveSynced` — **no `totalPoints`** (oncourse.js:1133-1143). Readers consume `r.totalPoints` only (leaderboard competitions.js:237; recent rounds competitions.js:321) → live-synced rounds score 0 on the leaderboard and print `undefined` in Recent Rounds. Fix: write `totalPoints: totalStableford + totalRulePoints` in the live payload (or read both keys). XS. |
| P2 (H8) | `competition_results` (oncourse.js:1148) — same payload also written to `comp_rounds` "backward compat" (1149). **No reader of `competition_results` exists in src or functions.** Write-only collection, doubles writes and rules surface. XS to drop (confirm no external consumer first). |
| P3 | `comp_rounds` consumer pushes raw doc data into state, no normaliser (competitions.js:206). Pattern bypass. |

### Coach linkage — three-field split (proposed BL-3.22)

| Sev | Finding | Evidence |
|-----|---------|----------|
| **P1** | Two disjoint linkage models: (a) `users.{coaches[]}` — written by Manage Coaches (coach.js:42-44, broken per F6) and `removeCoach` (coach.js:83); read by `populatePlayerSelect` coach branch (`array-contains`, app-v4.js:376). (b) `users.{coachUid}` — written by the Practice-tab selector (practice.js:513-514) and Release (coach.js:232); read by the Coach Portal roster (coach.js:166). **A player picking a coach on the Practice tab appears in the coach's roster but not in the coach's WHS player dropdown; the Manage Coaches flow (when fixed) feeds the dropdown but not the roster.** Unify on one field. M, needs brief. |
| P1-adjacent | `athlete.handicapIndex` rendered in roster + player view (coach.js:213, 269) is read off **`users`** docs — but handicapIndex is only ever written to **`profiles`** (whs.js:286-295). Coach HI column is permanently `--`. Fix: read profiles (or mirror). XS-S. |
| P2 (N22) | `users/{uid}/assignedDrills` written (coach.js:137-143) and **read by nothing** — players can never see assigned drills; `notif-drill-assign` pref toggles a notification that can never fire. *Adjacent to BL-3.06 (security rule) — this is the missing read path, a distinct gap.* M. |
| P3 (H9) | `profiles.handicapIndex` stored as a **string** (`index` is `.toFixed(1)` output, whs.js:135, 286). Consumers `parseFloat` defensively (oncourse.js:149); functions interpolate into prompts. Type drift. |

### `shots` — written by score-input.js:95-103 with fields `uid, hole, shotNumber, roundId, timestamp(ISO string), club, startLine, trajectory, strikeQuality, shape, puttControl, routines, penalty?, outcome?` (data-groups: index.html:644-702; penalty path: oncourse.js:1460-1469)

| Sev | Finding | Evidence |
|-----|---------|----------|
| **P1 (F12)** | Auto-GIR reads `payload.outcome === 'Green'` (score-input.js:111) but `outcome` is **only** set by the penalty modal (`'OB'/'Hazard'/'Fairway'`, oncourse.js:1461-1469). No wizard control produces `'Green'` → detailed-mode GIR is never auto-recorded. M (needs an outcome control or inference from `puttControl`). |
| **P2 (N4)** | Coach Shot Dispersion reads `s.line` and `s.curve` (analytics.js:32, 34); written fields are `startLine` and `shape` → **Start Line and Shot Shape panels are permanently 0%** (only Trajectory works). Value mismatch too: writer emits Hook/Slice which the reader's `{Draw, Straight, Fade}` buckets would drop even after renaming. Same root for ai.js:210 (`s.curve`) → "most common miss" never reaches AI prompts. XS-S. |
| P2 (N15) | `payload.isOffGreen` read (score-input.js:117) and **never written** — its setters were the nonexistent `btn-putt-on-green`/`btn-putt-fringe` (ui.js:154-155). Fringe putts always counted as putts. S. |
| P2 | Round review reads `s.outcome` per shot (oncourse.js:1609) → "Result" placeholder for all non-penalty shots. Cosmetic symptom of the same schema gap. |

### `simpleStats` (in-memory → whs_rounds.stats) and post-round analysis

| Sev | Finding | Evidence |
|-----|---------|----------|
| **P2 (N5)** | `runStatAnalysis` computes `penalties`, `mentalScore`, `shotShapeTendency` from `simpleStats[h].penalties/.routines/.shape` (oncourse.js:1304-1315) — **no writer ever puts those keys on simpleStats**: editor penalties are folded into the score (oncourse.js:516) and routines/shape live on `shots` docs. "Total Penalties: 0", "Primary Shape: None Recorded", Mental Routine N/A — always, even after a fully tracked detailed round whose data sits unread in `shots`. Also degrades the `analyzeRoundStats` AI payload. M: source these from `shots` (or mirror into simpleStats at save-shot time). |
| P2 (N17) | `fir` vs `fwy` (detailed in Task A / On-Course). |
| P2 (H21) | **State-rule violation with persistence consequence:** `liveRoundGroups` is mutated in place throughout score entry (oncourse.js:229-238, 263-279, 516-520; score-input.js:100-123) instead of via `mutateList` — the Proxy never fires, so persistence.js's auto-save (persistence.js:124-131) does **not** run on score changes; scores persist only when a `PERSIST_FIELDS` *reference* changes (e.g. `currentHole` on navigation, `currentHoleShots`/`activeRoundId`). A refresh mid-hole loses current-hole edits made since the last reference-assigning action. *Scoped precisely: persistence/hydration/transition all exist and work (FP-01/FP-04 stand); this is a save-trigger timing gap caused by contract-violating mutations.* M to route through `mutateList` (verify no re-render thrash). |

### `feed` (fan-out) — functions/index.js:403-448 ↔ social.js:176-218

| Sev | Finding | Evidence |
|-----|---------|----------|
| P2 (N6) | `handicapDifferential` read at fan-out (index.js:434) and rendered (social.js:164) — **no writer anywhere** sets it on whs_rounds → feed "Diff" column is permanently `—`. Either compute at fan-out (`(113/slope)*(adjustedGross-rating)` — note slope/rating are corrupt until F1 lands) or drop the column. XS-S. |
| P3 | `adjustedGrossScore ?? adjustedGross` and `courseName ?? course` fallbacks (index.js:432-433) correctly bridge the two writer shapes. Clean. |
| P3 (H19) | Fan-out derives followers via an **unfiltered `collectionGroup('following').get()`** — full scan of every following doc of every user per round logged (index.js:417-420). Correctness fine (the comment's reasoning is sound); scalability/cost flag. Consider `users/{uid}.followerUids` array or a per-author followers subcollection. M. |

### `users` / approval / notifications

| Sev | Finding | Evidence |
|-----|---------|----------|
| **P1 (F10)** | Approval gate disabled: `if (true \|\| userData.isApproved === true \|\| …)` (auth-v2.js:149, comment "Force allowed for verification") — every registered user is admitted regardless of `isApproved`; the pre-approval pipeline (admin tab, `preapproved_emails`) is decorative client-side. Worse, the catch path sets `window.currentUserIsAdmin = true` on **any** Firestore read failure (auth-v2.js:220, "forcing bypass") — a network blip elevates the client to admin UI/behaviour. Server-side rules are the real boundary (not audited this session), but both lines are leftover debug overrides in the trust-establishment path. **Security-adjacent: recommend explicit brief, same handling class as BL-3.06.** XS to fix mechanically. |
| P2 (N7) | Notification prefs round-trip to `users/{uid}/prefs/notifications` (notifications.js:48, 96-105) but **no behaviour consumes them**: `triggerLocalNotif` (notifications.js:112) is exported and never called by any module. The whole Settings notification panel is decorative. M to wire (round-save hook, coach-note hook) or descope. |
| P3 | `users.createdAt`, `preapproved_emails.addedAt` write-only (acceptable audit fields). `normalizeUserDoc` used by social.js:25 ✓ but bypassed by coach.js:170, admin.js:21-41, app-v4.js:379-387, practice.js:488 (raw `d.data()` into render paths). Pattern drift vs the CLAUDE.md normaliser rule. |
| P3 | practice.js:373 normalises `practice_rounds` docs with **`normalizeRoundDoc`** (the whs_rounds normaliser). Harmless today (spread preserves fields) but wrong contract; no `normalizePracticeRound` exists. Per CLAUDE.md ("add new normalisers here when new document types are consumed") this is a missing normaliser for an actively consumed doc type. XS-S. |

### Other consumers checked

- `coachNotes` writer (coach.js:118-122) ↔ reader (coach.js:292-305): fields match. Clean.
- `users/{uid}/following` writer (social.js:75-77) ↔ readers (social.js:93; collectionGroup in functions): consistent. Clean.
- `global_drills` / `practice_plans/active`: function writers (index.js:341-360) ↔ ui.js consumers (821-833, 906-976): merged-doc + normaliser contract holds (PR #42). Clean.
- Audio handshake: upload doc-ID `${activeRoundId}_${uid}` (oncourse.js:905) matches save doc-ID (oncourse.js:1107-1108); briefing consumes `audioUrl`/`aiSummary` from the same doc. Clean. (Sequencing OK: locker room shows before `endRoundCleanup` nulls `activeRoundId`, which only fires on "Go Home", oncourse.js:335.)
- `analyzeRoundStats` transport, `processRulesQuery` transport: clean (see B1).

---

# BL mapping & proposed new entries

**Overlaps with existing items (no new entry):**
- BL-3.05 — `generatePlan({})` re-confirmed at ui.js:881; not re-reported.
- BL-3.06 — assignedDrills *security rule*; this audit adds the adjacent missing *read path* (N22) → fold into the BL-3.06 brief or split (see BL-3.22).
- BL-3.07 — comp-invite orphans re-observed, not re-reported.
- T3-dateValidation — N13 (date input never read) is the superset of the tracked validation gap; recommend widening that ticket's scope rather than a new entry.

**Proposed new entries (suggested numbering continues from BL-3.17):**

| ID | Title | Bundles | Effort |
|----|-------|---------|--------|
| BL-3.18 | WHS data-integrity cluster: live-round rating/slope/par constants; handicap-index `.textContent`; notCounting passthrough; dead Exclude/Delete buttons; fir/fwy save key | F1, F2, F3, F4, N17 | M (3-4 commits, each ≤150 lines) |
| BL-3.19 | On-Course setup rewiring: populate `oc-stat-*`/`oc-dh-*`, restore manual CR/SR/Par/DH override, custom-course name flow, fix dead `.active` alert gate | N2, F11, (+root of F1) | M |
| BL-3.20 | Resolve duplicate `id="tab-practice"` — merge or retire legacy Practice Drills screen | F5, N18 | M (needs product decision) |
| BL-3.21 | Comp logging repair: dynamic rule inputs (container + target IDs), live-round `totalPoints`, comp-empty-state toggle, del-comp-round handler, starting-points display | F8, F9, N9, N10, N11 | M |
| BL-3.22 | Coach linkage unification: `coaches[]` vs `coachUid`, Add-Coach input ID (F6), HI source (users vs profiles), assignedDrills read path | F6, N22, coach-HI | M-L (brief first; touches BL-3.06 territory) |
| BL-3.23 | Pin `askAiCoach` to the shared Sydney Functions instance | F7 | XS |
| BL-3.24 | Remove auth debug bypasses (`if (true \|\|`, catch-path admin grant) | F10 | XS code / needs security review sign-off |
| BL-3.25 | Shots schema reconciliation: `line/curve` vs `startLine/shape`, `outcome:'Green'` GIR, `isOffGreen` setter, simpleStats `penalties/routines/shape` sourcing | F12, N4, N5, N15 | M |
| BL-3.26 | Feed differential: compute `handicapDifferential` at fan-out (after BL-3.18) or drop column | N6 | XS-S |
| BL-3.27 | Notifications: wire `triggerLocalNotif` to events honouring saved prefs, or descope the settings panel | N7 | M |
| BL-3.28 | Legacy `.active`-class remnants: telemetry active-tab check (telemetry.js:19-20) + event-binders alert gate | N8, part of F11 | XS |
| BL-3.29 | Comp archive/delete: implement or strip the dead UI (incl. `btn-toggle-archived`, delete-comp modal) | N1 | S (strip) / L (implement) |
| BL-3.30 | Hygiene sweep: dead UI cache keys, whs.js render duplicates, admin injected template, `temp-submit-register`, `btn-sync-rounds`, `oc-hole-dots`, `oc-fixed-finish-btn`, `btn-oc-abort-round`, `oc-progress-bar`, ai.js double-bind, mainApp dup key, normaliser realignment (`normalizeRoundDoc` schema, `normalizePracticeRound`), `competition_results` write-only, `!important` decision, app-version stale string | H1-H20 | S-M, batchable |
| BL-3.31 | Mid-round review scorecard: restore `btn-oc-review-round` trigger or delete the unreachable feature + modal | N3 | S (delete) / M (restore) |
| BL-3.32 | State-contract mutations: route `liveRoundGroups` score/stat writes through `mutateList` so persistence auto-save fires on score entry | H21 | M (perf-check re-renders) |

---

# Verified clean — do not re-sweep

**DOM (Task A):**
- **Tempo tab** — 16/16 IDs ↔ UI cache, no dynamic lookups, no Firestore.
- **Feed tab DOM** — 5/5 wired (search, results, following, activity).
- **Settings tab** — notif banner/toggles/save, account info, change-password, bag save (`btn-save-bag`, `bag-msg`, `.bag-check`) all wired.
- **Auth overlay/pending/forgot-password** — all wired (sole note: H11 `temp-submit-register`).
- **Admin tab static markup** — all 12 live IDs wired (users, preapprove, CSV, Excel); only the invite *JS* block is dead (N14).
- **On-Course core flow** — setup (mode/holes/date/course/tee/players/comp-link/quick-add incl. injected `oc-comp-regulars-select`), hub (`oc-hole-display/par-display/par-select/group-scores`), hole jumper, sub-nav, exit bar, GPS widget (`gps-front/middle/back`, toggle), voice overlay + rules card, surveyor (incl. `btn-pin-${type}` dynamic), penalty modal, finish modal + summary (`sum-total-*`), hole editor (all `editor-*`), detailed review modal, locker room (msg/err/analyze/audio/home), stat-analysis modal: all reconcile.
- **Shot wizard data-groups** — writer (event-binders.js:179-182) ↔ reader (score-input.js:57) group names consistent (`startLine/trajectory/strikeQuality/shape/puttControl`); `section-putting-outcome` toggle wired.
- **Practice Caddy block** (index.html:186-272) — 13/13 wired to ui.js:758-989.
- **AI modal injected DOM** — all internal IDs self-consistent with re-cached UI keys.

**Data contracts (Task B):**
- All five callables ↔ exports name-matched; request/response shapes verified for `processRulesQuery`, `analyzeRoundStats` (transport), `generateAudioBriefing`, `generatePracticePlan`.
- Region pinning correct everywhere **except** ai.js (F7): firebase-config.js:41 + all `functions` imports in ui.js/oncourse.js.
- Audio diary pipeline end-to-end (record → upload → `audioUrl` patch → briefing generate → `aiSummary` persist → drawer re-read).
- `practice_rounds` writer ↔ practice dashboard, recent table, and coach practice view (fields `uid/drillName/score/date/data` all consumed coherently).
- `whs_rounds` query key `uid` consistent across whs.js:152, coach.js:183/248, ai.js:160, functions index.js:259.
- `coachNotes`, `users/{uid}/following`, `global_drills`/`practice_plans` contracts.
- `feed` writer/reader field bridging (`courseName ?? course`, `adjustedGrossScore ?? adjustedGross`) — only `handicapDifferential` (N6) outstanding.
- whs.js unsubscribe/normaliser usage in `listenToWHSRounds` (FP-02 pattern confirmed intact; normaliser *schema* drift noted separately as P2).
- persistence.js PERSIST_FIELDS round-trip (FP-01 confirmed intact; only the mutation-trigger timing H21 is new).

**FP registry compliance:** no finding above re-litigates FP-01–FP-10. Adjacent touchpoints declared inline: FP-01/FP-04 (H21, tab-btn-oncourse note), FP-07/T3-dateValidation (N13), FP-09 (ai.js role-gating left alone; only the nonexistent `btn-ai-*` bindings reported).

*Report generated by overnight static audit. No source files modified; no commits made.*
