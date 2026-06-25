# BL-3.06 — Coach-assigned drills: client read path (offload brief)

> **Implementer:** Antigravity 2.0 / Gemini. **Independent check:** Claude (cross-family).
> Produced by Opus 2026-06-25. Follow the standing loop in
> `HANDOFF-antigravity-bl-4.x.md` + `LESSONS.md` (read LESSONS first; ask up-front on
> ambiguity; paste grep gates + the four-field Brief-feedback block in the PR).
> Branch `fix/bl-3.06-assigned-drills`. PR to main, **DO NOT MERGE**.
>
> **Decision (Opus, from the 2026-06-25 Confidence Audit):** BL-3.06 is **REAL** and
> re-scoped — this is **NOT a missing-rule task** (the rule already exists). The work is
> the **client READ path** + a player-facing view. Covers NIGHT1 **N22**.

## Root cause (verified at HEAD `aae25c1`)
Coaches assign drills, players can never see them:
- **Rule EXISTS** — `firestore.rules:48-56` `match /assignedDrills/{drillId}`: read (owner/
  coach/admin), update (owner *completed-only* / coach / admin), create+delete (coach/admin).
- **Write EXISTS** — `src/coach.js:145` `addDoc(collection(db,'users',_coachViewUid,'assignedDrills'), {drillName, notes, assignedBy, assignedAt: serverTimestamp(), completed:false})`.
- **Read path ABSENT** — a repo-wide grep for `assignedDrills` returns **only** the coach
  write (`coach.js:145`). No `onSnapshot`/`getDocs`/`getDoc` anywhere, and **no player-side
  UI**: the only `assignedDrills`-related markup in `index.html` is the coach's *assign*
  form (`#coach-drill-assign-name`/`-notes`, ~1975-1979) and the unrelated `#notif-drill-assign`
  pref toggle (~1137). So an assigned drill lands in Firestore and is never surfaced.

**Doc heads-up (out of scope, just don't be confused):** `docs/02_debt_catalogue.md:78`
and `docs/01_feature_map.md:181` still describe BL-3.06 as a *missing rule* — that framing
was superseded by the 2026-06-13 re-scope. The rule exists; do not add one.

## Document shape (what the read path consumes)
`users/{uid}/assignedDrills/{autoId}` = `{ drillName: string, notes: string, assignedBy: uid,
assignedAt: Timestamp, completed: boolean }`. `drillName`/`notes` are **coach-authored
strings → untrusted → must be escaped** (LESSONS L2).

---

## ① Implementation prompt (Antigravity 2.0 / Gemini)

```
TASK: Add the player-facing READ path for coach-assigned drills (BL-3.06 / N22). A new
"Assigned by Your Coach" panel on the merged Practice screen lists the current user's
users/{uid}/assignedDrills docs live, and the player can mark one complete. Branch
fix/bl-3.06-assigned-drills. PR to main, DO NOT MERGE. Read docs/agent-briefs/LESSONS.md first.

This is a READ-PATH + view task. Do NOT add or change any firestore rule (the rule already
exists, firestore.rules:48-56). Do NOT touch the coach-side assign form or coach.js.

FIX 1 — Markup (index.html). Add ONE card to the merged Practice screen (#tab-practice,
the single wrapper from BL-4.03). Place it as the FIRST card inside that screen's
`<div class="dashboard-grid" ...>` (the one holding "Log a Practice Session" etc.),
immediately after the grid's opening tag, so assigned drills sit at the top of the
"Log & Track Sessions" section. Use this structure (ids EXACT):
    <div class="card bg-white" style="grid-column: 1;">
        <h2 class="section-title">📋 Assigned by Your Coach</h2>
        <div id="assigned-drills-empty" class="empty-state" style="padding: 15px;">
            No drills assigned yet. Your coach can set you targeted work here.
        </div>
        <div id="assigned-drills-list"><!-- JS injects rows --></div>
    </div>
  Visibility is state-driven: toggle the `hidden` class on #assigned-drills-empty (NOT
  .style.display). Do not add !important, do not edit style.css.

FIX 2 — Read path (src/practice.js). Mirror the EXISTING listenToPractice pattern
(practice.js:357-377) — do not invent a new convention:
  - Add a module-scoped `let unsubscribeAssignedDrills = null;` next to
    `unsubscribePractice` (practice.js:13).
  - Add `listenToAssignedDrills()`:
      if (!AppState.currentUser) return;
      if (unsubscribeAssignedDrills) unsubscribeAssignedDrills();   // guard/teardown (FP-02 pattern)
      const q = query(collection(db, 'users', AppState.currentUser.uid, 'assignedDrills'),
                      orderBy('assignedAt', 'desc'));
      unsubscribeAssignedDrills = onSnapshot(q, (snap) => { renderAssignedDrills(snap); });
  - `renderAssignedDrills(snap)`: build the list into #assigned-drills-list. For EACH doc,
    render drillName + notes + a relative/short assignedAt date + completed state. EVERY
    coach-authored string (drillName, notes) MUST go through escapeHtml (import from
    './escape.js', already used in this file) or via textContent — never raw-interpolate.
    Toggle #assigned-drills-empty's `hidden` class on snap.empty (show empty-state when 0).
  - Call `listenToAssignedDrills()` at the SAME site(s) that call `listenToPractice()`
    (practice.js:122 and :216), and tear down `unsubscribeAssignedDrills` wherever
    `unsubscribePractice` is torn down (e.g. on logout/auth-change), so it cannot leak or
    cross users.

FIX 3 — Mark complete (SECOND commit). Let the player tick an assigned drill done. The
rule already allows the OWNER to update the `completed` field only.
  - Each rendered row gets a control (checkbox or button) carrying the doc id
    (data-drill-id). On click: `updateDoc(doc(db,'users',AppState.currentUser.uid,
    'assignedDrills', id), { completed: <newValue> })`. The onSnapshot listener re-renders
    automatically — do not hand-mutate the DOM after the write. Bind via delegation on
    #assigned-drills-list (one listener), not per-row.

HARD CONSTRAINTS (Sydney Protocol):
  - Visibility state-driven via the `hidden` class; no .style.display, no !important, no
    style.css edit.
  - Firebase region pinned — reuse the shared `db` import; no getFunctions/region call.
  - Escape all coach-authored strings (escapeHtml/textContent) — standing rule (L2).
  - Do not change the rule, the coach assign form, or coach.js. READ side only.
  - Split into 2 commits: (1) FIX 1+2 read path & view, (2) FIX 3 mark-complete.

ACCEPTANCE:
  - npm run build clean; npm run test:unit baseline unchanged (whs 10/10; only contract (b)
    red). NOTE: adding the new ids may change contract (b)'s offender list but must not make
    a previously-green contract red — if any inner id you reference from JS isn't in
    index.html, the contract (b) test will list it; keep #assigned-drills-list/-empty in
    index.html so they don't become new (b) offenders.
  - GREP GATE (paste output): `grep -rn "assignedDrills" src/` now shows the new
    onSnapshot read in practice.js (not just coach.js:145); `grep -c "id=\"assigned-drills-list\"" index.html` == 1 and `id="assigned-drills-empty"` == 1.
  - GREP GATE (escaping): show that drillName/notes are wrapped in escapeHtml or set via
    textContent in practice.js (paste the render lines).
  - Manual (if emulator): coach assigns a drill to a player → it appears live in the player's
    "Assigned by Your Coach" panel with the name/notes escaped; empty-state shows when none;
    ticking complete flips `completed` and the row reflects it after the snapshot.
  - PR: grep-gate output + the four-field Brief-feedback block (Clarity gaps / Rationale /
    Deviations / Coverage method).
```

## ② Independent check prompt (Claude — cross-family, NOT Gemini)

```
You are reviewing BL-3.06 (coach-assigned drills client read path) in a vanilla-JS/Firebase
app. I will paste the diff (index.html, src/practice.js). PASS/FAIL per item with file:line.
Run your OWN greps; be skeptical.

1. READ PATH EXISTS: practice.js now has an onSnapshot on
   users/{uid}/assignedDrills (orderBy assignedAt desc), with a stored
   `unsubscribeAssignedDrills` that is guarded/torn-down (FP-02 pattern) and called at the
   same site(s) as listenToPractice. FAIL if the listener is one-shot (getDocs without
   teardown) or never invoked.
2. PLAYER VIEW EXISTS: #assigned-drills-list + #assigned-drills-empty added to the single
   #tab-practice screen; empty-state toggled via the `hidden` class on snap.empty. Each row
   shows drillName + notes + assignedAt. FAIL if rendered on the coach screen or a new
   tab-content wrapper.
3. ESCAPING: drillName and notes (coach-authored) are escaped via escapeHtml or set via
   textContent — NOT raw-interpolated into innerHTML. FAIL on any raw `${...}` of coach data
   (LESSONS L2).
4. MARK-COMPLETE: player toggle writes updateDoc({completed}) to the OWNER's
   assignedDrills doc (not the coach path), bound by delegation, and relies on the snapshot
   to re-render (no hand-DOM mutation). FAIL if it writes any field other than `completed`.
5. SYDNEY / SCOPE: no .style.display, no !important, no style.css edit, no rule change, no
   getFunctions/region call; coach.js + the assign form untouched. Build clean; test:unit
   baseline unchanged (whs 10/10; only (b) red, and the two new ids are present in
   index.html so they are not new (b) offenders).

Output: items 1-5 PASS/FAIL + evidence, a "LOST FUNCTIONALITY" line, verdict SHIP/FIX-FIRST,
then a "Doc/Process update" line (read the implementer's four feedback fields; capture a
tagged LESSONS entry + patch the source if a real defect/recurring miss, else "nothing new").
```

---
*Notes for the merge docs: this closes BL-3.06 / NIGHT1 N22. When it lands, also re-align
`docs/02_debt_catalogue.md:78` + `docs/01_feature_map.md:181` off the superseded "missing
rule" framing (Confidence-Audit §3 fix-in-docs item).*
