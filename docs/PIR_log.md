# Post-Implementation Review (PIR) Log

## [2026-03-06] PIR: AST Parser Crash (-32099) & State Lock
**Symptoms:** 
1. Antigravity Language Server repeatedly crashed with `Code -32099: Cannot call write after a stream was destroyed`.
2. Start Round UI toggles (9/18 Holes, Tees) visually clicked but failed to bind to `AppState`.
3. Large "Omnibus" AI prompts resulted in malformed text edits and OOM crashes.
Root Causes:

Fatal Syntax 1: Unescaped < symbol in index.html (Wait for high accuracy (< 5.0m)).

Fatal Syntax 2: Duplicate function declaration of bindPracticeCaddyUI in src/ui.js.

Ghost State: AppState proxy retained stale selectedHoles data from previous sessions, preventing new UI clicks from registering.

Cognitive Overload: Asking the AI to rewrite 4 files simultaneously broke the file-writer stream.

Resolutions Applied (v7.4.2-alpha):

Sanitisation: Manual character escape (&lt;) and amputation of duplicate functions via Cursor bypass.

The Clean Slate Purge: Injected AppState.selectedHoles = null; AppState.selectedTee = null; into the MapsTo('view-home') routing function to guarantee a factory reset on every dashboard visit.

Safe-Boot: Wrapped initial getDocs() calls in a 3000ms Promise.race() offline-fallback wrapper (fetchWithTimeout) to prevent network hanging.

Chunking Protocol: Adopted micro-deployments (One Feature, One Prompt) to prevent AI buffer exhaustion.

Date: 2026-03-06
Symptom: Agent hangs on "Retrieved Console Logs" after a Malformed Edit.
Ghost: The edit corrupted the syntax of surveyor.js, preventing the UI from loading for Playwright.
Silver Bullet: Perform a git checkout to clear the buffer and skip Playwright for one cycle to restore the build.
Ward: Verify bracket nesting manually in the Recon phase before applying high-logic edits.

Date: 2026-03-06
Symptom: Silent 80m Failure
Ghost: Naming collisions (acc vs accuracy) inside midpoint calculations and distance checks caused silent logic termination.
Silver Bullet: Implement debug `alert()` calls around critical distance logic to confirm execution flow.
Ward: Use explicit property names and avoiding shadowing globally scoped variables.

Date: 2026-03-06
Symptom: Stale 1611m display (UI not updating)
Ghost: `updateGPSDistances()` called before local `AppState` was fully synchronized with the new coordinate payload.
Silver Bullet: Force local state update (direct AppState overwrite) before distance re-calculation.
Ward: Always sync local state before calling state-dependent UI refresh functions.

Date: 2026-03-06
Symptom: Self-Comparison Bug (0.8m)
Ghost: Local variables were being updated with new GPS coordinates *before* the distance check, causing the logic to compare the current location against itself.
Silver Bullet: Implement "Atomic Capture" — retrieve `existingData` from state at the absolute start of the function, before any new reading is processed.
Ward: Keep inputs and existing state strictly separated until comparison logic is finalized.

Date: 2026-03-06
Symptom: Siloed State (UI not updating across tabs)
Ghost: Reactivity was limited to the module that initiated the save. Stale data remained in other components/tabs.
Silver Bullet: Transition from direct function calls to a `CustomEvent` architecture (`holeUpdate`). Dispatch globally to ensure all listeners (Main Hub, Stats, etc.) refresh simultaneously.
Ward: Prefer event-driven communication for global UI state synchronization.

Date: 2026-03-06
Symptom: Accidental Pin Capture (Data Loss Risk)
Ghost: High-accuracy pinning is destructive by default; overwriting previous coordinates without an easy recovery path leads to user friction on-course.
Silver Bullet: Implement a "History Array" strategy (`pinHistory`). Store the last 5 captures in a rolling buffer within Firestore.
Ward: Use `pinHistory` as a permanent audit trail and safety net against accidental overwrites.

Date: 2026-03-06
Symptom: Self-Overwrite (0m Distance Alert)
Ghost: The sanity check was comparing the GPS reading against a local variable that had already been updated with that same reading.
Silver Bullet: Implement `legacyData` decoupling. Clone the existing pin state into a separate object at the very start of the function.
Ward: Never perform logic comparisons against mutable state that changes during the function's lifecycle.

Date: 2026-03-06
Symptom: Deaf Listener / Missing Payload (Stale UI)
Ghost: The `holeUpdate` event was triggering a refresh, but it wasn't passing the actual changed data. The listener was essentially "deaf" to the new coordinates, relying on stale local state for the re-render.
Silver Bullet: Implement "Payload Injection." Include the full `updatedHole` object in the event detail and ensure the listener overwrites its local state before calling render functions.
Ward: Always pass the updated state object along with the event to ensure atomic synchronization across modules.

Date: 2026-03-06
Symptom: Fractured State / 1609m Display Stuck
Ghost: The UI remained stuck on static coordinates (1609m) because it exclusively relied on event payloads that were sometimes malformed or dropped. The 80m guardrail also bypassed because it check only against non-existent surveyData.
Silver Bullet: Implement "Hard Re-Fetch" — stop trusting payloads and force a fresh Firestore read on every `holeUpdate`. Implement static mapping fallback in the guardrail to ensure sanity checks work even on first capture.
Ward: When state complexity increases, favor re-fetching the absolute ground truth over passing mutable payloads.

Date: 2026-03-11
Symptom: Tier 1 Firebase Restoration & Hardening (Phase 1)
Ghost: Stale Vue/legacy files causing framework leakage and silent state mutations not triggering Proxy events for array changes.
Silver Bullet: Cleared ghost files (`ScoreEntryOverlay.vue`, `app-v4.js`, `coach.js.tmp`) and replaced strict equality `!==` with `JSON.stringify()` serialization in `src/state.js` Proxy `set` trap to ensure array mutations fire stateChange events.
Ward: Run explicit file-deletion commands to halt leakage, and strictly enforce deep-value comparison in state tracking.

Date: 2026-03-11
Symptom: Tier 1 Hardening (Phase 2)
Ghost: Potential null-reference Firestore queries during app boot, lingering old PWA caches blocking updates, and dev audio files polluting production bucket.
Silver Bullet: Injected `if (!AppState.activeRoundId) return;` into `holeUpdate` in `src/oncourse.js`, unified `CACHE_NAME` in `public/sw.js` using a template literal for accurate old cache deletion, and wired `connectStorageEmulator(storage, '127.0.0.1', 9199);` in `src/firebase-config.js`.
Ward: Guard state initialization callbacks carefully, utilize strict template literals for cache tracking, and map all active Firebase services to local emulators defensively.

Date: 2026-03-11
Symptom: Tier 1 Hardening (Phase 3)
Ghost: Permissive Firestore security rules potentially allowing unauthorized data access or mutation across `comp_rounds`, `tempo`, and `feed` collections.
Silver Bullet: Updated `firestore.rules` to strictly scope `comp_rounds` reads to document owners, joined competition participants, or admins. Locked `tempo` read/write access to the `docId` (userId) or `uid` field owner. Locked `feed` collection to allow authenticated reads but strictly limited writes/deletes to the `request.resource.data.uid` or `resource.data.uid` owner.
Ward: Default all security rules to strict owner/admin access unless specific public visibility conditions are explicitly met via `get()` lookups.

Date: 2026-03-11
Symptom: Tier 1 Exit Gate Sign-Off
Ghost: System vulnerability and silent leakage remaining pre-hardening.
Silver Bullet: Successfully completed Phase 1, Phase 2, and Phase 3 of the Tier 1 Hardening block. BL-1.01 through BL-1.07 resolved.
Ward: Architecture baseline is hardened and secured. Ready for next phase feature execution.

## [2026-03-07] PIR: Output Buffer Exhaustion
**[PIR-2026-03-07-01] Output Buffer Exhaustion**
Status: RESOLVED (via Atomic Payload Protocol)
Incident: Persistent truncation of CSS and JS code blocks across multiple turns.
Root Cause: Platform-level token limits and formatting collisions.
Impact: Deployment delay; 7x malformed edits.
Action: Transitioned to Atomic Base64 for all logic writes.
Context: PERSONAL Golf Project.

## Lessons Learned
**[Lesson-01] The Monolithic Ceiling**
Discovery: Single-file updates exceeding ~50 lines of code + 500 words of context consistently trigger "Output Buffer Exhaustion."
SOP Change: > 1. Micro-Modularization: All new features must be built in dedicated sub-files (e.g., ui-gps.js instead of ui.js).
2. Shadow Writing: Write complex logic to .new files first to verify integrity before overwriting "Last Known Good" code.
3. Payload Standard: Base64 is the mandatory transport for logic-heavy modules.
