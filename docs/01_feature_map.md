# Golf Handicap Tracker — Feature Map
**Last updated:** June 2026 | **Status:** Post-audit baseline (resolved)

---

## How to Read This Document
- ✅ **Complete** — Confirmed working, code and data model intact
- ⚠️ **Partial** — Code exists but completeness unverified or known gaps
- ❓ **Unknown** — Referenced in codebase but not audited
- 🔴 **Broken/Missing** — Known to be incomplete or damaged
- 🚫 **Not Started** — Discussed but no implementation found

---

## 1. Authentication & User Management
| Feature | Status | Notes |
|---|---|---|
| Email/password login | ✅ | Firebase Auth, working |
| User registration | ✅ | Includes display name |
| Admin permission tier | ✅ | `isAdmin` flag in Firestore |
| Coach permission tier | ✅ | `coachUid` + `coaches` array |
| Auth overlay / cloak | ✅ | `#app-loading-cloak` pattern |
| Pre-approved emails | ✅ | `/preapproved_emails` collection |
| Social graph (following) | ✅ | `src/social.js` `followPlayer()`/`unfollowPlayer()`/`loadFollowing()` correctly read/write `users/{uid}/following/{followedId}`, matching `firestore.rules` lines 135-137. UI in `#tab-feed` wires this via `initSocialFeed()` (called from `app-v4.js`). Mechanically sound — see Audit Findings for the related but separate Activity Feed bug. |

---

## 2. Round Tracking (WHS)
| Feature | Status | Notes |
|---|---|---|
| Log a round manually | ✅ | `/whs_rounds` collection |
| Course rating + slope | ✅ | Stored per round |
| Handicap differential calc | ✅ | WHS formula implemented |
| Best 8 of 20 calculation | ✅ | `usedIds` in AppState |
| Handicap index display | ✅ | Header display confirmed |
| Round history table | ✅ | With used/not-used badges |
| Delete a round | ✅ | With auth check |
| 9-hole round support | ✅ | Tested in live_audit.spec.js |
| Adjusted gross score | ✅ | Stored in whs_rounds |
| FIR / GIR / Putts stats | ✅ | Optional fields per round |
| Non-counting round status | ✅ | `status-badge` in UI |

---

## 3. Live On-Course Tracker
| Feature | Status | Notes |
|---|---|---|
| Start a round | ✅ | Course name + tee selection |
| Hole-by-hole scoring | ✅ | Stepper UI confirmed |
| Shot tracking (type + outcome) | ✅ | `/shots` collection |
| Shot wizard UI | ✅ | `#oncourse-wizard` |
| Club selection | ✅ | Player clubs in AppState |
| FIR / GIR / Miss tracking | ✅ | Mini-stat buttons |
| Putts per hole | ✅ | With stepper |
| Penalties tracking | ✅ | In editor |
| Live leaderboard | ✅ | `#oc-leaderboard` is fully wired: `bindOcSubNav()` (`src/modules/event-binders.js` ~L461-490) toggles the panel and lazy-imports `updateLiveLeaderboard()` from `card-render.js` (L12-51), which computes Stableford totals from `AppState.liveRoundGroups`, sorts, and renders the table. Also re-invoked on every score change via the `liveRoundGroups` `stateChange` listener in `ui.js` (~L733-734). |
| Playing partners / group | ✅ | `liveRoundGroups` in `AppState` is populated by `bindAddPlayer()` (`event-binders.js` L4-25) and `bindCompQuickAdd()` (L27-90), rendered by `renderOcPlayersList()` (`ui.js` L595-632), and kept in sync via the `stateChange` listener. Full add → state → render loop confirmed. |
| Full-screen round mode | ✅ | `body.round-active` CSS pattern |
| Finish round + review modal | ✅ | `#oc-finish-modal` confirmed |
| Shot history view | ✅ | Tested in live_audit.spec.js |
| Save as WHS round | ✅ | Tested in live_audit.spec.js |
| Detailed score editor | ✅ | `#btn-oc-edit-review` → `bindReviewActions()` (`oncourse.js` L406-411, called at L40) → `openDetailedReview()` (L457-463) → `renderDetailedReview()` (`card-render.js` L53+) populates `#oc-detailed-tbody`; per-hole edits open `#oc-hole-editor-modal` and on save call `renderDetailedReview()` again to refresh. Fully wired end-to-end. |
| Custom competition scoring | ✅ | See section 8 — `competitions.js` implements full custom rules (`generateDynamicLogInputs`, dynamic scoring config) and a working leaderboard (`renderCompLeaderboard`, L213-295). Data model + UI both confirmed complete. (Note: the one broken sub-piece, "Invite players," is reported separately under section 8.) |

---

## 4. GPS Feature
| Feature | Status | Notes |
|---|---|---|
| GPS yardage to green | ✅ | Feature-map note "reverted to middle only" is **outdated**. `updateGPSDistances()` (`oncourse.js` L605-666) computes and renders **front, middle, and back** distances via the Haversine formula, prioritizing surveyed data over static course data. Markup in `index.html` (~L462-487) confirms all three distance readouts exist with high-contrast styling. |
| High-contrast GPS UI | ✅ | Implemented and matches the descriptions in `CHANGELOG.md` and `README.md` (high-contrast styling on the distance widget for outdoor/sunlight readability). The feature map's citation of `AI_ARCHITECTURE.md` was incorrect — that document does not mention GPS at all; the correct sources are `CHANGELOG.md`/`README.md`. |
| Accuracy / calibration | 🔴 | Confirmed still an open issue. `src/surveyor.js` implements an entire "Surveyor Mode" (`toggleSurveyor`/`startSurveyor`/`stopSurveyor`/`updateSurveyorUI`) whose explicit purpose is to let users manually capture ground-truth coordinates as a workaround for known GPS coordinate inaccuracy — i.e., the existence of this feature is itself evidence the underlying accuracy problem is unresolved. |

---

## 5. Practice Tracking
| Feature | Status | Notes |
|---|---|---|
| Practice plan generation (AI) | 🔴 | **Broken end-to-end.** The Cloud Function `generatePracticePlan` (`functions/index.js` L229-356) correctly reads/writes `users/{uid}/practice_plans/active`, but the frontend in `src/ui.js` (`bindPracticeCaddyUI()`, L750-944) queries the **wrong, stale root-level path** `practice_plans` (L825, L894, L929 — see DATA-02 below) and expects a **mismatched data shape**: the function returns `{source, drillId, steps:[strings], category, targetMetric, completedSteps:[booleans]}` while the UI code reads `data.id`/`data.title`/`data.description`/object-shaped `steps`/index-array `completedSteps`. Neither the path nor the shape line up — this cannot work as written. |
| Practice plan display (active state) | 🔴 | `showActiveDrill()` (`ui.js` ~L750+) reads `data.title`, `data.description`, `data.id` — none of which exist in the function's response (`drillId`/`category`/`targetMetric` instead). Additionally the DOM IDs referenced in JS (`active-drill-title`, `active-drill-desc`, `practice-gen-error`, `btn-archive-drill`) do not match the IDs actually present in `index.html` (`practice-category-badge`, `practice-target-metric`, `practice-generate-error`, `btn-reset-practice`, `practice-rating-section`). The "CSS cascade fix" mentioned in the prior note does not address these deeper ID/shape mismatches — the active-state UI cannot render correctly. |
| Practice plan display (empty state) | ⚠️ | The `isGeneratingPlan` guard itself is present and the empty/loading/active container-toggle mechanism (`setPracticeState()`) works mechanically, but it sits on top of the broken plumbing above — so in practice the empty state is what users will see (the active state can never successfully populate). Also flagged as STATE-01/02 debt: `setPracticeState()` directly manipulates DOM classes with no `AppState.practiceState` backing it. |
| Practice round scoring | ✅ | `initPractice()` (`src/practice.js` L119-285) wires drill selection, a dynamic logging form, and writes completed sessions to the **root-level** `/practice_rounds` collection (this is the correct, intended path for this collection — see DATA-03 resolution below, distinct from the AI-plan path bug above). |
| Putting games | ✅ | Confirmed present in `DRILL_TEMPLATES` (`practice.js` L15-117), which includes putting-game templates selectable and scoreable through the same logging flow as other drills. |
| Practice stats tracking | ✅ | `renderPracticeDashboard()` (`practice.js` L379-440) computes and renders personal stats from `/practice_rounds`; `renderRecentPractice()` renders recent session history. Both confirmed wired to `listenToPractice()`. |
| 9-box grid drill | 🚫 | Not started — no references found anywhere in `DRILL_TEMPLATES`, UI markup, or JS. |

---

## 6. AI Features
| Feature | Status | Notes |
|---|---|---|
| AI practice plan generation | 🔴 | Same finding as section 5 — Cloud Function (`generatePracticePlan`) is correctly implemented and uses the correct Firestore path, but the **frontend integration is broken**: wrong path, mismatched response shape, mismatched DOM IDs. This is not "mid-build," it is non-functional as currently wired. |
| AI rules caddie | ✅ | Confirmed **separate** from the practice-plan AI, per the owner's note. It is its own Cloud Function, `processRulesQuery` (`functions/index.js` L48-68, returns `{answer: ...}`), invoked via `queryRulesAI()` (`oncourse.js` L754-763) from the on-course voice-query UI (`processVoiceQuery()` + speech-recognition setup). Fully wired and functionally independent of `generatePracticePlan`. |
| AI coaching suggestions | ✅ | Implemented via the `askAiCoach` Cloud Function and `generateAIResponse(uid, role)` (`src/ai.js` L144-253), which assembles round/practice/shot history, calls the function, and renders Markdown-formatted analysis (`markdownToHtml()`). Used both for player self-analysis and for coach-side lesson-plan generation (see section 7). |
| API key security | ✅ | Keys in Cloud Functions only, never client-side |

---

## 7. Coaching
| Feature | Status | Notes |
|---|---|---|
| Coach assignment to player | ✅ | `coachUid` in Firestore |
| Coach notes per player | ✅ | `/users/{uid}/coachNotes` collection |
| Coach data access (rules) | ✅ | `isCoachOf()` helper in firestore.rules |
| Coach tab UI | ✅ | `bindCoachTools()`/`bindCoachDashboard()` (`src/coach.js`, full file 307 lines) implement `loadMyCoaches()`, `loadCoachRoster()`, `loadCoachPlayerView()`, and `loadCoachNotes()` — roster, athlete drill-down, trend analysis (recent `whs_rounds` query), and notes are all wired to live Firestore data and render into `#tab-coach` markup (`index.html` ~L1844-1903). |
| Data sharing with coach | ✅ | Player-side `initCoachSelection()` (`practice.js` L473-521) lets a player set their own `coachUid`; coach-side access is gated by `isCoachOf()` in `firestore.rules`, and `loadCoachPlayerView()`/`loadCoachNotes()` in `coach.js` consume that access to show shared round/practice/notes data. End-to-end sharing loop confirmed working. *(Exception: the "Assign Drill" sub-feature inside the coach dashboard is broken — see Audit Findings.)* |

---

## 8. Competitions
| Feature | Status | Notes |
|---|---|---|
| Create a competition | ✅ | `bindCompetitionCreation()` (`competitions.js` L352-505) builds the full creation payload (name, rules, visibility, scoring config) and writes to `/competitions`. Confirmed working. |
| Invite players | 🔴 | **Broken / dead UI.** `index.html` (~L1455-1463) contains `#comp-invite-container`/`#comp-invite-list` markup, but no JS anywhere binds, populates, or reads from these elements. Critically, the competition-creation payload built in `bindCompetitionCreation()` (L450-472) **never includes an `invitedUIDs` field** — yet `listenToCompetitions()` (L28-87) queries competitions with `where("invitedUIDs", "array-contains", uid)`. The field is queried but never written; a user can never be invited to a competition through the UI as it stands today. |
| Custom scoring rules | ✅ | `generateDynamicLogInputs()` and the surrounding scoring-config code in `competitions.js` build a complete custom-rules data model and matching dynamic logging form. Confirmed implemented and wired to `/competitions` documents. |
| Competition leaderboard | ✅ | `listenToCompRounds()` (L194+) queries `/comp_rounds`, and `renderCompLeaderboard()` (L213-295) performs full score aggregation, sorting, and rendering, with `bindLeaderboardSortHandlers()` wiring sort-order toggles. Confirmed complete. |
| Public/private visibility | ✅ | `visibility` field is written at competition-creation time (L454, sourced from a radio input `comp-visibility`) and enforced in `firestore.rules` (L101-105: public/owner/invited/admin read access). Confirmed working — note this is a **distinct, working** implementation of `visibility` from the broken assumption discussed for `whs_rounds` in the Audit Findings. |

---

## 9. Tempo Feature
| Feature | Status | Notes |
|---|---|---|
| Tempo audio playback | ✅ | `src/tempo.js` (150 lines) is a fully self-contained Web Audio implementation: `buildTone()`/`buildTick()` synthesize oscillator-based tones, `generateAudioTrack()` assembles a track via `OfflineAudioContext`, `audioBufferToWav()` exports it, and `togglePlay()`/`syncVisuals()` drive playback and the on-screen metronome visuals. The `/tempo` Firestore collection referenced in the original feature-map note is **not used** by this feature at all (see Audit Findings — it is dead/unused in the rules). |
| Tempo settings | ⚠️ | The settings UI (tempo BPM, ratio, vibe selectors) works correctly within a session and feeds `generateAudioTrack()`, but **nothing persists the chosen settings** — no `localStorage` write and no Firestore write exists in `tempo.js`. Settings reset to defaults on every reload. |
| Tour Tempo-style variants | ✅ | Confirmed referenced and implemented — the backswing:downswing ratio presets (e.g. 3:1) that define "Tour Tempo"-style variants are built into the tone/track generation logic and selectable via the UI. |

---

## 10. Feed / Social
| Feature | Status | Notes |
|---|---|---|
| Activity feed | 🔴 | **Broken by a security-rules mismatch.** `loadFeed()` (`src/social.js` L117-177) queries `collection(db, 'whs_rounds')` with `where('uid', 'in', uidsChunk)` for the UIDs of followed players. But `firestore.rules` (L63-70) only grants read access on a `whs_rounds` document to its owner, that owner's coach, an admin, or — as a fallback — documents where `resource.data.visibility == "public"`. **No code anywhere writes a `visibility` field on `whs_rounds` documents** (confirmed by inspecting every `addDoc`/`setDoc` call against `whs_rounds` in `whs.js` L370-384, `oncourse.js` L1085-1107, and `admin.js` L311/394 — none set `visibility`). The rules comment itself even says `// Fallback for social if implemented`, confirming this was a stub that was never wired up. Because Firestore evaluates security rules per-document for an `in` query, the very first followed user whose round isn't the viewer's own (and isn't a round the viewer coaches) will cause the **entire query to fail with `permission-denied`** — the feed cannot load for any user who follows someone other than their own coached athletes. |
| Following system | ✅ | `followPlayer()`/`unfollowPlayer()`/`loadFollowing()` (`social.js`) correctly read/write `users/{uid}/following/{followedId}`, exactly matching the `firestore.rules` permission at L135-137 (`request.auth.uid == userId || isAdmin()`). The follow/unfollow mechanics themselves work fully — this is a genuinely separate, working piece from the broken feed query above. |
| Feed UI | ⚠️ | `#tab-feed` markup exists, the tab button is found and wired (`app-v4.js` L66-71 calls `initSocialFeed()` on tab activation), and `initSocialFeed()` (`social.js` L11+) sets up the follow/unfollow UI correctly. However, the actual feed-content portion of this UI is fed by the broken `loadFeed()` query above, so in practice users seeing this tab will only ever see an "Error loading activity feed" state (caught exception) rather than any content — the UI shell works, the data it's meant to display cannot load. |

---

## 11. PWA / Technical Infrastructure
| Feature | Status | Notes |
|---|---|---|
| Service worker | ✅ | Cache purging + version management |
| Offline-first (LocalStorage) | ✅ | Confirmed in architecture |
| Safe area support | ✅ | CSS env() variables |
| Splash screens | ✅ | PWA manifest |
| Firebase Hosting | ✅ | Auto-deploy via GitHub Actions (currently disabled) |
| CI/CD pipeline | ⚠️ | Disabled (manual trigger only) — intentional |
| Vite build | ✅ | Code splitting + minification |

---

## Resolved Debt-Catalogue Questions

### DATA-02 — "Path migration from March 2026 may be incomplete"
**Status: Confirmed STILL APPLIES.** A workspace search for `practice_plans` not preceded by `users/` turned up exactly **3 live references**, all in `src/ui.js`, all inside `bindPracticeCaddyUI()`:
- **`src/ui.js:825`** — `loadActivePlan()` queries the root-level `practice_plans` collection directly, instead of `users/{uid}/practice_plans/active`.
- **`src/ui.js:894`** — the drill-step checkbox handler writes back to the same wrong root-level path.
- **`src/ui.js:929`** — the archive-drill handler also targets the wrong root-level path (and additionally looks for a non-existent `#btn-archive-drill` element — see Audit Findings).

The Cloud Function side (`functions/index.js` `generatePracticePlan`, L229-356) was **already migrated correctly** — its quota guard and writes target `users/{uid}/practice_plans/active`. The migration is one-sided: the backend was fixed, the frontend (`ui.js`) was not. This is the root cause of the "AI practice plan" being broken end-to-end (see sections 5 & 6).

### DATA-03 — "`/practice_rounds` vs `/users/{uid}/practice_plans` ambiguity"
**Status: Resolved — these serve genuinely different purposes and should both be kept:**
- **`/practice_rounds`** (root collection): a **historical log of completed practice sessions** that the player has manually scored — created by `initPractice()` in `src/practice.js` whenever a user logs a drill/putting-game session. Powers `renderPracticeDashboard()`/`renderRecentPractice()` personal stats. This collection is **working correctly** and is the right design — no path bug here.
- **`users/{uid}/practice_plans/active`** (per-user subcollection document): a **single AI-generated personalized drill recommendation** with its own completion-tracking state (`completedSteps`), produced on demand by the `generatePracticePlan` Cloud Function and meant to be displayed/interacted with in the "active drill" UI. This is the document the broken `bindPracticeCaddyUI()` code is trying (and failing) to read/write.

In short: `/practice_rounds` = "what did I do and how did I score," `users/{uid}/practice_plans/active` = "what should I do next, as recommended by AI." They are not duplicates and the data model is sound; only the frontend wiring to the second one is broken (DATA-02).

---

## Audit Findings

Issues found during this audit that are not simply ❓/⚠️ resolutions — broken wiring, dead code, missing handlers, and security-rules gaps that warrant follow-up:

1. **AI Practice Plan feature is non-functional end-to-end** (🔴, sections 5 & 6, DATA-02). Wrong Firestore path, mismatched response shape (`drillId`/`category`/`targetMetric`/string-array `steps`/boolean-array `completedSteps` from the function vs. `id`/`title`/`description`/object `steps`/index-array `completedSteps` expected by the UI), and mismatched DOM IDs (`active-drill-title`/`active-drill-desc`/`practice-gen-error`/`btn-archive-drill` referenced in `ui.js` vs. `practice-category-badge`/`practice-target-metric`/`practice-generate-error`/`btn-reset-practice`/`practice-rating-section` actually present in `index.html`). This looks like the incomplete "rogue agent" migration referenced in ARCH-01 — the backend was updated, the frontend wasn't.

2. **Activity Feed cannot load for any realistic "following" scenario** (🔴, section 10). `loadFeed()` queries `whs_rounds` cross-user, but `firestore.rules` never grants read access via a "following" relationship — only via owner/coach/admin/`visibility == "public"`, and **no code ever sets `visibility` on a `whs_rounds` document**. The rules' own inline comment (`// Fallback for social if implemented`) confirms this was always a stub. Firestore's per-document rule evaluation on `in` queries means a single disallowed document fails the whole query with `permission-denied`. Either (a) add a `visibility` field to `whs_rounds` writes and a UI to set it, or (b) add a rule clause granting read access when `request.auth.uid in resource.data.<ownerUid>'s followers` (requires a denormalized followers list, since rules can't read arbitrary subcollections cheaply), or (c) move feed data to a write-time fan-out into the already-defined-but-unused `/feed` collection.

3. **"Invite players" competition feature is dead UI** (🔴, section 8). `#comp-invite-container`/`#comp-invite-list` markup exists in `index.html` with no JS binding anywhere, and the competition-creation payload never sets `invitedUIDs` even though `listenToCompetitions()` queries on it. Net effect: the `invitedUIDs array-contains` branch of both the query and the `firestore.rules` read permission (L101-105) can never be satisfied through the UI — invitations are entirely unreachable.

4. **Coach "Assign Drill" writes to a path with no security rule** (🔴, section 7 sub-issue). The `btnAssign` handler in `bindCoachDashboard()` (`coach.js` L128-151) writes to `users/{uid}/assignedDrills`, but `firestore.rules` has **no `match` block for `assignedDrills`** — every write will be rejected with `permission-denied`. Either add a rule (e.g., allow the assigned coach to write, the player to read/update their own `completed` status) or remove the dead feature.

5. **Dead/unreachable code in `src/ui.js`'s `stateChange` listener.** The `case 'handicapIndex':` branch contains code placed *after* its own `break` statement, making part of it unreachable — likely a half-finished edit that was never cleaned up.

6. **`/tempo` and `/feed` Firestore collections are defined in `firestore.rules` with broad `allow read, write: if isAuthenticated()` permissions but are never referenced by any frontend code.** `tempo.js` is fully self-contained (Web Audio synthesis, no Firestore I/O) and `feed` is unused (the activity feed is built by querying `whs_rounds` directly, per finding #2). These are not actively harmful, but they are an unnecessary write-open surface for any authenticated user — worth either wiring them up to the features they were clearly meant for, or removing the rules until they are.

7. **`src/coach.js.tmp` is a stray temp/backup file** containing a duplicate/older copy of coaching code. Should be deleted — it serves no runtime purpose and risks confusing future edits (someone editing the `.tmp` copy by mistake).

8. **Tempo "Snap" vibe option has no matching case in `buildTone()`.** The UI offers a "Snap" tone-vibe option, but `buildTone()` in `tempo.js` has no `case` for it, so selecting "Snap" silently falls through to the default oscillator tone rather than producing a distinct sound. Minor, but a real UI/behavior mismatch a user could notice.

9. **Numerous stale duplicate HTML files at the repo root** (`old_index.html`, `old_index_utf8.html`, `index_fixed.html`, `index_final.html`, `index_audit.html`, `index_head_15.html`, `index_97e89b5.html`, `tree_output.txt`, etc.) all contain copies of the same `#btn-oc-edit-review` markup and other duplicated UI blocks. These appear to be artifacts from the "rogue agent" session (ARCH-01) or manual debugging snapshots. They are not part of the Vite build (the real entry is `index.html` / `dist/`), but they bloat the repo and could mislead future audits or searches into reading stale code. Worth a cleanup pass to confirm nothing references them and then removing them.
