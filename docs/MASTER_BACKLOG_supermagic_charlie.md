# THE GRAND SYNTHESIS: MASTER SUPERMAGIC BACKLOG

## I. The Architectural Verdict

The Reactivity and State Ingestion Enclosure suffers from systemic fractures where the state-driven UI paradigm is manually subverted. The `AppState` proxy's shallow reactivity model (checking only reference equality via `oldValue !== value`) is frequently bypassed by in-place array mutations (`.push()`, `.splice()`), leading to silent reactivity drops. Concurrently, the exclusivity contract established by `body[data-active-tab]` is routinely violated by dual-lever visibility overrides, inline `.style.display` toggles, and global CSS `!important` directives.

The remediation strategy focuses on three core pillars:
1.  **State Determinism:** Implement robust array mutation helpers (`mutateList`) to re-arm the proxy deterministically, and enforce payload validation on ingestion.
2.  **UI Contract Enforcement:** Strip redundant DOM overrides (`classList` + `style.display`), remove `!important` CSS collisions, and migrate localized closures to respect `AppState` enumerations.
3.  **Proxy Boundaries:** Re-arm proxy and ensure deep reactivity gaps are patched properly in state-driven UI patterns.

## II. The Definitive Master Backlog

### 1. Target: `src/state.js:60-83`
**Violation:**
`Proxy` set trap is reference-equality only (`oldValue !== value`); array mutations bypass `stateChange`.
```js
export const AppState = new Proxy(initialState, {
    set(target, prop, value) {
        // ... oldValue !== value check ...
```

**Remediation Plan:** Add a `mutateList(key, fn)` helper exported alongside `AppState` that performs a shallow copy, mutates, and reassigns (`AppState[key] = [...newList]`) to deterministically re-arm the proxy trap. (≤30 lines)

### 2. Target: `src/state.js:66-74`
**Violation:**
Unfiltered global dispatch on every proxy write.
```js
window.dispatchEvent(new CustomEvent('stateChange', { detail: { property: prop... } }));
```

**Remediation Plan:** Do not restructure the dispatch. Instead, add a documented convention/helper `onStateChange(keys, handler)` that early-exits via `if (!keys.includes(e.detail.property)) return;` before invoking `handler`. (~40 lines)

### 3. Target: `src/practice.js:370-372, src/social.js:23-26`
**Violation:**
Silent array mutations bypassing the proxy.
```js
AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });
```

**Remediation Plan:** Replace direct array mutation with the new `mutateList` helper to ensure reactivity. (≤30 lines)

### 4. Target: `src/ui.js:622-623`
**Violation:**
Bespoke undiscoverable proxy re-arming idiom.
```js
AppState.liveRoundGroups.splice(index, 1);
AppState.liveRoundGroups = [...AppState.liveRoundGroups];
```

**Remediation Plan:** Promote this bespoke reassignment idiom to use the shared `mutateList` helper to standardize list updates across the app. (≤20 lines)

### 5. Target: `src/style.css:868-871`
**Violation:**
Exclusivity contract CSS collision.
```css
body.round-active #tab-oncourse.hidden { display: block !important; }
```

**Remediation Plan:** Remove the `!important` directive which violently competes with the `data-active-tab` layout app contract. Enforce round-in-progress visibility entirely through the reactive `activeTab` state machine. (≤20 lines)

### 6. Target: `src/auth-v2.js:153-157, 201-205`
**Violation:**
Dual-lever visibility overrides bypassing single-source-of-truth.
```js
UI.authOverlay.classList.add('hidden');
UI.authOverlay.style.display = 'none'; // Force hide
```

**Remediation Plan:** Collapse component visibility exclusively to the `classList` token layer. Strip all imperative `.style.display` assignments across the auth module to restore single-authority styling. (≤25 lines)

### 7. Target: `src/oncourse.js:101-120, src/modules/event-binders.js:480-490`
**Violation:**
Rogue component visibility bypasses.
```js
document.getElementById('oncourse-setup').classList.remove('hidden');
if (simpleStats) simpleStats.classList.toggle('hidden', !isHub || !isSinglePlayer);
```

**Remediation Plan:** Refactor navigation events and localized view closures to react to `AppState` enumerations rather than imperatively firing `.classList.add/remove('hidden')` methods. Migrate in strict chunks of max 80 lines per feature block.

### 8. Target: `src/whs.js:148-156`
**Violation:**
Firestore ingestion missing schema payload validation.
```js
// Raw Firestore doc data is spread directly into AppState with no shape validation.
```

**Remediation Plan:** Introduce `normalizeRoundDoc(raw)` and `normalizeUserDoc(raw)` shape checkers to provide defaults for missing fields. Route snapshot callbacks through them before assigning to `AppState`. (≤40 lines)
