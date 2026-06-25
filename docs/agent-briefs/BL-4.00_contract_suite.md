# BL-4.00 — Static Contract Suite (Brief)

**Status:** Brief only — implement nothing from this document.
**Priority:** FIRST. Ships before any other BL-4.x fix so each later fix shrinks the allowlist and flips one assertion green.
**Source:** NIGHT2 tests-to-write item #1; NIGHT4 recommended first wave. Targets the *dead-id / contract-drift* root class behind NIGHT1 F5, F6, F7, F8, F10, and F1's root.
**Owner tool:** Claude Code (Tier 1, no emulator, no browser).

---

## 1. Goal

A single Tier 1 Vitest suite at **`tests/unit/contracts.test.js`** that statically validates four DOM/JS contracts by reading source as text — **no app code is imported, no emulator, no browser, no network.** It runs under the existing `npm run test:unit` (which globs `tests/unit/**`) and completes in well under a second.

Four assertions:

- **(a) Unique HTML ids.** Every `id="…"` in `index.html` is unique. → catches **NIGHT1 F5** (duplicate `id="tab-practice"` at index.html:186 and 1705).
- **(b) JS id references resolve.** Every *string-literal* id referenced from `src/` via `getElementById('…')` or `querySelector('#…')` exists in `index.html`, **modulo a documented JS-created-id allowlist** (§3). → catches **F6** (`coach-uid-input`, coach.js:36 — HTML has `coach-email`), **F8** (`log-comp-dynamic`, competitions.js:150/161 — HTML has `comp-dynamic-inputs`), and the dead **`oc-manual-cr/sr/par`** family at **F1's root** (oncourse.js:1028-1030 — never created anywhere).
- **(c) Single Functions instance.** The token `getFunctions(` appears in `src/` **only** in `src/firebase-config.js`. → catches **F7** (ai.js:233 builds an unpinned `getFunctions()` → us-central1, violating the australia-southeast1 contract).
- **(d) No forced-true gates.** No `if (true ||` or `if (true||` anywhere in `src/`. → tripwire for **F10's class** (auth-v2.js:149 `if (true || …)` debug override).

---

## 2. How each assertion reads source (implementation approach)

All four use `fs.readFileSync` + `glob`/`fs.readdirSync` over `src/**/*.js` and `index.html`. **No `import` of any `src/` module.** Pure string/regex scanning. `jsdom` is permitted for (a) only, if regex id-extraction proves fragile — but a regex over `id="…"` / `id='…'` is expected to suffice; do not pull in jsdom unless needed.

- **(a)** Read `index.html` as text. Extract all ids via `/\bid\s*=\s*["']([^"']+)["']/g`. Collect into an array; assert `array.length === new Set(array).size`. On failure, report the duplicated id(s) and their occurrence count.
- **(b)** Read every file under `src/` (recursively, `*.js` only). Extract **string-literal** referenced ids from two patterns:
  - `/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g`
  - `/querySelector(?:All)?\(\s*['"]#([A-Za-z0-9_-]+)['"]\s*\)/g` (simple `#id` selectors only — skip compound/descendant selectors)
  Skip any call whose argument is a template literal (backtick) or a variable — those are *computed* ids, out of scope (see the dynamic-pattern note in §3). Build `referenced`. Build `htmlIds` from `index.html` (same extractor as (a)). Assert `referenced ⊆ (htmlIds ∪ ALLOWLIST)`. On failure, print each offending `id` with the `file:line` it was referenced from, so triage maps directly to a finding.
- **(c)** Scan `src/**/*.js` for the literal substring `getFunctions(`. Collect the set of files containing it. Assert that set is exactly `{ 'src/firebase-config.js' }` (path-normalised). On failure, list the offending files + lines.
- **(d)** Scan `src/**/*.js` for `/if\s*\(\s*true\s*\|\|/`. Assert zero matches. On failure, list `file:line` of each match.

Each assertion's failure message must enumerate the offenders (id, file:line) — a bare boolean is not acceptable; the suite doubles as a live inventory.

---

## 3. The JS-created-id allowlist (assertion (b))

A documented `const ALLOWLIST = [ … ]` of ids that are **legitimately created by JS at runtime** (so they are validly referenced but absent from `index.html`). Enumerated from NIGHT1 Task A's "JS-injected DOM that legitimately satisfies references". **Each entry carries a comment citing its creator and, if the entry is dead/leftover, the BL-4.x that will delete it — and each later BL-4.x fix shrinks this list.** A green suite only happens once the real fixes land *and* the allowlist contains only genuinely-injected ids.

Starting contents:

| Allowlisted id(s) | Created by | Disposition |
|---|---|---|
| AI modal internal ids (`ai-*` / `btn-*-ai*` rendered inside the injected modal) | `ai.js:26-56` (modal injected at runtime, UI re-cached ai.js:59-61) | **Keep** — genuinely injected. *Do NOT allowlist the stale `btn-ai-player`, `btn-ai-coach`, `ai-prompt-textarea`, `btn-copy-ai-prompt` — those exist nowhere (NIGHT1 H2) and must remain violations until deleted by BL-4.13.* Enumerate the exact injected ids from `ai.js` when implementing. |
| `oc-comp-regulars-select` | `event-binders.js:92-103` (checkbox list injected) | Keep |
| `ai-coach-feedback` | `oncourse.js:1372` (injected) | Keep |
| `oc-fixed-finish-btn` | `event-binders.js:443-450` (FAB created + appended to `<body>`) | Keep — **NIGHT3 R8** corrected NIGHT1 H14: this element *is* created, so the reference is legitimate. |
| `temp-submit-register` | `auth-v2.js:33` (`submitBtn.id = …`), referenced auth-v2.js:46 | **Temporary** — leftover (NIGHT1 H11). Allowlist now; **BL-4.13 deletes it**, then remove from allowlist. |

**Dynamic-pattern note (not allowlist entries — the scanner skips them):** template-literal/computed ids are out of scope for the literal scan and are documented here so reviewers know they are intentionally not checked:
- `drill-input-${id}` (created practice.js:326; referenced practice.js:186,350)
- `btn-pin-${type}` → `btn-pin-front/back/override` (surveyor.js:124; all exist in HTML anyway)
- `ALL_SCREENS` / `switchTab` dynamic `tab-*` lookups (ui.js:232,247) — the `tab-*` screens all exist in `index.html`; references are computed, not literal.

**Not allowlisted (these are the violations the suite must surface, not hide):** `coach-uid-input` (F6), `log-comp-dynamic` (F8), `oc-manual-cr/sr/par` and `oc-course-info-line`/`oc-daily-handicap-line` (F1 root / N2), plus the H-series dead cache-key refs (`btn-sync-rounds`, `btn-oc-abort-round`, `oc-progress-bar`, `oc-simple-stats*`, old wizard `btn-shot-*`, etc.). These either get repointed (BL-4.01/4.02/4.04/4.05) or their dead reference deleted (BL-4.13).

---

## 4. Expected initial result — the suite ships RED

At current HEAD (`38d78e2` docs-merge; source unchanged from `e50c3f5`) all four assertions FAIL. This is intended: the suite is a RED tripwire that goes green only as BL-4.x lands.

| Assertion | Initial result | Failing because → finding | Goes green when |
|---|---|---|---|
| (a) unique ids | **FAIL** | duplicate `id="tab-practice"` (index.html:186, 1705) → **F5** | **BL-4.03** merges/retires the legacy Practice screen |
| (b) id refs resolve | **FAIL** | `coach-uid-input` → **F6**; `log-comp-dynamic` → **F8**; `oc-manual-cr/sr/par` + `oc-course-info-line`/`oc-daily-handicap-line` → **F1 root / N2**; plus H-series dead refs | per-entry as **BL-4.05** (F6), **BL-4.04** (F8), **BL-4.01/4.02** (F1/oc-manual), **BL-4.13** (dead refs) land; allowlist shrinks alongside |
| (c) single getFunctions | **FAIL** | `getFunctions(` in `ai.js:233` → **F7** | **BL-4.06** — and note this session's `fix/xs-contract-violations` PR fixes F7, so (c) flips green as soon as that PR merges |
| (d) no `if (true \|\|` | **FAIL** | `if (true \|\| …)` in `auth-v2.js:149` → **F10** | **BL-4.07** (F10 removal, separate security-reviewed brief) |

Document these expected failures in the suite file header so a maintainer who sees RED knows it is by-design, not a broken suite. As each fix lands it should, in the same PR, either delete the now-resolved expectation or convert it to a passing regression assertion (per the Commit-Hash Mandate, the guard ships with its fix).

---

## 5. Acceptance criteria

1. File exists at **`tests/unit/contracts.test.js`** and is picked up by **`npm run test:unit`** (`vitest run tests/unit`) with no config change — `tests/unit/**` already globs.
2. Runs Tier 1: no emulator, no browser, no network, **no `src/` module imported**; pure `fs` + regex (jsdom only if (a) requires it). Completes < 1s.
3. Four independent `describe`/`it` blocks, one per assertion (a)–(d), each with a failure message that enumerates offenders as `id` and/or `file:line`.
4. `ALLOWLIST` is a documented `const` with a per-entry comment citing the creator and (for dead entries) the BL-4.x that removes it.
5. Suite **ships RED** with a header comment mapping each current failure to its finding (the §4 table). It is not "fixed" by weakening assertions — it goes green only as BL-4.x closes.
6. Lands first; subsequent BL-4.x PRs shrink the allowlist and turn assertions green one finding at a time. F7's guard (assertion (c)) is the first to flip, via this session's `fix/xs-contract-violations` PR.

*Brief only. No test file created, no source changed.*
