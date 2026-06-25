# BL-X.XX — <title> (offload brief)

> **Implementer:** Antigravity 2.0 / Gemini. **Independent check:** Claude (cross-family).
> Produced by Opus <date>. Follow the standing loop in
> `HANDOFF-antigravity-bl-4.x.md` + `LESSONS.md` (read LESSONS first; ask up-front on
> ambiguity; paste grep gates + the four-field Brief-feedback block in the PR).
> Branch `<branch>`. PR to main, **DO NOT MERGE**.
>
> **Decision (user <date>):** <the one-line decision this brief implements>.

## Root cause (verified at HEAD)
<What is wrong, proven against current source with file:line. State what is NOT wrong
too if a prior claim was inverted — cite the FP-ID if it's a known false positive.>

---

## ① Implementation prompt (Antigravity 2.0 / Gemini)

```
TASK: <one sentence>. Branch <branch>. PR to main, DO NOT MERGE.
Read docs/agent-briefs/LESSONS.md first.

FIX 1 — <name> (<file>). <Exact change, with anchors/line hints.>
  - <step>
  - <step>
  NOTE: every element named in a FIX step ships. An "e.g." scopes the *styling* of an
  element, not whether it exists — include it verbatim or record in Brief-feedback >
  Deviations why you dropped it (LESSONS L6).

FIX 2 — <name> (<file>). <...>

HARD CONSTRAINTS (Sydney Protocol):
  - Visibility state-driven via body[data-active-tab] + the `hidden` class. No
    .style.display assignments, no !important, no unrelated style.css edits.
  - Firebase region pinned to australia-southeast1 — no getFunctions()/region call
    outside firebase-config.js; reuse shared functions/db imports.
  - AppState: mutate via mutateList(key, fn) (reference change) — EXCEPT the documented
    in-place simpleStats/compStats + loadHole() path; follow the brief, don't "upgrade" it.
  - Escape untrusted output with escapeHtml or route via textContent/setAttribute, even
    if XSS isn't mentioned (LESSONS L2).
  - <task-specific contracts this must not violate>
  - Split into <N> commits: (1) ..., (2) ...

ACCEPTANCE:
  - npm run build clean; npm run test:unit baseline unchanged (whs 10/10; the mapped
    contract(s) still red unless this brief says one flips green).
  - GREP GATE (paste output in PR): <exact grep(s) + expected count>.
  - <manual / emulator check if relevant>.
  - PR description: grep-gate output + the four-field Brief-feedback block (Clarity gaps,
    Rationale, Deviations, Coverage method — HANDOFF step 6d).
  - NOTE in PR: <anything expected-but-looks-like-a-regression, e.g. out-of-scope items>.
```

## ② Independent check prompt (Claude — cross-family, NOT Gemini)

```
You are reviewing BL-X.XX in a vanilla-JS/Firebase app. I will paste the diff
(<files>). PASS/FAIL per item with file:line evidence. Be skeptical; run your OWN
greps, don't trust the PR's.

1. <core acceptance item — the thing the fix exists to do>. FAIL if <…>.
2. NO LOST FUNCTIONALITY: <ids/behaviours that must survive>. FAIL on any dropped <…>.
3. SCOPE: only the intended change; <what must NOT have moved>.
4. SYDNEY: no .style.display added, no !important, no style.css edit (unless intended),
   no getFunctions/region call. Build clean; test:unit baseline unchanged.
5. <task-specific gate>.

Output: items PASS/FAIL + evidence, a "LOST FUNCTIONALITY" line (NONE / FOUND:…),
verdict SHIP / FIX-FIRST, then a "Doc/Process update" line — read the implementer's
four feedback fields and either capture a tagged LESSONS entry + patch the source, or
state "nothing new" (HANDOFF loop-back duty).
```

---
*Template v1 (2026-06-25). The four-field Brief-feedback block + reviewer loop-back duty
are defined in `HANDOFF-antigravity-bl-4.x.md`; lessons accumulate in `LESSONS.md`.*
