# TECHNICAL DEBT BACKLOG — LLAMA 4 DIAGNOSTIC

## 1. DOM Pollution Refactor (High Priority)
Migrate the following modules to purely use state-driven `body[data-active-tab]` or localized `data-state` hooks instead of direct CSS overrides (`.style.display`, `.classList.toggle`):
* `src/ai.js` (Lines 70-75)
* `src/auth-v2.js` (Authentication Flow)
* `src/modules/event-binders.js` (Leaderboard and Stats Toggles)
* `src/oncourse.js` (FIR / GIR Buttons)
* `src/tempo.js` (Animation synchronization logic)

## 2. Event Listener Lifecycle Management
Implement explicit `removeEventListener` calls or utilize an Event Bus wrapper when destroying and regenerating views, particularly in:
* `src/modules/card-render.js`
* `src/coach.js`

## 3. Firestore Rules
Investigate and resolve `FirebaseError: No matching allow statements` in the local emulator specifically for the `practice_plans` query path inside `bindPracticeCaddyUI`.

## 4. Forced Reflow Elimination
Remove `void UI.tempoRing.offsetWidth` in `src/tempo.js`. Utilize `requestAnimationFrame` or dual-class transitions to force CSS resets without blocking the main rendering thread.
