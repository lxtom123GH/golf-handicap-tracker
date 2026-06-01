# ⛳ KEPERRA 27-HOLE ENGINE: CONSOLIDATED MASTER BACKLOG
**Last Updated:** 2026-03-11
**Protocol:** Sydney v8.2.2 [PERSONAL]
**Stack:** Vanilla JS, Vite, Firebase (australia-southeast1)

## 🤖 SYSTEM DIRECTIVE (FOR AI AGENTS)
When reading this file at the start of a session:
1. Acknowledge the current Active Sprint & [STATE SNAPSHOT].
2. Adhere strictly to the Monolithic Ceiling (< 50 lines per code block/response).
3. Do NOT attempt to implement Vue.js or React components; this is a strictly Vanilla JS environment.
4. All Firebase/Functions MUST be pinned to `australia-southeast1`.
5. Assume Firebase Emulators are used for local dev. Remind user to run `firebase emulators:start` on new tasks.
6. Always request `ground_truth.txt` before modifying Tier 0 or Tier 1 items.

## 🧠 META-GOVERNANCE
* **[META-01] Instruction Audit:** Review the custom instructions in Gemini at least every 48 hours to avoid recursive instruction looping or degradation.

---

## 🚨 TIER 1: ARCHITECTURAL FOUNDATION & IMMEDIATE FIXES
*Critical data integrity, security, and reactivity bugs. Execute atomically before writing new feature logic.*

- [x] **[BL-1.01] (REA-01) Proxy State Integrity:** Update `src/state.js` Proxy `set` trap. Replace strict equality `!==` with `JSON.stringify()` serialization to ensure in-place array mutations (`push`, `splice`) fire `stateChange` events. (Effort: 10 mins)
- [x] **[BL-1.02] (REA-02) Round Init Guard:** Add `if (!AppState.activeRoundId) return;` to `holeUpdate` in `src/oncourse.js` to prevent null-reference Firestore queries on boot. (Effort: 5 mins)
- [x] **[BL-1.03] (SEC-02/03) Firestore Rules Hardening:** Update `firestore.rules`. Scope `comprounds`, `tempo`, and `feed` reads/writes strictly to `request.auth.uid`. (Effort: 15 mins)
- [x] **[BL-1.04] (ARC-01/03 & SYD-03) Ghost File Cleansing:** Run terminal commands to delete `src/components/ScoreEntryOverlay.vue`, `src/app-v4.js`, and `src/coach.js.tmp` to stop framework leakage. (Effort: 2 mins)
- [x] **[BL-1.05] (PWA-01) Service Worker Zombie Cache:** Unify `CACHE_NAME` constant in `public/sw.js` to ensure old cache deletion during activation. (Effort: 5 mins)
- [x] **[BL-1.06] (FIR-01) Storage Emulator Wiring:** Add `connectStorageEmulator(storage, '127.0.0.1', 9199)` to the `src/firebase-config.js` emulator block. (Effort: 5 mins)
- [x] **[BL-1.07] (SYD-02) PIR Log Update:** Add the Tier 1 Firebase Restoration entry to `docs/PIR_log.md` to satisfy the Exit Gate requirement. (Effort: 5 mins)
- [ ] **[BL-1.08] Competition Sync Visibility:** Debug real-time synchronisation preventing Custom Competitions from rendering. Requires emulator mock data seeding first. (Pending BL-1.01 completion).

## 🏗️ TIER 2: TECHNICAL DEBT & QUOTA GUARDS
*Resolving quota burning, structural bloat, and pipeline isolation. Required before scaling users.*

- [ ] **[BL-2.01] (STR-01) Monolithic Extraction (`oncourse.js`):** Break down the 600+ line monolith into `src/modules/` (e.g., `ui-round-setup.js`, `ui-leaderboard.js`). *Must execute under <50 line chunking protocol.*
- [ ] **[BL-2.02] (QUO-01/02) Firestore Quota Guards:** Refactor `loadFollowing()` in `src/social.js` to use batched `in` queries. Implement module-scoped cache in `src/competitions.js` to prevent duplicate full-table scans.
- [ ] **[BL-2.03] (QUO-03) Zombie Listener Purge:** Wire `unsubscribePractice` in `src/practice.js` to a global `userLoggedOut` event to stop background read charges.
- [ ] **[BL-2.04] Course Data Quota Guard:** Implement `localStorage` caching for static course data to minimise Firestore read operations during active rounds.
- [ ] **[BL-2.05] (STR-02/03) Module Bloat Reduction:** Extract `DRILL_TEMPLATES` to `src/modules/drill-templates.js`. Separate Chart.js rendering out of `src/whs.js`.
- [ ] **[BL-2.06] (REA-03) Stale Closure Fix:** Update `stateChange` listener in `src/ui.js` to read directly from `AppState` rather than `e.detail.newValue`.

## 🧪 TIER 3: TESTING & HYGIENE
*Stabilizing the CI pipeline and ensuring local robustness.*

- [ ] **[BL-3.01] Playwright Test Activation:** Integrate existing tests in `tests/e2e/` (Start Round, Score Submission) into the active development workflow.
- [ ] **[BL-3.02] (TST-01/03) Test Coverage Expansion:** Add `e2e/round_flow.spec.js` to `playwright.config.js` `testMatch`. Write unit test for `commitHoleScoreAtomic`.
- [ ] **[BL-3.03] (TST-02) AI Double-Tap Guard:** Add `btnGenerate.disabled = true` with a `finally` block restoration to the AI generator button in `src/practice.js`.
- [ ] **[BL-3.04] (PWA-02/03) PWA Polish:** Add `"purpose": "any maskable"` to icons in `manifest.json`. Modify `src/wakelock.js` to explicitly `releaseWakeLock()` on hidden state.
- [ ] **[BL-3.05] (SYD-01) Orthography Sweep:** Correct en-US spelling (`initialize`) to en-AU (`initialise`) in `src/modules/ui-hazards.js`.

## ✨ TIER 4: NEURO-INCLUSIVE UX & CORE FRICTION
*Prioritizing sensory-friendly design and cognitive ease on the course.*

- [ ] **[BL-4.01] (UX-01) Optimistic Scoring UI:** Refactor `commitScore()` in `src/modules/scoring-logic.js`. Apply state updates instantly, push Firestore sync to background `try/catch`.
- [ ] **[BL-4.02] (UX-02) Theme-Compliant Toggles:** Refactor `bindSetupToggles` in `src/oncourse.js`. Remove inline hex colors and drive via CSS classes for high-contrast support.
- [ ] **[BL-4.03] (UX-03) Haptic & Tactile Feedback:** Wire `navigator.vibrate([50, 30, 50])` to the score commit overlay and `+/-` buttons for tactile confirmation in bright/noisy environments.
- [ ] **[BL-4.04] Smart Score Defaults:** Pre-fill the score entry overlay to `Par + 2` strokes and `2` putts upon hole entry to convert a 6-tap process into a 1-tap commit.
- [ ] **[BL-4.05] Voice Synthesis (Yardage):** Implement TTS (`speechSynthesis`) for hands-free GPS yardage callouts (Front, Centre, Back).
- [ ] **[BL-4.06] GPS UI Refinement:** Restructure the GPS display to emphasise the 'Centre' distance dynamically.
- [ ] **[BL-4.07] UI Polish & Glassmorphism:** Finalise translucent navigation bars and `backdrop-filter` effects.
- [ ] **[BL-4.08] Lock Screen Scoring:** Investigate WakeLock API enhancements to allow score entry without unlocking the device.
- [ ] **[BL-4.09] Detailed Stats Optimisation:** Restructure default stats view for single-pane data entry.

## 🟢 TIER 5: COMPETITIONS, SOCIAL & STRATEGY
*Scaling multiplayer functionality and complex game modes.*

- [ ] **[BL-5.01] 27-Hole Engine Logic:** Finalise routing for Keperra's Old/North/West loop transitions and assure Stroke Index (SI) mapping across all 18-hole combos.
- [ ] **[BL-5.02] Matchplay Engine:** Implement head-to-head PvP matchplay scoring logic (1 UP, All Square, Dormie).
- [ ] **[BL-5.03] Virtual Practice Competitions:** Build cross-location live leaderboards for practice drills.
- [ ] **[BL-5.04] Mid-Competition Ruleset Modification:** Allow users to add/remove custom rules mid-round safely.
- [ ] **[BL-5.05] Natural Language Rules Parser:** Expand the AI rules engine to allow mid-competition ruleset creations via voice.
- [ ] **[BL-5.06] Multi-Player P2P Sync:** Explore WebRTC for real-time scorecard sharing without hitting Firestore.

## 🔵 TIER 6: AI PRACTICE LAB & DOCUMENTATION
*Advanced automated drills and compliance reporting.*

- [ ] **[BL-6.01] Practice Gamification:** Implement a balanced point/incentive model to reward practice frequencies.
- [ ] **[BL-6.02] AI Practice - Voice Notes:** Automate practice plan generation by ingesting voice notes.
- [ ] **[BL-6.03] AI Practice - Putting Mat:** Add library templates for at-home putting mat drills.
- [ ] **[BL-6.04] AI Camera Drill (9-Box):** Scaffold Vision API integration for smartphone-automated Tiger Woods 9-Box trajectory tracking.
- [ ] **[BL-6.05] Technical Deep-Dive README:** Create a comprehensive technical map showing inter-dependencies.
- [ ] **[BL-6.06] Exportable Mini-Readme:** Generate a downloadable CSV/TXT onboarding file for data imports.
- [ ] **[BL-6.07] SVG Map Interactivity:** Modularise Keperra SVG maps to allow "Zoom-to-Green" triggers.
- [ ] **[BL-6.08] Direct iOS Hardware GPS:** Research Core Location bridges to bypass standard browser geolocation throttling on iPhones.
- [ ] **[BL-6.09] Risk Management Framework:** Complete internal documentation mapping the 5x5 Hazard Risk Matrix to ISO31000.
- [ ] **[BL-6.10] PDF Stat Export:** Build a generator to export round history into an Australian Standard formatted PDF.

---
## ✅ COMPLETED / ARCHIVED
* **[TIER-0]** All critical architectural blockers resolved.
* **[BL-0.03] Vue Leakage Removal:** Extracted logic from `src/components/ScoreEntryOverlay.vue` to `src/modules/scoring-logic.js`.
* **[BL-0.04] Zombie CSS Exorcism:** Implemented State-Driven Visibility (`body[data-active-tab]`) and purged `!important` tags from `src/style.css`.
* **[BL-0.05] Structural Sanitisation:** Deleted redundant `index_*.html` variants.
* **[BL-1.01-OLD] Firebase Environment Restore:** Recreated `.env` file with `VITE_` prefixes and standardized `src/firebase.js`.
* **[BL-1.02-OLD] Clean Slate Purge:** Updated `MapsTo('view-home')` to explicitly reset `AppState`.