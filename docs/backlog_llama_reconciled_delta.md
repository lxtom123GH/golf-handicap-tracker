# Llama Lens — Reconciled Backlog (Adversarial Cross-Examination, Round 1)
*Synthesis of `backlog_llama4.md` (Exhibit Alpha / Jules) and `backlog_llama_claudeCLI.md` (Exhibit Bravo / Claude CLI), verified against the live source tree on `main`.*

## I. Peer Review Assessment

| Exhibit | Line-level precision | False positives | Verdict |
|---|---|---|---|
| **Alpha (llama4)** | High — every cited file/line/symbol exists exactly as described (`ai.js:70-75`, `tempo.js:122`, `bindPracticeCaddyUI` in `ui.js:806`, etc.) | Low — one finding (event-listener "leaks" in `card-render.js`/`coach.js`) is real-pattern-but-overstated; everything else cross-checks clean | **Superior.** Its Firestore-rules catch (#3) is the single sharpest finding across both exhibits — a genuine path-mismatch bug, not a style nit |
| **Bravo (llama_claudeCLI)** | Mixed — entries #4/#5 are precise and verified; entries #1–#3 cite real line numbers (`state.js:38-53`, `persistence.js:94-103`) but draw a conclusion the surrounding code directly contradicts | High on the "resume mid-round" cluster — three of five entries (60%) describe a feature gap that **does not exist**; the feature is already fully implemented | Strong on the two items it got right, but the hallucinated cluster would have sent an engineer to re-build existing infrastructure |

**Bottom line:** Alpha wins on precision and avoided the worst failure mode (recommending work that's already done). Bravo's surviving entries (#4, #5) are genuinely useful and cover ground Alpha never looked at (cache-staleness / `fromCache` handling), so they are folded into the reconciled ledger below — but its "resume mid-round" trilogy (#1–#3) is discarded as fabricated.

### The Hallucination Check

**Bravo #1 (`state.js:38-53` — "Only `playerClubs` is mirrored to localStorage; ~30 keys are memory-only")** — **HALLUCINATED.** `persistence.js:11-25` defines a `PERSIST_FIELDS` allow-list of 13 round-state keys (`currentTrackingMode`, `currentRoundHoles`, `currentRoundCourseName`, `currentCoursePars`, `liveRoundGroups`, `currentHole`, `currentShotData`, `currentLiveCompId`, `currentLiveCompRules`, `currentHoleShots`, `activeRoundId`, `currentRoundDate`, `myBag`), each mirrored to `localStorage` via `saveRoundState()`/`loadRoundState()`/`clearRoundState()`. The model appears to have read only the `playerClubs` parsing block at `state.js:38-53` and never opened `persistence.js` in full (despite citing it by name in entry #2).

**Bravo #2 (`persistence.js:94-103` — "`round-active` class set with no companion persistence write")** — **HALLUCINATED.** `persistence.js:119-133` registers a global `window.addEventListener('stateChange', …)` that auto-calls `saveRoundState()` (or `clearRoundState()` when `activeRoundId` clears) on every change to a `PERSIST_FIELDS` key. The "companion write" the entry says is missing exists and is wired to the exact field (`activeRoundId`) the entry discusses.

**Bravo #3 ("No file owns a hydrate-from-storage step before Firestore listeners attach")** — **HALLUCINATED**, and inverted. `persistence.js:87-92` exports `initializeAppRouting()`, which calls `loadRoundState()` (the hydrate step) and is invoked at `app-v4.js:47` — *before* `listenToWHSRounds()` at `app-v4.js:50`. The exact sequencing the entry recommends building is already the boot order.

**Bravo #4 (`whs.js:148-156`, `practice.js:360-372`)** — **partially valid.** The `onSnapshot` call sites are real and never inspect `snapshot.metadata.fromCache` (zero hits for `fromCache` repo-wide). However, half the prescribed remediation — "confirm/enable Firestore's offline persistence in `firebase-config.js`" — is already shipped: `firebase-config.js:31` configures `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`. Only the `fromCache`-awareness half of this entry survives review.

**Bravo #5 (`social.js:23-31`)** — **valid, precise.** `allUsersCache` is populated exactly once via `getDocs(collection(db, 'users'))` (line 24) and never invalidated; `social.js` has zero `online`/`offline`/`stateChange` listeners. Confirmed as described.

**Alpha #1–#4** — **all four cross-check clean.** Every cited file, symbol, and line range exists (`ai.js:70-75` style-display block, `auth-v2.js` show/hide + `.classList.toggle('hidden', …)`, `event-binders.js:480/483`, `oncourse.js:442-504` FIR/GIR `classList.toggle`, `tempo.js:122/135` display toggling, `tempo.js:122` literal `void UI.tempoRing.offsetWidth`, `ui.js:806` `bindPracticeCaddyUI` querying `practice_plans`). None of these read as boilerplate misclassified as a violation — they are the patterns described.

One nuance downgrades (but does not invalidate) Alpha #2: `card-render.js`/`coach.js` rebuild their DOM via `innerHTML = ''` resets before re-attaching `addEventListener` to freshly created nodes (`card-render.js:15,55,93,143`). Detached nodes and their listeners are GC'd together, so this is not an active leak — it's a repo-wide convention (zero `removeEventListener` calls exist anywhere in `src/`), making it a stylistic/defensive-coding suggestion rather than a "Sydney Protocol"-grade violation. Downgraded to low priority below.

### The Blindspot Report

**Valid violations Alpha caught that Bravo missed** (Bravo's lens never touched UI/DOM/security-rules code):
- The `practice_plans` Firestore rules path mismatch (Alpha #3) — a genuine root-vs-subcollection bug that throws `FirebaseError: No matching allow statements` at runtime.
- The forced synchronous reflow via `void UI.tempoRing.offsetWidth` in `tempo.js:122` (Alpha #4).
- The `.style.display` / `.classList.toggle` DOM-state sprawl across five modules (Alpha #1).

**Valid violations Bravo caught that Alpha missed** (Alpha's lens never touched sync/cache code):
- Stale `allUsersCache` in `social.js` with no reconnect-aware invalidation (Bravo #5).
- `onSnapshot` handlers in `whs.js`/`practice.js` ignoring `snapshot.metadata.fromCache`, so the UI can't distinguish "live" data from "last known cached" data (the surviving half of Bravo #4).

---

## II. The Reconciled Master Llama Backlog

### 1. Firestore security-rules / collection-path mismatch on practice plans (Highest priority — runtime error, not style)
**Target:** `firestore.rules:44` (rule nested under `match /users/{userId} { … match /practice_plans/{planId} }`) vs. `src/ui.js:806-825` (`bindPracticeCaddyUI` → `loadActivePlan`)
**Violation:**
```js
// ui.js:821 — queries the ROOT-level collection
const q = query(
    collection(db, "practice_plans"),
    where("userId", "==", AppState.currentUser.uid),
    where("status", "==", "active")
);
```
but the only matching security rule lives at a subcollection path (`/users/{userId}/practice_plans/{planId}`), so Firestore has no `allow` statement covering `/practice_plans/{planId}` at the root and throws `FirebaseError: No matching allow statements` (matches the emulator log Alpha observed).
**Remediation Plan:** Pick one canonical location and align both sides (~30 lines, single chunk): either (a) add a root-level `match /practice_plans/{planId} { allow read, write: if isAuthenticated() && (request.auth.uid == resource.data.userId || isAdmin()); }` block to `firestore.rules`, or (b) change `loadActivePlan`/the archive path in `ui.js` to query `collection(db, "users", uid, "practice_plans")` and drop the `where("userId", …)` filter. Given the code already stores a `userId` field on each doc and queries by it, option (a) is the smaller, lower-risk chunk.

### 2. Forced synchronous reflow in tempo animation loop
**Target:** `src/tempo.js:122`
**Violation:**
```js
UI.tempoRing.style.display = 'block'; UI.tempoRing.style.animation = "none"; void UI.tempoRing.offsetWidth;
```
**Remediation Plan:** Replace the `offsetWidth` read-for-side-effect with a `requestAnimationFrame` double-rAF or a dual-class swap (`ring--reset` → `ring--expand` on the next frame) so the animation restart no longer forces a synchronous layout flush on the main thread (~25 lines, isolated to the two call sites at `tempo.js:122` and `:135`).

### 3. Stale `allUsersCache` with no connectivity-aware refresh
**Target:** `src/social.js:23-31`
**Violation:**
```js
if (!AppState.allUsersCache) {
    const snap = await getDocs(collection(db, 'users'));
    AppState.allUsersCache = [];
    snap.forEach(d => AppState.allUsersCache.push({ uid: d.id, ...d.data() }));
}
```
The cache is populated exactly once per session and never invalidated; new/changed user docs are invisible until a hard reload.
**Remediation Plan:** Add a `window.addEventListener('online', () => { AppState.allUsersCache = null; })` (and/or hook the existing `stateChange` bus from `persistence.js:119`) to null out `allUsersCache` on reconnect, forcing the next search to re-fetch (~20 lines, single chunk in `social.js`).

### 4. `onSnapshot` listeners ignore cache-vs-server provenance
**Target:** `src/whs.js:148-156`, `src/practice.js:360-372`
**Violation:**
```js
unsubscribeWHS = onSnapshot(q, async (snapshot) => { /* … populates AppState.currentRounds directly … */ });
unsubscribePractice = onSnapshot(q, (snapshot) => { /* … populates AppState.currentPracticeRounds directly … */ });
```
Neither handler reads `snapshot.metadata.fromCache`, so the UI cannot tell the user "you're viewing cached data" while offline — even though `firebase-config.js:31` already enables `persistentLocalCache`, so cached snapshots *do* arrive; they're just silently indistinguishable from live ones.
**Remediation Plan:** In both handlers, branch on `snapshot.metadata.fromCache` to set a lightweight `AppState.dataIsStale` flag (or toggle a small "offline — showing cached data" banner via the existing `stateChange` bus) (~30 lines total across both files, one chunk per file).

### 5. DOM-state sprawl via direct `style.display` / `classList.toggle` calls
**Target:** `src/ai.js:70-75`, `src/auth-v2.js:26-27,43-44,108,154-156,202-204`, `src/modules/event-binders.js:480,483`, `src/oncourse.js:442-504,847,919,1658`, `src/tempo.js:122,135`
**Violation (representative sample):**
```js
// ai.js:71-75
if (btnAiCoach) btnAiCoach.style.display = 'none';
const btnAskAi = document.getElementById('btn-ask-ai');
if (btnAskAi) btnAskAi.style.display = 'none';
const btnCoachAiPlan = document.getElementById('btn-coach-ai-plan');
if (btnCoachAiPlan) btnCoachAiPlan.style.display = 'none';
```
Five modules independently flip visibility/active-state via inline styles or ad-hoc class toggles, making "what's currently visible" untraceable from any single source of truth.
**Remediation Plan:** Migrate incrementally, one module per chunk (≤100 lines each), to a `data-state`/`body[data-active-tab]` attribute convention driven by `AppState`'s existing `stateChange` event — start with `tempo.js` (smallest surface, 2 call sites) to validate the pattern, then `ai.js`, then `event-binders.js`/`oncourse.js`/`auth-v2.js` in subsequent PRs.

### 6. (Low priority / stylistic) No explicit listener teardown convention
**Target:** `src/modules/card-render.js:86,159`, `src/coach.js:223,229,237`
**Violation:** Re-render functions (`renderDetailedReview`, `renderHoleJumper`, `loadCoachRoster`) clear containers via `innerHTML = ''` and re-`addEventListener` on freshly created nodes each pass; the codebase contains **zero** `removeEventListener` calls anywhere in `src/`.
**Remediation Plan:** Not an active leak — detached nodes and their listeners are garbage-collected together, so this is a defensive-coding nicety rather than a bug. If pursued, switch to event-delegation on the stable parent container (one `addEventListener` per container instead of per-row) in `card-render.js` first (~40 lines), which both removes the rebind churn and sidesteps the GC question entirely. Treat as backlog filler, not a priority item.

## Sequencing
1 (runtime-breaking bug) → 5 → 2 → 4 → 3 → 6
