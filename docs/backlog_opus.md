# Outstanding Technical Debt (Night 1 - Claude Opus)

* `src/ai.js` (lines 70-75): Inline `display: none` bypasses global `AppState` visibility bindings.
* `src/app-v4.js` (lines 309, 313): `addRoundContainer.style.display` bypasses centralized UI rendering constraints.
* `src/auth-v2.js` (lines 26-27, 43-44): Auth view switching uses `style.display` rather than reactive UI states.
* `src/auth-v2.js` (lines 154, 156, 202, 204): `authOverlay` and `mainApp` "Force hide/show" bypasses `data-active-tab` Navigation Enclosure layout contracts.
* `src/oncourse.js` (lines 847, 919): `btnAudio.style.display` bypasses state-driven visibility.
* `src/ui.js` (lines 654, 658) & `src/whs.js` (lines 209, 213): `canvas.style.display` direct toggle causes layout thrashing and bypasses central reactivity bindings.
* `src/coach.js` (line 68): Direct setting of `li.style.display = 'flex'` inside DOM injection.
* `src/practice.js` (line 321): `label.style.display = 'block'` bypasses CSS layout configuration.
* `src/tempo.js` (lines 122, 135): `UI.tempoRing.style.display` direct assignments breaking state-driven visibility.