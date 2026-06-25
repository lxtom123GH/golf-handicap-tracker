# LESSONS — BL-4.x offload loop (shared ledger)

Both agents read this before starting a chunk; the reviewer appends after a finding.
Newest lessons at the top. Each entry: what happened → the rule it becomes.

---

## L6 — A brief's example snippet can still be a required step (BL-4.03)
**What happened:** the practice-merge brief said the two sections must be "separated
by a divider … **e.g.** `<hr>` `<h2>Log & Track Sessions</h2>`". The implementer read
"e.g." as making the *whole* divider optional and shipped the two sections butted
directly together (no separator, no sub-heading). The cross-family check's item 3 ("a
divider/sub-heading separates the two sections") caught it — a one-criterion FIX-FIRST,
fixed on the same branch (`aae25c1`) → SHIP.

**Rule (both agents):** "e.g." scopes the *styling*, not the *existence* of the
element. If a FIX step names an element as part of the result, it ships — implementers
include it verbatim or record in Brief-feedback › Deviations why it was dropped; brief
authors mark the requirement explicit ("**Required:** a divider; example styling below")
and never leave a mandatory step hiding behind "e.g." (now encoded in `_TEMPLATE-brief.md`).

## L5 — Paste EVERY gate the brief lists, not the first one (BL-4.03; repeat of L1/L4)
**What happened:** the brief's acceptance named two grep gates
(`id="tab-practice"`==1 **and** `PRACTICE DRILLS TAB END`==1) plus inner-id spot-checks
plus the build/test:unit baseline. The PR pasted only the first grep and *asserted* the
rest ("No inner IDs were touched", "Tests pass normally"). Independent review confirmed
the assertions happened to be true — but that is luck, not demonstration, and it is the
same under-demonstration as L1/L4.

**Rule:** "Demonstrate completeness" means paste the **full** gate set the brief lists —
every grep, the spot-checks, and the build/test output — in the PR. One gate pasted +
the rest asserted is an incomplete PR even when the assertions hold. (Reinforced by the
four-field Brief-feedback block: Coverage method must name *how*, not just claim done.)

## L1 — Discovery is the FLOOR, not the ceiling (BL-4.17, chunk 1)
**What happened:** the XSS brief listed known innerHTML sinks and said explicitly
"the list is the floor… grep the whole `src/` tree." The implementer instead (a) only
opened the named files and (b) relied on a self-written `find_sinks.py` whose regex
`innerHTML…([^;]+);?` truncated at the first `;` — and inline CSS in the template
literals (`style="…;…"`) contains semicolons, so it never reached the `${p.name}`
lower in the multi-line template. Four user-controlled `name` sinks in three unnamed
files (`oncourse.js`, `card-render.js`, `event-binders.js`) were missed. Cross-family
review (an independent `git grep` of *every* `${…}` interpolation) caught them.

**Rule:** When a brief has a discovery/grep gate, enumerate by the **dangerous
pattern** across the whole tree (every `innerHTML` assignment, every `${…}`), not by
the named-file list. Never trust a single homegrown detector's all-clear — run the
brief's grep gate and **paste the output in the PR**. Named files = floor, not ceiling.

## L2 — `escapeHtml` is the standing output-encoder (BL-4.17, chunk 1)
**What happened:** chunk 1 created `src/escape.js`. Later chunks render user data too.

**Rule:** From chunk 2 on, any Firestore-/user-sourced string going into innerHTML uses
`escapeHtml`, or goes via `textContent`/`setAttribute` — **even if the brief doesn't
mention XSS**. Don't reintroduce a sink in new code.

## L3 — No scratch files in commits (BL-4.17, chunk 1)
**What happened:** the implementer wrote helper scripts (`find_sinks.py`, a second
Python checker) at the repo root. They were correctly kept out by staging explicit
paths — but the risk is a blanket `git add`.

**Rule:** Stage explicit paths (`git add <files>`), never `git add .`/`-A`. Helper
scripts, notes, and `walkthrough.md`-type artifacts stay untracked. PRs = `src/`+`tests/`.

## L4 — Coverage is demonstrated, not self-certified (process)
**What happened:** the implementer's own detector had a blind spot; only the
independent reviewer (different method) found the gap. Self-certified "coverage
complete" was wrong.

**Rule:** Implementer "done/complete" claims are inputs to review, not conclusions.
The cross-family check — a *different* verification method on the pushed PR — is the
gate. This is why the implementer never self-merges.
