# Post-Implementation Review (PIR) Log

## [2026-03-05] v6.12.x Mobile Layout & Navigation Ghosting

### The Ghost (Issue)
Navigation tabs were re-triggering during the "Round Saved" Locker Room state, overlapping the modal and hiding the "Accept Quest" button on mobile devices. This caused a critical UX failure where users could not close the analysis or proceed.

### The Silver Bullet (Fix)
1. **Explicit Navigation Suppression**: Added logic in `src/oncourse.js` to explicitly hide `.tabs-container` when the Locker Room is active and restore it only upon returning home.
2. **Dynamic Viewport Height**: Switched modal `max-height` to `90dvh` to account for dynamic mobile browser chrome.
3. **Safe Area Clearance**: Applied `padding-bottom: 40px !important` (and `env(safe-area-inset-bottom)`) to ensure buttons clear the OS home bar.
4. **Z-Index Layering**: Boosted `#stat-analysis-modal` to `z-index: 20000`.

### The Ward (Prevention)
> [!IMPORTANT]
> **MANDATORY**: When creating full-screen overlays or dashboards, you must explicitly disable global navigation bars. Use `dvh` units and `env(safe-area-inset-bottom)` padding to ensure bottom buttons are reachable on all mobile devices.

---

## [2026-03-05] The Sydney Audio Briefing (v6.14.0 - v6.17.7)
**Status:** Recovered & Hardened

### 👻 The Ghost (Root Causes)
1.  **PWA Zombie Caching (v6.17.3):** The Service Worker was serving a stale JS bundle that targeted `us-central1`. Even after the code was fixed to Sydney, the phone was stuck in the past.
2.  **Model Naming 404s:** The migration from Gemini 1.5 Flash to 2.5 Flash required a specific SDK update. The old SDK did not recognize the new model identifiers, causing 404 errors.
3.  **Regional Mismatch:** Disconnect between the Storage Bucket (Sydney) and the Cloud Functions (Default US) caused latency and permission artifacts that were only visible in deep logs.

### 🛡️ The Silver Bullet (Fixes)
1.  **Cache-Name Force Bump:** Updated `sw.js` to `golf-cache-v6.17.7-FORCE`. This triggered an immediate `activate` event that purged all old caches across all user devices.
2.  **@google/genai SDK Migration:** Swapped the deprecated `@google/generative-ai` for the modern `@google/genai` (v1.0.0+), enabling stable multi-modal support for `gemini-2.5-flash`.
3.  **Regional Locking:** Standardized on `australia-southeast1` globally. Both `getFunctions(app, 'australia-southeast1')` (Frontend) and `onCall({ region: 'australia-southeast1' })` (Backend) are now pinned.

### 🔍 The Lesson: Diagnose, Don't Guess
This feature recovery proved that local testing is blind to PWA caching issues. **Diagnosis MUST start with Firebase Function Logs.** The logs revealed the `404 Not Found` for the model and the `GET` vs `POST` protocol mismatch that led us to the region fix.

---

## [2026-03-05] The Localhost QA Sandbox (v6.20.0)
**Status:** Architecture Operational

### 👻 The Ghost (Root Causes)
1.  **Framework Collision:** Playwright was auto-detecting and attempting to execute legacy `vitest`/`jest` test files (specifically `firestore.test.js`), leading to namespace conflicts and runtime crashes in the E2E pipeline.
2.  **The Infinite Cloak:** The frontend application remained trapped behind the `#app-loading-cloak` because it was initialized to contact production Firebase. Since the local test runner (Playwright) was isolated from production auth, the bootstrap logic hung indefinitely.

### 🛡️ The Silver Bullet (Fixes)
1.  **Strict Test Scoping:** Updated `playwright.config.js` with an explicit `testMatch` array targeting only the new `**/*.spec.js` Chaos Suite. This effectively walled off the legacy unit tests from the Playwright runner.
2.  **The Emulator Bridge:** Injected a `window.location.hostname` sniffer into `src/firebase-config.js`. This logic automatically detects if the app is running on `localhost` or `127.0.0.1` and forces all Firebase services (`auth`, `firestore`, `functions`) to bridge to the Local Emulator ports (9099, 8080, 5001).

> [!IMPORTANT]
> **The Localhost Shield**: All Firebase frontend initializations MUST include an environment sniffer to automatically route to emulators when running locally. Never let the frontend guess its environment. Ensure `testMatch` is used in Playwright to prevent framework cross-contamination.

---

### v6.21.0 - Split-Brain Versioning Bug

| The Ghost | The Silver Bullet | The Ward |
| :--- | :--- | :--- |
| **Split-Brain Versioning**: Decentralized, hardcoded version strings across multiple JS files led to UI mismatches and zombie cache confusion. | **Single-Source DOM Anchor**: Consolidated the version string into a single `<meta>` tag in `index.html` that all JavaScript modules dynamically read at runtime. | **The Ground Truth Rule**: Never hardcode application version strings inside JavaScript logic files. Always dynamically read from the HTML anchor. |

---

## 📜 The Three Commandments of AI Coding
1.  **Commandment I: The Sydney Anchor.** All AI Cloud Functions and Bucket-related logic must be pinned to `australia-southeast1` on both Frontend and Backend. No exceptions.
2.  **Commandment II: The Cache Buster.** Every major UI/Backend handshake change MUST be accompanied by a `sw.js` `CACHE_NAME` bump to prevent "Zombie Code" from running on mobile devices.
3.  **Commandment III: The Log Oracle.** Never attempt to "patch" a 404 or a connection error without first reading the raw stderr in the Firebase Google Cloud Console. The log is the only source of truth.

---

## [2026-03-05] Frontend XSS Hardening (Phase 1)
**Status:** Secured

### 👻 The Ghost (Root Causes)
1. **Unsanitized Injections:** Multiple UI modules (`social.js`, `coach.js`, `admin.js`) were passing raw user-generated strings (`displayName`, `email`, feed data) directly into DOM components using `.innerHTML = \`...\``. This exposed the frontend to critical Cross-Site Scripting (XSS) vulnerabilities.

### 🛡️ The Silver Bullet (Fixes)
1. **Safe DOM Construction:** Replaced all vulnerable `.innerHTML` assignments with native DOM API methods (`document.createElement()`, `.textContent`, `.appendChild()`). This enforces strict separation of data and markup, neutralizing script execution vectors.
2. **Targeted Hardening:** Preserved `.innerHTML` only for controlled, non-user-generated layout scaffolding (e.g., hardcoded SVG badges or structural containers) where safe to do so.

> [!IMPORTANT]
> **The TextContent Mandate**: Never inject user-provided data directly via `.innerHTML`. Always use `.textContent` or safe DOM creation APIs to ensure all inputs are parsed as strings rather than executable nodes.

---

## [2026-03-05] Frontend XSS Hardening - Redeclaration Hotfix
**Status:** Secured

### 👻 The Ghost (Root Causes)
1. **Scope Collisions:** When refactoring `.innerHTML` blocks in `src/coach.js` to use safe DOM `document.createElement()` APIs, local variables `viewBtn` and `releaseBtn` were accidentally redeclared within the same block scope. This triggered a fatal `SyntaxError: Identifier 'viewBtn' has already been declared` during the parsing phase.
2. **Artifact Tracking:** Auto-generated Playwright test reports (`playwright-report/index.html` and `test-results/.last-run.json`) had previously slipped into the Git index.

### 🛡️ The Silver Bullet (Fixes)
1. **Scope Resolution:** Removed the `const` redeclarations for `viewBtn` and `releaseBtn` inside the `src/coach.js` `loadCoachRoster` loop. Instead, event listeners were correctly attached directly to the elements generated in the preceding `document.createElement()` block.
2. **Untracking Artifacts:** Executed `git rm -r --cached` to purge the test artifacts from the Git index without deleting them locally. Added explicit `playwright-report/` and `test-results/` entries to `.gitignore` to prevent future contamination.

### 2026-06-08T02:42:07Z - Night 1: Claude Opus Architectural Audit
**Action:** Conducted read-only diagnostic pass of Core Reactivity and State Ingestion.
**Result:** Discovered 30% Mutation Determinism. Logged strict proxy bypasses, manual DOM mutations ('display: none'), and state coupling bottlenecks.
**Artifacts:** docs/reviews/night1_opus.md, docs/backlog_opus.md, docs/PIR_log_opus.md
