// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url));

function discover(config, cwd = fileURLToPath(new URL('../../', import.meta.url))) {
    const result = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json',
        '--config', fileURLToPath(new URL(`../../${config}`, import.meta.url))], {
        cwd, encoding: 'utf8', timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.errors).toEqual([]);
    return report.suites.flatMap(suite => suite.specs.flatMap(spec =>
        spec.tests.map(test => ({ file: suite.file, project: test.projectName }))));
}

it('keeps screenshot personas out of the default browser suite', () => {
    const tests = discover('playwright.config.js');
    expect(tests.length).toBeGreaterThan(0);
    expect(tests.filter(test => test.file === 'ux-harness.spec.js')).toEqual([]);
}, 40_000);

it('discovers exactly ten screenshot cases in the dedicated config, even outside the repo', () => {
    const tests = discover('playwright.ux.config.js', tmpdir());
    expect(tests).toHaveLength(10);
    expect(tests.every(test => test.file === 'ux-harness.spec.js')).toBe(true);
    expect(tests.filter(test => test.project === 'phone')).toHaveLength(5);
    expect(tests.filter(test => test.project === 'iphone-se')).toHaveLength(5);
}, 40_000);
