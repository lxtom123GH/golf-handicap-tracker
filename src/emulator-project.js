/**
 * @file emulator-project.js
 * @description The ONE Firebase project id the app uses when it runs on
 * localhost/127.0.0.1 (the emulator suite). A `demo-` prefix is Firebase's
 * offline-only convention: the emulators never reach real Google services for
 * a demo project, so a misrouted local or e2e call cannot land in production.
 * Shared by src/firebase-config.js, playwright.config.js and the e2e helpers
 * (tests/e2e/helpers/e2e-safety.js); tests/unit/e2e-demo-safety.test.js pins it.
 */
export const EMULATOR_PROJECT_ID = 'demo-golf-tracker';
