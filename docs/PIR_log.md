# Post-Implementation Review (PIR) Log

Date: 2026-03-06
Symptom: Agent hangs on "Retrieved Console Logs" after a Malformed Edit.
Ghost: The edit corrupted the syntax of surveyor.js, preventing the UI from loading for Playwright.
Silver Bullet: Perform a git checkout to clear the buffer and skip Playwright for one cycle to restore the build.
Ward: Verify bracket nesting manually in the Recon phase before applying high-logic edits.

Date: 2026-06-01
Symptom: Monolithic application layout files (BL-2.01) causing unmanageable file footprint, leading to tight coupling between UI rendering and core logic.
Ghost: Inline UI generation bound inside deep orchestrator functions, making testing and iterative feature enhancements brittle.
Silver Bullet: Extracted decoupled components (`card-render.js`, `score-input.js`, `event-binders.js`) into a dedicated `src/modules/` directory while strictly enforcing pre-existing DOM layout attributes to safeguard PIR scroll behaviors.
Ward: Always maintain 1:1 element ID and inline styling definitions during module extractions to prevent regression of hard-fought UX state patches. Ensure testing environments properly scope `vitest` unit frameworks away from Playwright E2E suites.
