# Reconciled Delta — Gemini Lens (Round 4 Adversarial Cross-Examination)

*Source exhibits: `backlog_gemini.md` (Exhibit Alpha / Jules) vs. `backlog_gemini_claudeCLI.md` (Exhibit Bravo / Claude CLI). All line numbers re-verified against current `src/` contents on 2026-06-08.*

---

## I. Peer Review Assessment

**Verdict: Exhibit Bravo has materially superior precision on Firebase schema / payload / data-layer findings — but it is not flawless.** Bravo operates in the correct domain (Firestore reads, `AppState` mutation contracts, listener lifecycles, unescaped field interpolation) and four of its five entries are real, line-accurate, and demonstrate genuine understanding of the `AppState` Proxy's `set`-trap limitations (nested mutations bypass `stateChange` dispatch — a subtle, correct observation in #3 and #5). Exhibit Alpha never engages with the Firebase/data layer at all — its two findings sit in UI-state-architecture and CI/test territory, which is a different lens entirely (its own header literally says "Firebase integration / payload-schema focus" is Bravo's job, not Alpha's).

That said, Bravo is not clean:
- **#1 (`whs.js:148-156`) is fabricated.** The code does exactly the opposite of what's alleged — it already stores `unsubscribeWHS = onSnapshot(...)` (line 159) and calls `if (unsubscribeWHS) unsubscribeWHS();` before re-subscribing (line 143). The cited range (148-156) doesn't even contain the `onSnapshot` call. This is dropped from the reconciled ledger entirely.
- **#4's line `55` is a boilerplate misread.** `admin.js:55` is the static `tabAdmin.innerHTML = '<header>...Admin Dashboard...'` structural injection — no Firestore field is interpolated there. The real violations in that finding are at lines 24-26 and 155-158 (and an unflagged sibling at line 215), all of which *do* interpolate `data.*`/`d.id` into `innerHTML`.

Alpha's two findings, while outside Bravo's stated scope, are independently verifiable and accurate: `AppState.activeTab` and the `body[data-active-tab]` CSS-visibility contract genuinely exist (`state.js:20`, `ui.js:259,734-735`), and `auth-v2.js` genuinely bypasses them with `UI.mainApp.style.display = 'block'; // Force show` (lines 154-156, 202-204) — a self-documented workaround. Its E2E failure list also references real spec names (`async-coach.spec.js:3`, `logic-boundaries.spec.js:41`, `quota-guards.spec.js:31`) and is corroborated by `PIR_log_gemini.md` ("4 tests failed out of 14... direct DOM manipulations").

**Net call:** Bravo wins on Firebase/data-layer precision (4 valid, schema-aware findings vs. zero from Alpha), but loses one full entry to fabrication. Alpha wins on UI-state-architecture precision but contributes nothing to the Firebase domain this lens is supposed to cover.

### Hallucination Check
| Exhibit | Entry | Verdict |
|---|---|---|
| Bravo #1 | `whs.js:148-156` "no stored unsubscribe handle" | **FABRICATED** — code already stores and invokes `unsubscribeWHS` correctly; cited range doesn't contain the subscription call |
| Bravo #4 | `admin.js:55` cited alongside 24/155 | **MISATTRIBUTED** — line 55 is static boilerplate HTML with zero Firestore interpolation; not a violation |
| Bravo #2, #3, #5 | `practice.js:372`, `social.js:23-31`, `app-v4.js:366,386` | Confirmed accurate, line-exact |
| Alpha Issue 1 | `auth-v2.js:154-156,202-204` | Confirmed accurate — `AppState.activeTab`/`data-active-tab` contract exists and is bypassed |
| Alpha Issue 2 | spec suite names | Confirmed real test files/titles; failure claim corroborated by `PIR_log_gemini.md` |

### Blindspot Report (Firebase / data-layer scope, per the audit brief)
- **Caught by Alpha, missed by Bravo:** Nothing in-scope. Alpha's findings (UI display-state bypass, E2E suite health) are real but sit outside the Firebase/payload-schema domain Bravo was scoped to.
- **Caught by Bravo, missed by Alpha:** All of it — unvalidated `docSnap.data()` spread into render-bound state (`practice.js`), `AppState` Proxy bypass via in-place array/object mutation (`social.js`, `app-v4.js`), and unescaped Firestore field interpolation into `innerHTML` (`admin.js`). Alpha's PIR notes gesture vaguely at "state coupling... bypassing AppState" but never localizes it to a Firestore read path the way Bravo does.

---

## II. Reconciled Master Gemini Backlog

| # | Target | Violation | Remediation Plan |
|---|---|---|---|
| 1 | `practice.js:369-373` | `unsubscribePractice = onSnapshot(q, (snapshot) => { AppState.currentPracticeRounds = []; snapshot.forEach(docSnap => { AppState.currentPracticeRounds.push({ id: docSnap.id, ...docSnap.data() }); }); ... })` — raw `docSnap.data()` spread into state with no shape check before it reaches the template at `practice.js:466` | Add a `normalizeRoundDoc(docSnap)` validator that checks `drillId`/`score`/`uid` exist and are the expected types before pushing; drop or quarantine malformed docs with a `console.warn`. ~30 lines, isolated — land first since #2/#3 below depend on its sibling normalizer pattern. |
| 2 | `social.js:23-26` | `if (!AppState.allUsersCache) { const snap = await getDocs(collection(db, 'users')); AppState.allUsersCache = []; snap.forEach(d => AppState.allUsersCache.push({ uid: d.id, ...d.data() })); }` — cache built via `.push()` on an array obtained through the `AppState` Proxy; in-place array mutation never triggers the Proxy's `set` trap (`state.js:61-81`), so `stateChange` never fires and unguarded `uid`-shaped docs flow straight into the matcher at line 30 | Build the array in a local variable, validate each doc with a shared `normalizeUserDoc(d)` (sibling to `normalizeRoundDoc`), then do a single top-level reassignment `AppState.allUsersCache = validated` so the Proxy `set` trap dispatches `stateChange` correctly. ~25 lines, depends on #1's normalizer pair. |
| 3 | `app-v4.js:366,386` | `AppState.profileUsersMap[AppState.currentUser.uid] = optSelf.textContent;` and `AppState.profileUsersMap[d.id] = opt.textContent;` — nested-key assignment on a Proxy-wrapped object; same `set`-trap bypass as #2, so roster changes never notify `stateChange` subscribers | Accumulate entries in a plain local object, then reassign `AppState.profileUsersMap = { ...AppState.profileUsersMap, ...updates }` once per fetch so the Proxy observes the change as a top-level set. Land alongside #2 once the validator/reassignment helper exists. ~15 lines. |
| 4 | `admin.js:24-26` and `admin.js:155-158` (plus unflagged sibling `admin.js:215`) | `tr.innerHTML = `...<td>${data.displayName || 'N/A'}</td><td>${data.email}</td>...`` and `tr.innerHTML = `<td>${d.id}</td>...onclick="removePreapprovedEmail('${d.id}')"...`` — Firestore field values (`displayName`, `email`, document IDs) interpolated directly into `innerHTML`/inline-handler strings with no escaping; a crafted display name or pre-approved-email document ID can break out of the attribute/string context | Replace template-string `innerHTML` assembly with `textContent` + `createElement`/`addEventListener` for any field sourced from a user-writable document (`users`, `preapproved_emails`). Apply the same fix to the import-select option builder at line 215 (`opt.textContent = data.displayName \|\| data.email` is already safe via `textContent`, but the `<option>` is appended into an `innerHTML`-managed parent — verify the parent isn't rebuilt via string concatenation elsewhere). ~35 lines. *Note: `admin.js:55` is static boilerplate (no Firestore interpolation) and should NOT be included in this fix's scope — Bravo's citation there was a misattribution.* |
| 5 | `auth-v2.js:154-156,202-204` | `UI.authOverlay.style.display = 'none'; // Force hide` / `UI.mainApp.classList.remove('hidden'); UI.mainApp.style.display = 'block'; // Force show` — direct, self-documented "Force show/hide" style manipulation that bypasses the documented `AppState.activeTab` → `body[data-active-tab]` CSS-visibility contract (`state.js:20`, `ui.js:259`, `ui.js:734-735`), producing a second, untracked source of truth for tab/overlay visibility | Replace the four direct `style.display`/`classList` calls with a single `AppState.activeTab = 'tab-oncourse'` (or equivalent) assignment on successful login, and let the existing `ui.js:734-735` `stateChange` handler drive `body.dataset.activeTab` → CSS visibility. Remove the now-redundant `classList.add/remove('hidden')` calls in the same block. ~20 lines, isolated. |
| 6 | Test debt (not a single file target) | Per `PIR_log_gemini.md` ("4 tests failed out of 14... E2E tests timed out or failed explicitly on infrastructure checks"): `tests/async-coach.spec.js:3` (Multi-Context Interaction Suite), `tests/logic-boundaries.spec.js:41` (Time Travel future-date validation), `tests/quota-guards.spec.js:31` (rapid multi-click / Double-Tap debounce), `tests/ui-ergonomics.spec.js` (visibility/overlay timeouts) | Triage as a follow-up spike, not a code-chunk PR: re-run each suite in isolation to separate genuine regressions from environment flakiness (the `auth-v2.js` direct-DOM-manipulation fix in #5 is the likely root cause of the `ui-ergonomics` visibility timeouts — re-run that suite first after #5 lands). |

## Sequencing
1 (isolated, lands first) → 2 → 3 (2/3 share the normalizer + reassignment helper pair from #1 — land together) → 4 (independent, parallel-safe) → 5 (isolated, parallel-safe) → 6 (re-run `ui-ergonomics` after #5; re-run the rest independently to confirm flake vs. regression)

---

*Original exhibits (`backlog_gemini.md`, `backlog_gemini_claudeCLI.md`) left untouched. No production code in `src/`/`tests/` was modified, staged, or committed.*
