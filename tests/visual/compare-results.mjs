import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { PROJECTS, SCREENS, SCREENSHOTS } from './capture-contract.mjs';
const require = createRequire(import.meta.url);
// Reuse the PNG decoder in the repository's locked Playwright dependency.
const { PNG } = require(join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const [before, after, output] = process.argv.slice(2);
if (!before || !after || !output) throw new Error('Usage: node compare-results.mjs BEFORE AFTER OUTPUT.json');
function files(root, suffix, current = root) {
    return readdirSync(current, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? files(root, suffix, join(current, entry.name))
        : entry.name.endsWith(suffix) ? [relative(root, join(current, entry.name)).replaceAll('\\', '/')] : []).sort();
}
const expectedStyles = SCREENSHOTS.map(path => path.replace('.png', '-styles.json'));
for (const root of [before, after]) {
    if (JSON.stringify(files(root, '.png')) !== JSON.stringify(SCREENSHOTS))
        throw new Error('Incomplete screenshot evidence: all 100 expected screens are required');
    if (JSON.stringify(files(root, '-styles.json')) !== JSON.stringify(expectedStyles))
        throw new Error('Incomplete computed-style evidence: every screenshot requires styles');
    for (const project of PROJECTS) {
        const manifest = JSON.parse(readFileSync(join(root, project, 'capture-complete.json'), 'utf8'));
        if (JSON.stringify(manifest.screens) !== JSON.stringify(SCREENS))
            throw new Error(`Incomplete capture manifest: ${project}`);
    }
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = SCREENSHOTS.map(path => {
    const a = readFileSync(join(before, path)), b = readFileSync(join(after, path));
    const first = PNG.sync.read(a), second = PNG.sync.read(b);
    const sameSize = first.width === second.width && first.height === second.height;
    let changedPixels = sameSize ? 0 : null;
    if (sameSize) for (let i = 0; i < first.data.length; i += 4) {
        if (first.data[i] !== second.data[i] || first.data[i+1] !== second.data[i+1]
            || first.data[i+2] !== second.data[i+2] || first.data[i+3] !== second.data[i+3]) changedPixels++;
    }
    return { path, beforeSha256: digest(a), afterSha256: digest(b),
        beforeSize: [first.width, first.height], afterSize: [second.width, second.height], changedPixels };
});
const styleRows = expectedStyles.map(path => {
    const a = JSON.parse(readFileSync(join(before, path), 'utf8'));
    const b = JSON.parse(readFileSync(join(after, path), 'utf8'));
    if (![a, b].every(value => Array.isArray(value) && value.length > 0))
        throw new Error(`Empty or invalid computed-style evidence: ${path}`);
    return { path, beforeElements: a.length, afterElements: b.length, equal: JSON.stringify(a) === JSON.stringify(b) };
});
const result = { screenshots: rows.length, screenshotFailures: rows.filter(r => r.changedPixels !== 0).length,
    computedStyleScreens: styleRows.length, computedStyleFailures: styleRows.filter(r => !r.equal).length,
    pixelTolerance: 0, masks: [], rows, styleRows };
writeFileSync(output, JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify({ screenshots: result.screenshots, screenshotFailures: result.screenshotFailures,
    computedStyleScreens: result.computedStyleScreens, computedStyleFailures: result.computedStyleFailures }));
process.exitCode = result.screenshotFailures || result.computedStyleFailures ? 1 : 0;
