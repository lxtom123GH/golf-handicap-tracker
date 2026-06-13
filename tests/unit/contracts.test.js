// ==========================================================================
// tests/unit/contracts.test.js  —  BL-4.00 Static Contract Suite
// ==========================================================================
//
// Tier 1 static contract suite. Per docs/briefs/BL-4.00_contract_suite.md.
//
// This suite reads index.html and src/**/*.js AS TEXT (fs + regex only). It
// imports NO application module, connects to NO Firebase, and needs NO
// emulator/browser/network. It runs under `npm run test:unit` and finishes in
// well under a second.
//
// It statically validates four DOM/JS contracts. It is a RED tripwire by
// design: it ships PARTIALLY RED at this HEAD and goes green only as the
// BL-4.x remediation fixes land. Do NOT "fix" a red group by weakening its
// assertion — a red group is the live inventory of an open finding.
//
// --------------------------------------------------------------------------
// EXPECTED RED/GREEN SPLIT AT THIS HEAD (the known baseline — see §4 of the
// brief and the NIGHT1 blast-radius report):
//
//   (a) unique HTML ids ........ EXPECT FAIL  — duplicate id="tab-practice"
//                                 (index.html:186 & 1705, NIGHT1 F5)
//                                 → goes GREEN with BL-4.03 (merge/retire the
//                                   legacy Practice Drills screen)
//
//   (b) JS id refs resolve ..... EXPECT FAIL  — dead ids referenced but absent
//                                 from index.html, incl. coach-uid-input (F6),
//                                 log-comp-dynamic (F8 root), the oc-manual-*
//                                 family (F1 root), plus H-series dead cache
//                                 refs.
//                                 → goes GREEN incrementally as BL-4.05 (F6),
//                                   BL-4.04 (F8), BL-4.02 (F1/oc-manual) and
//                                   BL-4.13 (dead-ref deletions) land; the
//                                   ALLOWLIST below shrinks alongside them.
//
//   (c) single getFunctions() .. EXPECT PASS  — F7 is fixed; getFunctions(
//                                 now appears only in src/firebase-config.js
//                                 (merged via fix/xs-contract-violations).
//                                 This group is ALREADY GREEN; it stays the
//                                 regression guard for BL-4.06.
//
//   (d) no forced-true gates ... EXPECT FAIL  — auth-v2.js:149 still has
//                                 `if (true || …)` (NIGHT1 F10, open)
//                                 → goes GREEN with BL-4.07 (auth debug-bypass
//                                   removal, security-reviewed).
//
// A fully-green suite is the acceptance signal that those four fixes have all
// landed — that is intended, not a regression of this suite.
// --------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(ROOT, 'src');
const INDEX_HTML = path.join(ROOT, 'index.html');

// --------------------------------------------------------------------------
// The JS-created-id allowlist for assertion (b).
//
// These ids are legitimately created by JS at runtime, so they are validly
// referenced from src/ yet absent from index.html. Seeded from NIGHT1 Task A's
// "JS-injected DOM that legitimately satisfies references" list and brief §3.
// Each later BL-4.x fix SHRINKS this list; a green suite only happens once the
// real fixes land AND this list contains only genuinely-injected ids.
//
// NOTE the deliberate exclusions (these stay violations until deleted, do NOT
// add them): btn-ai-player, btn-ai-coach, ai-prompt-textarea,
// btn-copy-ai-prompt (NIGHT1 H2 — exist nowhere; BL-4.13 deletes the refs).
// --------------------------------------------------------------------------
const ALLOWLIST = [
    // AI modal internals — injected at runtime by ai.js:26-56, UI re-cached
    // ai.js:59-61. Enumerated exactly from the injected innerHTML template.
    'ai-modal-container',   // ai.js:27
    'ai-modal-overlay',     // ai.js:29
    'ai-modal-title',       // ai.js:33
    'ai-modal-subtitle',    // ai.js:34
    'btn-close-ai-modal',   // ai.js:36
    'ai-loading',           // ai.js:38
    'ai-response-area',     // ai.js:42
    'ai-response-content',  // ai.js:43
    'ai-error-area',        // ai.js:45
    'ai-error-msg',         // ai.js:45
    'btn-regenerate-ai',    // ai.js:47
    'btn-close-ai-modal-2', // ai.js:48

    'oc-comp-regulars-select', // injected checkbox list — event-binders.js:92-103
    'ai-coach-feedback',       // injected — oncourse.js:1372
    'oc-fixed-finish-btn',     // FAB created + appended to <body> — event-binders.js:443-450 (NIGHT3 R8 corrected H14)

    // TEMPORARY — leftover (NIGHT1 H11). Created via submitBtn.id at
    // auth-v2.js:33, referenced auth-v2.js:46. BL-4.13 deletes it; remove from
    // this allowlist when that lands.
    'temp-submit-register',
];

// Dynamic-pattern note (NOT allowlist entries — the literal scanner skips them
// because their ids are template literals / computed, never string literals):
//   - drill-input-${id}        (created practice.js:326; ref practice.js:186,350)
//   - btn-pin-${type}          (surveyor.js:124; all variants exist in HTML)
//   - ALL_SCREENS / switchTab dynamic tab-* lookups (ui.js:232,247; all exist)

// --------------------------------------------------------------------------
// Shared helpers (pure fs + string scanning — no app code imported)
// --------------------------------------------------------------------------

/** Recursively collect every *.js file under a directory (skips node_modules). */
function collectJsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectJsFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

/** Project-relative, forward-slashed path for stable cross-platform reporting. */
function rel(file) {
    return path.relative(ROOT, file).split(path.sep).join('/');
}

/** 1-based line number of a character offset within content. */
function lineOf(content, index) {
    return content.slice(0, index).split('\n').length;
}

/** Extract every id="…" / id='…' value from HTML text. */
function extractHtmlIds(html) {
    const re = /\bid\s*=\s*["']([^"']+)["']/g;
    const ids = [];
    let m;
    while ((m = re.exec(html)) !== null) ids.push(m[1]);
    return ids;
}

const HTML_TEXT = fs.readFileSync(INDEX_HTML, 'utf8');
const SRC_FILES = collectJsFiles(SRC_DIR);

// --------------------------------------------------------------------------
// (a) Unique HTML ids — catches NIGHT1 F5 (duplicate id="tab-practice").
// --------------------------------------------------------------------------
describe('contract (a): every id="" in index.html is unique', () => {
    it('has no duplicate ids', () => {
        const ids = extractHtmlIds(HTML_TEXT);
        const counts = new Map();
        for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);

        const duplicates = [...counts.entries()]
            .filter(([, n]) => n > 1)
            .map(([id, n]) => `${id} (×${n})`);

        expect(
            duplicates,
            `Duplicate id="" in index.html (each must be unique):\n  ${duplicates.join('\n  ')}`
        ).toEqual([]);
    });
});

// --------------------------------------------------------------------------
// (b) JS id references resolve — every string-literal id referenced from src/
//     via getElementById('…') or querySelector('#…') exists in index.html,
//     modulo ALLOWLIST. Catches F6, F8 root, F1 root, and H-series dead refs.
// --------------------------------------------------------------------------
describe('contract (b): JS-referenced ids resolve to index.html (modulo allowlist)', () => {
    it('every literal getElementById / querySelector(#id) id exists in HTML or the allowlist', () => {
        const htmlIds = new Set(extractHtmlIds(HTML_TEXT));
        const allowed = new Set([...htmlIds, ...ALLOWLIST]);

        const getByIdRe = /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
        const qsRe = /querySelector(?:All)?\(\s*['"]#([A-Za-z0-9_-]+)['"]\s*\)/g;

        const offenders = [];
        for (const file of SRC_FILES) {
            const content = fs.readFileSync(file, 'utf8');
            for (const re of [getByIdRe, qsRe]) {
                re.lastIndex = 0;
                let m;
                while ((m = re.exec(content)) !== null) {
                    const id = m[1];
                    if (!allowed.has(id)) {
                        offenders.push(`${id}  ←  ${rel(file)}:${lineOf(content, m.index)}`);
                    }
                }
            }
        }

        expect(
            offenders,
            `JS references ids absent from index.html and the allowlist:\n  ${offenders.join('\n  ')}`
        ).toEqual([]);
    });
});

// --------------------------------------------------------------------------
// (c) Single Functions instance — getFunctions( appears in src/ only in
//     firebase-config.js. Catches NIGHT1 F7 (already fixed → expected GREEN).
// --------------------------------------------------------------------------
describe('contract (c): getFunctions( appears only in src/firebase-config.js', () => {
    it('no src/ file other than firebase-config.js constructs a Functions instance', () => {
        const offenders = [];
        for (const file of SRC_FILES) {
            const relPath = rel(file);
            if (relPath === 'src/firebase-config.js') continue;
            const content = fs.readFileSync(file, 'utf8');
            let from = content.indexOf('getFunctions(');
            while (from !== -1) {
                offenders.push(`${relPath}:${lineOf(content, from)}`);
                from = content.indexOf('getFunctions(', from + 1);
            }
        }

        expect(
            offenders,
            `getFunctions( found outside src/firebase-config.js (region-pin contract):\n  ${offenders.join('\n  ')}`
        ).toEqual([]);
    });
});

// --------------------------------------------------------------------------
// (d) No forced-true gates — no `if (true ||` / `if (true||` anywhere in src/.
//     Tripwire for NIGHT1 F10's class (auth-v2.js:149, open).
// --------------------------------------------------------------------------
describe('contract (d): no forced-true gates (`if (true ||`) in src/', () => {
    it('has no `if (true ||` debug overrides', () => {
        const re = /if\s*\(\s*true\s*\|\|/g;
        const offenders = [];
        for (const file of SRC_FILES) {
            const content = fs.readFileSync(file, 'utf8');
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(content)) !== null) {
                offenders.push(`${rel(file)}:${lineOf(content, m.index)}`);
            }
        }

        expect(
            offenders,
            `Forced-true gate(s) found (debug override left in trust path):\n  ${offenders.join('\n  ')}`
        ).toEqual([]);
    });
});

// --------------------------------------------------------------------------
// (e) No catch-path admin grant — no `currentUserIsAdmin = true` literal in
//     src/. The dynamic counterpart to (d): BL-4.07's catch block used to set
//     window.currentUserIsAdmin = true on a failed users/{uid} read, silently
//     granting admin UI on a transient Firestore error. A read failure must
//     never grant admin, so no source may hard-assign the flag to true.
//     (Role-derived assignments like `= userData.isAdmin || false` are fine.)
//     Goes GREEN with BL-4.07; stays the regression guard thereafter.
// --------------------------------------------------------------------------
describe('contract (e): no `currentUserIsAdmin = true` grant in src/', () => {
    it('no src/ file hard-assigns currentUserIsAdmin to true', () => {
        const re = /currentUserIsAdmin\s*=\s*true\b/g;
        const offenders = [];
        for (const file of SRC_FILES) {
            const content = fs.readFileSync(file, 'utf8');
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(content)) !== null) {
                offenders.push(`${rel(file)}:${lineOf(content, m.index)}`);
            }
        }

        expect(
            offenders,
            `Hard admin grant(s) found (currentUserIsAdmin = true — must derive from the user doc):\n  ${offenders.join('\n  ')}`
        ).toEqual([]);
    });
});
