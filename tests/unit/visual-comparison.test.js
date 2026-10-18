// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { PROJECTS, SCREENS, SCREENSHOTS } from '../visual/capture-contract.mjs';
const require = createRequire(import.meta.url);
const { PNG } = require(join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture(complete = true) {
    const root = mkdtempSync(join(tmpdir(), 'golf-parity-')); roots.push(root);
    const before = join(root, 'before'), after = join(root, 'after'), output = join(root, 'result.json');
    const image = new PNG({ width: 1, height: 1 }); image.data.fill(255);
    for (const dir of [before, after]) {
        mkdirSync(dir);
        if (!complete) continue;
        for (const project of PROJECTS) {
            mkdirSync(join(dir, project));
            writeFileSync(join(dir, project, 'capture-complete.json'), JSON.stringify({ screens: SCREENS }));
        }
        for (const path of SCREENSHOTS) {
            writeFileSync(join(dir, path), PNG.sync.write(image));
            writeFileSync(join(dir, path.replace('.png', '-styles.json')), JSON.stringify([{ tag: 'BODY', fontSize: '16px' }]));
        }
    }
    return { before, after, output, image, run() {
        // Never let a stale success ledger stand in for a rejected comparison.
        rmSync(output, { force: true });
        const result = spawnSync(process.execPath, [resolve('tests/visual/compare-results.mjs'), before, after, output], { encoding: 'utf8' });
        return { ...result, report: existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : null };
    } };
}

it('accepts all 100 screenshot/style pairs from completed journeys', () => {
    expect(SCREENSHOTS).toHaveLength(100);
    const result = fixture().run();
    expect(result.stderr).toBe(''); expect(result.status).toBe(0);
    expect(result.report).toMatchObject({ screenshots: 100, computedStyleScreens: 100, screenshotFailures: 0, computedStyleFailures: 0 });
});
it('rejects two empty evidence directories', () => expect(fixture(false).run().status).toBe(1));
it('rejects one identical PNG per side without styles', () => {
    const f = fixture(false);
    for (const dir of [f.before, f.after]) writeFileSync(join(dir, 'screen.png'), PNG.sync.write(f.image));
    expect(f.run().status).toBe(1);
});
it('rejects equally partial runs even with claimed completion', () => {
    const f = fixture();
    for (const dir of [f.before, f.after]) rmSync(join(dir, SCREENSHOTS[0]));
    expect(f.run().status).toBe(1);
});
it('rejects missing styles on both sides', () => {
    const f = fixture();
    for (const dir of [f.before, f.after]) rmSync(join(dir, SCREENSHOTS[0].replace('.png', '-styles.json')));
    expect(f.run().status).toBe(1);
});
it('rejects empty computed-style evidence', () => {
    const f = fixture();
    for (const dir of [f.before, f.after]) writeFileSync(join(dir, SCREENSHOTS[0].replace('.png', '-styles.json')), '[]');
    expect(f.run().status).toBe(1);
});
it('rejects an unfinished journey even with all files present', () => {
    const f = fixture(); rmSync(join(f.after, 'phone/capture-complete.json'));
    expect(f.run().status).toBe(1);
});
it('rejects a completion marker claiming only a partial journey', () => {
    const f = fixture();
    writeFileSync(join(f.after, 'phone/capture-complete.json'), JSON.stringify({ screens: SCREENS.slice(1) }));
    expect(f.run().status).toBe(1);
});
it('detects a single alpha-channel pixel change', () => {
    const f = fixture(); f.image.data[3] = 254;
    writeFileSync(join(f.after, SCREENSHOTS[0]), PNG.sync.write(f.image));
    const result = f.run(); expect(result.status).toBe(1);
    expect(result.report.rows[0].changedPixels).toBe(1);
});
it('detects changed geometry', () => {
    const f = fixture();
    writeFileSync(join(f.after, SCREENSHOTS[0]), PNG.sync.write(new PNG({ width: 2, height: 1 })));
    const result = f.run(); expect(result.status).toBe(1);
    expect(result.report.rows[0].changedPixels).toBeNull();
});
it('detects a changed computed style', () => {
    const f = fixture();
    writeFileSync(join(f.after, SCREENSHOTS[0].replace('.png', '-styles.json')), '[{"tag":"BODY","fontSize":"17px"}]');
    const result = f.run(); expect(result.status).toBe(1);
    expect(result.report.computedStyleFailures).toBe(1);
});
