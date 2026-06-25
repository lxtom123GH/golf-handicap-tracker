# BL-4.17 — Stored XSS remediation (offload brief)

> Working artifact. **Implementer:** Google Antigravity 2.0 driving Gemini 3.5 Flash
> (encode the Sydney Protocol as an Antigravity skill/instruction file).
> **Independent check:** Claude (cross-family — do NOT check Gemini with Gemini).
> Produced by Opus 2026-06-15; wiring updated 2026-06-25. Safe to delete after ship.
>
> Status when written: BL-4.01 closed (PR #54 merged; PR #55 open with F3 +
> Keperra). Next briefs queued: **BL-4.08** (shots schema) → **BL-4.04** (comp
> logging + R-LIVE-1) → **BL-4.02** (on-course rewiring, fuzziest).
>
> Pre-verified at HEAD: no escape helper exists anywhere in src/ (only safe
> `.textContent`); the `innerHTML` + `displayName` sink pattern is real
> (e.g. `src/social.js:46`). Sink list below is the FLOOR, not the ceiling.

---

## ① Implementation prompt (for Antigravity 2.0 / Gemini 3.5 Flash)

```
TASK: Fix stored XSS in the Golf Handicap Tracker (vanilla JS / Vite / Firebase).
User-controlled strings (displayName, round.course, competition/player names) are
interpolated into innerHTML without escaping, so a crafted value persists to
Firestore and executes when rendered for another user. Add output-escaping at
every sink, with a regression test. Open a PR to main on a branch
fix/bl-4.17-xss. Do NOT merge.

THIS IS A SECURITY FIX — be exhaustive, not minimal.

STEP 1 — Add a shared escape helper.
Create src/escape.js:

    /**
     * HTML-entity-encode an untrusted string for safe interpolation into innerHTML
     * text or quoted-attribute contexts. (BL-4.17)
     */
    export function escapeHtml(value) {
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

STEP 2 — Apply it at EVERY sink where a Firestore-sourced / user-controlled
string is interpolated into innerHTML or a template literal later assigned to
innerHTML. Wrap only the untrusted value, e.g.
`...${escapeHtml(player.displayName || player.email)}...`.

Known sinks (verify each at HEAD — line numbers may have drifted; these are the
FLOOR, not the ceiling):
  - round.course      -> src/whs.js (~:342), src/ui.js (~:371), src/coach.js (~:269)
  - displayName       -> src/admin.js (~:25), src/social.js (~:46 and ~:107),
                        src/competitions.js (~:592-593)
  - displayName (self, lower risk) -> src/notifications.js (~:70)

DISCOVERY (required): before finishing, grep the whole src/ tree for every
`innerHTML` assignment and every template literal later set as innerHTML, and
escape ANY interpolated value that originates from Firestore/user input
(displayName, email, *.course, competition name, player name, notes, etc.).
List every sink you changed in the PR description. Do not assume the list above
is complete.

STEP 3 — Regression test. Add tests/unit/escape.test.js (Vitest) asserting
escapeHtml neutralises `<`, `>`, `"`, `'`, `&` — e.g.
escapeHtml('<img src=x onerror=alert(1)>') contains no raw `<` and no executable
markup; null/undefined -> ''. (Optional but preferred: a jsdom test that renders
one real sink with a payload and asserts the DOM contains the escaped entity, not
a live element.)

HARD CONSTRAINTS (Sydney Protocol — do not violate):
  - Output-escaping ONLY. Do NOT change DOM structure, component visibility, or
    the existing `innerHTML = ''` clear-before-rebind pattern.
  - Do NOT add a dependency (no DOMPurify) — the entity helper is sufficient for
    these text/attribute contexts.
  - Do NOT touch: Firebase region pinning, getFunctions usage (must stay only in
    firebase-config.js), AppState proxy / mutateList, or any `.style.display`.
  - Escape the untrusted value only — do not double-escape static markup or break
    data-* attributes / event-binding selectors.

ACCEPTANCE:
  - `npm run build` clean.
  - `npm run test:unit` passes the new escape test; the two contract tests (a)(b)
    remain intentionally red, (c)(d)(e) green, whs 10/10 — i.e. you did not change
    that baseline.
  - Every enumerated sink + every sink found by grep wraps the untrusted value in
    escapeHtml. PR description lists them all.
```

## ② Independent check prompt (for Claude — cross-family, NOT Gemini)

```
You are doing a security review of a stored-XSS fix in a vanilla-JS/Firebase app.
I will paste the diff (or the files: src/escape.js, src/whs.js, src/ui.js,
src/coach.js, src/admin.js, src/social.js, src/competitions.js,
src/notifications.js, tests/unit/escape.test.js). Verify against this checklist
and answer PASS/FAIL per item with file:line evidence. Be skeptical — assume a
sink was missed.

1. ESCAPE HELPER: Does src/escape.js define an escapeHtml that entity-encodes &,
   <, >, ", ' and returns '' for null/undefined? Any ordering bug (must replace &
   first)? FAIL if a sink uses a hand-rolled partial escape instead.

2. COVERAGE — the critical check. Independently scan EVERY pasted file for:
   (a) `x.innerHTML = ` assignments, and (b) template literals (`...${...}...`)
   that are later assigned to innerHTML or returned into one. For each, list every
   interpolated expression. For ANY expression that could be user/Firestore data
   (displayName, email, *.course, competition name, player name, notes, free
   text), confirm it is wrapped in escapeHtml. Report any UNescaped user-controlled
   interpolation as a FAIL with file:line — including ones not in the original
   known-sink list.

3. CORRECTNESS: Is only the untrusted value escaped (not whole static markup)? Any
   double-escaping? Any value escaped for innerHTML but actually used in a JS/URL
   context (different encoding needed)? Any broken data-* attribute or selector?

4. REGRESSION TEST: Does tests/unit/escape.test.js actually assert neutralisation
   (e.g. a payload like `<img src=x onerror=alert(1)>` produces no raw `<`)? A test
   that only checks the happy path is a FAIL.

5. NO CONTRACT DAMAGE: Confirm the change did NOT alter component-visibility logic,
   add a getFunctions call outside firebase-config.js, introduce `.style.display`,
   add a dependency, or change the `innerHTML=''` clear pattern.

Output: a table of items 1-5 with PASS/FAIL + evidence, then a "MISSED SINKS"
section listing any unescaped user-controlled innerHTML interpolation you found,
then a one-line verdict: SHIP / FIX-FIRST.
```
