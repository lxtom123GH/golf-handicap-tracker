# Night 1 — Gemini Lens Audit (claudeCLI)
**Focus:** Firebase ecosystem integration · cloud-function payload schemas

**Mutation Determinism Score:** 47 / 100
**State Coupling:** Medium-High

> Rationale: Firestore listener lifecycles are wired directly into `AppState`
> mutation points with no visible cleanup/unsubscribe contract and no schema
> guard between `docSnap.data()` and the state shape that downstream renderers
> assume.

## Integration Findings

- **`src/whs.js:148-156`** — `onSnapshot(query(... where("uid","==",
  AppState.viewingPlayerId)), …)` re-subscribes every time the viewed player
  changes (`AppState.viewingPlayerId` flips at `auth-v2.js:158,223` and
  `app-v4.js:306`). No stored unsubscribe handle is visible — switching players
  repeatedly risks stacking listeners against the same collection.
- **`src/practice.js:360-372`** — the `onSnapshot` callback resets
  `AppState.currentPracticeRounds = []` then `.push({ id: docSnap.id,
  ...docSnap.data() })` with no shape validation. Any document missing an
  expected field (`drillId`, `score`, `uid`) flows straight into render
  (`practice.js:395,453`) and template strings (`:466`) — a malformed payload
  becomes a rendering bug, not a caught schema error.
- **`src/social.js:23-31`** — `AppState.allUsersCache` is hand-populated via
  `getDocs` + `forEach` + `push`, bypassing the `AppState` proxy's change
  signal entirely (per the o1 Lens reactivity-gap finding) *and* assuming every
  user document has a `uid`-shaped record without a guard.
- **`src/admin.js:16-45,149-161`** — admin reads/writes user and email-allowlist
  collections directly into `innerHTML` templates (`:24,55,155`) — string
  interpolation of Firestore field values into markup without an escaping layer
  visible in this file.
- **`src/app-v4.js:369-386`** — coach/student roster query
  (`where("coaches","array-contains", AppState.currentUser.uid)`) populates
  `AppState.profileUsersMap` via direct property writes inside a `forEach` —
  another cache assembled outside the documented `AppState` mutation contract.

## Recommended Schema Boundary (chunk ≤100 lines)

1. Introduce one `normalizeRoundDoc(docSnap)` / `normalizeUserDoc(docSnap)`
   pair that validates required fields and returns a typed object — call it at
   every `onSnapshot`/`getDocs` boundary (`whs.js:152`, `practice.js:365`,
   `social.js:23`, `app-v4.js:376`) before the result touches `AppState`.
2. Track and call `unsubscribe()` on listener teardown when
   `viewingPlayerId`/`currentUser` changes — prevents the stacking risk in
   `whs.js:148-156`.
