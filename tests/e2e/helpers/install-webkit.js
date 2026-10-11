import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The existing CI command reads this hook on Linux and Windows. Local runs
// keep using installed browsers; no install runs while merely listing tests.
export default function installWebkit() {
    if (!process.env.CI) return;
    const cli = fileURLToPath(new URL('../../../node_modules/@playwright/test/cli.js', import.meta.url));
    const result = spawnSync(process.execPath, [cli, 'install', '--with-deps', 'webkit'], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`WebKit installation failed (exit ${result.status})`);
}
