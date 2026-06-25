# Next-session startup prompt (paste after /clear)

Copy everything in the code block below into a fresh Claude Opus session.

```
Continue the Golf Handicap Tracker BL-4.x remediation. First read CLAUDE.md and
the recalled memories (jules-gemini-offload-workflow, single-source-manual-ratings).

OFFLOAD WIRING (per the memory): I implement BL-4.x items via Antigravity 2.0 /
Gemini 3.5 Flash and verify with Claude (cross-family — Gemini does NOT check
Gemini). YOUR (Opus) job is to write, per backlog item: (1) an airtight
implementation brief for Antigravity, (2) an adversarial check prompt for Claude.
Save each to docs/agent-briefs/bl-4.xx-*.md. The "airtight spec" gate + Sydney
Protocol constraints are in CLAUDE.md and the memory. Don't push/merge or open PRs
without my OK; commit src-only (ignore dist/, scheduled_task.md, logs/).

STATE TO VERIFY FIRST: BL-4.01 (WHS data integrity) is done — PR #54 merged. PR #55
(F3 + Keperra + BL-4.01 ✅ docs) was OPEN last session. Run `git fetch` and
`gh pr view 55` — if it's not merged, remind me; if merged, sync local main. Also
note my uncommitted CLAUDE.md "Model Selection" rewrite may still be in the working
tree — do not commit or revert it.

QUEUE: BL-4.17 (XSS — brief already written at docs/agent-briefs/bl-4.17-xss-
remediation.md) -> BL-4.08 (shots schema) -> BL-4.04 (comp logging + R-LIVE-1) ->
BL-4.02 (on-course rewiring, fuzziest). One item per turn.

START BY: confirm PR #55 status, then write the BL-4.08 brief — "Shots schema
reconciliation: line/curve vs startLine/shape; outcome:'Green' GIR; isOffGreen
setter; simpleStats sourcing" (F12, N4, N5, N15). Investigate the shot-recording
code at HEAD first (oncourse.js / score-input.js / ai.js consumers), THEN produce
the Antigravity implementation brief + the Claude cross-family check prompt, and
save them to docs/agent-briefs/bl-4.08-shots-schema.md.
```
