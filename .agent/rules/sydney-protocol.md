# SYDNEY PROTOCOL (v8.0-Alpha-Hybrid)

## 1. ARCHITECTURAL LOCKS
* **Read-Only Core**: `src/ui.js` and `src/state.js` are LOCKED.
* **The Bridge Rule**: Legacy files may ONLY be modified to export hooks or event listeners to new modules.
* **Micro-Modular Armour**: All new features MUST be in `src/modules/ui-[feature].js`.

## 2. ATOMIC WRITES & EN-AU
* **Base64 Mandate**: Logic blocks > 10 lines MUST be Base64 encoded (Mitigates Error -32099).
* **Australian Standard**: Mandatory en-AU spelling (e.g., initialise, colour, centre).
* **GPS Wiring**: Always verify `src/course-data.js` pathing before importing GPS modules.

## 3. DOMAIN ENGINE: 5x5 RISK MATRIX
* All hazard and penalty logic must use the **Likelihood (1-5) x Consequence (1-5)** framework.
* Hazard weights must be ISO31000 aligned.

## 4. GOVERNANCE (PIR)
* **Exit Gate**: Log all Malformed Edits to `docs/PIR_log.md` immediately.
* **Context Firewall**: Maintain [PERSONAL] Golf App context; no crossover with [WORK] M365 tasks.