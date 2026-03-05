# Golf Handicap Tracker - AI Context & Architecture Manifest
**Current Version:** v6.4.0
**Project Scope:** Personal project (Vanilla JS PWA). Focus on rapid prototyping with high stability and reasonable security boundaries.

## 🛠️ Tech Stack
* **Frontend:** Vanilla JavaScript, HTML5, CSS3. (Strictly NO React, Vue, TypeScript, or heavy frameworks).
* **Bundler:** Vite (Handles code splitting, minification, and CSS).
* **Backend / Database:** Firebase (Authentication, Cloud Functions, Hosting) & LocalStorage (Offline-first data layer).
* **Environment:** Windows 11 Desktop natively using PowerShell (`RemoteSigned`).

## 🧱 Core Architectural Rules
1.  **State Management:** All global state lives in `AppState`. UI must reactively sync with `AppState` changes. 
2.  **API Security:** AI API keys (Gemini/Claude) are strictly housed in Firebase Cloud Functions (`functions/index.js`). Never expose API keys in Vite `.env` client builds or `app-v4.js`.
3.  **DOM Stability:** Strict Tag-Balance checks (`<div>` opens must equal closes) are mandatory. UI overlays (modals/drawers) must never swallow the `main-app` container.
4.  **Error Handling:** Use `try/catch` blocks for complex UI renders. Do not expose raw stack traces to the user (e.g., translate `NotAllowedError` into user-friendly text).

## 🤖 AI Operational Directives ("Model Relay Protocol")
1.  **Code Output:** Never summarize or truncate code in `index.html` or `.js` files. Provide the full, unabridged logic blocks for requested sections. Use targeted 'Search and Replace' blocks for large files.
2.  **Execution Audits:** Every AI execution MUST include an Agent Execution Audit checking for 'malformed edit' errors, file write failures, and tag-balance anomalies.
3.  **Terminal Commands:** Execute commands natively in PowerShell (e.g., `npm run build`). DO NOT wrap commands in `cmd /c`.
4.  **Deployment Verification:** Remind the user to perform a 'Hard Refresh' or use Incognito mode to bypass the Service Worker zombie cache after every deployment.

### UI State Toggle Rule (v6.7.6)
**The Ward:** When writing JavaScript to toggle UI visibility, you must verify the base CSS rules for the target element (e.g., checking if it requires a secondary `.active` class) and audit the stylesheet for `!important` parent overrides. Never assume `classList.remove('hidden')` is sufficient for complex PWA transitions.
**Context:** During the v6.7.x sprint, the Locker Room remained invisible because `.tab-content` required an `.active` class to trigger `display: block`, and a `body.round-active` CSS rule was forcing the previous tab to stay visible via `!important`.
