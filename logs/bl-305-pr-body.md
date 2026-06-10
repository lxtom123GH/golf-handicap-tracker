## BL-3.05 — AI Practice Plan: Data Shape + DOM Reconciliation

Two of the three remaining ARCH-01 damage layers. DATA-02 (stale paths) landed earlier in d3befec; the personalisation-input defect is explicitly **out of scope** (TODO marker left at the `generatePlan({})` call site).

### Commit 1 — `fix(practice): BL-3.05 data shape normalisation`
**Verified field map at HEAD** (the backlog table had one stale row):

| Cloud Function returns | UI expected | Status |
|---|---|---|
| `drillId` | `id` | mismatch — adapted |
| `category` | `title` | mismatch — adapted |
| `targetMetric` | `description` | mismatch — adapted |
| `steps` (string array) | `steps` (object array) | mismatch — adapted |
| `completedSteps` (index array) | `completedSteps` (index array) | **already aligned** (commit 293ccc1 — audit row was stale) |

- `normalizePracticePlan(raw)` added to `state.js` alongside `normalizeRoundDoc`/`normalizeUserDoc` (same pure spread-preserving pattern). Cloud Function output untouched.
- **Composition gap fixed:** `users/{uid}/practice_plans/active` carries only `{drillId, status, completedSteps, userRating}` — no drill content. `loadActivePlan` now also fetches `global_drills/{drillId}` (authenticated read allowed by rules) and merges before normalising. Previously the page-reload path handed the renderer a document with no `steps` at all.
- Renderer consumes normalised `{description}` steps; the `goal`/`reps` meta line was removed because no data source ever produces those fields.

### Commit 2 — `fix(practice): BL-3.05 DOM ID reconciliation`
HTML IDs treated as source of truth:

| ui.js referenced (dead) | now references |
|---|---|
| `practice-gen-error` | `practice-generate-error` |
| `btn-archive-drill` | `btn-reset-practice` |
| `active-drill-title` | `practice-category-badge` (fed `category`) |
| `active-drill-desc` | `practice-target-metric` (fed `targetMetric`) |

- Orphaned `practice-rating-section` wired (data supports it: `userRating` field exists, owner write allowed by rules): appears when all steps are checked, stars set the rating and enable submit, submit writes `userRating` + `status: completed` and returns to the empty state.

### Render path trace (verification)
`generatePracticePlan` response → `normalizePracticePlan` → `_activeDrillData` → `showActiveDrill` → `practice-category-badge` / `practice-target-metric` / `practice-steps-list` — every returned field except `source` (informational) now reaches a DOM element. Reload path: `practice_plans/active` + `global_drills/{drillId}` → merge → same pipeline. Checkbox toggles round-trip via `arrayUnion`/`arrayRemove` on the index array.

**Known gaps (logged, not fixed here):**
- Personalisation inputs never sent to the function — every plan is the generic fallback (out of scope, `TODO(BL-3.05)` in code).
- The practice plan never enters `AppState`/`stateChange` — it renders imperatively from a module-level cache (`_activeDrillData`), pre-existing architecture; the brief's idealized `onSnapshot → AppState` stage does not exist at HEAD (`loadActivePlan` uses `getDoc`).

Combined diff: 125 lines across `src/state.js` + `src/ui.js` (budget 150). No changes to `functions/`, `firestore.rules`, or proxy internals.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
