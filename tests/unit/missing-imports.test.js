// Track A item 6 (simplify review 07 Oct 2026): the coach "Intent vs
// execution" card was always blank. coach.js called renderIntentPanel without
// importing it; the ReferenceError was swallowed by a try/catch, so nothing
// ever showed. This guards the whole class of bug: a module that calls a
// function some other src module exports must import it (or define its own).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');

function jsFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return jsFiles(p);
        return p.endsWith('.js') ? [p] : [];
    });
}

// A heuristic scanner, not a parser: good enough to catch a forgotten import
// of an exported function. Template literals keep their ${...} code (calls in
// HTML templates count); their text is dropped.
function keepInterpolations(tpl) {
    let out = '', depth = 0;
    for (let i = 1; i < tpl.length - 1; i++) {
        if (depth === 0 && tpl[i] === '$' && tpl[i + 1] === '{') { depth = 1; out += ' ('; i++; continue; }
        if (depth > 0) {
            if (tpl[i] === '{') depth++;
            if (tpl[i] === '}' && --depth === 0) { out += ') '; continue; }
            out += tpl[i];
        }
    }
    return out;
}

const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, keepInterpolations)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

const files = jsFiles(ROOT).map((p) => ({ p, raw: readFileSync(p, 'utf8') }));

// Every function name exported by some src module.
const exported = new Set();
for (const { raw } of files) {
    for (const m of raw.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) exported.add(m[1]);
}

function inScope(raw, name) {
    const code = strip(raw);
    const imported = [...raw.matchAll(/import\s*\{([^}]*)\}\s*from/g)]
        .some((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).includes(name));
    if (imported) return true;
    const n = `(?<![\\w$.])${name}(?![\\w$])`;
    const decl = [
        `function\\s*\\*?\\s*${n}`,                            // function name(
        `(?:const|let|var)\\s+${n}`,                           // const name =
        `(?:const|let|var)\\s*\\{[^}]*${n}[^}]*\\}\\s*=`,      // const { name } = await import(...)
        `\\(\\s*\\{[^}]*${n}[^}]*\\}\\s*\\)\\s*=>`,            // .then(({ name }) => ...)
        `function\\s*[\\w$]*\\s*\\([^)]*${n}[^)]*\\)`,         // a parameter
        `\\(([^()]*,)?\\s*${n}\\s*(,[^()]*)?\\)\\s*=>`,        // an arrow parameter
        `${n}\\s*=(?![=>])`,                                    // name = ... (not ==, not obj.name =)
    ];
    return decl.some((re) => new RegExp(re).test(code));
}

// A method definition (`name(args) {` at the start of a line) is not a call.
const isMethodDef = (code, index) => {
    const lineStart = code.lastIndexOf('\n', index) + 1;
    const before = code.slice(lineStart, index);
    if (!/^\s*(?:async\s+|static\s+|get\s+|set\s+)*$/.test(before)) return false;
    return /^[\w$]+\s*\([^()]*\)\s*\{/.test(code.slice(index));
};

describe('functions exported by one module are imported where they are called', () => {
    it('coach.js imports renderIntentPanel (the coach Intent vs execution card)', () => {
        const coach = files.find((f) => f.p.endsWith(join('src', 'coach.js'))).raw;
        expect(coach).toMatch(/import\s*\{[^}]*\brenderIntentPanel\b[^}]*\}\s*from\s*'\.\/modules\/intent-render\.js'/);
    });

    it('no src module calls an exported function it never imports or defines', () => {
        const missing = [];
        for (const { p, raw } of files) {
            const code = strip(raw);
            const called = new Set([...code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)]
                .filter((m) => !isMethodDef(code, m.index)).map((m) => m[1]));
            for (const name of called) {
                if (!exported.has(name)) continue;
                if (!inScope(raw, name)) missing.push(`${relative(process.cwd(), p)}: ${name}`);
            }
        }
        expect(missing).toEqual([]);
    });

    it('the scanner itself: finds calls in templates, ignores look-alikes', () => {
        const src = 'const a = `<b>${fmt(x)}</b>`; obj.other = 1; if (y === other) {}\n'
            + 'class K {\n    method(a) {\n        return 1;\n    }\n}\n';
        const code = strip(src);
        expect(code).toMatch(/fmt\(x\)/);
        expect(inScope(src, 'other')).toBe(false); // obj.other = / === are not declarations
        expect(isMethodDef(code, code.indexOf('method('))).toBe(true);
        expect(inScope('import { fmt } from "./f.js"; fmt(1);', 'fmt')).toBe(true);
        expect(inScope('import("./f.js").then(({ fmt }) => fmt(1));', 'fmt')).toBe(true);
    });
});
