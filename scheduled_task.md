# Overnight Review — Night 1: ARCH-01 Blast Radius Audit (DOM IDs + Data Contracts)

## Ground rules (read first, non-negotiable)
- Read CLAUDE.md in full before anything else. The False Positive Registry
  (FP-01 through FP-10) applies: if a finding matches an FP entry, cite the
  FP-ID and drop it. Do not re-investigate.
- READ-ONLY session: do not edit any source file, do not run git commit/push,
  do not touch firestore.rules or functions/. Your only write is the report
  file named below.
- Do not start the Firebase emulator and do not run Playwright. Static source
  analysis only.
- Ignore node_modules/, dist/, _ARCHIVE/, logs/, test-results/.
- Every claim needs file:line evidence from current HEAD. No findings from
  docs alone — docs/01_feature_map.md and docs/02_debt_catalogue.md contain
  stale line numbers; treat them as leads, not evidence.

## Already known — do not re-report
- BL-3.05 remaining sub-task (personalisation inputs never sent to
  generatePracticePlan)
- BL-3.06 (assignedDrills missing security rule)
- BL-3.07 (comp-invite dead UI)
- The Practice Caddy fixes in PR #42 (normalizePracticePlan, DOM IDs,
  rating section)

## Task A — DOM ID reconciliation matrix (do this first, complete it fully)
1. Enumerate every element ID referenced from JS: getElementById,
   querySelector('#...'), and every ID cached in the UI object in src/ui.js.
2. Enumerate every id="..." in index.html.
3. Diff both directions, grouped by tab (whs, comp, practice, oncourse,
   tempo, feed, coach, admin, settings):
   - JS references with no matching HTML element (dead bindings — these fail
     silently)
   - HTML IDs nothing in JS references (orphaned UI — features that render
     but do nothing)
   - IDs bound more than once, and duplicate keys in the UI cache object
     (one known instance: mainApp at ui.js:15 and ui.js:191 — find any others)

## Task B — data contract audit (only after A is complete)
For each httpsCallable in src/ against its function in functions/index.js,
and for each onSnapshot/getDoc/getDocs consumer against the Firestore doc
shape written elsewhere (client or function side):
- list fields returned/stored vs fields the consumer actually reads
- flag shape mismatches (the BL-3.05 class), fields read but never written,
  and fields written but never read
- note where normalizeRoundDoc/normalizeUserDoc/normalizePracticePlan is
  bypassed and raw doc data flows into render code

## Output
Write ONE file: docs/overnight_review_night1_blast_radius.md
- Per-tab DOM matrix tables, then data contract findings
- Severity-rank every finding (broken feature > silent no-op > hygiene),
  each with file:line evidence and a one-line proposed fix + effort estimate
- Map overlaps to existing BL items; propose new BL-3.1x entries for the rest
- End with a "verified clean" list: tabs/contracts checked that had no
  findings, so future sessions don't re-sweep them
Do not update MASTER_BACKLOG.md or PIR_LOG.md — report file only.
If you run long, finish Task A completely rather than half-finishing both.