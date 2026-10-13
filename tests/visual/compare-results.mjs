import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Reuse the PNG decoder in the repository's locked Playwright dependency.
const { PNG } = require(join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const [before, after, output] = process.argv.slice(2);
if (!before || !after || !output) throw new Error('Usage: node compare-results.mjs BEFORE AFTER OUTPUT.json');
function files(root, suffix, current = root) {
    return readdirSync(current, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? files(root, suffix, join(current, entry.name))
        : entry.name.endsWith(suffix) ? [relative(root, join(current, entry.name))] : []).sort();
}
const left = files(before, '.png'), right = files(after, '.png');
if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error('Before/after screenshot sets differ');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = left.map(path => {
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
const styles = files(before, '-styles.json');
if (JSON.stringify(styles) !== JSON.stringify(files(after, '-styles.json'))) throw new Error('Computed-style sets differ');
const styleRows = styles.map(path => {
    const a = JSON.parse(readFileSync(join(before, path), 'utf8'));
    const b = JSON.parse(readFileSync(join(after, path), 'utf8'));
    return { path, beforeElements: a.length, afterElements: b.length, equal: JSON.stringify(a) === JSON.stringify(b) };
});
const result = { screenshots: rows.length, screenshotFailures: rows.filter(r => r.changedPixels !== 0).length,
    computedStyleScreens: styleRows.length, computedStyleFailures: styleRows.filter(r => !r.equal).length,
    pixelTolerance: 0, masks: [], rows, styleRows };
writeFileSync(output, JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify({ screenshots: result.screenshots, screenshotFailures: result.screenshotFailures,
    computedStyleScreens: result.computedStyleScreens, computedStyleFailures: result.computedStyleFailures }));
process.exitCode = result.screenshotFailures || result.computedStyleFailures ? 1 : 0;
