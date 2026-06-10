Read CLAUDE.md in full before doing anything else.

This is an overnight session with two phases. Complete Phase A (code changes)
first, commit it, then proceed to Phase B (analysis report). Do not skip
Phase A to start Phase B.

========================================
PHASE A: BL-3.16 — Firestore Document Normalisation
========================================

Read these three files in full before making any changes:
- src/whs.js
- src/practice.js
- src/social.js

Also read src/state.js to understand the current mutateList helper.

## The Fix

Create two pure normaliser functions. These can live in a new file
(src/normalizers.js) or be added to the top of state.js — choose
whichever keeps the imports cleaner. State your choice before writing.

### normalizeRoundDoc(raw)
Accepts a raw Firestore doc data object, returns a cleaned version with
safe defaults for expected fields:
- date: raw.date || null
- score: typeof raw.score === 'number' ? raw.score : null
- courseName: raw.courseName || ''
- holes: Array.isArray(raw.holes) ? raw.holes : []
- userId: raw.userId || null
Preserve all other fields from raw via spread — the normaliser adds
safety, it does not strip unknown fields.

### normalizeUserDoc(raw)
Same pattern for user documents:
- uid: raw.uid || null
- displayName: raw.displayName || ''
- email: raw.email || ''
- isCoach: raw.isCoach === true
- isAdmin: raw.isAdmin === true
Preserve all other fields via spread.

### Wire the normalisers

Route each snapshot/getDocs callback through the appropriate normaliser
before data reaches AppState:

1. whs.js — onSnapshot callback: normalizeRoundDoc on each doc
2. practice.js — onSnapshot callback (the one using mutateList from
   BL-3.14): normalizeRoundDoc on each doc inside the mutateList call
3. social.js — getDocs callback: normalizeUserDoc on each doc in the
   snap.docs.map call (from BL-3.14 Phase 2)

Do NOT touch the existing mutateList calls — just add the normaliser
wrapping around the raw doc data.

## Hard constraints (Sydney Protocol — from CLAUDE.md)
- No .style.display, no !important, no CSS changes
- All Firebase references remain pinned to australia-southeast1
- Do not touch any other files beyond the normaliser location and
  the three consumer files
- Total line diff must not exceed 100 lines across all files
- Do NOT modify the Proxy set trap or the mutateList helper

## Phase A Deliverable
1. Where you placed the normalisers and why
2. The normaliseRoundDoc and normaliseUserDoc functions
3. The three wiring changes
4. Total line count
5. Commit: feat(data): add normalizeRoundDoc/normalizeUserDoc and
   wire to snapshot callbacks (BL-3.16)
6. Documentation update per CLAUDE.md workflow — mark BL-3.16 complete

========================================
PHASE B: Overnight Deep Review Report
========================================

After Phase A is committed, produce a comprehensive review of the
current codebase state. This is ANALYSIS ONLY — do not make any
code changes in Phase B. Write the output to a new file:
docs/overnight_review_2026-06-09.md

Read every file in src/ before writing the report. Take your time —
this is an overnight task and thoroughness matters more than speed.

The report should cover:

### 1. Sydney Protocol Compliance Audit
Scan every file in src/ for remaining violations:
- Any .style.display assignments (list file:line for each)
- Any !important in style.css (list each rule)
- Any direct array/object mutation on AppState that bypasses mutateList
  (list file:line for each)
Count total violations remaining after tonight's fixes.

### 2. BL-3.05 Readiness Assessment
The AI Practice Plan rebuild is the highest-priority active item.
Read src/ui.js (specifically bindPracticeCaddyUI), the Cloud Functions
in functions/, and index.html. Map:
- Current query paths vs. where they should point
- Data shape mismatches between Cloud Function output and UI expectations
- DOM ID mismatches between ui.js references and index.html elements
Produce a concrete, file-level fix plan for BL-3.05 that a future
Claude Code session can execute in chunks.

### 3. Test Suite Health
Read every file in tests/. For each spec file, report:
- How many real expect() assertions exist
- Whether the spec is a tautological placeholder (expect(true).toBe(true))
- Which specs are currently passing vs failing and why
This directly addresses AUDIT-02 (commit a63e1f3 hollow assertions).

### 4. Remaining Backlog Reassessment
In light of tonight's completed work (BL-3.12, BL-3.13, BL-3.14,
BL-3.15, BL-3.16), reassess the Deferred/Future items in
MASTER_BACKLOG.md:
- Which items are now unblocked by tonight's fixes?
- Which items' priorities have changed?
- Are there any new findings from the codebase scan that should be
  added to the backlog?
- Recommend the next 3-5 items to tackle in priority order

### 5. Functions/ Directory Audit (AUDIT-01)
This was explicitly flagged as an audit gap — the entire 14-file
Supermagic corpus was client-side only. Read every file in functions/
and report:
- Are all functions pinned to australia-southeast1?
- Any security concerns?
- Any data integrity issues at the client/server boundary?
- Any functions that reference paths inconsistent with firestore.rules?

## Phase B Deliverable
Write the complete report to docs/overnight_review_2026-06-09.md.
Do NOT commit it — leave it as an untracked file for morning review.
The report should be thorough enough that a human reading it over
coffee can make informed decisions about the next sprint without
needing to re-read any source files.