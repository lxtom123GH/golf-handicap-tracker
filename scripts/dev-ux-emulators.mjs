// One command, existing private-port demo harness, five isolated synthetic users.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function uxHarnessCommand(args = []) {
    const allowed = new Set(['--check', '--iphone-se']);
    if (args.some(arg => !allowed.has(arg))) throw new Error('Use only --check and/or --iphone-se');
    const check = args.includes('--check');
    return {
        args: ['scripts/run-e2e-isolated.mjs', 'tests/e2e/local-ux-harness.spec.js',
            `--project=${args.includes('--iphone-se') ? 'iphone-se' : 'phone'}`,
            ...(check ? [] : ['--headed'])],
        hold: check ? '0' : '1',
    };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const command = uxHarnessCommand(process.argv.slice(2));
    console.log(command.hold === '1'
        ? 'Opening five synthetic emulator users. Keep this terminal open; Ctrl+C stops the session.'
        : 'Checking five synthetic emulator users and saving phone screenshots.');
    const result = spawnSync(process.execPath, command.args, {
        cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit',
        env: { ...process.env, UX_HARNESS_HOLD: command.hold },
    });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
}
