# PIR Log — Gemini Lens (claudeCLI)
*Night 1 · 2026-06-08*

- **T+0:00** — Located all `onSnapshot`/`getDocs` call sites
  (`whs.js:148-156`, `practice.js:360-372`, `social.js:23-31`,
  `app-v4.js:369-386`) to map the Firestore integration surface.
- **T+0:09** — Checked each listener for a stored `unsubscribe` handle —
  none found at `whs.js:148-156`, flagged as a stacking risk on player-switch.
- **T+0:16** — Traced `docSnap.data()` spreads into `AppState` for schema
  guards — none present; malformed docs flow straight to render templates
  (`practice.js:466`).
- **T+0:22** — Reviewed `admin.js:24,55,155` for injection risk in
  `innerHTML` templates sourced from Firestore field values.
- **T+0:27** — Drafted the `normalize*Doc` + lifecycle-cleanup recommendation
  shared across the three listener sites.
- **T+0:31** — Wrote `night1_gemini_claudeCLI.md` and `backlog_gemini_claudeCLI.md`.
- **Status:** Complete. Score: 47/100 Determinism, Medium-High Coupling.
