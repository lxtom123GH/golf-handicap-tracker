# Post-Implementation Review (PIR) Log

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
