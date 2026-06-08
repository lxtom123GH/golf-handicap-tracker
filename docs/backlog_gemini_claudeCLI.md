# Backlog — Gemini Lens (claudeCLI)
*Firebase integration / payload-schema focus. Each fix sized to fit a ≤100-line PR chunk.*

| # | Target | Violation | Impact | Fix (chunk) |
|---|---|---|---|---|
| 1 | `whs.js:148-156` | `onSnapshot` re-subscribes on every `viewingPlayerId` change; no stored `unsubscribe` handle | Listener stacking risk when switching viewed players repeatedly | Store the `unsubscribe` returned by `onSnapshot`, call it before re-querying (~15 lines) |
| 2 | `practice.js:360-372` | `docSnap.data()` spread directly into `AppState.currentPracticeRounds` with no shape check | Malformed/partial documents flow straight into templates (`practice.js:466`) — schema errors surface as render bugs | Add `normalizeRoundDoc(docSnap)` validating `drillId`/`score`/`uid` before it reaches state (~30 lines) |
| 3 | `social.js:23-31` | `allUsersCache` hand-assembled via `forEach`/`push`, bypassing the `AppState` proxy and assuming `uid`-shaped docs | Cache invisible to `stateChange` subscribers (compounds o1 Lens reactivity-gap finding); unguarded shape assumption | Route through the `mutateList`/reassignment helper (o1 backlog #1) and the `normalizeUserDoc` validator (~25 lines, depends on #2's sibling helper) |
| 4 | `admin.js:24,55,155` | Firestore field values interpolated directly into `innerHTML` template strings | No escaping layer visible — a user-controlled display name/email could break or inject markup | Switch to `textContent`/DOM node construction for any field sourced from user-writable documents (~35 lines) |
| 5 | `app-v4.js:369-386` | Coach/student roster `forEach` writes into `AppState.profileUsersMap` via direct property assignment | Another cache assembled outside the documented mutation contract | Normalize alongside #3 once the validator/helper pair exists (~15 lines) |

## Sequencing
1 (isolated) → 2 → 3 → 5 (2/3/5 share one normalizer pair — land together) → 4 (independent, can run in parallel)
