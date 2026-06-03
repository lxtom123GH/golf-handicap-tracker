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

Date: 2026-06-02
Symptom: UX friction due to manual drive/approach shot tracking (BL-2.02).
Ghost: Players had to manually log every shot, creating significant latency on the course.
Silver Bullet: Scaffolded `src/modules/telemetry.js` to automatically infer drive distances via Haversine logic tied to `gpsLocation` AppState proxies, triggered strictly within `tab-oncourse`. Kept file size under 100 lines for mobile scannability. Added automated Firebase Preview channels via `.github/workflows/firebase-preview.yml`.
Ward: Enforce the 100-line limit per module file for telemetry calculations to maintain high performance. Always isolate GPS background loops strictly to the active target tab to prevent battery drain or zombie DOM interactions.
