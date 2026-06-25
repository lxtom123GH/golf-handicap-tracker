# Master Backlog — Supermagic (claudeCLI)
*De-duplicated, file-by-file ledger. Every row verified against current source
with line numbers and direct remediation code. Sourced from all 7 lens passes
(see `docs/backlog_*_claudeCLI.md` for per-lens attribution).*

---

## 1. `src/state.js` — Proxy misses in-place array mutation
**Lines:** 60-83 (trap), cf. `practice.js:370-372` vs `ui.js:622-623`
**Verified by:** o1, R1, Gemini, Master

```js
// ADD to state.js, exported alongside AppState:
export function mutateList(key, mutatorFn) {
    const next = mutatorFn([...AppState[key]]);
    AppState[key] = next; // reassignment re-arms the reference-equality trap
}

// practice.js:370-372 — replace:
//   AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() });
// with:
mutateList('currentPracticeRounds', list => [...list, { id: docSnap.id, ...docSnap.data() }]);
```

---

## 2. `src/auth-v2.js` — Dual-lever visibility (`classList` + `style.display`)
**Lines:** 25-28, 42-45, 153-157, 201-205
**Verified by:** Claude, R1, Master *(comments `// Force hide`/`// Force show` confirm this is a known prior patch, not an oversight)*

```js
// auth-v2.js:153-157 — replace:
//   UI.authOverlay.classList.add('hidden');
//   UI.authOverlay.style.display = 'none'; // Force hide
//   UI.mainApp.classList.remove('hidden');
//   UI.mainApp.style.display = 'block'; // Force show
// with:
UI.authOverlay.classList.add('hidden');
UI.mainApp.classList.remove('hidden');
// (relies on the existing `.hidden { display:none }` rule already in style.css —
//  no inline style needed once that's the *only* lever)
```
Apply the same removal of the `style.display` line at 25-28, 42-45, 201-205.

---

## 3. `src/style.css` — `!important` override fights `data-active-tab`
**Lines:** 869-870 vs the exclusivity contract at 570-582
**Verified by:** o1, R1, Master

```css
/* DELETE (style.css:869-870): */
body.round-active #tab-oncourse.hidden {
    display: block !important;
}
```
```js
// REPLACE WITH (persistence.js, at the round-start transition ~line 94):
AppState.activeTab = 'tab-oncourse'; // let the existing data-active-tab contract own visibility
```

---

## 4. `src/oncourse.js` / `src/modules/score-input.js` — Uncancelled timers
**Lines:** `oncourse.js:724,727,1519`, `score-input.js:166`
**Verified by:** GPT, R1, Master

```js
// oncourse.js — replace the bare setTimeout calls at 724 and 727:
clearTimeout(_voiceOverlayHideTimer);
_voiceOverlayHideTimer = setTimeout(() => UI.voiceOverlay.classList.add('hidden'), 2500);
// (declare `let _voiceOverlayHideTimer;` once near the top of the module;
//  apply the same store-and-clear pattern at :1519 and score-input.js:166)
```

---

## 5. List-render duplication (DRY + perf, same fix serves both)
**Files:** `admin.js:16-45`, `coach.js:65-71,180-238,251-281,293-304`,
`competitions.js:215-228,298-327,585-599`, `card-render.js:15-49,55-87,93-135,143-160`
**Verified by:** Claude, GPT, Master

```js
// ADD to ui.js (or new src/modules/list-render.js):
export function renderList(container, items, toRowFn, emptyMsg = 'Nothing to show.') {
    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = `<p class="empty-msg">${emptyMsg}</p>`;
        return;
    }
    for (const item of items) container.appendChild(toRowFn(item));
}
// Migrate admin.js:16-45 first (smallest, highest call frequency), then coach.js,
// then competitions.js / card-render.js.
```

---

## 6. Firestore listener lifecycle + schema guards
**Files:** `whs.js:148-156`, `practice.js:360-372`, `social.js:23-31`
**Verified by:** Gemini, Master

```js
// whs.js:148 — store the unsubscribe handle:
let _whsUnsub = null;
function subscribeWhs(uid) {
    if (_whsUnsub) _whsUnsub();
    _whsUnsub = onSnapshot(query(collection(db, 'rounds'), where('uid', '==', uid)), (snap) => {
        const rounds = snap.docs.map(normalizeRoundDoc).filter(Boolean);
        AppState.currentRounds = rounds; // reassignment — already proxy-safe
    });
}

// ADD a normalizer used at every onSnapshot/getDocs boundary:
export function normalizeRoundDoc(docSnap) {
    const d = docSnap.data();
    if (!d || typeof d.uid !== 'string') return null;
    return { id: docSnap.id, drillId: d.drillId ?? null, score: d.score ?? null, uid: d.uid, ...d };
}
```

---

## 7. `src/state.js` — Single-key persistence (offline durability)
**Lines:** 38-53 (only `playerClubs` mirrored); depends on item #1 landing first
**Verified by:** Llama, GPT, Master

```js
// ADD an allow-listed mirror, driven by the existing stateChange hook:
const PERSISTED_KEYS = ['activeRoundId', 'liveRoundGroups', 'currentHole',
                        'currentRoundHoles', 'currentRoundCourseName'];
window.addEventListener('stateChange', (e) => {
    if (PERSISTED_KEYS.includes(e.detail.property)) {
        localStorage.setItem('golfAppRoundMirror', JSON.stringify(
            Object.fromEntries(PERSISTED_KEYS.map(k => [k, AppState[k]]))
        ));
    }
});
// + a hydrateFromStorage() called at boot, before whs.js/practice.js listeners attach.
```

---

## Landing Order
`#1 → #2 → #3 → #4 → #5 → #6 → #7`
(#1 unblocks #6's reassignment pattern and is a prerequisite for #7's mirror to
be trustworthy; #2 and #3 are independent "two authorities" fixes that can land
in parallel with #1; #4–#6 are independent of each other; #7 is last — largest
surface, most behavior-sensitive.)
