// The standalone self-check and unit suite share the same behavioural probes.
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const result = spawnSync(process.execPath, [cli, 'run', 'tests/unit/visual-comparison.test.js'], {
    cwd: root, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
