# PHASE-3A-VERIFIED-FINDINGS.md

*Golf Handicap Tracker — Deep Dive · Adversarial Re-Verification of Phase-1 High+Medium Findings*
*As at 2026-06-26*

---

## 1. Verification Summary

**The Phase-1 map largely held up, but it systematically over-rated severity.** Of 30 findings independently re-checked by an adversarial verifier, the *factual core* of nearly every finding survived — but the headline **severity was overstated in the majority of cases**, and one High finding (F1) had its central causal conclusion fully inverted.

| Verdict | Count |
|---|---|
| **CONFIRMED** | 21 |
| **PARTIAL** (factual core holds; claim narrowed/downgraded) | 8 |
| **REFUTED** (core conclusion overturned) | 1 |
| **Total** | **30** |

Severity reality check (post-verification `real_severity`):

| real_severity | Count |
|---|---|
| high | 3 (F5, F8, F10) |
| medium | 9 (F4, F6→see note, F7, F9, F15, F17, F18, F19, F21, F23, F30) — see table |
| low | 13 |
| info | 2 (F2, F29) |

- **CONFIRMED-high:** only **3** of the 9 original "High" findings remain High after verification — **F5** (courses/ rule default-deny → silent data loss), **F8** (no AI rate-limiting → billing abuse), **F10** (xlsx vulnerable dependency bundled). Six original Highs were downgraded (F1→low/REFUTED, F2→info, F3→low, F4→medium, F6→low, F7→medium).
- **fix_safety = clean:** 16 findings. **fix_safety = needs-design:** 14 findings.
- **Phase-1's biggest systematic error was severity inflation**, not false positives: the *evidence* (file:line) was accurate in essentially every case, but "High/Medium security" framing repeatedly attached to what are actually hygiene, dead-code, or feature-broken-by-too-strict-rule issues that fail *closed*, not open.

---

## 2. Refuted / Downgraded Findings (where Phase-1 overclaimed)

These are listed first because they are where Phase-1's conclusions were wrong or materially overstated. Each entry gives the correction and why.

### 2.1 REFUTED

**F1 — "liveRoundGroups in-place mutation → no autosave, no re-render" (High → low, REFUTED)**
The cited lines are all accurate, but the **causal conclusion is inverted**. Every in-place `liveRoundGroups` mutation (`score-input.js:109,119-126,152`; `oncourse.js:518-522` et al.) is immediately paired with `loadHole()`, which unconditionally reassigns the PERSIST_FIELD `currentHoleShots = []` (`oncourse.js:190`; `persistence.js:21`). That reassignment is a *new array reference*, so the Proxy `stateChange` fires (`state.js:66`) → `persistence.js:124` matches → `saveRoundState()` serializes **all** PERSIST_FIELDS including the just-mutated `liveRoundGroups`. **Autosave does occur and the data is persisted; re-render also happens** (`loadHole()` rebuilds the grid, `oncourse.js:193-242`). This is intentional and documented (`oncourse.js:1741` literal comment "REQUIRED — see persistence note; do not remove"; `docs/agent-briefs/bl-4.04-f8-oncourse-comp-rules.md:43,154`).
*Real issue (low):* design fragility — persistence relies on an indirect side effect of an unrelated field's reassignment. Hygiene fix: route writes through `mutateList('liveRoundGroups', …)`. **Not High, not data-loss.**

### 2.2 PARTIAL (downgraded / narrowed)

**F7 — "askAiCoach is an open-ended Gemini proxy" (High → medium)**
Facts hold: `functions/index.js:28-39` passes raw `request.data.prompt` with no server `systemInstruction` and no length/topic cap — the lone outlier among siblings. But **"open-ended" overstates it**: the function *is* auth-gated (`functions/index.js:29`). Real risk is **authenticated-user abuse** (free general-purpose LLM on the project's billed quota) + content/reputation risk — medium, not a public open relay. **Clean fix:** add a coach-scoped `config.systemInstruction` + prompt-length cap to this one function.

**F13 — "feed.adjustedGrossScore / courseName survive only via `??` aliasing" (Medium → low)**
Aliasing at `functions/index.js:432-433` is real and load-bearing; writers are genuinely not single-sourced (`whs.js:386,389` and `admin.js` write `course`/`adjustedGross`; `oncourse.js:1115-1120` writes both; `adjustedGrossScore` is a phantom field never written). **But the feed renders correctly** — no data loss. This is schema hygiene/debt (prior reviews graded the same bridging P3 "Clean", `docs/overnight_review_night1_blast_radius.md:232`). Low. Fix (folding aliasing into `normalizeRoundDoc`) touches the normaliser contract → needs-design.

**F14 — "normalizeRoundDoc defaults dead fields; userId null, score/holes dead" (Medium → low)**
`userId` default (`state.js:125`) **is** genuinely dead (no writer emits it, nothing reads `.userId`); `holes`-as-array is dead (`admin.js:313` writes a number, normalized to `[]`). **But "score is dead" is overstated:** `score` is dead only on the WHS path — it is *live* for `practice_rounds`, the normaliser's second consumer (`practice.js:371` → read at `practice.js:404-413,464`). The normaliser is mis-named for that second use. Low (dead-field hygiene + harmless latent type-mismatch).

**F16 — "comp_rounds live-writer fields never read by the leaderboard" (Medium → low)**
The **headline is overturned**: the live writer's leaderboard-critical fields (`totalPoints`, `uid`, `playerName`, `ruleCounts`, `oncourse.js:1162-1174`) are *exactly* what the reader consumes (`competitions.js:258-271`). Live rounds **do** render. Only the *extra denormalized* fields are unread (live: `stablefordPoints`/`netScore`/`rulePoints`/`isLiveSynced`; form: `score`/`createdAt`). Low schema-drift/hygiene, plus an absent normaliser on the listener.

**F22 — "analyzeRoundStats JSON.stringifies entire unvalidated request.data" (Medium → low)**
Mechanism confirmed (`functions/index.js:78,114`). **But "unvalidated" is overstated:** a presence guard exists (`:79-81`, requires one of `par3Avg`/`par4Avg`/`par5Avg`) plus auth (`:76`). It is a presence gate, not a content whitelist. Impact is bounded (authenticated, single-tenant, no Firestore write, no PII). Notably *less* permissive than siblings `askAiCoach`/`processRulesQuery` which pass raw strings. Low. Clean fix: whitelist known stat fields before `JSON.stringify`.

**F24 — "triggers have no error handling AND feed cleanup needs an unstated composite index" (Medium → low)**
Error-handling half holds (`onRoundCreated`/`onRoundDeleted` lack try/catch, `functions/index.js:403-448,453-478`) but is cosmetic — failures log and the background invocation simply fails. **Index half is wrong:** the cleanup query (`functions/index.js:463-466`) is a pure-equality conjunction (`roundId==` AND `actorUid==`, no orderBy/range/limit) → Firestore serves it from automatic single-field indexes, **no composite index required**. The only feed composite index that matters (`feed(recipientUid, createdAt)`) already exists in `firestore.indexes.json:46-58`. Low.

**F25 — "vitest@4.0.18 violates ^4.1.8 floor" (Medium → low)**
True: `npm ls vitest` flags `4.0.18 invalid: "^4.1.8"`; node_modules drifted from `package.json:26`. **But this is install/reproducibility hygiene, not a correctness bug** — a patch/minor floor gap, not a breaking divergence. Low. Clean fix: `npm install` to a satisfying version, commit the lockfile.

**F29 — "contract-suite baseline is stale; (a)/(d)/(e) now pass; 23 pass / 1 fail" (Medium → info)**
Core staleness is **real for (a) and (d)**: `contracts.test.js:21-22` still annotates (a) EXPECT-FAIL (duplicate `id=tab-practice` already merged to one) and `:43-44` annotates (d) EXPECT-FAIL (`auth-v2.js` `if(true||` already removed); both now pass. CLAUDE.md:47's blanket "ships intentionally red" is now imprecise. **But the finding overstates scope:** (e) is **not** in the cited header range (18-49) — it lives at `:251-278` with a forward-looking BL-4.07 note, so it should not be cited as a stale red header claim; and **"23 pass / 1 fail" is wrong** — the suite has 5 `it()` blocks → **4 pass / 1 fail** (only (b) red). Info (doc hygiene only; tests execute and report correctly).

### 2.3 Severity downgraded but verdict CONFIRMED (Phase-1 over-rated, facts intact)

These were marked CONFIRMED but their `real_severity` dropped from the Phase-1 grade — flagged here because Phase-1 over-rated them:

- **F2** High → **info** — `activePracticeSession` / IndexedDB recovery are documented as contracts (`CLAUDE.md:18-19`) but are unbuilt backlog (`MASTER_BACKLOG.md:190`, unchecked); shipped persistence is localStorage-only. Documentation-accuracy, not runtime defect.
- **F3** High → **low** — `feed.handicapDifferential` has a reader (`functions/index.js:434`) but no writer → always `—`. Confirmed exhaustively; cosmetic. (= BL-4.09.)
- **F4** High → **medium** — courses/holes write-only orphan; default-deny means the write is *blocked*, not exposed → broken/dead feature + misleading "Pin saved" toast, not a security hole.
- **F6** High → **low** — dead rule branches (`coachUid`/`visibility`/`invitedUIDs`) fail *closed*; an unsatisfiable permissive read branch grants no access. Hygiene/latent-feature debt. (coach feature still works via `coaches[]` fallback, `firestore.rules:23`.)
- **F9** High → **medium** — unbounded `collectionGroup('following')` scan is a read-cost/scaling bug (`functions/index.js:417`), not security/data-loss.
- **F11** Medium → **low** — 46 `!important` + 20 `.style.display` are genuine Sydney-Protocol violations but hygiene/architecture-debt; some `!important` are load-bearing specificity overrides.
- **F18 / F19** Medium → **medium but NOT security** — both are rules that are too *strict* (feature-breaking), not too loose: multi-player comp logging and admin bulk-import are broken, not exposed.
- **F20** Medium → **low** — no create-rule field/schema validation, but ownership *is* enforced on every create → hardening/hygiene debt, not auth bypass.
- **F26** Medium → **low** — 1.2 MB single chunk / no `manualChunks`; build/perf hygiene.
- **F27 / F28** Medium → **low** — protobufjs CRITICAL / grpc-js HIGH advisories are real but **node/dev-side only**, verified absent from the browser bundle; supply-chain hygiene.

---

## 3. Confirmed Findings Table

Sorted by `real_severity` (high → medium → low → info), then `fix_safety` (clean before needs-design). Includes all CONFIRMED + PARTIAL findings whose factual core survived (excludes only the fully-REFUTED F1).

| ID | real_sev | fix_safety | Finding | Verifier evidence (file:line) |
|---|---|---|---|---|
| **F5** | high | clean | `courses/` has no Firestore rule → Surveyor pin write default-denied at runtime; error swallowed, "Pin saved" toast still shown | `firestore.rules:1-152` (no `match /courses`, no catch-all); `src/surveyor.js:232-233`; swallow `:235-237`; toast `:208` |
| **F10** | high | needs-design | `xlsx@0.18.5` (prototype-pollution CVE-2023-30533 + ReDoS CVE-2024-22363, no npm fix) imported and bundled to browser | `package.json:31`; `package-lock.json:12183-12186`; `src/admin.js:9`; parse path `:348,:372`; bundled in `dist/assets/index-RW744XpR.js` |
| **F8** | high | needs-design | No rate-limiting/quota on any AI callable except the practice-plan cache guard → unbounded paid Gemini calls | `functions/index.js:28,50,75,131`; sole guard `:239-255`; no App Check / maxInstances / throttle anywhere |
| **F4** | medium | needs-design | `courses/{id}/holes/{n}` write-only orphan: `updateDoc` with no creator, no reader, no rule; silent data loss + misleading success toast | `src/surveyor.js:230-233,199,208,235-237`; `oncourse.js:623` reads in-memory not Firestore; `firestore.rules` (no match) |
| **F17** | medium | needs-design | `comp_rounds` read rule is any-authenticated → every user can read ALL competition rounds globally; `compId` narrowing is client-side only | `firestore.rules:122-123`; `src/competitions.js:220-227` |
| **F18** | medium | needs-design | `comp_rounds` create rule (`uid==auth.uid`, no admin exception) blocks multi-player logging (`uid:targetUid`) | `firestore.rules:124`; `src/competitions.js:574,584,595-607,544` |
| **F19** | medium | clean | `whs_rounds` create rule lacks `\|\| isAdmin()` (unlike update/delete) → admin bulk-import for other users denied; failures swallowed | `firestore.rules:81-82`; `src/admin.js:311-313,394-407,270,360-368,324,410` |
| **F21** | medium | needs-design | `users` read rule (`if isAuthenticated()`) exposes every user doc (email, isAdmin, isApproved, coachUid) to any authed user | `firestore.rules:32`; readers `social.js:24-26`, `admin.js:20`, `competitions.js:595`, `app-v4.js:366-372` |
| **F23** | medium | needs-design | `generateAudioBriefing` SSRF guard checks URL prefix but not object ownership; no upper size cap (full file buffered + base64) | `functions/index.js:143-145,153,156-157,164`; `src/services/audioService.js:119` |
| **F7** | medium | clean | `askAiCoach` passes raw client `prompt` with no server `systemInstruction`, no topic/length cap (lone sibling outlier) | `functions/index.js:28-39`; `src/ai.js:214-235` |
| **F9** | medium | clean | `onRoundCreated` runs unbounded `collectionGroup('following')` full scan on every round insert → read cost scales with all follow-edges | `functions/index.js:417-419`; writer `src/social.js:76` |
| **F12** | medium | needs-design | `telemetry.js` double-dead: gates on never-set `.tab-content.active` AND listens for never-dispatched `gpsLocation` event → never runs | `telemetry.js:8,19-20`; `ui.js:242-259,732-733`; `style.css:570-582`; only dynamic `.active` is `#oc-locker-room` `oncourse.js:1237` |
| **F15** | medium | clean | `assignedDrills` written by coach, read by no client (BL-3.06 — rule exists, read path is the open work) | writer `src/coach.js:145`; rule `firestore.rules:48-56`; no reader (grep); notif pref-only `notifications.js:46,106` |
| **F30** | medium | clean | `log-comp-dynamic` is a dead id; `dynamicBody.innerHTML=''` on null throws TypeError (unguarded inside generator) | `src/competitions.js:187-188,178,173`; real id `comp-dynamic-inputs` `index.html:1773`; form exists `index.html:1738` |
| **F3** | low | needs-design | `feed.handicapDifferential` read but written by no round-writer → always null → Diff column always "—" | reader `functions/index.js:434`; render `social.js:124-125,165`; writers `oncourse.js:1113-1130`, `whs.js:384-392`, `admin.js:312` (none write field) |
| **F6** | low | needs-design | Rules reference fields no writer produces — `coachUid` / `whs_rounds.visibility` / `invitedUIDs` → dead branches (fail closed) | `firestore.rules:19-25,79,115`; `auth-v2.js:76-85`; `coach.js:53`; `competitions.js:479-501,56` |
| **F11** | low | needs-design | Sydney-Protocol "No !important"/"No .style.display" violated 46 + 20 times | `src/style.css` (×46, e.g. `:111,114-116,583-586,1070-1082`); `.style.display` ×20 across `auth-v2.js:26-27,43-44`, `ai.js:70-75`, `oncourse.js:850,922` etc. |
| **F13** | low | needs-design | `feed.adjustedGrossScore`/`courseName` survive only via `??` aliasing of canonical fields (schema not single-sourced) | `functions/index.js:432-433`; `src/whs.js:386,389`; `oncourse.js:1115-1120`; phantom `adjustedGrossScore` never written |
| **F14** | low | clean | `normalizeRoundDoc` defaults dead fields: `userId` permanently null, `holes`-array dead (score dead only on WHS path) | `state.js:118-127`; `oncourse.js:1114`, `whs.js:385`, `admin.js:313,295`; score live at `practice.js:371,404-413,464` |
| **F16** | low | clean | `comp_rounds` two writers emit divergent field sets; *extra denormalized* fields unread + listener bypasses normaliser | writers `competitions.js:572-581`, `oncourse.js:1162-1174`; reader `competitions.js:258-271,333-354`; listener `:224-232` |
| **F20** | low | needs-design | No field/schema/type/range/immutability validation in any create rule (ownership-only) | `firestore.rules:81,92,103,124,118`; only `diff()/hasOnly()` is the assignedDrills *update* rule `:51` |
| **F22** | low | clean | `analyzeRoundStats` `JSON.stringify`s entire `request.data` into prompt after presence-only guard | `functions/index.js:78,114,79-81,76,117` |
| **F24** | low | clean | `onRoundCreated`/`onRoundDeleted` lack try/catch (cosmetic); feed-cleanup needs NO composite index | `functions/index.js:403-448,453-478,463-466`; `firestore.indexes.json:46-58` |
| **F25** | low | clean | Installed `vitest@4.0.18` below declared `^4.1.8` floor → node_modules drifted from manifest | `package.json:26`; `npm ls vitest` (`4.0.18 invalid`) |
| **F26** | low | clean | Build emits single ~1206 kB JS chunk; no `manualChunks` for chart.js/xlsx/firestore | `vite.config.js:13-15`; `dist/assets/index-RW744XpR.js` (1206.10 kB); static imports `ui.js:5`, `admin.js:9`, firestore ×16; warned dynamic import `event-binders.js:477` |
| **F27** | low | clean | protobufjs CRITICAL + @grpc/grpc-js HIGH advisories in firebase chain — node-side only, NOT in browser bundle | `npm ls protobufjs` (7.5.4), `@grpc/grpc-js` (1.14.3/1.9.15); `dist/assets/*.js` zero lib signatures (WebChannel transport) |
| **F28** | low | clean | `npm audit`: 34 vulns (1 critical, 16 high); 4 prod-only; bulk via `firebase-tools@15.8.0` (~14 minors behind) | `npm audit` (34: 1C/16H); `--omit=dev` (4); `package.json:22,31` |
| **F2** | info | clean | CLAUDE.md presents `activePracticeSession` Practice State + IndexedDB recovery as contracts; both are unbuilt backlog | `CLAUDE.md:18-19`; `MASTER_BACKLOG.md:190` (unchecked); persistence localStorage-only `persistence.js:8,45,53,79`; `state.js:6-36` no key |
| **F29** | info | clean | Contract-suite header annotations stale: (a)/(d) now pass; CLAUDE.md blanket "ships red" imprecise (4 pass / 1 fail, only (b) red) | `contracts.test.js:21-22 (a)`, `:43-44 (d)`, `:251-278 (e)`; `CLAUDE.md:47`; `index.html:186` |

---

## 4. Re-Based Remediation Seed

Grouped from CONFIRMED + surviving-PARTIAL findings (F1 excluded as REFUTED).

### (A) Security
| ID | real_sev | fix_safety | Recommended action | Design step? |
|---|---|---|---|---|
| F5 | high | clean | Add `match /courses/{courseId}/holes/{holeNum}` with `read: isAuthenticated()`, `write: isAdmin()`; surface the swallowed write error so the success toast isn't shown on failure | Clean fix |
| F8 | high | needs-design | Add per-user rate-limiting/quota (App Check + call counter or a callable-wrapper throttle) across all 5 AI callables; the cache guard alone is insufficient | Design (rate-limit strategy) |
| F7 | medium | clean | Add coach-scoped `config.systemInstruction` + prompt-length cap to `askAiCoach` (`functions/index.js:28-39`) | Clean fix |
| F17 | medium | needs-design | Constrain `comp_rounds` read rule to competition owner/invitee/participant; stop relying on client-side `compId` filter | Design (visibility model) |
| F21 | medium | needs-design | Split public-profile fields (e.g. via existing `/profiles`) or field-minimize; readers `social.js:25`/`competitions.js:595`/`admin.js:20` legitimately need cross-user reads | Design (profile split) |
| F23 | medium | needs-design | Add object-ownership check (path prefix `audio_diaries/{auth.uid}/`) + an upper size cap before buffering/base64 (`functions/index.js:153-164`) | Design (ownership + cap) |
| F20 | low | needs-design | Add required-field/type/immutability checks to create rules — requires exact per-writer schema (BL-3.05 hidden-writer lesson) | Design (schema capture) |

### (B) Correctness Bugs
| ID | real_sev | fix_safety | Recommended action | Design step? |
|---|---|---|---|---|
| F4 | medium | needs-design | Design courses/holes model (stable doc ID not course-name string; `setDoc` merge to create; an actual read path on round load) + matching rule | Design (data model) |
| F18 | medium | needs-design | Decide multi-player comp-logging auth model, then relax create rule to permit `uid:targetUid` for owner/admin without opening exposure | Design (auth model) |
| F19 | medium | clean | Add `\|\| isAdmin()` to `whs_rounds` create rule (`firestore.rules:81`) to match line 82; admin bulk-import then works | Clean fix |
| F9 | medium | clean | Add `.where(FieldPath.documentId(),'==',authorUid)` to the `collectionGroup('following')` query (`functions/index.js:417`); drop in-memory filter | Clean fix |
| F30 | medium | clean | Repoint dead id `log-comp-dynamic` → `comp-dynamic-inputs` (`competitions.js:187`) OR null-guard line 188 | Clean fix |
| F3 | low | needs-design | Write `handicapDifferential` from every round-writer (or compute server-side in `onRoundCreated`) so the feed Diff column populates | Design (writer/source) |

### (C) Schema / Contract Drift
| ID | real_sev | fix_safety | Recommended action | Design step? |
|---|---|---|---|---|
| F13 | low | needs-design | Fold `course`/`courseName` + `adjustedGross`/`adjustedGrossScore` aliasing into `normalizeRoundDoc` so client+server share canonical names | Design (normaliser contract) |
| F16 | low | clean | Drop unread denormalized fields OR add a comp_rounds normaliser on the listener (`competitions.js:224-232`); document the canonical schema | Clean fix |
| F14 | low | clean | Remove dead `userId`/`holes` defaults from `normalizeRoundDoc`; rename/split the practice-rounds path where `score`/`drillName` are live | Clean fix |
| F6 | low | needs-design | Reconcile `coachUid` clause with the live `coaches[]` model; remove/tighten dead `visibility`/`invitedUIDs` read branches once deferred features land | Design (coordinate w/ deferred features) |

### (D) Hygiene / Dead-Code
| ID | real_sev | fix_safety | Recommended action | Design step? |
|---|---|---|---|---|
| F12 | medium | needs-design | Decide telemetry's intent: wire a real `gpsLocation` writer + `body[data-active-tab]` gate, or delete the dead module | Design (intent decision) |
| F15 | medium | clean | Implement the BL-3.06 client read path (`onSnapshot`/`getDocs` against `users/{uid}/assignedDrills`) so coach assignments + notifications fire | Clean fix |
| F11 | low | needs-design | Migrate `.style.display` (×20) to `body[data-active-tab]`/`.hidden`; remove non-load-bearing `!important`; keep the load-bearing specificity overrides | Design (per-site review) |
| F22 | low | clean | Whitelist known stat fields into a new object before `JSON.stringify` (`functions/index.js:114`) | Clean fix |
| F24 | low | clean | Wrap trigger bodies in try/catch; no index work needed | Clean fix |
| F26 | low | clean | Add `build.rollupOptions.output.manualChunks` vendor split for chart.js/xlsx; reconcile firestore mixed static/dynamic import first | Clean fix |
| F25 | low | clean | `npm install` to satisfy `^4.1.8`; commit updated lockfile | Clean fix |
| F27 | low | clean | `npm audit fix` / bump firebase + firebase-tools; no app-code impact (browser bundle already clean) | Clean fix |
| F28 | low | clean | Bump `firebase-tools` toward 15.22.3; review `xlsx` (see F10) | Clean fix |

### (E) Doc-Fixes
| ID | real_sev | fix_safety | Recommended action | Design step? |
|---|---|---|---|---|
| F2 | info | clean | Edit `CLAUDE.md:18-19` to mark `activePracticeSession` Practice State + IndexedDB recovery as *planned* (Practice Caddy Phase 1), not current contracts | Clean fix |
| F29 | info | clean | Update stale EXPECT-FAIL annotations `contracts.test.js:21-22` (a) and `:43-44` (d); fix `CLAUDE.md:47` blanket "ships red" to "only (b) red, 4 pass / 1 fail" | Clean fix |

---

## 5. Cross-Check vs Existing Backlog

### Already tracked (map to existing BL items)
| Finding | Existing item | Evidence |
|---|---|---|
| **F3** | **BL-4.09** (N6) | `MASTER_BACKLOG` BL-4.09; `overnight_review_night1` line 231 ("no writer anywhere") |
| **F5 / F4** | **BL-4.16** | F5 cites BL-4.16 directly (courses/ rule); F4 is the same courses/holes orphan |
| **F15** | **BL-3.06** (NIGHT1 N22) | `CLAUDE.md:56`, `MASTER_BACKLOG.md:50-51` — rule exists, client read path is the open work |
| **F6** (partial) | **BL-3.07** (invitedUIDs) + **BL-3.22/F6** (coachUid) | `MASTER_BACKLOG.md:55-56`, `docs/02_debt_catalogue.md:82-83`; `overnight_review_night1_blast_radius.md:270` |
| **F23** | **BL-3.17** (bucket-prefix allowlist) | `MASTER_BACKLOG.md:10`, `docs/06_residue_audit.md:173` — the prefix check that doesn't verify ownership |
| **F30** | **BL-4.04** (F8) historical | `overnight_review_night1_blast_radius.md:78` predicted the exact TypeError; `f3a4f96` (BL-4.04 PART A) touched the file but didn't repoint the dead id |
| **F1** (now REFUTED) | **BL-4.04** persistence note | `oncourse.js:1741`; `docs/agent-briefs/bl-4.04-f8-oncourse-comp-rules.md:43,154` — the intended design |

*Note:* The prompt lists BL-4.11/4.13/4.15 as candidate maps; none of the verified findings carried evidence linking them to those specific IDs, so they are not asserted here.

### NEW (not in existing backlog) — most are the verifier-confirmed security items
| Finding | real_sev | Why new |
|---|---|---|
| **F8** — no AI-callable rate-limiting / billing-abuse | **high** | AI-abuse vector; no existing BL covers quota/App Check on the callables |
| **F10** — `xlsx@0.18.5` vulnerable dependency bundled to browser | **high** | Supply-chain/CVE item with no backlog entry |
| **F7** — `askAiCoach` missing systemInstruction / caps | medium | AI-abuse hardening, new |
| **F17** — `comp_rounds` global read exposure | medium | New security finding (rule too loose on read) |
| **F18** — `comp_rounds` create rule too strict (multi-player) | medium | New correctness finding |
| **F19** — `whs_rounds` create rule missing `\|\| isAdmin()` | medium | New correctness finding |
| **F21** — `users` read rule over-exposes PII/role flags | medium | New security finding (users-read) |
| **F9** — unbounded `collectionGroup('following')` scan | medium | New scaling/cost finding |
| **F12** — `telemetry.js` double-dead module | medium | New dead-code finding |
| **F20** — no create-rule schema validation | low | New hardening finding |
| **F11** — Sydney-Protocol !important/.style.display violations | low | New hygiene finding |
| **F13 / F14 / F16** — schema/normaliser drift | low | New hygiene findings |
| **F22 / F24 / F26** — prompt-whitelist / trigger try-catch / chunking | low | New hygiene findings |
| **F25 / F27 / F28** — dep/audit hygiene | low | New supply-chain hygiene |
| **F2 / F29** — doc accuracy | info | New doc-fixes |

**Bottom line:** the two genuinely new High-severity security items the Phase-1 map surfaced and the verifier sustained are **F8 (AI-callable billing abuse)** and **F10 (bundled vulnerable xlsx)**, plus the new medium-security cluster **F17/F21 (over-broad reads), F7 (AI guardrails), F23 (audio ownership/size)** — none of which were previously in the backlog.