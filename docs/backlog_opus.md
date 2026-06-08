# Technical Debt Manifest - Backlog

- [ ] `src/ai.js` (lines 70-75): Refactor `btnAiPlayer.style.display = 'none'` and similar hardcoded toggles to use `.hidden` class or rely on state-driven rendering.
- [ ] `src/app-v4.js` (lines 309, 313): Refactor `UI.addRoundContainer.style.display` manipulations to be controlled by `AppState` and `.hidden` toggling.
- [ ] `src/auth-v2.js` (lines 26-27, 43-44): Remove hardcoded `display: none` / `block` toggles for `UI.btnLogin` and `UI.btnRegister` in favor of state-driven class updates.
- [ ] `src/auth-v2.js` (lines 154, 156, 202, 204): Remove "Force hide/show" overrides for `UI.authOverlay.style.display` and `UI.mainApp.style.display`, ensuring strict adherence to the Navigation Enclosure rule.
- [ ] `src/oncourse.js` (lines 847, 919): Refactor `btnAudio.style.display` toggles to use state-driven CSS classes (`.hidden`).
- [ ] `src/ui.js` (lines 654, 658) and `src/whs.js` (lines 209, 213): Refactor Chart.js `canvas.style.display` visibility toggles to avoid layout flickering and rely on robust state or DOM manipulation.
- [ ] `src/coach.js` (line 68): Refactor `li.style.display = 'flex'` to use state-driven CSS classes for layout structure.
- [ ] `src/practice.js` (line 321): Refactor `label.style.display = 'block'` to rely on robust state or DOM manipulation.
- [ ] `src/tempo.js` (lines 122, 135): Refactor `UI.tempoRing.style.display` manipulations to avoid layout flickering and rely on `.hidden` class toggling.
