import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { PNG } = require(join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const root = mkdtempSync(join(tmpdir(), 'golf-pixel-proof-'));
const before = join(root,'before'), after = join(root,'after'), output = join(root,'result.json');
mkdirSync(before); mkdirSync(after);
const manifest = join(root, 'manifest.json');
writeFileSync(manifest, JSON.stringify({ screenCount: 1, screens: [{ path: 'screen.png' }] }));
const image = (width=1, red=0) => {
    const p = new PNG({width,height:1}); p.data.fill(255); p.data[0]=red;
    return PNG.sync.write(p);
};
const file = (dir, name, data) => writeFileSync(join(dir,name), data);
function run(expected = manifest) {
    rmSync(output, { force: true });
    const result = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'compare-results.mjs'), before, after, output, expected], { encoding: 'utf8' });
    return { status:result.status, error:result.stderr, report:existsSync(output) ? JSON.parse(readFileSync(output,'utf8')) : null };
}
function rejects(message, expected) {
    const result = run(expected);
    assert.equal(result.status, 1);
    assert.match(result.error, message);
    assert.equal(result.report, null);
}
try {
    rejects(/No screenshots/);
    for (const dir of [before,after]) file(dir,'screen.png',image());
    rejects(/PNG\/style pairs/);
    for (const dir of [before,after]) {
        file(dir,'screen.png',image());
        file(dir,'screen-styles.json',JSON.stringify([{id:'fixture',tag:'BUTTON',fontSize:'16px'}]));
    }
    assert.equal(run().status,0); // Fixed fixture IDs, styles and pixels are equal.
    rejects(/expected census/, fileURLToPath(new URL('../../docs/style-screen-census.json', import.meta.url)));
    for (const dir of [before,after]) file(dir,'extra-styles.json','[]');
    rejects(/PNG\/style pairs/);
    for (const dir of [before,after]) rmSync(join(dir,'extra-styles.json'));
    for (const dir of [before,after]) file(dir,'extra.png',image());
    rejects(/expected census/);
    for (const dir of [before,after]) rmSync(join(dir,'extra.png'));
    file(after,'screen.png',image(1,1));
    let result=run(); assert.equal(result.status,1); assert.equal(result.report.rows[0].changedPixels,1);
    file(after,'screen.png',image(2));
    result=run(); assert.equal(result.status,1); assert.equal(result.report.rows[0].changedPixels,null);
    file(after,'screen.png',image());
    file(after,'screen-styles.json',JSON.stringify([{id:'random',tag:'BUTTON',fontSize:'17px'}]));
    result=run(); assert.equal(result.status,1); assert.equal(result.report.computedStyleFailures,1);
    console.log('9 comparison self-checks passed: equal, empty, missing styles, incomplete census, orphan styles, unexpected capture, pixel, geometry, computed style');
} finally { rmSync(root,{recursive:true,force:true}); }
