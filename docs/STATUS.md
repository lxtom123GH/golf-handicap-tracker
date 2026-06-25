# STATUS — Golf Handicap Tracker

> Living index: where we are, what's next, and which doc is authoritative for what.
> Update this when a backlog item ships or priorities change. Detail lives in
> `MASTER_BACKLOG.md`; this is the one-page map. Last updated: 2026-06-25.

## Current state
- **BL-4.x P1 remediation queue: shipped & merged** — BL-4.01 (WHS integrity),
  BL-4.05 (coach linkage), BL-4.06 (askAiCoach region), BL-4.07 (auth bypass),
  **BL-4.17** (stored XSS), **BL-4.08** (shots schema), **BL-4.04** (comp logging +
  R-LIVE-1 + F8 compStats), **BL-4.02** (on-course setup rewiring). BL-4.00 static
  contract suite in place.
- Implemented via the offload loop (Antigravity 2.0/Gemini implements →
  Claude cross-family review → merge). Process docs: `docs/agent-briefs/HANDOFF-*`
  + `LESSONS.md`.
- Build clean; `test:unit` baseline: whs 10/10; contract groups (c)(d)(e) green,
  (a)(b) intentionally red pending their mapped fixes.

## Next up (priority order)
**P1 — in flight**
1. **BL-4.03** — duplicate `id="tab-practice"`. **Decision made: MERGE** both screens
   (AI Caddy + manual Drills) into one; brief written
   (`docs/agent-briefs/bl-4.03-practice-merge.md`), handed to Antigravity.
   *Status: implementation in flight → awaiting PR → cross-family check.* Also fixes N18.
2. **BL-3.05 ✅ CLOSED (2026-06-25)** — was "send personalisation inputs so plans
   aren't generic"; verified **inverted premise** (FP-11): `generatePracticePlan`
   already personalises server-side from `whs_rounds` + `profiles.handicapIndex`
   (`functions/index.js:257-290`). TODO corrected (commit `d2f2e23`). Genuine forward
   work captured as Adaptive-Engine **F-A** (self-reported inputs) / **F-B**
   (voice-diary→plan) in MASTER_BACKLOG — parked, not bugs.

**Rough next-3 build queue** (one chunk → PR → cross-family check → next; brief each
just-in-time off fresh HEAD, not in advance). All bounded, low-decision:
1. **BL-3.06** — `assignedDrills` client read path + rules-test (rule already exists).
2. **BL-3.07** — competition invite-players wiring (dead UI → handlers + Firestore writes).
3. **BL-4.11** — last legacy `.active` remnant (telemetry active-tab check only; small).
*Decision-gated, surface to user before briefing:* **BL-4.16** (surveyor: descope vs build),
**BL-4.12** (comp archive/delete: implement vs strip).

**P2**
2. **BL-4.11** — legacy `.active` remnants. ⚠️ **Partially done:** BL-4.02 fixed the
   event-binders alert gate; **only the telemetry active-tab check remains** (small).
3. **BL-4.16** — surveyor persistence: DECIDE descope-to-local vs build (R-LIVE-2).
4. **BL-4.12** — comp archive/delete: implement or strip dead UI.
5. **BL-4.14** — mid-round review scorecard: restore trigger or delete dead feature.
6. **BL-4.10** — notifications: wire `triggerLocalNotif` to saved prefs or descope.
7. **BL-4.09** — feed differential: compute at fan-out or drop column.
8. **BL-4.15** — route `liveRoundGroups` writes through `mutateList`. ⚠️ Tension with
   the in-place `simpleStats`/`compStats` + `loadHole()` pattern used by BL-4.04 F8 /
   BL-4.08 — reconcile the contract before changing it.

**P3**
9. **BL-4.13** — hygiene sweep (dead keys/CSS/`!important`×44/dup renders, etc.).

**Also open (from CLAUDE.md active backlog, pre-4.x):**
- **BL-3.06** `assignedDrills` client read path + rules test · **BL-3.07** competition
  invite-players wiring. *(BL-3.05 closed — see above / FP-11.)*
- **Practice Caddy Upgrades (Adaptive Engine)** incl. **F-A** self-reported inputs +
  **F-B** voice-diary→plan (captured 2026-06-25; both reuse existing pipelines).

**Deferred:** DATA-01 (firestore-paths), DATA-04 (followers index), ARCH-02 (ui.js
split), ARCH-03 (FIRESTORE_SCHEMA), AUDIT-01 (`functions/` review — Cloud Functions
never audited; do before first real-user release).

## Doc map (what's authoritative)
| Doc | Role |
|---|---|
| `CLAUDE.md` (root) | Agent operating contract — Sydney Protocol, model routing, FP-01..10, post-commit workflow |
| `MASTER_BACKLOG.md` (root) | **Source of truth for tasks** — detailed debt ledger + completion notes/hashes |
| `docs/STATUS.md` (this) | Current state + next-up index |
| `docs/01–07_*.md` | Audit corpus: feature map, debt catalogue, testing strategy, production-readiness, unit-test audit, residue audit, session report |
| `PIR_LOG.md` (root) | Post-incident reviews — strategic sessions only; do not edit ad-hoc |
| `docs/agent-briefs/HANDOFF-*` + `LESSONS.md` | Multi-agent offload process (reusable) |
| `_ARCHIVE/` | Historical QA reports; `_ARCHIVE/bakeoff/` = superseded multi-model variants; `_ARCHIVE/agent-briefs-shipped/` = shipped BL-4.x briefs; `_ARCHIVE/PIR_log_legacy_2026-03.md` = separate legacy PIR log |

## Loose ends to reconcile (housekeeping)
- `CLAUDE.md` has an uncommitted "Model Selection" edit in the working tree — decide
  to commit or discard so the instruction source isn't left dirty. (Under review:
  also refresh the stale offload-workflow refs — "Jules" → Antigravity/Gemini +
  Claude cross-family — and point the Active Backlog Reference at this STATUS doc.)
- `docs/agent-briefs/NEXT-SESSION-PROMPT.md` is a stale ephemeral handoff note —
  archive or delete.

*Resolved 2026-06-25: legacy `docs/PIR_log.md` archived (it was a separate log, not
a partial of root); `docs/briefs/` folded into `docs/agent-briefs/`; shipped BL-4.x
briefs archived to `_ARCHIVE/agent-briefs-shipped/`.*
