# PHASE-1-GROUND-TRUTH.md — Golf Handicap Tracker

*Independent, source-derived system map. As at 2026-06-26. Branch: `fix/bl-4.03-practice-merge`. Trusts neither the docs nor CLAUDE.md — every claim is anchored to `file:line`.*

---

## 1. Overview

The Golf Handicap Tracker is a vanilla-JS / Vite / Firebase single-page app whose state layer (`AppState` Proxy, `mutateList`, normalisers) and region pinning (`australia-southeast1`) are correctly implemented **where used** — but whose actual runtime behaviour diverges sharply from its written contract. The app boots through `app-v4.js` after auth, with `ui.js` (988 lines) acting as a god-module by coupling, and persists round state to localStorage only (no IndexedDB).

Three cross-cutting themes dominate. **(1) Contract-vs-reality drift:** CLAUDE.md asserts features that have zero source footprint (Practice Session State, IndexedDB offline recovery), forbids patterns that exist 66 times (`!important` ×46, `.style.display` ×20), and the contract suite baseline is stale (claims 4 red, only 1 is). **(2) Systemic absence of field/schema validation:** every Firestore `create` rule is ownership-only — no type, required-field, or range checks anywhere — which compounds a pervasive field-name drift (`uid` vs `userId`, `adjustedGross` vs `adjustedGrossScore`, `course` vs `courseName`) papered over with `??` fallback chains. **(3) Dead-code and orphan clusters:** 31 JS-referenced ids absent from live `index.html`, dead duplicate render functions, write-only Firestore fields/collections, dead rule branches, and a 1.2 MB un-split bundle. Underlying all three: the in-place mutation of `liveRoundGroups` (a persisted field) on the hottest write path bypasses the entire stateChange→autosave→render contract.

---

## 2. Consolidated findings table (all areas, high → low severity)

| Area | Sev | Kind | Finding | Evidence |
|---|---|---|---|---|
| Architecture & State | High | contract-violation | Live score/stat writes mutate `liveRoundGroups` (a PERSIST_FIELD) in place → no stateChange, no autosave, no re-render; compensated by manual `loadHole()` | score-input.js:103,106,109,119-126,152; oncourse.js:518-522,1506; event-binders.js:429-438; state.js:66; persistence.js:124; ui.js:727 |
| Architecture & State | High | drift | CLAUDE.md "Practice Session State" + "IndexedDB offline recovery" describe features with **zero** source footprint (`activePracticeSession`/IndexedDB absent from `src/`) | state.js:6-36; persistence.js (localStorage-only); grep src → 0 hits |
| Firestore Schema | High | drift | `feed.handicapDifferential` is read in 2 places but written by no round-writer → always null; feed Diff renders "—" | functions/index.js:434; social.js:165; (writers) oncourse.js:1113-1130, whs.js:384-392, admin.js:312/395 |
| Firestore Schema | High | risk | `courses/{id}/holes/{n}` is a write-only orphan via `updateDoc` (no creator), no reader, **and no security rule** (default-deny) — triple-dead | surveyor.js:230-233; firestore.rules (no `/courses` match, 1-152) |
| Rules Matrix | High | contract-violation | `courses/` has NO rule → every Surveyor write is default-denied at runtime (BL-4.16) | firestore.rules (no `match /courses`); surveyor.js:232-233 |
| Rules Matrix | High | contract-violation | Security rules reference fields no writer produces: `studentData.coachUid`, `whs_rounds.visibility`, `competitions.invitedUIDs` → permanently dead branches | firestore.rules:19-25,79,115; (writers) auth-v2.js:83, coach.js:53, competitions.js:479-501 |
| Cloud Functions | High | risk | `askAiCoach` is an open-ended, client-controlled Gemini proxy (prompt assembled client-side, no server systemInstruction, no topic/length cap) | functions/index.js:30-39; src/ai.js:214-235 |
| Cloud Functions | High | risk | No rate-limiting/quota on any AI callable except the practice-plan cache guard → unbounded paid Gemini calls (billing-abuse) | functions/index.js:28,50,75,131; (only guard) :243-255 |
| Cloud Functions | High | risk | `onRoundCreated` runs an unbounded `collectionGroup('following')` full scan on every round insert → reads scale O(all follow-edges) | functions/index.js:417, 418-420 |
| Deps/Build/Bundle | High | risk | `xlsx@0.18.5` shipped to browser with no-fix HIGH prototype-pollution + ReDoS CVEs | package.json:31; admin.js:9; GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 |
| Architecture & State | Medium | contract-violation | Sydney-Protocol "No `!important`" / "No `.style.display`" violated 46 + 20 times (spirit re: tab nav holds; letter broken) | src/style.css (46×); ai.js, app-v4.js, coach.js, auth-v2.js, oncourse.js, whs.js, practice.js, tempo.js, ui.js (20×) |
| Architecture & State | Medium | drift | Telemetry module double-dead: gates on never-set `.tab-content.active` AND listens for never-dispatched `gpsLocation` | telemetry.js:8,19,20,26-46,54-57 |
| Firestore Schema | Medium | drift | `feed.adjustedGrossScore`/`courseName` survive only via `??` fallback aliasing of canonical `course`/`adjustedGross` | functions/index.js:432-433; whs.js:387-389 |
| Firestore Schema | Medium | drift | `normalizeRoundDoc` defaults fields no writer produces (`userId` permanently null; `score`/`holes` dead) | state.js:118-127; (writers use `uid`) oncourse.js:1114, whs.js:385, admin.js:313 |
| Firestore Schema | Medium | gap | `assignedDrills` written by coach, never read by any client (matches BL-3.06 — rule exists, read path is the open work) | coach.js:145-151; firestore.rules:48-56 |
| Firestore Schema | Medium | debt | `comp_rounds` has two writers emitting disjoint field sets; live-writer fields never read by leaderboard | competitions.js:572-584; oncourse.js:1162-1177; (reader) competitions.js:258-271 |
| Rules Matrix | Medium | risk | `comp_rounds` read is any-authenticated — every user can read all competition rounds globally (compId narrowing is client-side only) | firestore.rules:122-123; competitions.js:224 |
| Rules Matrix | Medium | contract-violation | `comp_rounds` create rule (`uid==auth.uid`) blocks multi-player logging (`uid:targetUid`) | firestore.rules:124; competitions.js:584,543-544,595-607 |
| Rules Matrix | Medium | contract-violation | `whs_rounds` admin bulk-import blocked: create rule has no `||isAdmin()` clause (unlike update/delete) | admin.js:312-313,395-396,368/361; firestore.rules:81 |
| Rules Matrix | Medium | risk | Systemic absence of field/schema validation in all create rules (ownership-only; no type/required/range/immutability) | firestore.rules:81,92,103,124,118 |
| Rules Matrix | Medium | risk | `users` read rule exposes every user doc (email, isAdmin, isApproved, coachUid) to any authenticated user | firestore.rules:32; social.js:25, admin.js:20,209, competitions.js:595,613, app-v4.js:366 |
| Cloud Functions | Medium | risk | `analyzeRoundStats` `JSON.stringify`s the entire unvalidated `request.data` into the model | functions/index.js:79-81,114 |
| Cloud Functions | Medium | risk | `generateAudioBriefing` SSRF guard doesn't verify object ownership; no upper size cap (full file buffered + base64) | functions/index.js:143-145,156-157,164 |
| Cloud Functions | Medium | debt | Firestore triggers have no error handling; feed cleanup depends on an unstated composite index on `feed(roundId, actorUid)` | functions/index.js:403-448,453-478,463-466 |
| Deps/Build/Bundle | Medium | drift | Installed `vitest@4.0.18` violates declared `^4.1.8` floor → node_modules drifted from manifest; reproducibility broken | package.json:26; `npm ls vitest` → invalid |
| Deps/Build/Bundle | Medium | debt | 1.2 MB single JS chunk; no `manualChunks`/code-split for chart.js/xlsx/firestore | build output `index-RW744XpR.js 1,206.10 kB`; vite.config.js:13-15; ui.js:5, whs.js:7, admin.js:9 |
| Deps/Build/Bundle | Medium | risk | CRITICAL protobufjs + HIGH @grpc/grpc-js in firebase chain (Node-side; not browser-shipped, exposure capped) | `npm ls protobufjs`; GHSA-xq3m-2v4x-88gg; `grep -c protobuf dist` ≈ 0 |
| Deps/Build/Bundle | Medium | debt | 34 npm-audit vulns (1 critical, 16 high); 4 prod-only; bulk via firebase-tools@15.8.0 (~14 minors behind) | `npm audit`; `npm audit --omit=dev` |
| Dead-code/Orphans | Medium | drift | Contract-suite baseline stale: contracts (a)/(d)/(e) now PASS but header + CLAUDE.md call them RED (only (b) red; 23 pass / 1 fail) | contracts.test.js:18-49; `grep -c 'id="tab-practice"' index.html` = 1 |
| Dead-code/Orphans | Medium | risk | `log-comp-dynamic` is the one dead ref NOT null-safe — `dynamicBody.innerHTML=''` on unguarded null (NIGHT1 F8 / BL-4.04) | competitions.js:187-188 |
| Dead-code/Orphans | Medium | contract-violation | Sydney-Protocol CSS/DOM contracts violated 46 + 20 (live code) | src/style.css (46×); 9 files (20×) — see Architecture row |
| Architecture & State | Low | debt | Undeclared AppState keys created at runtime (`currentHoleTelemetry`, `gpsLocation`) + dead persist field `myBag` | telemetry.js:29,55,8; persistence.js:24; state.js:6-36 |
| Architecture & State | Low | contract-violation | `competitions.js` `currentCompRounds` snapshot bypasses both `mutateList` and the normaliser pattern | competitions.js:230-232,234-235; (contrast) practice.js:368-373 |
| Firestore Schema | Low | debt | `global_drills` rating aggregates + `practice_plans.userRating` written but never read/updated | functions/index.js:348-350; ui.js:975 |
| Firestore Schema | Low | drift | `whs_rounds` doc schema not single-sourced; field-name drift hidden by `??` fallbacks | functions/index.js:279,283,432-433; ai.js:168; firestore.rules |
| Rules Matrix | Low | debt | `tempo/` rule is dead AND over-permissive (any-auth read+write) — collection never touched | firestore.rules:137-139; tempo.js (no firestore import) |
| Rules Matrix | Low | risk | `preapproved_emails` publicly readable (`auth==null`) — exposes full allow-listed email set | firestore.rules:133; auth-v2.js:65 |
| Rules Matrix | Low | gap | `whs_rounds.visibility=='public'` read branch dead — no writer sets `visibility` | firestore.rules:79; whs.js:396, admin.js imports |
| Cloud Functions | Low | risk | Player PII (handicap index, course names, history) sent to Gemini as model INPUT; no-PII rule governs OUTPUT only | functions/index.js:273-286,298-301; ai.js:216-224 |
| Cloud Functions | Low | drift | `whs_rounds` schema field-name drift papered over with `??` fallbacks (slope missing → NaN, not error) | functions/index.js:279,432-433; ai.js:168 |
| Deps/Build/Bundle | Low | debt | firebase/firestore dynamic+static import conflict → no-op dynamic import | build warning; event-binders.js:477; 16 static importers |
| Deps/Build/Bundle | Low | gap | Playwright `webServer` command non-functional on Windows (bash `&`) | playwright.config.js:30 |
| Deps/Build/Bundle | Low | gap | Build/test on node 24 while Cloud Functions pin node 20; no root `.nvmrc` | local node v24.14.0; functions/package.json:11-13 |
| Deps/Build/Bundle | Low | gap | No lint/typecheck/CI script; `vitest.config` exclude-only (no `include`) | package.json:7-15; vitest.config.js:8 |
| Dead-code/Orphans | Low | debt | `whs.js` exports two dead duplicate render fns shadowed by wired `ui.js` copies | whs.js:195,309; ui.js:336,638,715-716,725 |
| Dead-code/Orphans | Low | debt | Archive-only orphan triad: JS + CSS still target markup living only in `_ARCHIVE` | oncourse.js:332; persistence.js:97 + style.css:869,907; oncourse.js:289,1756 + style.css:908 |
| Dead-code/Orphans | Low | gap | Entire admin invite-email feature inert (markup absent everywhere) | admin.js:224-232 |
| Dead-code/Orphans | Low | debt | Overhauled-wizard rewrite left 7+ orphan id refs cached into `UI` object | ui.js:106-154 |
| Dead-code/Orphans | Low | debt | `tab-btn-oncourse`/`tab-btn-comp` refs architecturally dead — nav switched to `data-target` | index.html:170,172; persistence.js:106; ui.js:61,91 |
| Architecture & State | Info | strength | AppState Proxy + mutateList + normalisers + region pinning correctly implemented where used; bootstrap fault-isolated | state.js:60-108; firebase-config.js:41; app-v4.js:47-81 |
| Firestore Schema | Info | debt | `profiles` vs `users` are two parallel uid-keyed user docs (easy to desync) | auth-v2.js:76-85; whs.js:274-296; functions/index.js:266,414 |
| Rules Matrix | Info | gap | `assignedDrills` read rule exists but no client read path (BL-3.06) | firestore.rules:49; coach.js:145 |
| Rules Matrix | Info | strength | `feed` collection correctly server-only (client create/update/delete=false; owner-scoped read) | firestore.rules:143-145,142; social.js:188-195; functions/index.js:438-447,462-477 |
| Cloud Functions | Info | strength | Region pinning (all 7 exports) and BL-3.17 SSRF allowlist HOLD at HEAD; no internal error leak | functions/index.js:12,28,50,75,131,231,403,453,143-145; firebase-config.js:41 |
| Dead-code/Orphans | Info | debt | `getAdjustmentFactor`/`calculateIndex` over-exported (used only internally) | whs.js:22,120,105,168 |

---

## 3. Per-area maps

### 3.1 Architecture & State Contracts

#### AppState Proxy — how stateChange fires (src/state.js:60-83)
`AppState` is a `Proxy` over a plain `initialState` object (state.js:6-36). The `set` trap (state.js:61-82) fires a `window` `CustomEvent('stateChange', {detail:{property, oldValue, newValue}})` **only when `oldValue !== value`** (state.js:66) — a strict reference/identity compare. Consequence, exactly as the contract states: reassignment (`AppState.key = newArr`) fires; in-place mutation (`.push`, `.splice`, `obj[k]=v`, `arr[i]=v`) keeps the same reference, so `oldValue === value` and **no event is dispatched**. There is no deep/structural diffing.

Subscribers are global `window.addEventListener('stateChange', …)` handlers, NOT a filtered wrapper. Three exist:
- ui.js:710-743 — the main render dispatcher (switch on `property`): re-renders on `currentRounds`, `handicapIndex`, `usedIds`, `liveRoundGroups`→`renderOcPlayersList`, `activeTab`→`document.body.dataset.activeTab = newValue` (state.js:733), `currentUser`.
- persistence.js:120-133 — auto-save: if `property` ∈ `PERSIST_FIELDS`, save/clear localStorage.
- telemetry.js:7-23 — listens for `gpsLocation` (see drift finding — never dispatched).

`onStateChange(keys, handler)` (the deferred T3-onStateChange filtered wrapper) is **not implemented** — confirmed, matches CLAUDE.md.

#### mutateList (state.js:102-108)
Shallow-copies the array/object, runs `fn(copy)`, reassigns `AppState[key]=copy` → always a new reference → always fires stateChange. Correct implementation. **Usage is inconsistent**: used at app-v4.js:360/380 (profileUsersMap), ui.js:621 (liveRoundGroups splice), practice.js:368 (currentPracticeRounds). NOT used at the highest-traffic write sites (live score writes, competitions snapshot).

#### Normaliser pattern (state.js:118-173)
- `normalizeRoundDoc` (118) — used whs.js:165 (WHS rounds) and practice.js:371 (practice_rounds).
- `normalizeUserDoc` (137) — used social.js:26.
- `normalizePracticePlan` (159) — used ui.js:829, ui.js:881 (AI plan adapter). Maps Cloud-Function `drillId/steps[]` string shape → renderer shape. Consistent with contract.
- `currentCompRounds` snapshot (competitions.js:229-236) consumes Firestore docs with **NO normaliser** — a snapshot consumer that skips the normaliser pattern.

#### Module graph / bootstrap
- Entry: app-v4.js. On load (top-level) it force-reloads on version bump (7-12) and unregisters all service workers + clears all caches on every boot (14-17). `setupAuthUI(bootstrapApplication)` (85) defers all module init until auth resolves.
- `bootstrapApplication` (43-82) order: `initializeAppRouting()` (restore round state) → module inits (WHS, comps, practice, oncourse+telemetry, coach, AI, notifications, tempo, wakelock, feed) → `setupTabs()` last (81). Each wrapped in its own try/catch so one failure doesn't abort boot.
- `ui.js` (988 lines) is the central hub: imported by 13 modules; owns the `UI` DOM cache, tab navigation (switchTab/initNavigation/setupTabs), the main stateChange render dispatcher, chart rendering, AND the Practice Caddy controller. It is a **god-module by coupling** though oncourse.js (1791) is the largest file. Navigation was migrated to a "Clean Slate" `initNavigation` (ui.js:285-311); `setupTabs` is a deprecated wrapper kept for compat (ui.js:317-328).

#### Tab/screen visibility (the sanctioned mechanism)
Tab visibility IS correctly state-driven: `switchTab` (ui.js:242-259) only sets `AppState.activeTab`; the stateChange handler mirrors it to `body[data-active-tab]` (ui.js:733); CSS (style.css:570-600) shows the matching `#tab-*` and active `.tab-btn`. No `.style.display` is used for top-level tab navigation. However **intra-tab screen** swaps (oncourse setup↔hub, modals, mode panels) use `.classList.add/remove('hidden')` directly (persistence.js:100-103, event-binders.js:442-453, app-v4.js:157-170) — a second, class-based visibility system running parallel to the data-attr one.

#### Persistence / offline (src/persistence.js)
- localStorage only. `GOLF_APP_STATE_KEY='golf_round_state'` (8). `PERSIST_FIELDS` (11-25) = 13 entries: currentTrackingMode, currentRoundHoles, currentRoundCourseName, currentCoursePars, liveRoundGroups, currentHole, currentShotData, currentLiveCompId, currentLiveCompRules, currentHoleShots, activeRoundId, currentRoundDate, **myBag** (note: `myBag` is NOT in initialState; the real bag key is `playerClubs`/localStorage `golfAppClubs` — a stale/dead persist field).
- Save (30-47) gated on `activeRoundId` truthy; auto-saves via stateChange listener (124-131); clears when `activeRoundId`→falsy.
- Boot rehydration: `loadRoundState` (52-73) + `initializeAppRouting` (87-117) restore round + force on-course UI via direct `.classList`/`.click()`.
- A second localStorage namespace: `playerClubs` (state.js:38-53, key `golfAppClubs`) loaded at module-init. FP-01 confirmed accurate (round state is well persisted).

### 3.2 Firestore Schema Map

#### Method
Enumerated every Firestore access in `functions/index.js` and `src/**` at HEAD. "WRITTEN" = field appears in a `set/add/update` payload. "READ" = field is consumed from a snapshot.

#### Top-level collections

**`whs_rounds`** (central round store) — Writers (4, divergent shapes):
- Live on-course save — oncourse.js:1113-1137 (`setDoc`, id=`{roundId}_{uid}`): `uid, course, courseName, rating, slope, par, adjustedGross, notCounting, totalGross, totalScore, totalStableford, dailyHandicap, isLiveTracked, liveRoundsMode, stats:{putts,gir,fwy}, totalPutts, date`.
- Manual add — whs.js:382-396 (`addDoc`): `uid, course, rating, slope, adjustedGross, date, notCounting`, optional `stats`. (No `courseName`, no `par`.)
- CSV import — admin.js:312-322: `uid, course, rating, slope, adjustedGross, holes(array), notCounting, date, importedAt`.
- Excel import — admin.js:395-407: `uid, course, rating, slope, adjustedGross, holes(=18 number), notCounting, date, importedAt, isAutoImported, originalGrossDiff`.
- Update sites: `audioUrl` (oncourse.js:910), `aiSummary` (ui.js:476), `notCounting` toggle (whs.js:423).
- Readers: client listener whs.js:152-166 → `normalizeRoundDoc`; coach.js:191,256; CF `generatePracticePlan` (functions/index.js:258-283); CF `onRoundCreated/onRoundDeleted` (functions/index.js:409,432-435,459,464-465).

**`shots`** — Written score-input.js:101,105; deleted score-input.js:144, event-binders.js:477-480, oncourse.js:1599. Read ai.js:162, analytics.js:11-16, oncourse.js:1331-1332.

**`practice_rounds`** — Written practice.js:205-213 (`uid, playerName, drillId, drillName, score, data, date`). Read practice.js:362-367, coach.js:280, ai.js:161.

**`comp_rounds`** (two incompatible writers) — Writer A manual competitions.js:572-584 (`compId, uid, playerName, totalPoints, score, date, ruleCounts, createdAt`); Writer B live oncourse.js:1162-1177 (`compId, uid, playerName, stablefordPoints, netScore, rulePoints, totalPoints, ruleCounts, isLiveSynced, date`). Read competitions.js:224-232 → leaderboard reads `uid, playerName, totalPoints, ruleCounts` (258-271).

**`competitions`** — Written competitions.js:479-504 (`name, ownerId, createdAt, visibility, rules, defaultPlayers[{uid,name}], startingPoints…`). Read competitions.js:52-61.

**`feed`** (function-only writer) — Written ONLY by `onRoundCreated` functions/index.js:427-444. Read social.js:188-210 → `buildFeedCard` (143-165). Client cannot write (firestore.rules:143 `allow create: if false`).

**`profiles`** — Written whs.js:274-296 (`handicapIndex, indexHistory[…]`). Read oncourse.js:147-150, functions/index.js:266-268. Distinct from `users/{uid}`.

**`global_drills`** (function-written) — Written ONLY by `generatePracticePlan` functions/index.js:341-350. Read functions/index.js:245,250-252 and ui.js:827-831. Client read-only per firestore.rules:59-61; function writes via Admin SDK bypassing rules.

**`courses` / `courses/{id}/holes/{n}`** (orphan write) — Written ONLY surveyor.js:230-233. Read: NONE in src. No `firestore.rules` match → default-deny.

**`tempo`** — Not a Firestore collection in the app; `tempo.js` is a metronome with zero Firestore imports. A rule exists (firestore.rules:137-139) for a collection no code touches.

**`preapproved_emails`** — Written admin.js:140,239; deleted 190. Read existence-only auth-v2.js:65-67, listed admin.js:152.

**`users`** (top-level doc) — Written auth-v2.js:76-85; updated isApproved/isCoach/coaches (admin.js:170,180; coach.js:53,91,240; practice.js:517,521). Read auth-v2.js:136-149, social.js:25, app-v4.js:366-372, coach.js:174, practice.js:484, competitions.js:595,613, functions/index.js:414-415.

#### `users/{uid}` subcollections

| Subcollection | Written | Read |
|---|---|---|
| `following` | social.js:76, del 83 | social.js:94-104; fn `collectionGroup('following')` functions/index.js:417-420 |
| `coachNotes` | coach.js:126-130 | coach.js:300 |
| `prefs/notifications` | notifications.js:49 | notifications.js:97-98 |
| `practice_plans/active` | fn functions/index.js:354-360; client updates ui.js:907-913,942,975 | fn functions/index.js:240-253; client ui.js:820-831 |
| `assignedDrills` | coach.js:145-151 | **NONE in src** |

#### Confirmed drift summary
1. `feed.handicapDifferential` — read (functions/index.js:434; social.js:165), never written → always null.
2. `feed.adjustedGrossScore`/`courseName` — name-mismatch; only via fallback `?? adjustedGross / ?? course` (functions/index.js:432-433).
3. `normalizeRoundDoc` (state.js:118-127) defaults `score, courseName, holes, userId` — `userId` permanently null (writers use `uid`); `score`/`holes` dead.
4. `holes` type-inconsistent: array (admin.js:318) vs number 18 (admin.js:401); never read.
5. `comp_rounds` two writers, disjoint fields; live-writer fields never read.
6. `global_drills.completionCount/averageRating/ratingCount` (functions/index.js:348-350) write-once, never read; `practice_plans.userRating` (ui.js:975) never read.
7. `assignedDrills` write-only (coach.js:145), no reader — matches BL-3.06.
8. `courses` write-only orphan + `updateDoc` on never-created doc + no rule → write never succeeds.
9. `tempo` — rule for a phantom collection.
10. Rules-vs-data drift: `isCoachOf` checks `studentData.coachUid` (firestore.rules:22) never written; `whs_rounds.visibility` (firestore.rules:79) and `competitions.invitedUIDs` (firestore.rules:115) referenced, never written.

### 3.3 Security-Rules Coverage Matrix

Source of truth: `firestore.rules` (152 lines). Cloud Functions use the Admin SDK (`admin.initializeApp()`, functions/index.js:10) which **bypasses all rules** — rules only gate the browser client.

- **users/{userId}** (rules 31-33): read any-auth, write owner|admin. Match YES. **Note: read rule exposes EVERY user doc (incl. email, isAdmin, isApproved, coachUid) to any logged-in user** — relied on by social.js:25, comp/admin player pickers.
- **users/.../coachNotes** (35-38): read owner|coachOf|admin, write coachOf|admin. Match YES.
- **users/.../prefs** (40-42): owner|admin. Match YES.
- **users/.../practice_plans** (44-46): owner|admin; server write via Admin SDK (functions/index.js:240). Match YES.
- **users/.../assignedDrills** (48-56): coach create coach.js:145; **no client read path** (BL-3.06). Write YES; read rule latent/unexercised.
- **global_drills** (59-62): read any-auth, write admin (server via Admin SDK functions/index.js:341). Match YES.
- **profiles** (64-67): read any-auth, write owner|admin. Match YES.
- **whs_rounds** (73-83): read owner|coachOf|admin|`visibility=="public"`; create `request.resource.data.uid==auth.uid` (**no admin clause**). Reads always filter `where("uid","==",…)`. **create MISMATCH**: admin bulk-import writes `uid:targetUid` (admin.js:312-313,395-396) → fails. `visibility=="public"` branch never set (dead).
- **shots** (85-94): create/update/delete YES. Two by-`roundId` queries (oncourse.js:1331,1599; event-binders.js:479) skip the uid filter but only target the user's own round → pass incidentally.
- **practice_rounds** (96-105): Match YES.
- **competitions** (111-120): client query mirrors the rule disjunction exactly (competitions.js:51-57). Match YES.
- **comp_rounds** (122-126): read **any authenticated (no scoping)** — over-permissive; client narrows by compId only client-side (competitions.js:224). create `uid==auth.uid` → **MISMATCH** with multi-player logging (`uid:targetUid`, competitions.js:584,543-544,595-607).
- **preapproved_emails** (132-135): read authenticated OR `auth==null` (**fully public read**) — intentional signup gate (auth-v2.js:65), but exposes the allow-list publicly.
- **tempo** (137-139): read,write any-auth. **NO client/function usage** → DEAD RULE, over-permissive.
- **feed** (141-146): read recipient-scoped; create/update/delete=false (client locked out; Admin SDK writes). Match YES — well-designed.
- **users/.../following** (148-150): owner|admin; Admin SDK `collectionGroup` read. Match YES.
- **courses/.../holes** — **NO `match /courses` block** → DEFAULT DENY. surveyor.js:232-233 `updateDoc` REJECTED at runtime (BL-4.16). `course-data.js` is a static catalog; only the dead write path exists.

**Systemic patterns:** (1) No field/schema validation anywhere — every create rule is ownership-only (whs_rounds:81, shots:92, practice_rounds:103, comp_rounds:124, competitions:118); arbitrary/garbage/omitted fields pass. (2) Reads gated by `resource.data.uid` REQUIRE client uid-filtering — present for whs_rounds/practice_rounds/shots; two by-roundId shot queries pass incidentally. (3) Admin SDK paths bypass rules — feed fan-out/cleanup, global_drills seeding, practice_plans generation (correctly server-only).

### 3.4 Cloud Functions Audit (AUDIT-01) — functions/index.js

`functions/index.js` (479 lines) is the entire surface. 7 exported functions. Deps (functions/package.json:15-19): `@google/genai ^1.0.0`, `firebase-admin ^12.7.0`, `firebase-functions ^4.9.0`, Node 20. Module constants (index.js:12-14): `REGION="australia-southeast1"` (all 7 exports ✅), `MODEL_NAME="gemini-2.5-flash"`, `STORAGE_URL_PREFIX` (project-bucket SSRF allowlist). `getAiClient()` (19-23) reads `process.env.GEMINI_API_KEY` per-function secret.

1. **`askAiCoach`** (28-45): onCall, region ✅, auth gate (29). No Firestore. Gemini `generateContent` with `contents: prompt` (36-39). Validation: `prompt` truthiness only (30-31) — full persona+data prompt assembled client-side (ai.js:214-231), passed verbatim → **unconstrained Gemini text proxy gated only by auth**. Errors → console.error + generic HttpsError (42-43).
2. **`processRulesQuery`** (50-70): onCall, region ✅, auth (51). Gemini with server `systemInstruction` (62). Validation: `query` truthiness only. Errors → returns friendly `{answer}` (68).
3. **`analyzeRoundStats`** (75-122): onCall, region ✅, auth (76). `contents: JSON.stringify(stats)` (114) — **entire `request.data` stringified into model**. Validation: checks `stats` + ≥1 of par3/4/5Avg (79-81); other keys unvalidated. Errors → friendly return (120).
4. **`generateAudioBriefing`** (131-218): onCall, region ✅, auth (132). TWO external calls: `fetch(audioUrl)` (153) + multimodal Gemini (181-197). SSRF guard: `new URL` + `https:` + `startsWith(STORAGE_URL_PREFIX)` (138-145) — genuine allowlist (BL-3.17), **but object ownership NOT verified** (cross-user audio read via privileged fetch). Size: rejects `<1000` bytes (164-169), **no upper bound** (156-157). Errors → generic HttpsError (215-216).
5. **`generatePracticePlan`** (231-376): onCall, region ✅, auth (232); uses `request.auth.uid` (234, no client-supplied uid ✅). Reads `practice_plans/active` (240-241 quota guard), `global_drills` (245), `whs_rounds where uid==caller orderBy date limit 5` (258-262 BOUNDED ✅), `profiles` (266). Writes `global_drills` (341-350) + `practice_plans/active` (354-360) via Admin SDK. Input derived server-side (no `request.data` fields). Quota guard (243-255) returns cached plan with no Gemini call — the only cost control. Output validated (329-338). **Lowest-risk.** Note: BL-3.05 doc claims generic-fallback-only, but the function builds personalised input server-side (257-290) — doc may describe a pre-fix state.
6. **`onRoundCreated`** (403-448): onDocumentCreated `whs_rounds/{roundId}`, region ✅. Trusts `roundData.uid` (rules enforce at write, 409). Reads `users/{authorUid}` (414-415); **`collectionGroup('following').get()` — UNBOUNDED full scan** (417), in-memory filtered (418-420). Writes one feed doc per follower, batched in 450-chunks (387-398). **No try/catch.**
7. **`onRoundDeleted`** (453-478): onDocumentDeleted, region ✅. Trusts deleted `uid` (459). Reads `feed where roundId== and actorUid==` (463-466, indexed) — requires composite index. Batch-deletes in 450-chunks (473-475). **No try/catch.**

**Contract cross-checks:** Region pinning TRUE at HEAD (all 7 + firebase-config.js:41). `getFunctions(` only in firebase-config.js:41. BL-3.17 SSRF allowlist PRESENT (143-145). BL-3.05 PARTLY STALE. Field-name drift (R6): `adjustedGross`/`adjustedGrossScore`, `course`/`courseName`, `slope` papered over with `??` chains — schema not single-sourced.

### 3.5 Dependency, Build & Bundle Health

`npm run build` (vite 7.3.1) succeeds: 57 modules, ~5s, exit 0. Build does NOT inherit CLAUDE.md's Windows-broken-tooling framing. Emitted chunks: `dist/index.html` 143.86 kB (the hand-authored SPA source), `index-Cu2zO6Oj.css` 16.00 kB, `surveyor-Ld_VjqHR.js` 3.76 kB (split via `import('./surveyor')` — oncourse.js:554-569), `event-binders-DIjOoJ9u.js` 17.30 kB, **`index-RW744XpR.js` 1,206.10 kB (gzip 384.69 kB)** — the monolith.

- **Warning 1 (>1MB chunk):** vite.config.js:14 sets `chunkSizeWarningLimit:1000`; no `rollupOptions`/`manualChunks`. `chart.js/auto` (ui.js:5, whs.js:7), `xlsx` (admin.js:9), `firebase/firestore` (16 files) all statically imported → fused.
- **Warning 2 (firestore dynamic-vs-static):** event-binders.js:477 `await import('firebase/firestore')` while 16 files import it statically → "dynamic import will not move module into another chunk" — the lone dynamic import is a no-op.
- **Deps:** prod `chart.js ^4.5.1`, `firebase ^12.10.0`, `xlsx ^0.18.5`; dev `@firebase/rules-unit-testing ^5.0.0`, `@playwright/test ^1.58.2`, `firebase-tools ^15.8.0`, `jsdom ^28.1.0`, `vite ^7.3.1`, `vitest ^4.1.8`. functions: `@google/genai ^1.0.0`, `firebase-admin ^12.7.0`, `firebase-functions ^4.9.0`, node 20.
- **`npm outdated`:** firebase 12.10→12.15, playwright 1.58.2→1.61.1, firebase-tools 15.8→15.22.3, vite 7.3.1→7.3.6 (major 8.1.0), vitest 4.0.18→4.1.9, jsdom 28.1→29.1.1.
- **Installed tree out of sync:** `npm ls vitest` → `vitest@4.0.18 invalid: "^4.1.8"` (below declared floor); `npm ls` exits ELSPROBLEMS. Reproducibility broken until `npm install` re-run.
- **Local tooling:** Node v24.14.0 / npm 11.9.0; mismatch vs Cloud Functions node 20 (functions/package.json:11-13); no root `.nvmrc`.
- **Scripts (package.json:7-15):** dev/build/preview work; `test:unit`→`vitest run tests/unit` (pure jsdom); `test:rules`→emulator; `test:e2e`→`playwright test` (playwright.config.js:30 `webServer.command` uses bash `&` — broken on Windows PowerShell). No lint/typecheck/CI.
- **Audit:** xlsx@0.18.5 HIGH no-fix CVEs reach the browser bundle. protobufjs CRITICAL + @grpc/grpc-js HIGH in firebase chain but `grep -c protobuf dist` ≈ 0 (gRPC-Web/REST browser build) → exposure capped. 34 total vulns (1 critical, 16 high); 4 prod-only; bulk via firebase-tools@15.8.0.

### 3.6 Dead-Code & Orphan Map

`npm run test:unit` runs `tests/unit/contracts.test.js` (BL-4.00): **23 pass / 1 fail** at HEAD. Only failing group is **contract (b)** — "JS-referenced ids resolve to index.html" — emitting a 31-offender list.

**Contract-suite baseline drift:** header (contracts.test.js:18-49) + CLAUDE.md describe 4 RED, but at HEAD: (a) duplicate `id="tab-practice"` PASSES (`grep -c` = 1; BL-4.03 dedup landed 91a5726/0d4bbb2); (d) `if (true ||` PASSES (BL-4.07); (e) `currentUserIsAdmin=true` PASSES (BL-4.07); (c) single `getFunctions(` PASSES. Only (b) is red.

**The 31 dead/orphan JS id refs** — all referenced in `src/` but absent from live `index.html`; all null-guarded (dead-but-safe) EXCEPT one.
- *Genuinely dead (no archive copy):* admin-invite-form/invite-msg/invite-email/invite-name/invite-role (admin.js:224-232); btn-ai-player/btn-ai-coach (ai.js:64-65), ai-prompt-textarea/btn-copy-ai-prompt (ui.js:140-141) — BL-4.13 deletion targets; log-comp-round-container (competitions.js:112, has class fallback that also doesn't exist); **log-comp-dynamic (competitions.js:176,187)** — NOT fully safe; btn-oc-abort-round (event-binders.js:460); oc-hole-dots (oncourse.js:165); tab-btn-oncourse (persistence.js:106, ui.js:91); tab-btn-comp (ui.js:61); btn-cancel-practice (ui.js:86); btn-oc-review-round (ui.js:109).
- *Archive-only (markup in `_ARCHIVE` only):* btn-sync-rounds (oncourse.js:332, stub handler); oc-progress-bar (persistence.js:97 + dead CSS style.css:869,907); oc-simple-stats (event-binders.js:534, oncourse.js:1756); oc-simple-stats-container (oncourse.js:289 + dead CSS style.css:908); btn-wizard-prev/next, btn-shot-prev/next, btn-back-to-hole, btn-putt-on-green, btn-putt-fringe (ui.js:106-154) — orphans of the wizard UI rewrite, cached null.

Count: 17 genuinely-dead, 14 archive-only → **30 dead-but-safe, 1 dead-and-unsafe** (`log-comp-dynamic` at competitions.js:188 does `dynamicBody.innerHTML=''` on an unguarded null → TypeError if `generateDynamicLogInputs` runs; root of NIGHT1 F8 / BL-4.04).

**Duplicate render functions:** `whs.js:195 renderTrendChart` and `whs.js:309 renderRoundsHistory` are exported but never imported and never called internally — DEAD. The wired copies are `ui.js:336 renderRoundsHistory` and `ui.js:638 renderTrendChart` (stateChange handler ui.js:715-716,725). Safe to delete.

**Redundant exports:** `whs.js:22 getAdjustmentFactor` (called only at whs.js:120) and `whs.js:105 calculateIndex` (called only at whs.js:168) — live but `export` is redundant.

**Dead CSS:** style.css:869 `#oc-progress-bar`, :907 `body.active-wizard-mode #oc-progress-bar`, :908 `body.active-wizard-mode #oc-simple-stats-container` — ids only in `_ARCHIVE`.

**Sydney-Protocol violations (live code):** `!important` 46× all in src/style.css; `.style.display =` 20× across 9 files (ai.js ×4, auth-v2.js ×4, app-v4.js ×2, oncourse.js ×2, whs.js ×2, tempo.js ×2, ui.js ×2, coach.js ×1, practice.js ×1).

---

## 4. Cross-cutting themes

**A. Systemic absence of field/schema validation.** Every Firestore create rule is ownership-only (firestore.rules:81,92,103,118,124) — no type, required-field, range, or `uid`-immutability checks. This is the load-bearing enabler of theme B: nothing at the persistence boundary rejects malformed or drifted documents.

**B. Contract-vs-reality drift, pervasive and bidirectional.** CLAUDE.md asserts non-existent features (Practice Session State + IndexedDB recovery, zero `src/` footprint) and forbids patterns present 66× (`!important`/`.style.display`). The contract suite's own baseline is stale (claims 4 red, 1 is). Firestore field names disagree across paths (`uid` vs `userId`; `adjustedGross` vs `adjustedGrossScore`; `course` vs `courseName`) and are reconciled at read time by `??` fallbacks (functions/index.js:432-433; state.js:118-127) and dead normaliser defaults — a rename anywhere would silently degrade (e.g. `slope` missing → differential NaN, functions/index.js:279) rather than error. BL-3.05 doc text describes a state the function has already moved past.

**C. Dead-code / orphan clusters.** A UI rewrite (wizard markup) and a feature retirement (oncourse archive triad) left matched JS+CSS pointers at markup that survives only in `_ARCHIVE`; an entire admin-invite feature is inert; `whs.js` ships dead duplicate render functions; `courses/`, `tempo/`, `assignedDrills`-read, and several Firestore fields (`global_drills` rating aggregates, `practice_plans.userRating`, `comp_rounds` live-writer fields, `feed.handicapDifferential`) are written-but-never-read or rule-without-collection. The dead-but-safe convention (null guards) hides 30 of 31 orphans; the one ungated case (`log-comp-dynamic`) is the live BL-4.04 crash.

**D. The in-place-mutation footgun on the hot path.** `liveRoundGroups` and per-player score/stat objects are mutated in place (score-input.js, oncourse.js, event-binders.js), `currentCompRounds` is push-mutated, and telemetry mutates undeclared keys — all bypassing the Proxy's reference-identity stateChange, hence bypassing autosave and re-render. The app survives only via manual `loadHole()` / manual render calls; the most-frequent writes are the least contract-compliant.

**E. AI cost/abuse surface with one guard.** Four of five AI callables have no rate limit and forward client-controlled or unvalidated content to a paid third-party model (functions/index.js:28,50,75,131); only `generatePracticePlan` has a cache guard. Player PII flows to Gemini as input despite an output-only no-PII instruction. The `onRoundCreated` follow fan-out scales O(all follow-edges) per round.

**F. Over-permissive read surfaces.** `users` (every user doc to any authed user, incl. email/roles), `comp_rounds` (all rounds globally), `preapproved_emails` (public, incl. unauth), and the dead-but-open `tempo` rule together expose more than each feature needs.

---

## 5. Open questions → Phase 2/3 targets

### Phase 2 — doc reconciliation
- **Phantom contracts:** Is "Practice Session State / IndexedDB offline-recovery" a planned-but-unbuilt backlog item or stale CLAUDE.md text? It is asserted as a live rule with zero source footprint — reconcile so future agents don't code against a phantom contract.
- **BL-3.05 staleness:** The doc claims `generatePracticePlan` only ever uses the generic fallback, but the function builds personalised input server-side (functions/index.js:257-290). Confirm whether the doc describes a pre-fix state, or whether the client path still prevents rounds existing for new users so the fallback dominates in practice.
- **Contract-suite baseline:** Update the contracts.test.js header + CLAUDE.md to reflect that (a)/(c)/(d)/(e) now PASS and only (b) is red — the RED/GREEN split documented does not match HEAD.
- **Sydney-Protocol letter vs spirit:** Decide whether the 46 `!important` + 20 `.style.display` are accepted exceptions (role-gating, auth toggles, chart canvas, feature gate) or genuine violations to remediate; the contract text is absolute.
- **whs_rounds canonical schema:** Single-source the field names (`uid`/`userId`, `adjustedGross`/`adjustedGrossScore`, `course`/`courseName`) and decide the fate of `feed.handicapDifferential` (backfill via writer change, or compute from slope/rating/AGS at fan-out — data is available in `roundData`).
- **Dead-rule/field disposition:** Prune or activate `coachUid`, `whs_rounds.visibility`, `competitions.invitedUIDs`, the `tempo` rule, `global_drills` rating aggregates, `practice_plans.userRating` — each is either future scaffolding or removable.

### Phase 3 — multi-hat deep audits
- **Live-state runtime hat:** Against the emulator, confirm whether the in-place `liveRoundGroups` score writes ever fire autosave/re-render, or whether the multi-player leaderboard/scorecard silently desyncs and is rescued only by incidental top-level field reassignment (currentHole advance). Verify mid-hole scores are actually persisted.
- **Security/abuse hat:** (1) Confirm whether ANY App Check / per-user rate limiting / Gemini quota exists outside `functions/index.js` (firebase.json, GCP quotas); if not, the AI callables are a live billing-abuse vector. (2) Audit Storage object ACLs/download-token semantics — the SSRF guard confirms the bucket but not object ownership (cross-user audio read). (3) Decide whether `users`/`comp_rounds`/`preapproved_emails` reads should be scoped (PII exposure) and whether `tempo` rule should be removed. (4) Assess the Gemini DPA/region acceptability for identifiable golfer performance data as model input.
- **Data-integrity hat:** Determine empirically whether deployed Firestore contains out-of-band-seeded `courses/{id}/holes` docs (which would make surveyor.js:233 succeed despite default-deny), and whether a composite index on `feed(roundId, actorUid)` exists (absent → `onRoundDeleted` throws, orphaning feed entries). Resolve whether multi-player `comp_rounds`/admin `whs_rounds` import are supported features (needing a rule clause) or vestigial (needing self-only UI).
- **Scalability hat:** Quantify the `onRoundCreated` `collectionGroup('following')` full-scan cost and design a bounded fan-out (e.g. per-author follower index).
- **Dead-code cleanup hat:** Confirm BL-4.13 status (AI-modal ref deletions), whether the `_ARCHIVE` wizard/oncourse orphans are a deliberate rollback path or removable, whether the BL-4.04 `log-comp-dynamic` call path is reachable, and that no test/dynamic import references the dead `whs.js` render functions before deletion.
- **Build/reproducibility hat:** Resolve the `vitest` floor mismatch (re-run `npm install`, confirm `package-lock.json` is committed in sync), evaluate moving/lazy-loading `xlsx` to remove the HIGH no-fix CVE from the shipped bundle, add a `manualChunks` vendor split (firebase/chart.js/xlsx), bump firebase-tools to clear the dev-chain audit bulk, and pin the dev runtime (`.nvmrc`) given node 24 vs functions node 20.